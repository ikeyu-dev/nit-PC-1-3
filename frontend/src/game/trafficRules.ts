import type { ViolationRule, ViolationType } from "../types";

// INITIAL_MONEYでゲーム開始時の所持金を決め、反則金による減点スコアに使う。
export const INITIAL_MONEY = 30000;

// violationRulesで画像にある主な違反と反則金をまとめ、判定とUI表示の両方で使う。
export const violationRules: Record<ViolationType, ViolationRule> = {
    distractedRiding: {
        type: "distractedRiding",
        label: "ながら走行",
        fine: 12000,
        hint: "スマホを見ながら走らず、前を見て運転しよう。",
    },
    railroadCrossing: {
        type: "railroadCrossing",
        label: "遮断踏切立入り",
        fine: 7000,
        hint: "遮断機が下りている踏切には入らないようにしよう。",
    },
    redLight: {
        type: "redLight",
        label: "信号無視",
        fine: 6000,
        hint: "赤信号では止まって、青になってから進もう。",
    },
    wrongSide: {
        type: "wrongSide",
        label: "通行区分違反",
        fine: 6000,
        hint: "道路では決められた場所を走ろう。",
    },
    stopSign: {
        type: "stopSign",
        label: "一時不停止",
        fine: 5000,
        hint: "止まれの標識では、停止線の前でいったん止まろう。",
    },
    badBrake: {
        type: "badBrake",
        label: "ブレーキ不良",
        fine: 5000,
        hint: "ブレーキがきく自転車に乗ろう。",
    },
    umbrellaOrEarphones: {
        type: "umbrellaOrEarphones",
        label: "傘差し・イヤホン・音楽",
        fine: 5000,
        hint: "傘やイヤホンを使いながら運転しないようにしよう。",
    },
    sideBySide: {
        type: "sideBySide",
        label: "並んで走行",
        fine: 3000,
        hint: "友だちと横に並ばず、一列で走ろう。",
    },
    noLight: {
        type: "noLight",
        label: "無点灯走行",
        fine: 5000,
        hint: "暗い道ではライトをつけて走ろう。",
    },
    twoRiders: {
        type: "twoRiders",
        label: "2人乗り",
        fine: 3000,
        hint: "自転車は決められた人数で乗ろう。",
    },
};

export function formatYen(value: number) {
    // toLocaleStringで3桁区切りにして、子供にも金額を読みやすくする。
    return `${value.toLocaleString("ja-JP")}円`;
}
