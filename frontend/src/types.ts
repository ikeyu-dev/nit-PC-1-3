export type HandShape = "Rock" | "Paper" | "Pointing_Left" | "Pointing_Right" | "Pointing_Down";

export type DriveCommand = {
  action: BodyAction;
  label: string;
  speedTarget: number;
  turnTarget: number;
};

export type VisionStatus = "idle" | "loading" | "ready" | "camera-blocked" | "error";

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

export type BodyVisionState = {
  status: VisionStatus;
  action: BodyAction;
  confidence: number;
  message: string;
  frame?: number;
};

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

export type ViolationEvent = ViolationRule & {
  id: string;
};
