import { useEffect, useRef } from "react";
import { DrivingScene } from "../game/DrivingScene";
import type { DriveCommand, ViolationEvent } from "../types";

type GameCanvasProps = {
  command: DriveCommand;
  onDriveStart: () => void;
  onLap: (lap: number) => void;
  onViolation: (violation: ViolationEvent) => void;
};

export function GameCanvas({ command, onDriveStart, onLap, onViolation }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<DrivingScene | null>(null);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    // canvas要素からThree.jsのDrivingSceneを作り、3D道路と自転車を描画する。
    const scene = new DrivingScene({
      canvas: canvasRef.current,
      onDriveStart,
      onLap,
      onViolation,
    });
    sceneRef.current = scene;
    scene.start();

    // ウィンドウサイズ変更でcanvasの描画サイズとカメラ比率を合わせ直す。
    const resize = () => scene.resize();
    window.addEventListener("resize", resize);

    return () => {
      // コンポーネント破棄時にアニメーションとWebGLリソースを片付けるため。
      window.removeEventListener("resize", resize);
      scene.dispose();
      sceneRef.current = null;
    };
  }, [onDriveStart, onLap, onViolation]);

  useEffect(() => {
    // React側で決まった操作を、次のThree.js更新で使う。
    sceneRef.current?.setCommand(command);
  }, [command]);

  return <canvas ref={canvasRef} className="game-canvas" aria-label="3D driving park" />;
}
