import "dotenv/config";

import { WebSocket, WebSocketServer } from "ws";
import { Translate } from "@google-cloud/translate/build/src/v2/index.js";
import { WSPacket } from "./websocketPackets.mjs";
import { EventEmitter } from "events";

const wss = new WebSocketServer({
    port: 8080,
});

// const translate = new Translate();

const validLanguages = {
    en: true,
    ja: true,
    ko: true,
    ru: true,
    zh: true,
    fr: true,
};

function isValidLanguage(lang: string) {
    return Object.hasOwn(validLanguages, lang);
}

const neosConnectionEvents = new EventEmitter();

wss.on("connection", (ws, request) => {
    if (request.url == undefined) {
        ws.close(1002, "URL undefined or missing.");
        return;
    }

    console.log(request.url);
    const url = new URL(request.url, "a:/");

    const targetUser = url.searchParams.get("userid");
    if (targetUser == undefined || !targetUser.startsWith("U-")) {
        ws.close(1002, "userid query parameter missing, undefined or invalid.");
        return;
    }

    switch (url.pathname) {
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

function initSpeechRecognitionClient(
    ws: WebSocket,
    url: URL,
    targetUser: string
) {
    let languageFrom = url.searchParams.get("langfrom")!;
    if (languageFrom == undefined || !isValidLanguage(languageFrom)) {
        ws.close(1002, "langfrom query parameter missing or invalid.");
        return;
    }

    let languageTo = url.searchParams.get("langto")!;
    if (languageTo == undefined || !isValidLanguage(languageTo)) {
        ws.close(1002, "langto query parameter missing or undefined.");
        return;
    }

    if (languageFrom == languageTo) {
        ws.close(1002, "langfrom and langto are the same.");
        return;
    }

    ws.on("message", async (message) => {
        try {
            const data = JSON.parse(message.toString()) as WSPacket;
            ({ languageFrom, languageTo } = await parseIncommingPacket(
                data,
                targetUser,
                languageFrom,
                languageTo,
                ws
            ));
        } catch (e) {
            ws.close(1002, "Invalid request.");
        }
    });
}

async function parseIncommingPacket(
    data: WSPacket,
    targetUser: string | null,
    languageFrom: string,
    languageTo: string,
    ws: WebSocket
) {
    switch (data.type) {
        case "partialRecognition":
            if (
                neosConnectionEvents.listenerCount(`partial-${targetUser}`) <= 0
            ) {
                break;
            }

            neosConnectionEvents.emit(`partial-${targetUser}`, data.text);
            break;

        case "finalRecognition":
            if (
                neosConnectionEvents.listenerCount(`final-${targetUser}`) <= 0
            ) {
                break;
            }

            const translated = await translateText(
                data.text,
                languageFrom,
                languageTo
            );

            neosConnectionEvents.emit(
                `final-${targetUser}`,
                data.text,
                translated
            );
            break;

        case "changeLanguage":
            // Check that the data is valid
            if (
                !isValidLanguage(data.langFrom) ||
                !isValidLanguage(data.langTo)
            ) {
                ws.close(1002, "Invalid language.");
                break;
            }

            // It must be valid... right?
            languageFrom = data.langFrom;
            languageTo = data.langTo;

        default:
            ws.close(1002, "Invalid packet type.");
    }
    return { languageFrom, languageTo };
}

function initNeosListener(ws: WebSocket, targetUser: string | null) {
    const partialSend = (text: string) => {
        ws.send(`partial\n${neosEscape(text)}`);
    };
    const finalSend = (text: string, translatedText: string) => {
        ws.send(`final\n${neosEscape(text)}\n${neosEscape(translatedText)}`);
    };

    neosConnectionEvents.on(`partial-${targetUser}`, partialSend);
    neosConnectionEvents.on(`final-${targetUser}`, finalSend);

    ws.on("close", () => {
        neosConnectionEvents.removeListener(
            `partial-${targetUser}`,
            partialSend
        );
        neosConnectionEvents.removeListener(`final-${targetUser}`, finalSend);
    });
}

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

async function translateText(text: string, langFrom: string, langTo: string) {
    // const result = await translate.translate(text, {
    //     from: langFrom,
    //     to: langTo,
    // });

    // return result[0];
    return new Promise<string>((resolve) => resolve(text.toUpperCase()));
}
