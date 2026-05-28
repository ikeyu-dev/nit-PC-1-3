import type { RefObject } from "react";
import type { VisionState } from "../types";

type CameraPanelProps = {
  videoRef: RefObject<HTMLVideoElement>;
  vision: VisionState;
};

export function CameraPanel({ videoRef, vision }: CameraPanelProps) {
  return (
    <section className="camera-panel" aria-label="Hand camera controls">
      <div className="video-frame">
        <video ref={videoRef} muted playsInline />
        <div className="video-glow" />
      </div>
      <div className="camera-actions">
        <p>{vision.message}</p>
      </div>
    </section>
  );
}
