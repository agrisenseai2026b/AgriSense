import sys
import json
import os
import traceback


# ============================================================
# SEND JSON ONLY
# ============================================================

def send(data):

    sys.stdout.write(
        json.dumps(data) + "\n"
    )

    sys.stdout.flush()


# ============================================================
# LOAD MODEL ONCE
# ============================================================

try:

    from disease_pred import predict_disease

    send({
        "type": "ready",
        "success": True
    })

except Exception as e:

    traceback.print_exc(
        file=sys.stderr
    )

    send({
        "type": "startup_error",
        "success": False,
        "error": str(e)
    })

    sys.exit(1)


# ============================================================
# WAIT FOR REQUESTS
# ============================================================

for line in sys.stdin:

    try:

        line = line.strip()

        if not line:
            continue


        # ----------------------------------------------------
        # REQUEST MUST BE JSON
        # ----------------------------------------------------

        request = json.loads(line)


        # ----------------------------------------------------
        # GET IMAGE PATH
        # ----------------------------------------------------

        image_path = request.get(
            "image_path"
        )


        if not image_path:

            send({
                "type": "result",
                "success": False,
                "error": "Image path not provided."
            })

            continue


        image_path = str(
            image_path
        ).strip()


        # ----------------------------------------------------
        # CHECK FILE
        # ----------------------------------------------------

        if not os.path.isfile(
            image_path
        ):

            send({
                "type": "result",
                "success": False,
                "error":
                    "Image file does not exist: "
                    + image_path
            })

            continue


        # ----------------------------------------------------
        # PREDICT
        # ----------------------------------------------------

        result = predict_disease(
            image_path
        )


        # ----------------------------------------------------
        # SEND RESULT
        # ----------------------------------------------------

        send({
            "type": "result",
            **result
        })


    except Exception as e:

        traceback.print_exc(
            file=sys.stderr
        )

        send({
            "type": "result",
            "success": False,
            "error": str(e)
        })
