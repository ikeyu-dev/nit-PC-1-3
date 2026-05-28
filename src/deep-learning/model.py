import pandas as pd
import numpy as np
import json
from pathlib import Path
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
import tensorflow as tf
from tensorflow.keras.utils import to_categorical
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Dense, Dropout

base_dir = Path(__file__).resolve().parent
csv_path = base_dir / "landmark_data" / "hand_landmarks.csv"
model_dir = base_dir / "model"
frontend_model_path = base_dir.parent.parent / "frontend" / "public" / "models" / "hand_model.json"

# データを読み込む
df = pd.read_csv(csv_path)

# 特徴量（X）とラベル（y）に分ける
X = df.drop("label", axis=1).values
y = df["label"].values
expected_labels = {"Rock", "Paper", "Pointing_Left", "Pointing_Right", "Pointing_Down"}
unknown_labels = sorted(set(y) - expected_labels)
missing_labels = sorted(expected_labels - set(y))
if unknown_labels or missing_labels:
    raise ValueError(
        f"Unexpected labels: {unknown_labels}. Missing labels: {missing_labels}. "
        "Collect fresh data with collect.py before training."
    )

# ラベルを数値にエンコード
label_encoder = LabelEncoder()
y_encoded = label_encoder.fit_transform(y)

num_classes = len(label_encoder.classes_)

# One-hot encoding
y_categorical = to_categorical(y_encoded, num_classes=num_classes)

# 訓練データとテストデータに分割
X_train, X_test, y_train, y_test = train_test_split(
    X, y_categorical, test_size=0.2, random_state=42
)


# モデルの構築
model = Sequential()

# 入力層
model.add(Dense(64, input_shape=(X_train.shape[1],), activation="relu"))

# 中間層
model.add(Dense(64, activation="relu"))
model.add(Dropout(0.5))  # 過学習防止のためのDropout層

# 出力層
model.add(Dense(num_classes, activation="softmax"))

# モデルのコンパイル
model.compile(optimizer="adam", loss="categorical_crossentropy", metrics=["accuracy"])

# モデルの概要を表示
model.summary()

# モデルの学習
history = model.fit(
    X_train, y_train, epochs=10, batch_size=32, validation_data=(X_test, y_test)
)

# モデルの評価
loss, accuracy = model.evaluate(X_test, y_test)
print(f"Test Accuracy: {accuracy * 100:.2f}%")

# モデルの保存
model_dir.mkdir(parents=True, exist_ok=True)
model.save(model_dir / "hand_model.keras")

labels = label_encoder.classes_.tolist()
(model_dir / "labels.json").write_text(
    json.dumps(labels, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

dense_layers = []
for layer in model.layers:
    if not isinstance(layer, Dense):
        continue
    kernel, bias = layer.get_weights()
    dense_layers.append(
        {
            "kernel": kernel.tolist(),
            "bias": bias.tolist(),
            "activation": layer.activation.__name__,
        }
    )

frontend_model_path.parent.mkdir(parents=True, exist_ok=True)
frontend_model_path.write_text(
    json.dumps({"labels": labels, "layers": dense_layers}, ensure_ascii=False, indent=2),
    encoding="utf-8",
)
