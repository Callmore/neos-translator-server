export interface WSPacketPartialRecognition {
    type: "partialRecognition";
    text: string;
}

export interface WSPacketFinalRecognition {
    type: "finalRecognition";
    origanal: string;
    translated: string;
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
    | WSPacketHeartBeat
    | WSPacketInfo;
