import { useCallback, useEffect, useRef, useState } from "react";
import type { PoseDetector } from "@tensorflow-models/pose-detection";
import type { BodyAction, BodyVisionState } from "../types";

type PoseKeypoint = {
    name?: string;
    x: number;
    y: number;
    score?: number;
};

const defaultVisionState: BodyVisionState = {
    status: "idle",
    action: "idle",
    confidence: 0,
    message: "カメラを使うと体全体で操作できます",
};

function waitForVideoSize(video: HTMLVideoElement) {
    // videoWidth/videoHeightが取れるまで待ち、姿勢推定へ空の映像を渡さないようにする。
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

function keypointMap(keypoints: PoseKeypoint[]) {
    // keypoint名で検索しやすくするため、配列をMapへ変換する。
    return new Map(keypoints.filter((point) => point.name).map((point) => [point.name, point]));
}

function visible(point: PoseKeypoint | undefined, minScore = 0.28): point is PoseKeypoint {
    // scoreで見えている体の点だけを採用し、誤検出を操作に使わないようにする。
    return !!point && (point.score ?? 0) >= minScore;
}

function classifyBodyAction(keypoints: PoseKeypoint[], previousAnkleY: number | null): BodyAction {
    // MoveNetの骨格点から肩・手首・足首・鼻を取り出し、ゲーム操作へ変換する。
    const points = keypointMap(keypoints);
    const leftShoulder = points.get("left_shoulder");
    const rightShoulder = points.get("right_shoulder");
    const leftWrist = points.get("left_wrist");
    const rightWrist = points.get("right_wrist");
    const leftAnkle = points.get("left_ankle");
    const rightAnkle = points.get("right_ankle");
    const nose = points.get("nose");

    if (!visible(leftShoulder) || !visible(rightShoulder)) {
        // 肩が見えない時は全身姿勢が安定しないため、安全側の停止にする。
        return "idle";
    }

    const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
    const shoulderCenterX = (leftShoulder.x + rightShoulder.x) / 2;
    const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;

    if (
        visible(leftWrist) &&
        visible(rightWrist) &&
        leftWrist.y < shoulderY - shoulderWidth * 0.18 &&
        rightWrist.y < shoulderY - shoulderWidth * 0.18
    ) {
        // 両手を上げた姿勢でライトONにし、夜道の無点灯走行を避ける操作にする。
        return "lightOn";
    }

    if (
        visible(leftWrist) &&
        leftWrist.x < leftShoulder.x - shoulderWidth * 0.36 &&
        Math.abs(leftWrist.y - shoulderY) < shoulderWidth * 0.55
    ) {
        // 左手首が左肩より外側に出たら、左に曲がる合図として扱う。
        return "signalLeft";
    }

    if (
        visible(rightWrist) &&
        rightWrist.x > rightShoulder.x + shoulderWidth * 0.36 &&
        Math.abs(rightWrist.y - shoulderY) < shoulderWidth * 0.55
    ) {
        // 右手首が右肩より外側に出たら、右に曲がる合図として扱う。
        return "signalRight";
    }

    if (visible(nose) && Math.abs(nose.x - shoulderCenterX) > shoulderWidth * 0.2) {
        // 顔が肩の中心から左右へずれたら、左右確認として扱う。
        return nose.x < shoulderCenterX ? "lookLeft" : "lookRight";
    }

    if (visible(leftAnkle) && visible(rightAnkle)) {
        const ankleY = (leftAnkle.y + rightAnkle.y) / 2;
        if (previousAnkleY !== null && Math.abs(ankleY - previousAnkleY) > shoulderWidth * 0.05) {
            // 足首の上下変化で足踏みを検出し、前へ進む操作にする。
            return "pedal";
        }
    }

    // どの動きにも当てはまらない時は止まる操作にする。
    return "idle";
}

export function useBodyVision() {
    // videoRefでカメラ映像を画面表示と姿勢推定の入力に使う。
    const videoRef = useRef<HTMLVideoElement | null>(null);
    // detectorRefでMoveNetの検出器を保持し、毎フレーム再生成しないようにする。
    const detectorRef = useRef<PoseDetector | null>(null);
    const timerRef = useRef<number | null>(null);
    const videoFrameCallbackRef = useRef<number | null>(null);
    const isRunningRef = useRef(false);
    const frameCountRef = useRef(0);
    const previousAnkleYRef = useRef<number | null>(null);
    const [vision, setVision] = useState<BodyVisionState>(defaultVisionState);

    const stop = useCallback(() => {
        // stopでタイマー・カメラ・検出器をまとめて止め、再起動できる状態に戻す。
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

        detectorRef.current?.dispose();
        detectorRef.current = null;
        previousAnkleYRef.current = null;
        setVision(defaultVisionState);
    }, []);

    const start = useCallback(async () => {
        try {
            // startでモデル読み込み、カメラ起動、フレームごとの姿勢推定を開始する。
            setVision((current) => ({
                ...current,
                status: "loading",
                message: "カメラをたしかめています",
            }));

            if (!window.isSecureContext) {
                throw new Error("Camera requires HTTPS or localhost.");
            }

            setVision((current) => ({
                ...current,
                message: "全身モデルを読み込み中",
            }));

            await import("@tensorflow/tfjs-backend-webgl");
            const tf = await import("@tensorflow/tfjs-core");
            try {
                // WebGLで高速に推定し、使えない環境ではCPUへ切り替える。
                await tf.setBackend("webgl");
            } catch {
                await tf.setBackend("cpu");
            }
            await tf.ready();

            const poseDetection = await import("@tensorflow-models/pose-detection");
            // MoveNet Lightningで軽量な単人姿勢推定を行い、ブラウザ上で動かしやすくする。
            const detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
                modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
            });
            detectorRef.current = detector;

            setVision((current) => ({
                ...current,
                message: "カメラを開いています",
            }));

            const stream = await navigator.mediaDevices.getUserMedia({
                // user-facingカメラでプレイヤーの体を映し、音声は使わない。
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
            isRunningRef.current = true;

            const scheduleNext = (detect: () => Promise<void>) => {
                // setTimeoutで次の推定を予約し、Promiseはvoidで明示して未処理にしない。
                const video = videoRef.current;
                if (!video) {
                    return;
                }

                timerRef.current = window.setTimeout(() => {
                    void detect();
                }, 90);
            };

            const detect = async () => {
                // detectで1フレーム分の姿勢を推定し、BodyVisionStateへ反映する。
                if (!isRunningRef.current || !videoRef.current || !detectorRef.current) {
                    return;
                }

                try {
                    const video = videoRef.current;
                    if (
                        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
                        video.videoWidth === 0 ||
                        video.videoHeight === 0
                    ) {
                        scheduleNext(detect);
                        return;
                    }

                    const poses = await detectorRef.current.estimatePoses(video, {
                        // 画面表示と同じ左右反転で、プレイヤーから見た左右を一致させる。
                        flipHorizontal: true,
                    });

                    frameCountRef.current += 1;
                    const pose = poses[0];
                    if (pose.keypoints.length > 0) {
                        const keypoints = pose.keypoints as PoseKeypoint[];
                        // 骨格点をゲーム操作へ変換し、React側へ渡す。
                        const action = classifyBodyAction(keypoints, previousAnkleYRef.current);
                        const points = keypointMap(keypoints);
                        const leftAnkle = points.get("left_ankle");
                        const rightAnkle = points.get("right_ankle");
                        if (visible(leftAnkle) && visible(rightAnkle)) {
                            // 次フレームで足踏みを判定するため、現在の足首位置を保存する。
                            previousAnkleYRef.current = (leftAnkle.y + rightAnkle.y) / 2;
                        }

                        setVision({
                            status: "ready",
                            action,
                            confidence: typeof pose.score === "number" ? pose.score : 0,
                            frame: frameCountRef.current,
                            message: "体の動きを見ています",
                        });
                    } else {
                        setVision({
                            status: "ready",
                            action: "idle",
                            confidence: 0,
                            frame: frameCountRef.current,
                            message: "全身が映るように少し下がってください",
                        });
                    }
                } catch (error) {
                    console.error("Body detection frame failed", error);
                    setVision((current) => ({
                        ...current,
                        status: "error",
                        action: "idle",
                        confidence: 0,
                        message: "体の読みとりをやりなおしています",
                    }));
                }

                scheduleNext(detect);
            };

            scheduleNext(detect);
        } catch (error) {
            console.error("Body vision failed", error);
            const isBlocked = error instanceof DOMException && ["NotAllowedError", "NotFoundError"].includes(error.name);
            const message = error instanceof Error ? error.message : "";
            const isInsecureContext = message.includes("HTTPS or localhost");
            setVision({
                status: isBlocked || isInsecureContext ? "camera-blocked" : "error",
                action: "idle",
                confidence: 0,
                message:
                    isBlocked || isInsecureContext
                        ? "カメラは localhost か HTTPS で使えます"
                        : "体の操作を読みこめませんでした",
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
