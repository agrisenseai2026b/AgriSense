import sys
import json
import traceback
import os

print("========================================", flush=True)
print("PLANT DISEASE PREDICTION STARTED", flush=True)
print("========================================", flush=True)


try:

    # ============================================================
    # CHECK ARGUMENT
    # ============================================================

    if len(sys.argv) < 2:

        print(
            json.dumps({
                "success": False,
                "error": "Image path not provided."
            }),
            flush=True
        )

        sys.exit(1)


    image_path = sys.argv[1]

    print(
        "Image path:",
        image_path,
        flush=True
    )


    # ============================================================
    # CHECK IMAGE
    # ============================================================

    if not os.path.exists(image_path):

        print(
            json.dumps({
                "success": False,
                "error": "Image file does not exist."
            }),
            flush=True
        )

        sys.exit(1)


    print(
        "Image exists.",
        flush=True
    )


    # ============================================================
    # IMPORT DISEASE MODEL
    # ============================================================

    print(
        "Importing disease_pred...",
        flush=True
    )

    from disease_pred import predict_disease


    print(
        "disease_pred imported successfully.",
        flush=True
    )


    # ============================================================
    # RUN PREDICTION
    # ============================================================

    print(
        "Starting prediction...",
        flush=True
    )

    result = predict_disease(
        image_path
    )


    print(
        "Prediction completed.",
        flush=True
    )


    # ============================================================
    # RETURN RESULT
    # ============================================================

    print(
        json.dumps(result),
        flush=True
    )


except Exception as e:

    print(
        "========================================",
        flush=True
    )

    print(
        "PLANT DISEASE ERROR",
        flush=True
    )

    print(
        str(e),
        flush=True
    )

    traceback.print_exc()

    print(
        json.dumps({
            "success": False,
            "error": str(e)
        }),
        flush=True
    )

    sys.exit(1)
