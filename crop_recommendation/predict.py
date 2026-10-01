import sys
import json
import joblib
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "crop_recommendation_model.pkl"

try:

    # Debug information goes to stderr, NOT stdout
    print("Loading crop recommendation model...", file=sys.stderr)

    model_data = joblib.load(MODEL_PATH)

    if isinstance(model_data, dict):
        model = model_data.get("model")
        label_encoder = model_data.get("label_encoder")
    else:
        model = model_data
        label_encoder = None

    if model is None:
        raise Exception("Model was not found inside the PKL file.")

    # --------------------------------------------------
    # Get input from Node.js
    # --------------------------------------------------

    if not sys.stdin.isatty():

        input_text = sys.stdin.read().strip()

        if not input_text:
            raise Exception("No input data received.")

        input_data = json.loads(input_text)

    # --------------------------------------------------
    # Direct terminal testing
    # --------------------------------------------------

    else:

        print("Enter crop information:", file=sys.stderr)

        input_data = {
            "N": float(input("Nitrogen (N): ")),
            "P": float(input("Phosphorus (P): ")),
            "K": float(input("Potassium (K): ")),
            "temperature": float(input("Temperature: ")),
            "humidity": float(input("Humidity: ")),
            "ph": float(input("pH: ")),
            "rainfall": float(input("Rainfall: "))
        }

    # --------------------------------------------------
    # Prepare features
    # --------------------------------------------------

    features = [[
        float(input_data["N"]),
        float(input_data["P"]),
        float(input_data["K"]),
        float(input_data["temperature"]),
        float(input_data["humidity"]),
        float(input_data["ph"]),
        float(input_data["rainfall"])
    ]]

    # --------------------------------------------------
    # Prediction
    # --------------------------------------------------

    prediction = model.predict(features)[0]

    if label_encoder is not None:
        prediction = label_encoder.inverse_transform([prediction])[0]

    # IMPORTANT:
    # stdout must contain ONLY JSON
    result = {
        "success": True,
        "prediction": str(prediction)
    }

    print(json.dumps(result))

except Exception as e:

    result = {
        "success": False,
        "error": str(e)
    }

    # IMPORTANT:
    # stdout must contain ONLY JSON
    print(json.dumps(result))

    sys.exit(1)