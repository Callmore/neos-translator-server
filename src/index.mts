import "dotenv/config";

import { ServerOptions, WebSocket, WebSocketServer } from "ws";
import {
    WSPacket,
    WSPacketHeartBeat,
    WSPacketInfo,
} from "./websocketPackets.mjs";
import { EventEmitter } from "events";

const escapedCharacters = {
    ".": true,
    "*": true,
    "+": true,
    "?": true,
    "^": true,
    $: true,
    "{": true,
    "}": true,
    "(": true,
    ")": true,
    "|": true,
    "[": true,
    "]": true,
    "\\": true,
};

function neosEscape(text: string) {
    const output: string[] = [];
    for (const codepoint of text) {
        if (Object.hasOwn(escapedCharacters, codepoint)) {
            output.push(`\\${codepoint}`);
            continue;
        }
        // Try matching a special character
        let character = undefined;
        switch (codepoint) {
            case "\t":
                character = "t";
                break;
            case "\n":
                character = "n";
                break;
            case "\f":
                character = "f";
                break;
            case "\r":
                character = "r";
                break;
        }

        if (character != undefined) {
            output.push(`\\${character}`);
            continue;
        }

        output.push(codepoint);
    }
    return output.join("");
}

const connectionEventManager = new EventEmitter();

function initSpeechRecognitionClient(
    ws: WebSocket,
    url: URL,
    targetUser: string
) {
    ws.on("message", async (message) => {
        try {
            const data = JSON.parse(message.toString()) as WSPacket;
            parseIncommingPacket(data, targetUser, ws);
        } catch (e) {
            ws.close(4001, "Invalid request.");
        }
    });

    const heartBeatCallback = setInterval(() => {
        ws.send(
            JSON.stringify({
                type: "heartBeat",
            } as WSPacketHeartBeat)
        );
    }, 10000);

    const onNeosInfoMessageEmited = (msg: string) => {
        ws.send(
            JSON.stringify({
                type: "info",
                msg,
            } as WSPacketInfo)
        );
    };
    // TODO: add info event emiiters
    connectionEventManager.on(
        `info-neos-${targetUser}`,
        onNeosInfoMessageEmited
    );

    ws.on("close", () => {
        connectionEventManager.emit(
            `info-recognition-${targetUser}`,
            "Speech recognition connection lost."
        );

        clearInterval(heartBeatCallback);

        connectionEventManager.removeListener(
            `info-neos-${targetUser}`,
            onNeosInfoMessageEmited
        );
    });

    ws.on("open", () => {
        connectionEventManager.emit(
            `info-recognition-${targetUser}`,
            "Speech recognition connected."
        );
    });
}

function parseIncommingPacket(
    data: WSPacket,
    targetUser: string | null,
    ws: WebSocket
) {
    switch (data.type) {
        case "partialRecognition":
            if (
                connectionEventManager.listenerCount(`partial-${targetUser}`) <=
                0
            ) {
                break;
            }

            connectionEventManager.emit(`partial-${targetUser}`, data.text);
            break;

        case "finalRecognition":
            if (
                connectionEventManager.listenerCount(`final-${targetUser}`) <= 0
            ) {
                break;
            }

            connectionEventManager.emit(
                `final-${targetUser}`,
                data.origanal,
                data.translated
            );
            break;

        case "heartBeat":
            // yay!
            break;

        default:
            ws.close(1002, "Invalid packet type.");
    }
    return;
}

function initNeosListener(ws: WebSocket, targetUser: string | null) {
    const partialSend = (text: string) => {
        ws.send(`partial\n${neosEscape(text)}`);
    };
    connectionEventManager.on(`partial-${targetUser}`, partialSend);

    const finalSend = (text: string, translatedText: string) => {
        ws.send(`final\n${neosEscape(text)}\n${neosEscape(translatedText)}`);
    };
    connectionEventManager.on(`final-${targetUser}`, finalSend);

    const onRecognitionInfoMessageEmitted = (msg: string) => {
        ws.send(`info\n${neosEscape(msg)}`);
    };
    connectionEventManager.on(
        `info-recognition-${targetUser}`,
        onRecognitionInfoMessageEmitted
    );

    const heartBeatCallback = setInterval(() => {
        ws.send("heartbeat\n");
    }, 10000);

    ws.on("close", () => {
        connectionEventManager.emit(
            `info-neos-${targetUser}`,
            "Neos connection lost."
        );

        connectionEventManager.removeListener(
            `partial-${targetUser}`,
            partialSend
        );
        connectionEventManager.removeListener(`final-${targetUser}`, finalSend);
        connectionEventManager.removeListener(
            `info-recognition-${targetUser}`,
            onRecognitionInfoMessageEmitted
        );

        clearInterval(heartBeatCallback);
    });

    ws.on("open", () => {
        connectionEventManager.emit(
            `info-neos-${targetUser}`,
            "Neos connected."
        );
    });
}

export function createWebSocketServer(
    options?: ServerOptions | undefined,
    callback?: (() => void) | undefined
) {
    const wss = new WebSocketServer(options, callback);

    wss.on("connection", (ws, request) => {
        if (request.url == undefined) {
            ws.close(1002, "URL undefined or missing.");
            return;
        }

        const url = new URL(request.url, "a:/");

        const targetUser = url.searchParams.get("userid");
        if (targetUser == undefined || !targetUser.startsWith("U-")) {
            ws.close(
                1002,
                "userid query parameter missing, undefined or invalid."
            );
            return;
        }

        if (!url.pathname.startsWith("/ws/")) {
            ws.close(1002, "Invalid pathname.");
            return;
        }

        const endpoint = url.pathname.split("/");
        if (endpoint.length <= 2) {
            ws.close(1002, "Invalid pathname");
            return;
        }

        switch ("/" + endpoint.slice(2).join("/")) {
            case "/speech":
                // This is the speech recognition client connecting to send text to translate.
                initSpeechRecognitionClient(ws, url, targetUser);
                break;

            case "/neos":
                // This is a neos client connecting to listen.
                initNeosListener(ws, targetUser);
                break;

            default:
                // Dunno who this one is, tell them to go away.
                ws.close(1002, "Invalid pathname.");
                break;
        }
    });

    return wss;
}
