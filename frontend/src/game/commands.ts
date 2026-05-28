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
        label: "とまる",
        speedTarget: 0,
        turnTarget: 0,
    },
    Pointing_Left: {
        handShape: "Pointing_Left",
        label: "ひだり",
        speedTarget: 0.72,
        turnTarget: -1,
    },
    Pointing_Right: {
        handShape: "Pointing_Right",
        label: "みぎ",
        speedTarget: 0.72,
        turnTarget: 1,
    },
    Pointing_Down: {
        handShape: "Pointing_Down",
        label: "バック",
        speedTarget: -0.68,
        turnTarget: 0,
    },
};
