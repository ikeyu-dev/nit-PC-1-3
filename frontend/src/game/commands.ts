import type { BodyAction, DriveCommand } from "../types";

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
