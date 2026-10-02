import sys
import json
import traceback

# ============================================================
# LOAD MODEL ONCE
# ============================================================

try:

    from disease_pred import predict_disease

    # Tell Node.js that the model is ready.
    # IMPORTANT: stdout is used only for JSON communication.
    print(
        json.dumps({
            "type": "ready"
        }),
        flush=True
    )

except Exception as e:

    print(
        json.dumps({
            "type": "startup_error",
            "error": str(e)
        }),
        flush=True
    )

    traceback.print_exc(
        file=sys.stderr
    )

    sys.exit(1)


# ============================================================
# WAIT FOR IMAGE REQUESTS
# ============================================================

for line in sys.stdin:

    try:

        line = line.strip()

        if not line:
            continue


        request = json.loads(line)


        # ----------------------------------------------------
        # PING
        # ----------------------------------------------------

        if request.get("type") == "ping":

            print(
                json.dumps({
                    "type": "pong"
                }),
                flush=True
            )

            continue


        # ----------------------------------------------------
        # PREDICTION
        # ----------------------------------------------------

        image_path = request.get(
            "image_path"
        )


        if not image_path:

            print(
                json.dumps({
                    "type": "result",
                    "success": False,
                    "error": "Image path not provided."
                }),
                flush=True
            )

            continue


        # ----------------------------------------------------
        # RUN ALREADY-LOADED MODEL
        # ----------------------------------------------------

        try:

            result = predict_disease(
                image_path
            )


            print(
                json.dumps({
                    "type": "result",
                    **result
                }),
                flush=True
            )


        except Exception as e:

            traceback.print_exc(
                file=sys.stderr
            )


            print(
                json.dumps({
                    "type": "result",
                    "success": False,
                    "error": str(e)
                }),
                flush=True
            )


    except Exception as e:

        traceback.print_exc(
            file=sys.stderr
        )


        print(
            json.dumps({
                "type": "result",
                "success": False,
                "error": str(e)
            }),
            flush=True
        )
