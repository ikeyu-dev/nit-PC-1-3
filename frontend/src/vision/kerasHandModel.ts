import type { HandShape } from "../types";
import { classifyHandShapeFromRules, type Keypoint } from "./handClassifier";

type DenseLayer = {
  kernel: number[][];
  bias: number[];
  activation: "relu" | "softmax";
};

type KerasModelPayload = {
  labels: string[];
  layers: DenseLayer[];
};

type SourceSize = {
  width: number;
  height: number;
};

function dense(input: number[], layer: DenseLayer) {
  // Python/Kerasで学習したDense層を、ブラウザ上で同じ計算になるように実行する。
  const output = layer.bias.map((bias, outputIndex) => {
    let sum = bias;
    for (let inputIndex = 0; inputIndex < input.length; inputIndex += 1) {
      const inputValue = Number.isFinite(input[inputIndex]) ? input[inputIndex] : 0;
      const weight = layer.kernel[inputIndex]?.[outputIndex];
      const weightValue = Number.isFinite(weight) ? weight : 0;
      sum += inputValue * weightValue;
    }
    return layer.activation === "relu" ? Math.max(0, sum) : sum;
  });

  if (layer.activation !== "softmax") {
    return output;
  }

  const max = Math.max(...output);
  const exp = output.map((value) => Math.exp(value - max));
  const total = exp.reduce((sum, value) => sum + value, 0);
  return exp.map((value) => value / total);
}

function toFinite(value: number | undefined, fallback = 0) {
  return Number.isFinite(value) ? value! : fallback;
}

function toModelInput(keypoints: Keypoint[], keypoints3D: Keypoint[] | undefined, source: SourceSize) {
  return keypoints.flatMap((keypoint, index) => {
    const x = toFinite(keypoint.x) / source.width;
    const y = toFinite(keypoint.y) / source.height;
    // keypoints3D.z from the TFJS hand detector is not compatible with
    // MediaPipe's normalized lm.z used by the original Keras training data.
    const z = 0;

    return [x, y, z];
  });
}

function isHandShape(value: string | undefined): value is HandShape {
  return (
    value === "Rock" ||
    value === "Paper" ||
    value === "Pointing_Left" ||
    value === "Pointing_Right" ||
    value === "Pointing_Down"
  );
}

export class KerasHandClassifier {
  private constructor(private readonly payload: KerasModelPayload) {}

  static async load() {
    // model.pyが出力したフロント用JSONを読み込み、ブラウザだけで分類できるようにする。
    const response = await fetch("/models/hand_model.json");
    if (!response.ok) {
      throw new Error(`Could not load Keras hand model: ${response.status}`);
    }

    return new KerasHandClassifier((await response.json()) as KerasModelPayload);
  }

  predict(keypoints: Keypoint[], keypoints3D: Keypoint[] | undefined, source: SourceSize) {
    if (keypoints.length < 21 || source.width <= 0 || source.height <= 0) {
      return { handShape: "Rock" as HandShape, confidence: 0, probabilities: {} };
    }

    const input = toModelInput(keypoints, keypoints3D, source);
    const probabilities = this.payload.layers.reduce((values, layer) => dense(values, layer), input);
    let bestIndex = 0;
    for (let index = 1; index < probabilities.length; index += 1) {
      if ((probabilities[index] ?? 0) > (probabilities[bestIndex] ?? 0)) {
        bestIndex = index;
      }
    }
    const confidence = probabilities[bestIndex] ?? 0;
    const modelHandShape = this.payload.labels[bestIndex];

    const ruleResult = classifyHandShapeFromRules(keypoints);
    const probabilityMap = Object.fromEntries(
      this.payload.labels.flatMap((label, index) => (isHandShape(label) ? [[label, probabilities[index] ?? 0]] : [])),
    ) as Partial<Record<HandShape, number>>;

    if (ruleResult.handShape.startsWith("Pointing_")) {
      // 指差しの向きは、子供が見ている画面上の方向を優先するためルール判定を採用する。
      return {
        ...ruleResult,
        probabilities: probabilityMap,
      };
    }

    if (
      !isHandShape(modelHandShape) ||
      !Number.isFinite(confidence) ||
      confidence < 0.78 ||
      (modelHandShape === "Rock" && confidence < 0.9)
    ) {
      return {
        ...ruleResult,
        probabilities: probabilityMap,
      };
    }

    if (modelHandShape === "Rock" && ruleResult.handShape !== "Rock") {
      return {
        ...ruleResult,
        probabilities: probabilityMap,
      };
    }

    return {
      handShape: modelHandShape,
      confidence,
      probabilities: probabilityMap,
    };
  }
}
