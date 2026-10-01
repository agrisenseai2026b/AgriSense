import os
import pandas as pd
import joblib

from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix


# ==========================================
# 1. LOAD DATASET
# ==========================================

DATA_PATH = "data/crop_data.csv"
MODEL_PATH = "models/crop_recommendation_model.pkl"

df = pd.read_csv(DATA_PATH)

print("\nDataset loaded successfully!")
print("Dataset shape:", df.shape)
print("\nColumns:")
print(df.columns.tolist())


# ==========================================
# 2. DEFINE FEATURES AND TARGET
# ==========================================

features = [
    "N",
    "P",
    "K",
    "temperature",
    "humidity",
    "ph",
    "rainfall"
]

target = "label"


# Check that required columns exist
missing_columns = [col for col in features + [target] if col not in df.columns]

if missing_columns:
    raise ValueError(
        f"\nThese columns are missing from your dataset: {missing_columns}"
    )


X = df[features]
y = df[target]


# ==========================================
# 3. HANDLE MISSING VALUES
# ==========================================

print("\nMissing values:")
print(X.isnull().sum())

X = X.copy()

for column in features:
    X[column] = pd.to_numeric(X[column], errors="coerce")

X = X.fillna(X.median())


# ==========================================
# 4. SPLIT DATA
# ==========================================

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.20,
    random_state=42,
    stratify=y
)

print("\nTraining samples:", len(X_train))
print("Testing samples:", len(X_test))


# ==========================================
# 5. CREATE MODEL
# ==========================================

model = RandomForestClassifier(
    n_estimators=300,
    max_depth=None,
    min_samples_split=2,
    min_samples_leaf=1,
    random_state=42,
    n_jobs=-1,
    class_weight="balanced"
)


# ==========================================
# 6. TRAIN MODEL
# ==========================================

print("\nTraining model...")

model.fit(X_train, y_train)

print("Training completed!")


# ==========================================
# 7. TEST MODEL
# ==========================================

y_pred = model.predict(X_test)

accuracy = accuracy_score(y_test, y_pred)

print("\n================================")
print("MODEL RESULTS")
print("================================")

print(f"Accuracy: {accuracy * 100:.2f}%")

print("\nClassification Report:")
print(classification_report(y_test, y_pred))

print("\nConfusion Matrix:")
print(confusion_matrix(y_test, y_pred))


# ==========================================
# 8. FEATURE IMPORTANCE
# ==========================================

print("\n================================")
print("FEATURE IMPORTANCE")
print("================================")

importance = pd.DataFrame({
    "feature": features,
    "importance": model.feature_importances_
})

importance = importance.sort_values(
    by="importance",
    ascending=False
)

print(importance)


# ==========================================
# 9. SAVE MODEL
# ==========================================

os.makedirs("models", exist_ok=True)

model_data = {
    "model": model,
    "features": features
}

joblib.dump(model_data, MODEL_PATH)

print("\n================================")
print("MODEL SAVED")
print("================================")
print(f"Saved to: {MODEL_PATH}")