import type { RefObject } from "react";
import type { BodyVisionState } from "../types";

type CameraPanelProps = {
  videoRef: RefObject<HTMLVideoElement>;
  vision: BodyVisionState;
};

export function CameraPanel({ videoRef, vision }: CameraPanelProps) {
  return (
    <section className="camera-panel" aria-label="Body camera controls">
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
