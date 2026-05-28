import cv2
import mediapipe as mp
import pandas as pd
from pathlib import Path

base_dir = Path(__file__).resolve().parent
csv_file = base_dir / "landmark_data" / "hand_landmarks.csv"

# MediaPipe Hands　セットアップ
mp_hands = mp.solutions.hands
hands = mp_hands.Hands(
    static_image_mode=False, max_num_hands=1, min_detection_confidence=0.5
)
mp_drawing = mp.solutions.drawing_utils

# カメラ　セットアップ
cap = cv2.VideoCapture(0)

# 手の座標データ収集
landmarks_data: list[str] = []


def collect_landmarks(label):
    global landmarks_data
    count = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            print("Failed")
            break

        # 画像を水平方向に反転
        frame = cv2.flip(frame, 1)

        # 画像をRGBに変換
        image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # 手のランドマーク　検出
        results = hands.process(image)

        # 画像をBGRに戻す
        frame = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)

        # ランドマークが検出された場合にデータを収集
        if results.multi_hand_landmarks:
            for hand_landmarks in results.multi_hand_landmarks:
                landmarks = []
                for lm in hand_landmarks.landmark:
                    landmarks.extend([lm.x, lm.y, lm.z])
                landmarks.append(label)
                landmarks_data.append(landmarks)
                mp_drawing.draw_landmarks(
                    frame, hand_landmarks, mp_hands.HAND_CONNECTIONS
                )
                count += 1
                print(f"Collected {count} images for {label}")

        # 画像表示
        cv2.imshow("Hand Landmarks", frame)

        # qキーが押されたら終了
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    print(f"Collected {len(landmarks_data)} data points for {label}")


gestures = [
    ("Rock", "グー（止まる）"),
    ("Paper", "パー（すすむ）"),
    ("Pointing_Left", "人差し指を画面の左へ向ける（左に曲がる）"),
    ("Pointing_Right", "人差し指を画面の右へ向ける（右に曲がる）"),
    ("Pointing_Down", "人差し指を下へ向ける（後ろに下がる）"),
]

for label, description in gestures:
    input(f"{description}: Enterで収集開始、qで次へ")
    collect_landmarks(label)


# CSVファイルに保存
try:
    columns = (
        [f"x{i}" for i in range(21)]
        + [f"y{i}" for i in range(21)]
        + [f"z{i}" for i in range(21)]
        + ["label"]
    )
    df = pd.DataFrame(landmarks_data, columns=columns)
    csv_file.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(csv_file, index=False)
    print(f"successfully: {csv_file}")
except Exception as e:
    print(f"Error: {e}")

# リソース　解放
cap.release()
cv2.destroyAllWindows()
