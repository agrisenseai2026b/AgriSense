import sys
import json
import os
import traceback

# ============================================================
# IMPORTANT: REDUCE PYTORCH CPU THREAD OVERHEAD ON RENDER
# ============================================================

os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"

import torch

torch.set_num_threads(1)

# ============================================================
# LOAD DISEASE MODEL ONCE
# ============================================================

print(
    "========================================",
    file=sys.stderr,
    flush=True
)

print(
    "STARTING AGRISENSE DISEASE WORKER",
    file=sys.stderr,
    flush=True
)

print(
    "========================================",
    file=sys.stderr,
    flush=True
)

try:

    from disease_pred import predict_disease

    print(
        "Disease model loaded successfully.",
        file=sys.stderr,
        flush=True
    )

except Exception as e:

    print(
        "FAILED TO LOAD DISEASE MODEL",
        file=sys.stderr,
        flush=True
    )

    traceback.print_exc(
        file=sys.stderr
    )

    sys.exit(1)


# ============================================================
# WAIT FOR IMAGE REQUESTS
# ============================================================

print(
    "Disease worker is READY.",
    file=sys.stderr,
    flush=True
)


for line in sys.stdin:

    try:

        line = line.strip()

        if not line:
            continue


        # ====================================================
        # READ JSON REQUEST
        # ====================================================

        request = json.loads(line)

        image_path = request.get(
            "image_path"
        )


        # ====================================================
        # VALIDATE IMAGE PATH
        # ====================================================

        if not image_path:

            print(
                json.dumps({
                    "success": False,
                    "error": "Image path not provided."
                }),
                flush=True
            )

            continue


        if not os.path.exists(image_path):

            print(
                json.dumps({
                    "success": False,
                    "error":
                        "Image file does not exist."
                }),
                flush=True
            )

            continue


        print(
            f"Predicting: {image_path}",
            file=sys.stderr,
            flush=True
        )


        # ====================================================
        # RUN MODEL
        # ====================================================

        result = predict_disease(
            image_path
        )


        # ====================================================
        # SEND JSON RESULT TO NODE
        # ====================================================

        print(
            json.dumps(result),
            flush=True
        )


    except Exception as e:

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
      
