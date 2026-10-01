import os
import pandas as pd
import joblib

from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report


# ==============================
# LOAD DATA
# ==============================

DATA_PATH = "data/fertilizer_data.csv"
MODEL_PATH = "models/fertilizer_prediction_model.pkl"

df = pd.read_csv(DATA_PATH)

# Remove spaces from column names
df.columns = df.columns.str.strip()

print("Dataset loaded")
print("Shape:", df.shape)
print(df.head())


# ==============================
# FEATURES AND TARGET
# ==============================

features = [
    "Temparature",
    "Humidity",
    "Moisture",
    "Soil Type",
    "Crop Type",
    "Nitrogen",
    "Potassium",
    "Phosphorous"
]

target = "Fertilizer Name"


X = df[features]
y = df[target]


# ==============================
# COLUMNS
# ==============================

numeric_features = [
    "Temparature",
    "Humidity",
    "Moisture",
    "Nitrogen",
    "Potassium",
    "Phosphorous"
]

categorical_features = [
    "Soil Type",
    "Crop Type"
]


# ==============================
# PREPROCESSING
# ==============================

preprocessor = ColumnTransformer(
    transformers=[
        (
            "categorical",
            OneHotEncoder(handle_unknown="ignore"),
            categorical_features
        )
    ],
    remainder="passthrough"
)


# ==============================
# MODEL
# ==============================

model = Pipeline(
    steps=[
        ("preprocessor", preprocessor),
        (
            "classifier",
            RandomForestClassifier(
                n_estimators=300,
                random_state=42,
                n_jobs=-1
            )
        )
    ]
)


# ==============================
# TRAIN TEST SPLIT
# ==============================

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.20,
    random_state=42,
    stratify=y
)


# ==============================
# TRAIN
# ==============================

print("\nTraining model...")

model.fit(X_train, y_train)

print("Training complete!")


# ==============================
# EVALUATION
# ==============================

y_pred = model.predict(X_test)

accuracy = accuracy_score(
    y_test,
    y_pred
)

print("\nAccuracy:", accuracy)

print("\nClassification Report:")
print(
    classification_report(
        y_test,
        y_pred,
        zero_division=0
    )
)


# ==============================
# SAVE MODEL
# ==============================

os.makedirs("models", exist_ok=True)

joblib.dump(
    model,
    MODEL_PATH
)

print("\nModel saved successfully!")
print("Location:", MODEL_PATH)