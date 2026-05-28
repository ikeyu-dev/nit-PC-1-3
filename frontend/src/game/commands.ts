import type { DriveCommand, HandShape } from "../types";

export const commandByHandShape: Record<HandShape, DriveCommand> = {
    Paper: {
        handShape: "Paper",
        label: "すすむ",
        speedTarget: 0.5,
        turnTarget: 0,
    },
    Rock: {
        handShape: "Rock",
        label: "止まる",
        speedTarget: 0,
        turnTarget: 0,
    },
    Pointing_Left: {
        handShape: "Pointing_Left",
        label: "左に曲がる",
        speedTarget: 0.72,
        turnTarget: -1,
    },
    Pointing_Right: {
        handShape: "Pointing_Right",
        label: "右に曲がる",
        speedTarget: 0.72,
        turnTarget: 1,
    },
    Pointing_Down: {
        handShape: "Pointing_Down",
        label: "後ろに下がる",
        speedTarget: -0.68,
        turnTarget: 0,
    },
};
