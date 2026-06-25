export type HandShape = "Rock" | "Paper" | "Pointing_Left" | "Pointing_Right" | "Pointing_Down";

// DriveCommandで3Dシーンへ渡す操作内容をまとめ、速度と旋回を制御する。
export type DriveCommand = {
  action: BodyAction;
  label: string;
  speedTarget: number;
  turnTarget: number;
};

export type VisionStatus = "idle" | "loading" | "ready" | "camera-blocked" | "error";

// BodyActionで体の動きをゲーム内の意味へ置き換え、手の形に依存しない操作にする。
export type BodyAction =
  | "idle"
  | "pedal"
  | "brake"
  | "signalLeft"
  | "signalRight"
  | "lookLeft"
  | "lookRight"
  | "lightOn";

export type VisionState = {
  status: VisionStatus;
  handShape: HandShape;
  confidence: number;
  message: string;
  probabilities?: Partial<Record<HandShape, number>>;
  frame?: number;
};

// BodyVisionStateで全身姿勢推定の状態をUIと操作変換で共有する。
export type BodyVisionState = {
  status: VisionStatus;
  action: BodyAction;
  confidence: number;
  message: string;
  frame?: number;
};

// ViolationTypeでゲームに登場する自転車違反の種類を固定する。
export type ViolationType =
  | "distractedRiding"
  | "railroadCrossing"
  | "redLight"
  | "wrongSide"
  | "stopSign"
  | "badBrake"
  | "umbrellaOrEarphones"
  | "sideBySide"
  | "noLight"
  | "twoRiders";

export type ViolationRule = {
  type: ViolationType;
  label: string;
  fine: number;
  hint: string;
};

// ViolationEventで実際に発生した違反を識別し、同じ表示を再利用できるようにする。
export type ViolationEvent = ViolationRule & {
  id: string;
};
