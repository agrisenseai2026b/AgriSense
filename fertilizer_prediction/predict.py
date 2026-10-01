import sys
import json
import joblib
import pandas as pd
from pathlib import Path


# ============================================================
# MODEL PATH
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

MODEL_PATH = (
    BASE_DIR
    / "models"
    / "fertilizer_prediction_model.pkl"
)


try:

    # ========================================================
    # LOAD MODEL
    # ========================================================

    print(
        "Loading fertilizer prediction model...",
        file=sys.stderr
    )

    model_data = joblib.load(MODEL_PATH)

    print(
        "Model loaded successfully.",
        file=sys.stderr
    )


    # ========================================================
    # CHECK MODEL FORMAT
    # ========================================================

    if hasattr(model_data, "predict"):

        model = model_data
        label_encoder = None

    elif isinstance(model_data, dict):

        model = model_data.get("model")
        label_encoder = model_data.get("label_encoder")

    else:

        raise Exception(
            "Unknown model format."
        )


    if model is None:

        raise Exception(
            "Model was not found inside the PKL file."
        )


    # ========================================================
    # RECEIVE INPUT FROM NODE.JS
    # ========================================================

    input_text = sys.stdin.read().strip()


    if not input_text:

        raise Exception(
            "No input data received from Node.js."
        )


    input_data = json.loads(input_text)


    print(
        "Input received from Node.js:",
        file=sys.stderr
    )

    print(
        input_data,
        file=sys.stderr
    )


    # ========================================================
    # GET VALUES
    # ========================================================

    def get_value(*keys):

        for key in keys:

            if key in input_data:

                value = input_data[key]

                if (
                    value is not None
                    and str(value).strip() != ""
                ):

                    return value

        return None


    temperature = get_value(
        "Temparature",
        "Temperature",
        "temperature"
    )


    humidity = get_value(
        "Humidity",
        "humidity"
    )


    moisture = get_value(
        "Moisture",
        "moisture"
    )


    soil_type = get_value(
        "Soil Type",
        "soilType",
        "soil_type"
    )


    crop_type = get_value(
        "Crop Type",
        "cropType",
        "crop_type"
    )


    nitrogen = get_value(
        "Nitrogen",
        "nitrogen"
    )


    potassium = get_value(
        "Potassium",
        "potassium"
    )


    phosphorous = get_value(
        "Phosphorous",
        "Phosphorus",
        "phosphorous",
        "phosphorus"
    )


    # ========================================================
    # DEBUG VALUES
    # ========================================================

    print(
        "----------------------------------------",
        file=sys.stderr
    )

    print(
        "Parsed fertilizer inputs:",
        file=sys.stderr
    )

    print(
        "Temperature:",
        temperature,
        file=sys.stderr
    )

    print(
        "Humidity:",
        humidity,
        file=sys.stderr
    )

    print(
        "Moisture:",
        moisture,
        file=sys.stderr
    )

    print(
        "Soil Type:",
        soil_type,
        file=sys.stderr
    )

    print(
        "Crop Type:",
        crop_type,
        file=sys.stderr
    )

    print(
        "Nitrogen:",
        nitrogen,
        file=sys.stderr
    )

    print(
        "Potassium:",
        potassium,
        file=sys.stderr
    )

    print(
        "Phosphorous:",
        phosphorous,
        file=sys.stderr
    )

    print(
        "----------------------------------------",
        file=sys.stderr
    )


    # ========================================================
    # CHECK MISSING VALUES
    # ========================================================

    missing = []


    if temperature is None:
        missing.append("temperature")


    if humidity is None:
        missing.append("humidity")


    if moisture is None:
        missing.append("moisture")


    if soil_type is None:
        missing.append("soilType")


    if crop_type is None:
        missing.append("cropType")


    if nitrogen is None:
        missing.append("nitrogen")


    if potassium is None:
        missing.append("potassium")


    if phosphorous is None:
        missing.append("phosphorus")


    if missing:

        raise Exception(
            "Missing fertilizer input(s): "
            + ", ".join(missing)
        )


    # ========================================================
    # CREATE DATAFRAME
    # ========================================================

    df = pd.DataFrame({

        "Temparature": [
            float(temperature)
        ],

        "Humidity": [
            float(humidity)
        ],

        "Moisture": [
            float(moisture)
        ],

        "Soil Type": [
            soil_type
        ],

        "Crop Type": [
            crop_type
        ],

        "Nitrogen": [
            float(nitrogen)
        ],

        "Potassium": [
            float(potassium)
        ],

        "Phosphorous": [
            float(phosphorous)
        ]

    })


    print(
        "DataFrame sent to model:",
        file=sys.stderr
    )

    print(
        df.to_string(index=False),
        file=sys.stderr
    )


    # ========================================================
    # PREDICTION
    # ========================================================

    prediction = model.predict(df)[0]


    # ========================================================
    # LABEL ENCODER
    # ========================================================

    if label_encoder is not None:

        prediction = label_encoder.inverse_transform(
            [prediction]
        )[0]


    # ========================================================
    # SUCCESS
    # ========================================================

    result = {

        "success": True,

        "prediction": str(prediction)

    }


    # IMPORTANT:
    # stdout contains ONLY JSON

    print(
        json.dumps(result)
    )


# ============================================================
# ERROR HANDLING
# ============================================================

except Exception as e:

    print(
        "Python error:",
        str(e),
        file=sys.stderr
    )


    result = {

        "success": False,

        "error": str(e)

    }


    print(
        json.dumps(result)
    )


    sys.exit(1)