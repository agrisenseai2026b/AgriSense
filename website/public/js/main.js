document.addEventListener("DOMContentLoaded", () => {

    /* =====================================================
       ALL PREDICTION FORMS
    ===================================================== */

    const forms = document.querySelectorAll(
        ".prediction-form"
    );

    forms.forEach((form) => {

        form.addEventListener("submit", () => {

            const button =
                form.querySelector(".predict-button");

            if (!button) {
                return;
            }

            /*
             * Save original button text
             */
            const originalText =
                button.innerHTML;

            /*
             * Disable button
             */
            button.disabled = true;

            /*
             * Loading style
             */
            button.style.opacity = "0.75";
            button.style.cursor = "wait";

            /*
             * Loading text
             */
            button.innerHTML =
                "⏳ Analyzing...";

            /*
             * Keep button disabled long enough
             * for Python model processing.
             *
             * The page will normally navigate to the
             * prediction result before this timeout.
             */
            setTimeout(() => {

                button.disabled = false;

                button.style.opacity = "1";
                button.style.cursor = "pointer";

                button.innerHTML =
                    originalText;

            }, 30000);

        });

    });


    /* =====================================================
       PLANT DISEASE IMAGE PREVIEW
    ===================================================== */

    const imageInput =
        document.getElementById("plant_image");

    const imagePreview =
        document.getElementById("imagePreview");

    const previewContainer =
        document.getElementById("previewContainer");

    const uploadContent =
        document.getElementById("uploadContent");


    /*
     * Only execute this section if
     * disease page elements exist.
     */
    if (
        imageInput &&
        imagePreview &&
        previewContainer &&
        uploadContent
    ) {

        imageInput.addEventListener(
            "change",
            function () {

                const file =
                    this.files[0];

                if (!file) {
                    return;
                }


                /* Allowed image types */

                const allowedTypes = [
                    "image/jpeg",
                    "image/png",
                    "image/webp"
                ];


                if (
                    !allowedTypes.includes(
                        file.type
                    )
                ) {

                    alert(
                        "Please select a JPG, PNG or WEBP image."
                    );

                    this.value = "";

                    return;
                }


                /* Maximum 10 MB */

                if (
                    file.size >
                    10 * 1024 * 1024
                ) {

                    alert(
                        "Image must be smaller than 10MB."
                    );

                    this.value = "";

                    return;
                }


                /* Read image */

                const reader =
                    new FileReader();


                reader.onload =
                    function (event) {

                        imagePreview.src =
                            event.target.result;

                        previewContainer.style.display =
                            "block";

                        imagePreview.style.display =
                            "block";

                        uploadContent.style.display =
                            "none";

                    };


                reader.readAsDataURL(file);

            }
        );

    }

});