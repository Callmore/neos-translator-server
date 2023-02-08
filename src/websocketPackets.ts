export interface WSPacketPartialRecognition {
    type: "partialRecognition";
    text: string;
}

export interface WSPacketFinalRecognition {
    type: "finalRecognition";
    text: string;
}

export interface WSPacketChangeLanguage {
    type: "changeLanguage";
    langFrom: string;
    langTo: string;
}

export interface WSPacketHeartBeat {
    type: "heartBeat";
}

export interface WSPacketInfo {
    type: "info";
    msg: string;
}

export type WSPacket =
    | WSPacketPartialRecognition
    | WSPacketFinalRecognition
    | WSPacketChangeLanguage
    | WSPacketHeartBeat
    | WSPacketInfo;
