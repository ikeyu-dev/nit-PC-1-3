import { useEffect, useRef } from "react";
import { DrivingScene } from "../game/DrivingScene";
import type { DriveCommand } from "../types";

type GameCanvasProps = {
  command: DriveCommand;
  onDriveStart: () => void;
  onLap: (lap: number) => void;
};

export function GameCanvas({ command, onDriveStart, onLap }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<DrivingScene | null>(null);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    const scene = new DrivingScene({
      canvas: canvasRef.current,
      onDriveStart,
      onLap,
    });
    sceneRef.current = scene;
    scene.start();

    const resize = () => scene.resize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      scene.dispose();
      sceneRef.current = null;
    };
  }, [onDriveStart, onLap]);

  useEffect(() => {
    sceneRef.current?.setCommand(command);
  }, [command]);

  return <canvas ref={canvasRef} className="game-canvas" aria-label="3D driving park" />;
}
