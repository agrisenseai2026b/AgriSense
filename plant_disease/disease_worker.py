import sys
import json
import traceback

from disease_pred import predict_disease


print(
    "========================================",
    file=sys.stderr,
    flush=True
)

print(
    "PLANT DISEASE WORKER STARTED",
    file=sys.stderr,
    flush=True
)

print(
    "MODEL LOADED AND READY",
    file=sys.stderr,
    flush=True
)

print(
    "========================================",
    file=sys.stderr,
    flush=True
)


# ============================================================
# WAIT FOR IMAGE PATHS
# ============================================================

for line in sys.stdin:

    try:

        line = line.strip()

        if not line:
            continue


        # ----------------------------------------------------
        # RECEIVE JSON
        # ----------------------------------------------------

        request = json.loads(line)


        image_path = request.get(
            "image_path"
        )


        if not image_path:

            print(
                json.dumps({
                    "success": False,
                    "error": "Image path not provided."
                }),
                flush=True
            )

            continue


        print(
            "Predicting:",
            image_path,
            file=sys.stderr,
            flush=True
        )


        # ----------------------------------------------------
        # RUN MODEL
        # ----------------------------------------------------

        result = predict_disease(
            image_path
        )


        # ----------------------------------------------------
        # RETURN JSON
        # ----------------------------------------------------

        print(
            json.dumps(result),
            flush=True
        )


        print(
            "Prediction completed.",
            file=sys.stderr,
            flush=True
        )


    except Exception as e:

        print(
            "Disease worker error:",
            str(e),
            file=sys.stderr,
            flush=True
        )

        traceback.print_exc(
            file=sys.stderr
        )


        print(
            json.dumps({
                "success": False,
                "error": str(e)
            }),
            flush=True
        )
