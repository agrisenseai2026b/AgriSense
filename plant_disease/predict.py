import sys
import json
import traceback
import os


print(
    "========================================",
    flush=True
)

print(
    "PLANT DISEASE PREDICTION STARTED",
    flush=True
)

print(
    "========================================",
    flush=True
)


try:

    # ============================================================
    # READ INPUT FROM NODE.JS STDIN
    # ============================================================

    input_data = sys.stdin.read().strip()


    print(
        "Raw input received:",
        input_data,
        flush=True
    )


    # ============================================================
    # CHECK INPUT
    # ============================================================

    if not input_data:

        print(
            json.dumps({
                "success": False,
                "error": "No input received from website."
            }),
            flush=True
        )

        sys.exit(1)


    # ============================================================
    # PARSE JSON
    # ============================================================

    try:

        data = json.loads(input_data)

    except json.JSONDecodeError as e:

        print(
            json.dumps({
                "success": False,
                "error": "Invalid JSON input: " + str(e)
            }),
            flush=True
        )

        sys.exit(1)


    # ============================================================
    # GET IMAGE PATH
    # ============================================================

    image_path = data.get("image_path")


    print(
        "Image path received:",
        image_path,
        flush=True
    )


    # ============================================================
    # CHECK IMAGE PATH
    # ============================================================

    if not image_path:

        print(
            json.dumps({
                "success": False,
                "error": "Image path not provided."
            }),
            flush=True
        )

        sys.exit(1)


    # ============================================================
    # CHECK IMAGE FILE
    # ============================================================

    if not os.path.exists(image_path):

        print(
            json.dumps({
                "success": False,
                "error":
                    "Image file does not exist: "
                    + image_path
            }),
            flush=True
        )

        sys.exit(1)


    print(
        "Image exists successfully.",
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
        "Starting disease prediction...",
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
