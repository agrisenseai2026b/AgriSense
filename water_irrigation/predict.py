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
    / "water_irrigation_model.pkl"
)


try:

    # Debug messages go to STDERR.
    # Node.js will NOT try to parse these.
    print(
        "Loading water irrigation prediction model...",
        file=sys.stderr
    )


    # ========================================================
    # LOAD MODEL
    # ========================================================

    model_data = joblib.load(
        MODEL_PATH
    )


    # Check saved model format

    if hasattr(model_data, "predict"):

        # Complete sklearn pipeline/model
        model = model_data
        label_encoder = None


    elif isinstance(model_data, dict):

        # Dictionary containing model
        model = model_data.get("model")
        label_encoder = model_data.get(
            "label_encoder"
        )


    else:

        raise Exception(
            "Unknown model format."
        )


    if model is None:

        raise Exception(
            "Model was not found inside the PKL file."
        )


    # ========================================================
    # RECEIVE INPUT
    # ========================================================

    if not sys.stdin.isatty():

        # ----------------------------------------------------
        # Input coming from Node.js
        # ----------------------------------------------------

        input_text = sys.stdin.read().strip()


        if not input_text:

            raise Exception(
                "No input data received."
            )


        input_data = json.loads(
            input_text
        )


    else:

        # ----------------------------------------------------
        # Direct terminal testing
        # ----------------------------------------------------

        print(
            "Enter irrigation information:",
            file=sys.stderr
        )


        input_data = {

            "Soil_Type": input(
                "Soil Type: "
            ),

            "Soil_pH": float(
                input(
                    "Soil pH: "
                )
            ),

            "Soil_Moisture": float(
                input(
                    "Soil Moisture: "
                )
            ),

            "Temperature_C": float(
                input(
                    "Temperature (C): "
                )
            ),

            "Humidity": float(
                input(
                    "Humidity: "
                )
            ),

            "Rainfall_mm": float(
                input(
                    "Rainfall (mm): "
                )
            ),

            "Wind_Speed_kmh": float(
                input(
                    "Wind Speed (km/h): "
                )
            ),

            "Crop_Type": input(
                "Crop Type: "
            ),

            "Season": input(
                "Season: "
            ),

            "Irrigation_Type": input(
                "Irrigation Type: "
            ),

            "Water_Source": input(
                "Water Source: "
            ),

            "Field_Area_hectare": float(
                input(
                    "Field Area (hectare): "
                )
            ),

            "Region": input(
                "Region: "
            )

        }


    # ========================================================
    # CREATE DATAFRAME
    # ========================================================
    #
    # These names MUST match the columns used during training:
    #
    # Soil_Type
    # Soil_pH
    # Soil_Moisture
    # Temperature_C
    # Humidity
    # Rainfall_mm
    # Wind_Speed_kmh
    # Crop_Type
    # Season
    # Irrigation_Type
    # Water_Source
    # Field_Area_hectare
    # Region
    #
    # ========================================================

    df = pd.DataFrame({

        "Soil_Type": [

            input_data.get(
                "Soil_Type",
                input_data.get(
                    "soil_type"
                )
            )

        ],


        "Soil_pH": [

            float(
                input_data.get(
                    "Soil_pH",
                    input_data.get(
                        "soil_ph"
                    )
                )
            )

        ],


        "Soil_Moisture": [

            float(
                input_data.get(
                    "Soil_Moisture",
                    input_data.get(
                        "soil_moisture"
                    )
                )
            )

        ],


        "Temperature_C": [

            float(
                input_data.get(
                    "Temperature_C",
                    input_data.get(
                        "temperature_c"
                    )
                )
            )

        ],


        "Humidity": [

            float(
                input_data.get(
                    "Humidity",
                    input_data.get(
                        "humidity"
                    )
                )
            )

        ],


        "Rainfall_mm": [

            float(
                input_data.get(
                    "Rainfall_mm",
                    input_data.get(
                        "rainfall_mm"
                    )
                )
            )

        ],


        "Wind_Speed_kmh": [

            float(
                input_data.get(
                    "Wind_Speed_kmh",
                    input_data.get(
                        "wind_speed_kmh"
                    )
                )
            )

        ],


        "Crop_Type": [

            input_data.get(
                "Crop_Type",
                input_data.get(
                    "crop_type"
                )
            )

        ],


        "Season": [

            input_data.get(
                "Season",
                input_data.get(
                    "season"
                )
            )

        ],


        "Irrigation_Type": [

            input_data.get(
                "Irrigation_Type",
                input_data.get(
                    "irrigation_type"
                )
            )

        ],


        "Water_Source": [

            input_data.get(
                "Water_Source",
                input_data.get(
                    "water_source"
                )
            )

        ],


        "Field_Area_hectare": [

            float(
                input_data.get(
                    "Field_Area_hectare",
                    input_data.get(
                        "field_area_hectare"
                    )
                )
            )

        ],


        "Region": [

            input_data.get(
                "Region",
                input_data.get(
                    "region"
                )
            )

        ]

    })


    # ========================================================
    # DEBUG INFORMATION
    # ========================================================

    print(
        "Input received:",
        file=sys.stderr
    )


    print(
        df.to_string(index=False),
        file=sys.stderr
    )


    # ========================================================
    # PREDICT
    # ========================================================

    prediction = model.predict(
        df
    )[0]


    # ========================================================
    # LABEL ENCODER
    # ========================================================

    if label_encoder is not None:

        prediction = label_encoder.inverse_transform(
            [prediction]
        )[0]


    # ========================================================
    # CONFIDENCE
    # ========================================================

    confidence = None


    if hasattr(
        model,
        "predict_proba"
    ):

        probabilities = model.predict_proba(
            df
        )[0]


        if hasattr(
            model,
            "classes_"
        ):

            classes = model.classes_

            prediction_index = list(
                classes
            ).index(
                prediction
            )

            confidence = (
                probabilities[
                    prediction_index
                ]
                * 100
            )


    # ========================================================
    # RECOMMENDATION
    # ========================================================

    if prediction == "Low":

        recommendation = (
            "Low irrigation requirement. "
            "No immediate irrigation may be required. "
            "Continue monitoring soil moisture."
        )


    elif prediction == "Medium":

        recommendation = (
            "Moderate irrigation requirement. "
            "Monitor soil moisture closely and "
            "consider irrigation if moisture decreases."
        )


    elif prediction == "High":

        recommendation = (
            "High irrigation requirement. "
            "Irrigation should be considered soon."
        )


    else:

        recommendation = (
            "Irrigation requirement detected as "
            + str(prediction)
            + ". Monitor your field conditions."
        )


    # ========================================================
    # SUCCESS RESPONSE
    # ========================================================
    #
    # VERY IMPORTANT:
    #
    # stdout must contain ONLY JSON.
    #
    # Node.js uses JSON.parse() on this output.
    #
    # ========================================================

    result = {

        "success": True,

        "prediction": str(
            prediction
        ),

        "confidence":
            round(
                float(confidence),
                2
            )
            if confidence is not None
            else None,

        "recommendation":
            recommendation
    }


    print(
        json.dumps(
            result
        )
    )


# ============================================================
# ERROR HANDLING
# ============================================================

except Exception as e:

    result = {

        "success": False,

        "error": str(
            e
        )

    }


    # stdout must contain ONLY JSON

    print(
        json.dumps(
            result
        )
    )


    sys.exit(1)