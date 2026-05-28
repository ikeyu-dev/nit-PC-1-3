import cv2
import mediapipe as mp
import numpy as np
from tensorflow.keras.models import load_model
import time
import json
import os

# Mediapipe Handsのセットアップ
mp_hands = mp.solutions.hands
hands = mp_hands.Hands(
    static_image_mode=False, max_num_hands=1, min_detection_confidence=0.5
)
mp_drawing = mp.solutions.drawing_utils

model_path = os.path.join(os.path.dirname(__file__), "model/hand_model.keras")
labels_path = os.path.join(os.path.dirname(__file__), "model/labels.json")
model = load_model(model_path)
if os.path.exists(labels_path):
    with open(labels_path, encoding="utf-8") as f:
        labels = json.load(f)
else:
    labels = ["Paper", "Pointing_UP", "Rock"]


# 手のランドマークを抽出する関数
def extract_landmark_data(hand_landmarks):
    landmarks = []
    for lm in hand_landmarks.landmark:
        landmarks.extend([lm.x, lm.y, lm.z])
    return landmarks


# 手の形を判別する関数
def predict_hand_shape(landmarks):
    # ランドマークデータを正しい形に変換
    landmarks = np.array(landmarks).reshape(1, -1)

    # モデルで予測
    prediction = model.predict(landmarks)
    predicted_class = np.argmax(prediction)

    return labels[predicted_class]


# カメラのセットアップ
cap = cv2.VideoCapture(0)

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    # 画像を水平方向に反転
    frame = cv2.flip(frame, 1)

    # 画像をRGBに変換
    image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    # 手のランドマークの検出
    results = hands.process(image)

    # 画像をBGRに戻す
    frame = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)

    # ランドマークが検出された場合、手の形を判別
    if results.multi_hand_landmarks:
        for hand_landmarks in results.multi_hand_landmarks:
            # 手のランドマークデータを抽出
            landmarks = extract_landmark_data(hand_landmarks)

            # 手の形を判別
            hand_shape = predict_hand_shape(landmarks)

            # 結果を表示
            cv2.putText(
                frame,
                f"Predicted: {hand_shape}",
                (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX,
                1,
                (0, 255, 0),
                2,
                cv2.LINE_AA,
            )

            # ランドマークを描画
            mp_drawing.draw_landmarks(frame, hand_landmarks, mp_hands.HAND_CONNECTIONS)

    # 別ウィンドウで描画
    cv2.imshow("Hand Detection", frame)

    time.sleep(0.1)  # 通信の頻度制限

    # 'q'キーで終了
    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

# リソースの解放
cap.release()
cv2.destroyAllWindows()
