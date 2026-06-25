import type { BodyVisionState, DriveCommand } from "../types";
import { formatYen } from "../game/trafficRules";

type HudProps = {
  command: DriveCommand;
  vision: BodyVisionState;
  money: number;
  elapsedMs: number;
  clearTimeMs: number | null;
  isTiming: boolean;
};

function formatTime(ms: number) {
  return `${(ms / 1000).toFixed(2)}s`;
}

export function Hud({ command, vision, money, elapsedMs, clearTimeMs, isTiming }: HudProps) {
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
          <span>所持金</span>
          <strong>{formatYen(money)}</strong>
        </div>
        <div className="status-tile">
          <span>体の検出</span>
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
