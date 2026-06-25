import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CameraPanel } from "./components/CameraPanel";
import { GameCanvas } from "./components/GameCanvas";
import { Hud } from "./components/Hud";
import { ViolationCard } from "./components/ViolationCard";
import { commandByBodyAction } from "./game/commands";
import { INITIAL_MONEY } from "./game/trafficRules";
import type { BodyAction, ViolationEvent } from "./types";
import { useBodyVision } from "./vision/useBodyVision";

function formatTime(ms: number) {
  return `${(ms / 1000).toFixed(2)}s`;
}

export function App() {
  const { videoRef, vision, start } = useBodyVision();
  const [bodyAction, setBodyAction] = useState<BodyAction>("idle");
  const [money, setMoney] = useState(INITIAL_MONEY);
  const [lastViolation, setLastViolation] = useState<ViolationEvent | null>(null);
  const timerStartRef = useRef<number | null>(null);
  const violationTimerRef = useRef<number | null>(null);
  const [isTiming, setIsTiming] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [clearTimeMs, setClearTimeMs] = useState<number | null>(null);
  const command = useMemo(() => commandByBodyAction[bodyAction], [bodyAction]);

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
      // 体が見えなくなったら、直前の操作を残さず安全側の停止へ戻す。
      setBodyAction("idle");
      return;
    }

    if (vision.action !== "idle" && vision.confidence < 0.25) {
      return;
    }

    setBodyAction(vision.action);
  }, [clearTimeMs, vision.action, vision.confidence, vision.status]);

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
    setBodyAction("idle");
  }, []);

  const handleRestart = useCallback(() => {
    timerStartRef.current = null;
    setElapsedMs(0);
    setClearTimeMs(null);
    setIsTiming(false);
    setBodyAction("idle");
    setMoney(INITIAL_MONEY);
    setLastViolation(null);
  }, []);

  const handleViolation = useCallback((violation: ViolationEvent) => {
    setMoney((current) => Math.max(0, current - violation.fine));
    setLastViolation(violation);

    if (violationTimerRef.current !== null) {
      window.clearTimeout(violationTimerRef.current);
    }
    violationTimerRef.current = window.setTimeout(() => {
      setLastViolation(null);
      violationTimerRef.current = null;
    }, 5200);
  }, []);

  useEffect(() => {
    return () => {
      if (violationTimerRef.current !== null) {
        window.clearTimeout(violationTimerRef.current);
      }
    };
  }, []);

  return (
    <main className="app-shell">
      <GameCanvas command={command} onDriveStart={handleDriveStart} onLap={handleLap} onViolation={handleViolation} />
      <div className="ui-layer">
        <Hud
          command={command}
          vision={vision}
          money={money}
          elapsedMs={elapsedMs}
          clearTimeMs={clearTimeMs}
          isTiming={isTiming}
        />
        <ViolationCard violation={lastViolation} money={money} />
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
