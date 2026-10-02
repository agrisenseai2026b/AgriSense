import sys
import json
import traceback
import os


print(
    "========================================",
    file=sys.stderr
)

print(
    "PLANT DISEASE PREDICTION STARTED",
    file=sys.stderr
)

print(
    "========================================",
    file=sys.stderr
)


try:

    # ============================================================
    # GET IMAGE PATH FROM COMMAND LINE
    # ============================================================

    if len(sys.argv) < 2:

        print(
            json.dumps({
                "success": False,
                "error": "Image path not provided."
            })
        )

        sys.exit(1)


    image_path = sys.argv[1]


    print(
        "Image path:",
        image_path,
        file=sys.stderr
    )


    # ============================================================
    # CHECK IMAGE
    # ============================================================

    if not os.path.exists(image_path):

        print(
            json.dumps({
                "success": False,
                "error": "Image file does not exist."
            })
        )

        sys.exit(1)


    print(
        "Image exists.",
        file=sys.stderr
    )


    # ============================================================
    # IMPORT DISEASE MODEL
    # ============================================================

    print(
        "Importing disease_pred...",
        file=sys.stderr
    )


    from disease_pred import predict_disease


    print(
        "disease_pred imported successfully.",
        file=sys.stderr
    )


    # ============================================================
    # RUN PREDICTION
    # ============================================================

    print(
        "Starting prediction...",
        file=sys.stderr
    )


    result = predict_disease(
        image_path
    )


    print(
        "Prediction completed.",
        file=sys.stderr
    )


    # ============================================================
    # RETURN ONLY JSON TO STDOUT
    # ============================================================

    print(
        json.dumps(result)
    )


except Exception as e:

    print(
        "========================================",
        file=sys.stderr
    )

    print(
        "PLANT DISEASE ERROR",
        file=sys.stderr
    )

    print(
        str(e),
        file=sys.stderr
    )


    traceback.print_exc(
        file=sys.stderr
    )


    print(
        json.dumps({
            "success": False,
            "error": str(e)
        })
    )


    sys.exit(1)
