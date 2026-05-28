import { useCallback, useEffect, useRef, useState } from "react";
import type { HandDetector } from "@tensorflow-models/hand-pose-detection";
import type { VisionState } from "../types";
import { KerasHandClassifier } from "./kerasHandModel";

const defaultVisionState: VisionState = {
  status: "idle",
  handShape: "Rock",
  confidence: 0,
  message: "カメラを使うと手で操作できます",
};

function waitForVideoSize(video: HTMLVideoElement) {
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Camera video size stayed at 0."));
    }, 5000);

    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("loadedmetadata", check);
      video.removeEventListener("loadeddata", check);
      video.removeEventListener("resize", check);
    };

    const check = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        cleanup();
        resolve();
      }
    };

    video.addEventListener("loadedmetadata", check);
    video.addEventListener("loadeddata", check);
    video.addEventListener("resize", check);
  });
}

export function useHandVision() {
  // videoは画面表示用、canvasはMediaPipe Handsへ渡す1フレーム分の画像用。
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const detectorRef = useRef<HandDetector | null>(null);
  const classifierRef = useRef<KerasHandClassifier | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const videoFrameCallbackRef = useRef<number | null>(null);
  const isRunningRef = useRef(false);
  const frameCountRef = useRef(0);
  const [vision, setVision] = useState<VisionState>(defaultVisionState);

  const stop = useCallback(() => {
    // カメラ停止時はタイマー、映像フレーム監視、MediaStreamをまとめて止める。
    isRunningRef.current = false;

    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (videoFrameCallbackRef.current && videoRef.current?.cancelVideoFrameCallback) {
      videoRef.current.cancelVideoFrameCallback(videoFrameCallbackRef.current);
      videoFrameCallbackRef.current = null;
    }

    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    detectorRef.current?.reset();
    setVision(defaultVisionState);
  }, []);

  const start = useCallback(async () => {
    try {
      setVision((current) => ({
        ...current,
        status: "loading",
        message: "カメラをたしかめています",
      }));

      if (!window.isSecureContext) {
        throw new Error("Camera requires HTTPS or localhost.");
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera API is not available in this browser.");
      }

      setVision((current) => ({
        ...current,
        message: "モデルを読み込み中",
      }));

      // ブラウザ上ではTensorFlow.js経由でMediaPipe Handsを動かす。
      await import("@tensorflow/tfjs-backend-webgl");
      const tf = await import("@tensorflow/tfjs-core");
      try {
        await tf.setBackend("webgl");
      } catch {
        await tf.setBackend("cpu");
      }
      await tf.ready();

      const handPoseDetection = await import("@tensorflow-models/hand-pose-detection");
      const [detector, classifier] = await Promise.all([
        handPoseDetection.createDetector(handPoseDetection.SupportedModels.MediaPipeHands, {
          runtime: "tfjs",
          modelType: "lite",
          maxHands: 1,
        }),
        KerasHandClassifier.load(),
      ]);
      detectorRef.current = detector;
      classifierRef.current = classifier;

      setVision((current) => ({
        ...current,
        message: "カメラを開いています",
      }));

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      if (!videoRef.current) {
        return;
      }

      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      await waitForVideoSize(videoRef.current);
      canvasRef.current = document.createElement("canvas");
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      isRunningRef.current = true;

      const scheduleNext = (detect: () => void) => {
        const video = videoRef.current;
        if (!video) {
          return;
        }

        if (video.requestVideoFrameCallback) {
          videoFrameCallbackRef.current = video.requestVideoFrameCallback(() => detect());
        } else {
          timerRef.current = window.setTimeout(detect, 90);
        }
      };

      const detect = async () => {
        if (!isRunningRef.current || !videoRef.current || !detectorRef.current) {
          return;
        }

        try {
          // videoの現在フレームをcanvasに写し、その画像から手のランドマークを推定する。
          const video = videoRef.current;

          if (
            video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
            video.videoWidth === 0 ||
            video.videoHeight === 0
          ) {
            scheduleNext(detect);
            return;
          }

          if (!canvasRef.current) {
            canvasRef.current = document.createElement("canvas");
          }

          if (canvasRef.current.width !== video.videoWidth || canvasRef.current.height !== video.videoHeight) {
            canvasRef.current.width = video.videoWidth;
            canvasRef.current.height = video.videoHeight;
          }

          const context = canvasRef.current.getContext("2d", { willReadFrequently: true });
          if (!context) {
            scheduleNext(detect);
            return;
          }

          context.drawImage(video, 0, 0, canvasRef.current.width, canvasRef.current.height);

          const hands = await detectorRef.current.estimateHands(canvasRef.current, {
            // カメラ映像はCSSで左右反転して表示しているため、ランドマークも左右反転する。
            // これにより、Pointing_Left/Rightが子供に見えている画面上の向きと一致する。
            flipHorizontal: true,
            staticImageMode: true,
          });

          if (hands[0]?.keypoints?.length && classifierRef.current) {
            frameCountRef.current += 1;
            // MediaPipe Handsの21点ランドマークを、手形分類モデルとルール判定へ渡す。
            const result = classifierRef.current.predict(hands[0].keypoints, hands[0].keypoints3D, {
              width: canvasRef.current.width,
              height: canvasRef.current.height,
            });
            setVision({
              status: "ready",
              handShape: result.handShape,
              confidence: result.confidence,
              probabilities: result.probabilities,
              frame: frameCountRef.current,
              message: "手をみています",
            });
          } else {
            frameCountRef.current += 1;
            setVision((current) => ({
              ...current,
              status: "ready",
              handShape: "Rock",
              confidence: 0,
              probabilities: {
                Paper: 0,
                Rock: 0,
                Pointing_Left: 0,
                Pointing_Right: 0,
                Pointing_Down: 0,
              },
              frame: frameCountRef.current,
              message: "手を画面の中央に見せてください",
            }));
          }
        } catch (error) {
          console.error("Hand detection frame failed", error);
          setVision((current) => ({
            ...current,
            status: "error",
            confidence: 0,
            message: "手の読みとりをやりなおしています",
          }));
        }

        scheduleNext(detect);
      };

      scheduleNext(detect);
    } catch (error) {
      console.error("Hand vision failed", error);
      const isBlocked = error instanceof DOMException && ["NotAllowedError", "NotFoundError"].includes(error.name);
      const message = error instanceof Error ? error.message : "";
      const isInsecureContext = message.includes("HTTPS or localhost");
      const isModelLoadError =
        message.includes("Failed to fetch") ||
        message.includes("tfhub.dev") ||
        message.includes("loadGraphModel") ||
        message.includes("fetch");
      setVision({
        status: isBlocked || isInsecureContext ? "camera-blocked" : "error",
        handShape: "Rock",
        confidence: 0,
        message:
          isBlocked || isInsecureContext
            ? "カメラは localhost か HTTPS で使えます"
            : isModelLoadError
              ? "手のモデルをネットから読みこめません"
              : "手の操作を読みこめませんでした",
      });
    }
  }, []);

  useEffect(() => stop, [stop]);

  return {
    videoRef,
    vision,
    start,
    stop,
  };
}
