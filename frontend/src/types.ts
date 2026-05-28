export type HandShape = "Rock" | "Paper" | "Pointing_Left" | "Pointing_Right" | "Pointing_Down";

export type DriveCommand = {
  handShape: HandShape;
  label: string;
  speedTarget: number;
  turnTarget: number;
};

export type VisionStatus = "idle" | "loading" | "ready" | "camera-blocked" | "error";

export type VisionState = {
  status: VisionStatus;
  handShape: HandShape;
  confidence: number;
  message: string;
  probabilities?: Partial<Record<HandShape, number>>;
  frame?: number;
};
