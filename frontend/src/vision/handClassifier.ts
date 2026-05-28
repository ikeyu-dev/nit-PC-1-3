import type { HandShape } from "../types";

export type Keypoint = {
  x: number;
  y: number;
  z?: number;
  name?: string;
};

// MediaPipe Handsのランドマーク番号:
// 親指/人差し指/中指/薬指/小指の指先 = 4/8/12/16/20、
// 手のひらに近い第一関節 = 3/6/10/14/18、
// 手のひら側の付け根 = 2/5/9/13/17。
const tipIndexes = [4, 8, 12, 16, 20];
const pipIndexes = [3, 6, 10, 14, 18];
const mcpIndexes = [2, 5, 9, 13, 17];

// 指差し方向は、もう片方の軸より1.25倍以上強い場合だけ採用する。
// 斜め向きの指差しを左/右/下として過剰に判定しないためのしきい値。
const directionDominance = 1.25;

function distance(a: Keypoint, b: Keypoint) {
  const zA = a.z ?? 0;
  const zB = b.z ?? 0;
  return Math.hypot(a.x - b.x, a.y - b.y, zA - zB);
}

function fingerStates(keypoints: Keypoint[]) {
  const wrist = keypoints[0];
  const fingers = tipIndexes.map((tipIndex, index) => {
    const tip = keypoints[tipIndex];
    const pip = keypoints[pipIndexes[index]];
    const mcp = keypoints[mcpIndexes[index]];

    if (index === 0) {
      // 親指は手の回転でy座標が大きく変わるため、指先と付け根の距離で開閉を見る。
      return distance(tip, mcp) > distance(pip, mcp) * 1.08;
    }

    // 親指以外は、指先が中間関節より手首から遠ければ伸びているとみなす。
    return distance(tip, wrist) > distance(pip, wrist) * 1.12;
  });

  const longFingerOpenness = [fingers[1], fingers[2], fingers[3], fingers[4]].filter(Boolean).length / 4;

  return {
    thumb: fingers[0],
    index: fingers[1],
    middle: fingers[2],
    ring: fingers[3],
    pinky: fingers[4],
    openness: longFingerOpenness,
  };
}

export function classifyHandShapeFromRules(keypoints: Keypoint[]): { handShape: HandShape; confidence: number } {
  if (keypoints.length < 21) {
    return { handShape: "Rock", confidence: 0 };
  }

  const fingers = fingerStates(keypoints);
  const openLongFingers = [fingers.index, fingers.middle, fingers.ring, fingers.pinky].filter(Boolean).length;

  if (openLongFingers >= 3) {
    // 親指以外の指が3本以上伸びていればパーとみなす。
    return { handShape: "Paper", confidence: Math.max(0.72, fingers.openness) };
  }

  if (fingers.index && openLongFingers <= 2 && !fingers.ring && !fingers.pinky) {
    // 人差し指の方向は、ランドマーク5（人差し指の付け根）から8（指先）への向きで見る。
    // useHandVision.tsで検出結果を左右反転しているため、dx/dyはカメラ画面の見た目と一致する。
    const indexBase = keypoints[5];
    const indexTip = keypoints[8];
    const dx = indexTip.x - indexBase.x;
    const dy = indexTip.y - indexBase.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (absX > absY * directionDominance) {
      return {
        // プレビュー画面ではx座標が右方向に増える。
        handShape: dx < 0 ? "Pointing_Left" : "Pointing_Right",
        confidence: Math.min(0.94, 0.78 + absX / Math.max(absX + absY, 1)),
      };
    }

    if (dy > 0 && absY > absX * directionDominance) {
      return {
        // プレビュー画面ではy座標が下方向に増える。
        handShape: "Pointing_Down",
        confidence: Math.min(0.94, 0.78 + absY / Math.max(absX + absY, 1)),
      };
    }

    return { handShape: "Rock", confidence: 0.62 };
  }

  return { handShape: "Rock", confidence: Math.max(0.7, 1 - fingers.openness) };
}
