const { GoogleGenAI } = require("@google/genai");

// ============================================================
// GEMINI CONFIGURATION
// ============================================================

if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY was not found.");
}

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});


// ============================================================
// SLEEP
// ============================================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


// ============================================================
// ASK GEMINI WITH RETRY
// ============================================================

async function askGemini(message) {

    const MAX_RETRIES = 4;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {

        try {

            console.log(
                `Gemini request attempt ${attempt + 1}/${MAX_RETRIES + 1}`
            );

            const response = await ai.models.generateContent({

                model: "gemini-3.8-flash",

                contents: message

            });

            return response.text;

        } catch (error) {

            console.error(
                `Gemini attempt ${attempt + 1} failed:`,
                error.message
            );

            // ------------------------------------------------
            // Extract status code
            // ------------------------------------------------

            const status =
                error.status ||
                error.code ||
                error?.error?.code;

            // ------------------------------------------------
            // Retry only temporary errors
            // ------------------------------------------------

            const retryable =
                status === 503 ||
                status === 429 ||
                status === 408 ||
                (typeof status === "number" && status >= 500);

            if (!retryable) {

                throw error;

            }

            // ------------------------------------------------
            // Maximum retries reached
            // ------------------------------------------------

            if (attempt === MAX_RETRIES) {

                throw new Error(
                    "Gemini is temporarily unavailable. Please try again later."
                );

            }

            // ------------------------------------------------
            // Exponential backoff
            //
            // attempt 0 → 2 seconds
            // attempt 1 → 4 seconds
            // attempt 2 → 8 seconds
            // attempt 3 → 16 seconds
            // ------------------------------------------------

            const delay =
                Math.pow(2, attempt + 1) * 1000;

            console.log(
                `Retrying Gemini in ${delay / 1000} seconds...`
            );

            await sleep(delay);
        }
    }
}


// ============================================================
// EXPORT
// ============================================================

module.exports = {
    askGemini
};