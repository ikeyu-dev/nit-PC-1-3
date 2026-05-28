import type { DriveCommand, VisionState } from "../types";

type HudProps = {
  command: DriveCommand;
  vision: VisionState;
  elapsedMs: number;
  clearTimeMs: number | null;
  isTiming: boolean;
};

function formatTime(ms: number) {
  return `${(ms / 1000).toFixed(2)}s`;
}

export function Hud({ command, vision, elapsedMs, clearTimeMs, isTiming }: HudProps) {
  const confidence = Math.round(vision.confidence * 100);
  const probabilities = `${confidence}%`;
  const timeLabel = clearTimeMs !== null ? formatTime(clearTimeMs) : isTiming ? formatTime(elapsedMs) : "0.00s";

  return (
    <header className="hud">
      <div className="status-strip">
        <div className="status-tile">
          <span>動き</span>
          <strong>{command.label}</strong>
        </div>
        <div className="status-tile">
          <span>手</span>
          <strong>{vision.status === "ready" && vision.confidence > 0 ? vision.handShape : "-"}</strong>
        </div>
        <div className="status-tile">
          <span>信頼度</span>
          <strong>{probabilities}</strong>
        </div>
        <div className="status-tile">
          <span>タイム</span>
          <strong>{timeLabel}</strong>
        </div>
      </div>
    </header>
  );
}
