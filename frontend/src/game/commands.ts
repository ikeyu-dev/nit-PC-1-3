import type { BodyAction, DriveCommand, HandShape } from "../types";

// 旧手形入力との互換を残すため、手形を体アクション相当の操作へ変換する。
export const commandByHandShape: Record<HandShape, DriveCommand> = {
    Paper: {
        action: "pedal",
        label: "すすむ",
        speedTarget: 0.5,
        turnTarget: 0,
    },
    Rock: {
        action: "idle",
        label: "止まる",
        speedTarget: 0,
        turnTarget: 0,
    },
    Pointing_Left: {
        action: "signalLeft",
        label: "左に曲がる",
        speedTarget: 0.72,
        turnTarget: -1,
    },
    Pointing_Right: {
        action: "signalRight",
        label: "右に曲がる",
        speedTarget: 0.72,
        turnTarget: 1,
    },
    Pointing_Down: {
        action: "brake",
        label: "後ろに下がる",
        speedTarget: -0.68,
        turnTarget: 0,
    },
};

// commandByBodyActionで姿勢推定結果を速度・旋回量に変換し、3D自転車を動かす。
export const commandByBodyAction: Record<BodyAction, DriveCommand> = {
    idle: {
        action: "idle",
        label: "止まる",
        speedTarget: 0,
        turnTarget: 0,
    },
    pedal: {
        action: "pedal",
        label: "すすむ",
        speedTarget: 0.56,
        turnTarget: 0,
    },
    brake: {
        action: "brake",
        label: "ブレーキ",
        speedTarget: 0,
        turnTarget: 0,
    },
    signalLeft: {
        action: "signalLeft",
        label: "左の合図",
        speedTarget: 0.48,
        turnTarget: -0.95,
    },
    signalRight: {
        action: "signalRight",
        label: "右の合図",
        speedTarget: 0.48,
        turnTarget: 0.95,
    },
    lookLeft: {
        action: "lookLeft",
        label: "左を確認",
        speedTarget: 0,
        turnTarget: 0,
    },
    lookRight: {
        action: "lookRight",
        label: "右を確認",
        speedTarget: 0,
        turnTarget: 0,
    },
    lightOn: {
        action: "lightOn",
        label: "ライトON",
        speedTarget: 0.48,
        turnTarget: 0,
    },
};
