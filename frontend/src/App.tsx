import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CameraPanel } from "./components/CameraPanel";
import { GameCanvas } from "./components/GameCanvas";
import { Hud } from "./components/Hud";
import { commandByHandShape } from "./game/commands";
import type { HandShape } from "./types";
import { useHandVision } from "./vision/useHandVision";

function formatTime(ms: number) {
  return `${(ms / 1000).toFixed(2)}s`;
}

export function App() {
  const { videoRef, vision, start } = useHandVision();
  const [driveShape, setDriveShape] = useState<HandShape>("Rock");
  const timerStartRef = useRef<number | null>(null);
  const [isTiming, setIsTiming] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [clearTimeMs, setClearTimeMs] = useState<number | null>(null);
  const command = useMemo(() => commandByHandShape[driveShape], [driveShape]);

  useEffect(() => {
    void start();
  }, [start]);

  useEffect(() => {
    // ゴール画面を表示している間は、カメラ入力で車が再スタートしないようにする。
    if (clearTimeMs !== null) {
      return;
    }

    if (vision.status !== "ready") {
      return;
    }

    if (vision.confidence <= 0) {
      // 手が見えなくなったら、直前の操作を残さず安全側の停止へ戻す。
      setDriveShape("Rock");
      return;
    }

    // グーは誤検出で停止しやすいので、少し高めの信頼度だけ採用する。
    if (vision.handShape === "Rock" && vision.confidence < 0.86) {
      return;
    }

    setDriveShape(vision.handShape);
  }, [clearTimeMs, vision.handShape, vision.confidence, vision.status]);

  useEffect(() => {
    if (!isTiming) {
      return;
    }

    const interval = window.setInterval(() => {
      if (timerStartRef.current !== null) {
        setElapsedMs(performance.now() - timerStartRef.current);
      }
    }, 80);

    return () => window.clearInterval(interval);
  }, [isTiming]);

  const handleDriveStart = useCallback(() => {
    // 最初に車が動き出した瞬間をスタート時刻にする。
    if (timerStartRef.current !== null) {
      return;
    }

    timerStartRef.current = performance.now();
    setElapsedMs(0);
    setClearTimeMs(null);
    setIsTiming(true);
  }, []);

  const handleLap = useCallback(() => {
    if (timerStartRef.current === null) {
      return;
    }

    // ゴールに入った瞬間の経過時間を固定して、ゴール画面に表示する。
    const clearTime = performance.now() - timerStartRef.current;
    timerStartRef.current = null;
    setElapsedMs(clearTime);
    setClearTimeMs(clearTime);
    setIsTiming(false);
    setDriveShape("Rock");
  }, []);

  const handleRestart = useCallback(() => {
    timerStartRef.current = null;
    setElapsedMs(0);
    setClearTimeMs(null);
    setIsTiming(false);
    setDriveShape("Rock");
  }, []);

  return (
    <main className="app-shell">
      <GameCanvas command={command} onDriveStart={handleDriveStart} onLap={handleLap} />
      <div className="ui-layer">
        <Hud command={command} vision={vision} elapsedMs={elapsedMs} clearTimeMs={clearTimeMs} isTiming={isTiming} />
        <div className="bottom-panel">
          <CameraPanel videoRef={videoRef} vision={vision} />
        </div>
      </div>
      {clearTimeMs !== null && (
        <div className="goal-overlay" role="dialog" aria-modal="true" aria-label="ゴール">
          <div className="goal-panel">
            <p className="goal-title">ゴール!</p>
            <p className="goal-time">{formatTime(clearTimeMs)}</p>
            <button type="button" onClick={handleRestart}>
              もう一回
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
