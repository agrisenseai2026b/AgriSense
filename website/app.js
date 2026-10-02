const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { spawn } = require("child_process");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const https = require("https");
const http = require("http");
const { Server } = require("socket.io");

const PYTHON_PATH =
    process.env.PYTHON_PATH || "python";


// ============================================================
// LOAD ENVIRONMENT VARIABLES
// ============================================================

dotenv.config({
    path: path.join(__dirname, "..", ".env")
});

const { askGemini } = require("./ai/gemini");

// ============================================================
// APP
// ============================================================
const app = express();

const PORT = process.env.PORT || 3000;

// ============================================================
// HTTP SERVER + SOCKET.IO
// ============================================================

// IMPORTANT:
// Do NOT use app.listen() at the bottom.
// Socket.IO needs the HTTP server.
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// ============================================================
// SOCKET.IO CONNECTION
// ============================================================

io.on("connection", (socket) => {

    console.log(
        "Website Socket.IO client connected:",
        socket.id
    );

    socket.on("disconnect", () => {

        console.log(
            "Website Socket.IO client disconnected:",
            socket.id
        );

    });

});

// ============================================================
// MONGODB SENSOR MODEL
// ============================================================

const sensorSchema = new mongoose.Schema({

    moisture: Number,

    temperature: Number,

    pH: Number,

    nitrogen: Number,

    phosphorus: Number,

    potassium: Number

});

const SensorData = mongoose.model(
    "SensorData",
    sensorSchema,
    "sensordatas"
);


// ============================================================
// MONGODB FARM INFORMATION MODEL
// ============================================================

const farmInfoSchema = new mongoose.Schema({

    rainfall: {
        type: Number,
        default: 0
    },

    cropType: {
        type: String,
        default: "Wheat"
    },

    soilType: {
        type: String,
        default: "Loamy"
    },

    season: {
        type: String,
        default: "Monsoon"
    },

    irrigationType: {
        type: String,
        default: "Drip"
    },

    waterSource: {
        type: String,
        default: "Groundwater"
    },

    fieldArea: {
        type: Number,
        default: 1
    },

    region: {
        type: String,
        default: "Central"
    },

    updatedAt: {
        type: Date,
        default: Date.now
    }

});

const FarmInfo = mongoose.model(
    "FarmInfo",
    farmInfoSchema,
    "farminfos"
);

// ============================================================
// MONGODB CONNECTION
// ============================================================

console.log("MongoDB URI loaded:",
    process.env.MONGODB_URI ? "YES" : "NO"
);

mongoose
    .connect(process.env.MONGODB_URI)
    .then(async () => {

        console.log("MongoDB Connected Successfully");
        console.log("Database: AgriSenseDB");
        console.log("Collection: sensordatas");

        // ========================================================
        // START SENSOR REAL-TIME CHANGE STREAM
        // ========================================================

        try {

            const sensorChangeStream =
                SensorData.watch(
                    [],
                    {
                        fullDocument: "updateLookup"
                    }
                );

            console.log(
                "MongoDB Sensor Change Stream Started"
            );

            sensorChangeStream.on(
                "change",
                async (change) => {

                    console.log("");
                    console.log(
                        "========================================"
                    );

                    console.log(
                        "SENSOR DATA CHANGE DETECTED"
                    );

                    console.log(
                        "Operation:",
                        change.operationType
                    );

                    console.log(
                        "========================================"
                    );

                    try {

                        const sensor =
                            await getLatestSensorData();

                        console.log(
                            "Latest sensor data:"
                        );

                        console.log(sensor);

                        // ==================================================
                        // SEND SENSOR DATA TO WEBSITE
                        // ==================================================

                        io.emit(
                            "sensorDataUpdated",
                            sensor
                        );

                        console.log(
                            "Sensor data sent to website."
                        );

                    }
                    catch (error) {

                        console.error(
                            "Error while broadcasting sensor data:"
                        );

                        console.error(error);

                    }

                }
            );

            sensorChangeStream.on(
                "error",
                (error) => {

                    console.error(
                        "MongoDB Sensor Change Stream Error:"
                    );

                    console.error(error);

                }
            );

            sensorChangeStream.on(
                "close",
                () => {

                    console.log(
                        "MongoDB Sensor Change Stream Closed."
                    );

                }
            );

        }
        catch (error) {

            console.error(
                "Unable to start MongoDB Sensor Change Stream:"
            );

            console.error(error);

        }

    })
    .catch((error) => {

        console.log(
            "MongoDB Connection Error:"
        );

        console.log(error);

    });
    

// ============================================================
// REAL-TIME FARM INFORMATION CHANGE STREAM
// Detects changes made by Android / other applications
// ============================================================

mongoose.connection.once("open", () => {

    console.log(
        "MongoDB connection opened - starting FarmInfo Change Stream"
    );

    const farmChangeStream =
        FarmInfo.watch(
            [],
            {
                fullDocument: "updateLookup"
            }
        );


    farmChangeStream.on(
        "change",
        async (change) => {

            console.log(
                "========================================"
            );

            console.log(
                "MONGODB FARM CHANGE DETECTED"
            );

            console.log(change);

            console.log(
                "========================================"
            );


            try {

                // ------------------------------------------------
                // Get latest FarmInfo document
                // ------------------------------------------------

                const updatedFarm =
                    await FarmInfo
                        .findOne({})
                        .sort({
                            updatedAt: -1
                        })
                        .lean();


                if (!updatedFarm) {

                    console.log(
                        "No farm information found."
                    );

                    return;

                }


                const farm = {

                    rainfall:
                        updatedFarm.rainfall,

                    cropType:
                        updatedFarm.cropType,

                    soilType:
                        updatedFarm.soilType,

                    season:
                        updatedFarm.season,

                    irrigationType:
                        updatedFarm.irrigationType,

                    waterSource:
                        updatedFarm.waterSource,

                    fieldArea:
                        updatedFarm.fieldArea,

                    region:
                        updatedFarm.region

                };


                console.log(
                    "Sending Android/MongoDB farm change to website:"
                );

                console.log(farm);


                // ------------------------------------------------
                // SEND TO ALL CONNECTED WEBSITES
                // ------------------------------------------------

                io.emit(
                    "farmInformationUpdated",
                    farm
                );


                console.log(
                    "Farm information sent to website."
                );

            }

            catch (error) {

                console.error(
                    "Error processing farm change:"
                );

                console.error(error);

            }

        }
    );


    farmChangeStream.on(
        "error",
        (error) => {

            console.error(
                "Farm Change Stream Error:"
            );

            console.error(error);

        }
    );

});







// ============================================================
// DIRECTORIES
// ============================================================

const AGRISENSE_DIR = path.resolve(__dirname, "..");

const PUBLIC_DIR = path.join(
    __dirname,
    "public"
);

const UPLOAD_DIR = path.join(
    PUBLIC_DIR,
    "uploads",
    "disease"
);


// Create upload directory automatically
fs.mkdirSync(
    UPLOAD_DIR,
    {
        recursive: true
    }
);


// ============================================================
// MIDDLEWARE
// ============================================================

app.use(
    express.urlencoded({
        extended: true
    })
);

app.use(
    express.json()
);

app.use(
    express.static(
        PUBLIC_DIR
    )
);


// ============================================================
// EJS
// ============================================================

app.set(
    "view engine",
    "ejs"
);

app.set(
    "views",
    path.join(
        __dirname,
        "views"
    )
);


// ============================================================
// PYTHON SCRIPTS
// ============================================================

const CROP_SCRIPT =
    path.join(__dirname, "..", "crop_recommendation", "predict.py");

const FERTILIZER_SCRIPT =
    path.join(__dirname, "..", "fertilizer_prediction", "predict.py");

const IRRIGATION_SCRIPT =
    path.join(__dirname, "..", "water_irrigation", "predict.py");


const DISEASE_SCRIPT =
    path.join(
        __dirname,
        "..",
        "plant_disease",
        "predict.py"
    );


// ============================================================
// PYTHON COMMAND
// ============================================================

const PYTHON_COMMAND =
    process.env.PYTHON_PATH || "python3";


// ============================================================
// MULTER CONFIGURATION
// ============================================================

const storage = multer.diskStorage({

    destination: function (
        req,
        file,
        cb
    ) {

        cb(
            null,
            UPLOAD_DIR
        );

    },

    filename: function (
        req,
        file,
        cb
    ) {

        const extension =
            path.extname(
                file.originalname
            ).toLowerCase();

        const filename =
            "plant_" +
            Date.now() +
            "_" +
            Math.round(
                Math.random() * 100000
            ) +
            extension;

        cb(
            null,
            filename
        );

    }

});


const upload = multer({

    storage: storage,

    limits: {
        fileSize: 10 * 1024 * 1024
    },

    fileFilter: function (
        req,
        file,
        cb
    ) {

        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp"
        ];

        if (
            allowedTypes.includes(
                file.mimetype
            )
        ) {

            cb(
                null,
                true
            );

        } else {

            cb(
                new Error(
                    "Only JPG, PNG and WEBP images are allowed."
                )
            );

        }

    }

});


// ============================================================
// RUN PYTHON
// ============================================================

function runPython(
    scriptPath,
    inputData
) {

    return new Promise(
        (
            resolve,
            reject
        ) => {

            console.log(
                "\n----------------------------------------"
            );

            console.log(
                "Running Python:"
            );

            console.log(
                scriptPath
            );

            console.log(
                "Input:"
            );

            console.log(
                inputData
            );

            console.log(
                "----------------------------------------"
            );


            const python = spawn(
                PYTHON_COMMAND,
                [
                    scriptPath
                ],
                {
                    cwd: path.dirname(scriptPath)
                }
            );


            let output = "";

            let errorOutput = "";


            // =================================================
            // STDOUT
            // =================================================

            python.stdout.on(
                "data",
                (data) => {

                    output += data.toString();

                }
            );


            // =================================================
            // STDERR
            // =================================================

            python.stderr.on(
                "data",
                (data) => {

                    errorOutput += data.toString();

                }
            );


            // =================================================
            // PROCESS ERROR
            // =================================================

            python.on(
                "error",
                (error) => {

                    reject(error);

                }
            );


            // =================================================
            // PROCESS CLOSED
            // =================================================

            python.on(
                "close",
                (code) => {

                    console.log(
                        "Python exit code:",
                        code
                    );


                    if (errorOutput) {

                        console.log(
                            "Python stderr:"
                        );

                        console.log(
                            errorOutput
                        );

                    }


                    console.log(
                        "Python stdout:"
                    );

                    console.log(
                        output
                    );


                    // -----------------------------------------
                    // PYTHON FAILED
                    // -----------------------------------------

                    if (code !== 0) {

                        // Try to read JSON error from stdout

                        try {

                            const pythonResult =
                                JSON.parse(
                                    output.trim()
                                );


                            if (
                                pythonResult.error
                            ) {

                                reject(
                                    new Error(
                                        pythonResult.error
                                    )
                                );

                                return;

                            }

                        }

                        catch (parseError) {

                            // Ignore JSON parse error
                            // because process itself failed

                        }


                        reject(
                            new Error(
                                errorOutput ||
                                `Python process exited with code ${code}.`
                            )
                        );

                        return;

                    }


                    // -----------------------------------------
                    // EMPTY OUTPUT
                    // -----------------------------------------

                    if (
                        !output.trim()
                    ) {

                        reject(
                            new Error(
                                "Python returned empty output."
                            )
                        );

                        return;

                    }


                    // -----------------------------------------
                    // PARSE JSON
                    // -----------------------------------------

                    try {

                        const result =
                            JSON.parse(
                                output.trim()
                            );


                        resolve(
                            result
                        );

                    }

                    catch (error) {

                        reject(
                            new Error(
                                "Invalid JSON response from Python: "
                                +
                                output
                            )
                        );

                    }

                }
            );


            // =================================================
            // SEND INPUT TO PYTHON
            // =================================================

            python.stdin.write(
                JSON.stringify(
                    inputData
                )
            );


            python.stdin.end();

        }
    );

}

// ============================================================
// RUN PLANT DISEASE PYTHON MODEL
// ============================================================
// IMPORTANT:
// Disease predict.py expects the image path as sys.argv[1]
// It does NOT read JSON from stdin.
// ============================================================

function runDiseasePython(
    scriptPath,
    imagePath
) {

    return new Promise(
        (
            resolve,
            reject
        ) => {

            console.log(
                "\n========================================"
            );

            console.log(
                "RUNNING PLANT DISEASE MODEL"
            );

            console.log(
                "Python script:"
            );

            console.log(
                scriptPath
            );

            console.log(
                "Image path:"
            );

            console.log(
                imagePath
            );

            console.log(
                "========================================"
            );


            // ====================================================
            // IMPORTANT
            // PASS IMAGE PATH AS COMMAND-LINE ARGUMENT
            // ====================================================

            const python =
                spawn(
                    PYTHON_COMMAND,
                    [
                        scriptPath,
                        imagePath
                    ],
                    {
                        cwd:
                            path.dirname(
                                scriptPath
                            )
                    }
                );


            let output = "";

            let errorOutput = "";


            // ====================================================
            // STDOUT
            // ====================================================

            python.stdout.on(
                "data",
                (data) => {

                    output +=
                        data.toString();

                }
            );


            // ====================================================
            // STDERR
            // ====================================================

            python.stderr.on(
                "data",
                (data) => {

                    errorOutput +=
                        data.toString();

                }
            );


            // ====================================================
            // PROCESS ERROR
            // ====================================================

            python.on(
                "error",
                (error) => {

                    reject(
                        error
                    );

                }
            );


            // ====================================================
            // PROCESS CLOSED
            // ====================================================

            python.on(
                "close",
                (code) => {

                    console.log(
                        "Disease Python exit code:",
                        code
                    );


                    if (errorOutput) {

                        console.log(
                            "Disease Python logs:"
                        );

                        console.log(
                            errorOutput
                        );

                    }


                    console.log(
                        "Disease Python stdout:"
                    );

                    console.log(
                        output
                    );


                    // =================================================
                    // PYTHON FAILED
                    // =================================================

                    if (code !== 0) {

                        try {

                            const lines =
                                output
                                    .trim()
                                    .split("\n");


                            const lastLine =
                                lines[
                                    lines.length - 1
                                ];


                            const pythonResult =
                                JSON.parse(
                                    lastLine
                                );


                            if (
                                pythonResult.error
                            ) {

                                reject(
                                    new Error(
                                        pythonResult.error
                                    )
                                );

                                return;

                            }

                        }

                        catch (parseError) {

                            // Ignore JSON parsing error

                        }


                        reject(
                            new Error(
                                errorOutput ||
                                `Disease Python process exited with code ${code}.`
                            )
                        );

                        return;

                    }


                    // =================================================
                    // EMPTY OUTPUT
                    // =================================================

                    if (
                        !output.trim()
                    ) {

                        reject(
                            new Error(
                                "Disease Python returned empty output."
                            )
                        );

                        return;

                    }


                    // =================================================
                    // PARSE FINAL JSON LINE
                    // =================================================

                    try {

                        const lines =
                            output
                                .trim()
                                .split("\n");


                        const lastLine =
                            lines[
                                lines.length - 1
                            ];


                        const result =
                            JSON.parse(
                                lastLine
                            );


                        resolve(
                            result
                        );

                    }

                    catch (error) {

                        console.log(
                            "Unable to parse disease JSON:"
                        );

                        console.log(
                            output
                        );


                        reject(
                            new Error(
                                "Invalid JSON response from disease model."
                            )
                        );

                    }

                }
            );

        }
    );

}

// ============================================================
// GEMINI TEST API
// ============================================================

app.post("/api/test-gemini", async (req, res) => {

    try {

        const message = req.body.message;

        if (!message) {
            return res.status(400).json({
                success: false,
                error: "Message is required."
            });
        }

        const answer = await askGemini(message);

        res.json({
            success: true,
            answer: answer
        });

    } catch (error) {

        console.error("Gemini API Error:");
        console.error(error);

        res.status(500).json({
            success: false,
            error: error.message
        });

    }

});

// ============================================================
// GET FARM INFORMATION
// ============================================================

async function getFarmInfo() {

    let farmInfo = await FarmInfo
        .findOne()
        .sort({ _id: -1 });

    // If no farm information exists, create default data
    if (!farmInfo) {

        farmInfo = await FarmInfo.create({

            rainfall: 0,

            cropType: "Wheat",

            soilType: "Loamy",

            season: "Monsoon",

            irrigationType: "Drip",

            waterSource: "Groundwater",

            fieldArea: 1,

            region: "Central"

        });

    }

    return farmInfo;
}

// ============================================================
// GET LATEST SENSOR DATA FOR REAL-TIME WEBSITE
// ============================================================

async function getLatestSensorData() {

    const sensor = await SensorData
        .findOne()
        .sort({ _id: -1 })
        .lean();

    return {

        moisture:
            sensor?.moisture ?? null,

        temperature:
            sensor?.temperature ?? null,

        pH:
            sensor?.pH ?? null,

        nitrogen:
            sensor?.nitrogen ?? null,

        phosphorus:
            sensor?.phosphorus ?? null,

        potassium:
            sensor?.potassium ?? null

    };

}

// ============================================================
// GET WEATHER DATA FROM OPEN-METEO
// ============================================================

function getWeatherData() {

    return new Promise((resolve, reject) => {

        // Nagpur location
        const latitude = 21.1458;
        const longitude = 79.0882;

        const url =
            `https://api.open-meteo.com/v1/forecast` +
            `?latitude=${latitude}` +
            `&longitude=${longitude}` +
            `&current=relative_humidity_2m,wind_speed_10m` +
            `&timezone=Asia%2FKolkata`;

        https.get(url, (response) => {

            let data = "";

            response.on("data", (chunk) => {
                data += chunk;
            });

            response.on("end", () => {

                try {

                    const result = JSON.parse(data);

                    resolve({

                        humidity:
                            result.current?.relative_humidity_2m ?? null,

                        windSpeed:
                            result.current?.wind_speed_10m ?? null

                    });

                } catch (error) {

                    reject(error);

                }

            });

        }).on("error", (error) => {

            reject(error);

        });

    });

}



// ============================================================
// HOME / DISEASE DETECTION PAGE
// ============================================================
// ============================================================
// HOME / DISEASE DETECTION PAGE
// ============================================================

// ============================================================
// HOME / DASHBOARD
// ============================================================

// ============================================================
// HOME / DASHBOARD
// ============================================================

app.get("/", async (req, res) => {

    try {

        // ----------------------------------------
        // GET LATEST SENSOR DATA
        // ----------------------------------------

        const data = await SensorData
            .findOne()
            .sort({ _id: -1 });


        // ----------------------------------------
        // GET FARM INFORMATION
        // ----------------------------------------

        const farmInfo = await getFarmInfo();


        // ----------------------------------------
        // GET WEATHER DATA
        // ----------------------------------------

        let humidity = null;
        let windSpeed = null;

        try {

            const weather = await getWeatherData();

            humidity = weather.humidity;
            windSpeed = weather.windSpeed;

            console.log("Weather data:");
            console.log("Humidity:", humidity);
            console.log("Wind Speed:", windSpeed);

        }

        catch (weatherError) {

            console.log(
                "Weather API error:"
            );

            console.log(weatherError);

        }


        // ----------------------------------------
        // CONSOLE
        // ----------------------------------------

        console.log("MongoDB sensor data:");
        console.log(data);

        console.log("Farm information:");
        console.log(farmInfo);


        // ----------------------------------------
        // RENDER DASHBOARD
        // ----------------------------------------

        res.render(
            "index",
            {

                title:
                    "AgriSense AI | Plant Disease Detection",

                prediction:
                    null,

                confidence:
                    null,

                title_result:
                    null,

                description:
                    null,

                recommendation:
                    null,

                image:
                    null,

                error:
                    null,

                // MongoDB sensor data
                data:
                    data,

                // Farm information
                farmInfo:
                    farmInfo,

                // Weather data
                humidity:
                    humidity,

                windSpeed:
                    windSpeed

            }
        );

    }

    catch (error) {

        console.log(
            "Dashboard fetch error:"
        );

        console.log(error);


        // ----------------------------------------
        // STILL RENDER PAGE
        // ----------------------------------------

        res.render(
            "index",
            {

                title:
                    "AgriSense AI | Plant Disease Detection",

                prediction:
                    null,

                confidence:
                    null,

                title_result:
                    null,

                description:
                    null,

                recommendation:
                    null,

                image:
                    null,

                error:
                    "Unable to load dashboard data.",

                data:
                    null,

                farmInfo:
                    null,

                humidity:
                    null,

                windSpeed:
                    null

            }
        );

    }

});


// ============================================================
// UPDATE FARM INFORMATION
// ============================================================

// ============================================================
// UPDATE FARM INFORMATION - WEBSITE
// ============================================================

app.post(
    "/update-farm-info",
    async (req, res) => {

        try {

            console.log(
                "Updated farm information:"
            );

            console.log(
                req.body
            );


            // ========================================================
            // UPDATE FARM INFORMATION IN MONGODB
            // ========================================================

            const updatedFarm =
                await FarmInfo.findOneAndUpdate(

                    {},

                    {

                        rainfall:
                            Number(req.body.rainfall),

                        cropType:
                            req.body.cropType,

                        soilType:
                            req.body.soilType,

                        season:
                            req.body.season,

                        irrigationType:
                            req.body.irrigationType,

                        waterSource:
                            req.body.waterSource,

                        fieldArea:
                            Number(req.body.fieldArea),

                        region:
                            req.body.region,

                        updatedAt:
                            new Date()

                    },

                    {
                        upsert: true,
                        new: true,
                        setDefaultsOnInsert: true
                    }

                );


            // ========================================================
            // SEND UPDATED FARM DATA TO WEBSITE IMMEDIATELY
            // ========================================================

            const farm = {

                rainfall:
                    updatedFarm.rainfall,

                cropType:
                    updatedFarm.cropType,

                soilType:
                    updatedFarm.soilType,

                season:
                    updatedFarm.season,

                irrigationType:
                    updatedFarm.irrigationType,

                waterSource:
                    updatedFarm.waterSource,

                fieldArea:
                    updatedFarm.fieldArea,

                region:
                    updatedFarm.region

            };


            console.log(
                "Sending updated farm information to website:"
            );

            console.log(farm);


            io.emit(
                 "farmInformationUpdated",
                farm
            );

            console.log(
        "farmInformationUpdated emitted successfully");


            // ========================================================
            // GO BACK TO DASHBOARD
            // ========================================================

            res.redirect("/");

        }

        catch (error) {

            console.error(
                "Farm information update error:"
            );

            console.error(error);

            res.status(500).send(
                "Unable to update farm information."
            );

        }

    }
);


// ============================================================
// PLANT DISEASE PREDICTION
// ============================================================

// ============================================================
// PLANT DISEASE PREDICTION
// ============================================================

app.post(
    "/disease-predict",

    function (req, res) {

        upload.single("plant_image")(
            req,
            res,

            async function (uploadError) {

                // ========================================================
                // GET DASHBOARD DATA
                // ========================================================

                let data = {
                    moisture: 0,
                    temperature: 0,
                    pH: 0,
                    nitrogen: 0,
                    phosphorus: 0,
                    potassium: 0
                };

                let farmInfo = {
                    rainfall: 0,
                    cropType: "Wheat",
                    soilType: "Loamy",
                    season: "Monsoon",
                    irrigationType: "Drip",
                    waterSource: "Groundwater",
                    fieldArea: 1,
                    region: "Central"
                };

                let humidity = null;
                let windSpeed = null;


                // ========================================================
                // LOAD MONGODB + WEATHER DATA
                // ========================================================

                try {

                    const sensorData =
                        await SensorData
                            .findOne()
                            .sort({ _id: -1 });

                    if (sensorData) {

                        data = {
                            moisture:
                                sensorData.moisture ?? 0,

                            temperature:
                                sensorData.temperature ?? 0,

                            pH:
                                sensorData.pH ?? 0,

                            nitrogen:
                                sensorData.nitrogen ?? 0,

                            phosphorus:
                                sensorData.phosphorus ?? 0,

                            potassium:
                                sensorData.potassium ?? 0
                        };

                    }


                    const savedFarmInfo =
                        await getFarmInfo();

                    if (savedFarmInfo) {

                        farmInfo = {
                            rainfall:
                                savedFarmInfo.rainfall ?? 0,

                            cropType:
                                savedFarmInfo.cropType ?? "Wheat",

                            soilType:
                                savedFarmInfo.soilType ?? "Loamy",

                            season:
                                savedFarmInfo.season ?? "Monsoon",

                            irrigationType:
                                savedFarmInfo.irrigationType ?? "Drip",

                            waterSource:
                                savedFarmInfo.waterSource ?? "Groundwater",

                            fieldArea:
                                savedFarmInfo.fieldArea ?? 1,

                            region:
                                savedFarmInfo.region ?? "Central"
                        };

                    }


                    // ====================================================
                    // WEATHER
                    // ====================================================

                    try {

                        const weather =
                            await getWeatherData();

                        humidity =
                            weather.humidity;

                        windSpeed =
                            weather.windSpeed;

                    }

                    catch (weatherError) {

                        console.log(
                            "Weather fetch failed during disease prediction:"
                        );

                        console.log(
                            weatherError.message
                        );

                    }


                    console.log(
                        "Disease page dashboard data:"
                    );

                    console.log("Sensor:", data);

                    console.log(
                        "Farm:",
                        farmInfo
                    );

                    console.log(
                        "Humidity:",
                        humidity
                    );

                    console.log(
                        "Wind Speed:",
                        windSpeed
                    );

                }

                catch (dashboardError) {

                    console.log(
                        "Could not load dashboard data for disease page:"
                    );

                    console.log(
                        dashboardError.message
                    );

                }


                try {

                    // ====================================================
                    // MULTER ERROR
                    // ====================================================

                    if (uploadError) {

                        return res.render(
                            "index",
                            {

                                title:
                                    "AgriSense AI | Plant Disease Detection",

                                prediction: null,

                                confidence: null,

                                title_result: null,

                                description: null,

                                recommendation: null,

                                image: null,

                                error:
                                    uploadError.message,

                                // DASHBOARD DATA
                                data: data,

                                farmInfo: farmInfo,

                                humidity: humidity,

                                windSpeed: windSpeed

                            }
                        );

                    }


                    // ====================================================
                    // NO IMAGE
                    // ====================================================

                    if (!req.file) {

                        return res.render(
                            "index",
                            {

                                title:
                                    "AgriSense AI | Plant Disease Detection",

                                prediction: null,

                                confidence: null,

                                title_result: null,

                                description: null,

                                recommendation: null,

                                image: null,

                                error:
                                    "Please upload a plant leaf image.",

                                // DASHBOARD DATA
                                data: data,

                                farmInfo: farmInfo,

                                humidity: humidity,

                                windSpeed: windSpeed

                            }
                        );

                    }


                    // ====================================================
                    // IMAGE UPLOADED
                    // ====================================================

                    console.log(
                        "\nUploaded image:"
                    );

                    console.log(
                        req.file.path
                    );


                    // ====================================================
                    // RUN PYTHON DISEASE MODEL
                    // ====================================================

                    const imagePath =
    path.resolve(
        req.file.path
    );


console.log(
    "Uploaded image:"
);

console.log(
    imagePath
);


const result =
    await runDiseasePython(
        DISEASE_SCRIPT,
        imagePath
    );


console.log(
    "Disease Prediction Result:"
);

console.log(
    result
);


                    // ====================================================
                    // PYTHON MODEL ERROR
                    // ====================================================

                    if (!result.success) {

                        return res.render(
                            "index",
                            {

                                title:
                                    "AgriSense AI | Plant Disease Detection",

                                prediction: null,

                                confidence: null,

                                title_result: null,

                                description: null,

                                recommendation: null,

                                image:
                                    "/uploads/disease/" +
                                    req.file.filename,

                                error:
                                    result.error,

                                // DASHBOARD DATA
                                data: data,

                                farmInfo: farmInfo,

                                humidity: humidity,

                                windSpeed: windSpeed

                            }
                        );

                    }


                    // ====================================================
                    // SUCCESS
                    // ====================================================

                    console.log(
                        "\nDisease Prediction Result:"
                    );

                    console.log(result);


                    return res.render(
                        "index",
                        {

                            title:
                                "AgriSense AI | Plant Disease Detection",

                            prediction:
                                result.prediction,

                            confidence:
                                result.confidence,

                            title_result:
                                result.title,

                            description:
                                result.description,

                            recommendation:
                                result.recommendation,

                            image:
                                "/uploads/disease/" +
                                req.file.filename,

                            error: null,

                            // =================================================
                            // IMPORTANT:
                            // SEND DASHBOARD DATA TO index.ejs
                            // =================================================

                            data: data,

                            farmInfo: farmInfo,

                            humidity: humidity,

                            windSpeed: windSpeed

                        }
                    );


                }

                catch (error) {

                    console.error(
                        "Disease prediction error:"
                    );

                    console.error(error);


                    return res.render(
                        "index",
                        {

                            title:
                                "AgriSense AI | Plant Disease Detection",

                            prediction: null,

                            confidence: null,

                            title_result: null,

                            description: null,

                            recommendation: null,

                            image:
                                req.file
                                    ? "/uploads/disease/" +
                                      req.file.filename
                                    : null,

                            error:
                                error.message,

                            // DASHBOARD DATA
                            data: data,

                            farmInfo: farmInfo,

                            humidity: humidity,

                            windSpeed: windSpeed

                        }
                    );

                }

            }
        );

    }
);


// ============================================================
// ANDROID API - PLANT DISEASE PREDICTION
// ============================================================

app.post(
    "/api/disease-predict",

    upload.single("plant_image"),

    async (req, res) => {

        console.log("\n========================================");
        console.log("ANDROID DISEASE PREDICTION REQUEST");
        console.log("========================================");

        try {

            // ----------------------------------------
            // CHECK IMAGE
            // ----------------------------------------

            if (!req.file) {

                console.log("No image received.");

                return res.status(400).json({

                    success: false,

                    prediction: null,

                    confidence: null,

                    title: null,

                    description: null,

                    recommendation: null,

                    error: "Please upload a plant leaf image."

                });

            }


            // ----------------------------------------
            // IMAGE RECEIVED
            // ----------------------------------------

            console.log("Uploaded image:");

            console.log(req.file.path);


            // ----------------------------------------
            // RUN PYTHON MODEL
            // ----------------------------------------

            console.log("----------------------------------------");

            console.log("Running Python:");

            console.log(DISEASE_SCRIPT);


            const result =
                await runDiseasePython(
                DISEASE_SCRIPT,
                req.file.path
            );


            console.log("----------------------------------------");

            console.log("Python result:");

            console.log(result);


            // ----------------------------------------
            // PYTHON ERROR
            // ----------------------------------------

            if (!result.success) {

                return res.status(500).json({

                    success: false,

                    prediction: null,

                    confidence: null,

                    title: null,

                    description: null,

                    recommendation: null,

                    error:
                        result.error ||
                        "Disease prediction failed."

                });

            }


            // ----------------------------------------
            // SUCCESS
            // ----------------------------------------

            console.log("----------------------------------------");

            console.log("Disease prediction successful:");

            console.log(
                "Prediction:",
                result.prediction
            );

            console.log(
                "Confidence:",
                result.confidence
            );


            return res.status(200).json({

                success: true,

                prediction:
                    result.prediction || null,

                confidence:
                    result.confidence || null,

                title:
                    result.title || null,

                description:
                    result.description || null,

                recommendation:
                    result.recommendation || null,

                error: null,

                message:
                    "Disease prediction successful."

            });


        } catch (error) {

            console.error(
                "ANDROID DISEASE PREDICTION ERROR:"
            );

            console.error(error);


            return res.status(500).json({

                success: false,

                prediction: null,

                confidence: null,

                title: null,

                description: null,

                recommendation: null,

                error:
                    error.message ||
                    "Disease prediction failed."

            });

        }

    }
);




// ============================================================
// CROP RECOMMENDATION PAGE
// ============================================================
// ============================================================
// CROP RECOMMENDATION PAGE
// ============================================================

app.get(
    "/crop-recommendation",
    async (req, res) => {

        try {

            // ----------------------------------------
            // GET LATEST SENSOR DATA
            // ----------------------------------------

            const data = await SensorData
                .findOne()
                .sort({ _id: -1 });


            // ----------------------------------------
            // GET FARM INFORMATION
            // ----------------------------------------

            const farmInfo = await getFarmInfo();


            // ----------------------------------------
            // GET WEATHER DATA
            // ----------------------------------------

            let humidity = null;

            try {

                const weather =
                    await getWeatherData();

                humidity =
                    weather.humidity;

                console.log(
                    "Humidity for crop page:",
                    humidity
                );

            }

            catch (weatherError) {

                console.log(
                    "Weather API error on crop page:"
                );

                console.log(
                    weatherError
                );

            }


            // ----------------------------------------
            // RENDER CROP PAGE
            // ----------------------------------------

            res.render(
                "crop",
                {

                    prediction:
                        null,

                    error:
                        null,


                    // ==============================
                    // SENSOR DATA
                    // ==============================

                    nitrogen:
                        data
                            ? data.nitrogen
                            : null,

                    moisture:
                        data
                            ? data.moisture
                            : null,

                    phosphorus:
                        data
                            ? data.phosphorus
                            : null,

                    potassium:
                        data
                            ? data.potassium
                            : null,

                    temperature:
                        data
                            ? data.temperature
                            : null,

                    pH:
                        data
                            ? data.pH
                            : null,


                    // ==============================
                    // WEATHER DATA
                    // ==============================

                    humidity:
                        humidity,


                    // ==============================
                    // FARM INFORMATION
                    // ==============================

                    rainfall:
                        farmInfo
                            ? farmInfo.rainfall
                            : 0

                }
            );

        }

        catch (error) {

            console.log(
                "Crop page error:"
            );

            console.log(error);


            res.render(
                "crop",
                {

                    prediction:
                        null,

                    error:
                        "Unable to load crop recommendation data.",


                    nitrogen:
                        null,

                    moisture:
                        null,

                    phosphorus:
                        null,

                    potassium:
                        null,

                    temperature:
                        null,

                    pH:
                        null,

                    humidity:
                        null,

                    rainfall:
                        0

                }
            );

        }

    }
);


// ============================================================
// CROP PREDICTION
// ============================================================

// ============================================================
// CROP PREDICTION
// ============================================================

// ============================================================
// CROP PREDICTION
// ============================================================

app.post(
    "/crop-predict",
    async (req, res) => {

        try {

            console.log("\n========================================");
            console.log("CROP PREDICTION");
            console.log("========================================");

            console.log("Received crop input:");
            console.log(req.body);


            // ========================================================
            // GET LATEST SENSOR DATA
            // ========================================================

            const data = await SensorData
                .findOne()
                .sort({ _id: -1 });


            // ========================================================
            // GET FARM INFORMATION
            // ========================================================

            const farmInfo = await getFarmInfo();


            // ========================================================
            // GET WEATHER DATA
            // ========================================================

            let weather = {
                humidity: null,
                windSpeed: null
            };

            try {

                weather = await getWeatherData();

                console.log("Weather:");
                console.log(weather);

            }

            catch (weatherError) {

                console.log(
                    "Weather fetch failed:"
                );

                console.log(
                    weatherError.message
                );

            }


            // ========================================================
            // PREPARE CROP INPUT
            // ========================================================

            const cropInput = {

                N:
                    Number(
                        req.body.N ??
                        req.body.nitrogen ??
                        (data ? data.nitrogen : 0)
                    ),

                P:
                    Number(
                        req.body.P ??
                        req.body.phosphorus ??
                        (data ? data.phosphorus : 0)
                    ),

                K:
                    Number(
                        req.body.K ??
                        req.body.potassium ??
                        (data ? data.potassium : 0)
                    ),

                temperature:
                    Number(
                        req.body.temperature ??
                        (data ? data.temperature : 0)
                    ),

                ph:
                    Number(
                        req.body.ph ??
                        req.body.pH ??
                        req.body.phValue ??
                        (data ? data.pH : 0)
                    ),

                humidity:
                    Number(
                        req.body.humidity ??
                        weather.humidity ??
                        0
                    ),

                rainfall:
                    Number(
                        req.body.rainfall ??
                        (farmInfo ? farmInfo.rainfall : 0)
                    )

            };


            // ========================================================
            // DISPLAY INPUT
            // ========================================================

            console.log("----------------------------------------");
            console.log("Input sent to Crop Python model:");
            console.log(cropInput);
            console.log("----------------------------------------");


            // ========================================================
            // RUN CROP PYTHON MODEL
            // ========================================================

            const result =
                await runPython(
                    CROP_SCRIPT,
                    cropInput
                );


            // ========================================================
            // COMMON PAGE DATA
            // ========================================================

            const pageData = {

                // ----------------------------------------
                // PREDICTION
                // ----------------------------------------

                prediction:
                    result.success
                        ? (
                            result.prediction ||
                            null
                        )
                        : null,

                error:
                    result.success
                        ? null
                        : (
                            result.error ||
                            "Crop prediction failed."
                        ),


                // ----------------------------------------
                // SENSOR DATA
                // ----------------------------------------

                nitrogen:
                    data
                        ? data.nitrogen
                        : cropInput.N,

                phosphorus:
                    data
                        ? data.phosphorus
                        : cropInput.P,

                potassium:
                    data
                        ? data.potassium
                        : cropInput.K,

                temperature:
                    data
                        ? data.temperature
                        : cropInput.temperature,

                pH:
                    data
                        ? data.pH
                        : cropInput.ph,

                moisture:
                    data
                        ? data.moisture
                        : null,


                // ----------------------------------------
                // WEATHER
                // ----------------------------------------

                humidity:
                    weather.humidity !== null
                        ? weather.humidity
                        : cropInput.humidity,

                windSpeed:
                    weather.windSpeed,


                // ----------------------------------------
                // FARM INFORMATION
                // ----------------------------------------

                rainfall:
                    farmInfo
                        ? farmInfo.rainfall
                        : cropInput.rainfall,

                cropType:
                    farmInfo
                        ? farmInfo.cropType
                        : "Wheat",

                soilType:
                    farmInfo
                        ? farmInfo.soilType
                        : "Loamy",

                season:
                    farmInfo
                        ? farmInfo.season
                        : "Monsoon",

                irrigationType:
                    farmInfo
                        ? farmInfo.irrigationType
                        : "Drip",

                waterSource:
                    farmInfo
                        ? farmInfo.waterSource
                        : "Groundwater",

                fieldArea:
                    farmInfo
                        ? farmInfo.fieldArea
                        : 1,

                region:
                    farmInfo
                        ? farmInfo.region
                        : "Central"

            };


            // ========================================================
            // PYTHON MODEL ERROR
            // ========================================================

            if (!result.success) {

                console.log(
                    "Crop model returned error:"
                );

                console.log(
                    result.error
                );

                return res.render(
                    "crop",
                    pageData
                );

            }


            // ========================================================
            // SUCCESS
            // ========================================================

            console.log("----------------------------------------");
            console.log("CROP PREDICTION SUCCESS");
            console.log("----------------------------------------");

            console.log(
                "Predicted Crop:",
                result.prediction
            );

            console.log("----------------------------------------");


            // ========================================================
            // RENDER crop.ejs
            // ========================================================

            return res.render(
                "crop",
                pageData
            );

        }

        catch (error) {

            console.error(
                "CROP PREDICTION ERROR:"
            );

            console.error(error);


            // ========================================================
            // TRY TO LOAD DATA AGAIN
            // ========================================================

            let data = null;
            let farmInfo = null;

            try {

                data =
                    await SensorData
                        .findOne()
                        .sort({ _id: -1 });

                farmInfo =
                    await getFarmInfo();

            }

            catch (dbError) {

                console.log(
                    "Could not reload crop data:"
                );

                console.log(
                    dbError.message
                );

            }


            // ========================================================
            // RENDER ERROR
            // ========================================================

            return res.render(
                "crop",
                {

                    prediction: null,

                    error:
                        error.message ||
                        "Crop prediction failed.",


                    // SENSOR DATA

                    nitrogen:
                        data
                            ? data.nitrogen
                            : null,

                    phosphorus:
                        data
                            ? data.phosphorus
                            : null,

                    potassium:
                        data
                            ? data.potassium
                            : null,

                    temperature:
                        data
                            ? data.temperature
                            : null,

                    pH:
                        data
                            ? data.pH
                            : null,

                    moisture:
                        data
                            ? data.moisture
                            : null,


                    // WEATHER

                    humidity: null,

                    windSpeed: null,


                    // FARM INFORMATION

                    rainfall:
                        farmInfo
                            ? farmInfo.rainfall
                            : 0,

                    cropType:
                        farmInfo
                            ? farmInfo.cropType
                            : "Wheat",

                    soilType:
                        farmInfo
                            ? farmInfo.soilType
                            : "Loamy",

                    season:
                        farmInfo
                            ? farmInfo.season
                            : "Monsoon",

                    irrigationType:
                        farmInfo
                            ? farmInfo.irrigationType
                            : "Drip",

                    waterSource:
                        farmInfo
                            ? farmInfo.waterSource
                            : "Groundwater",

                    fieldArea:
                        farmInfo
                            ? farmInfo.fieldArea
                            : 1,

                    region:
                        farmInfo
                            ? farmInfo.region
                            : "Central"

                }
            );

        }

    }
);


// ============================================================
// ANDROID API - CROP PREDICTION
// ============================================================

app.post(
    "/api/crop-predict",
    async (req, res) => {

        console.log("\n========================================");
        console.log("ANDROID CROP PREDICTION");
        console.log("========================================");

        console.log("Received from Android:");
        console.log(req.body);

        try {

            const inputData = {

                N: Number(req.body.N),

                P: Number(req.body.P),

                K: Number(req.body.K),

                temperature:
                    Number(req.body.temperature),

                ph:
                    Number(
                        req.body.ph ??
                        req.body.pH
                    ),

                humidity:
                    Number(req.body.humidity),

                rainfall:
                    Number(req.body.rainfall)

            };


            console.log("Input sent to Python:");
            console.log(inputData);


            const result =
                await runPython(
                    CROP_SCRIPT,
                    inputData
                );


            console.log(
                "Crop Python result:"
            );

            console.log(result);


            if (
                !result ||
                !result.success
            ) {

                return res.status(500).json({

                    success: false,

                    prediction: null,

                    message:
                        result?.error ||
                        "Crop prediction failed."

                });

            }


            return res.status(200).json({

                success: true,

                prediction:
                    result.prediction ||
                    null,

                message:
                    "Crop prediction successful."

            });

        }

        catch (error) {

            console.error(
                "ANDROID CROP PREDICTION ERROR:"
            );

            console.error(error);


            return res.status(500).json({

                success: false,

                prediction: null,

                message:
                    error.message ||
                    "Crop prediction failed."

            });

        }

    }
);


// ============================================================
// FERTILIZER PAGE
// ============================================================

// ============================================================
// FERTILIZER PAGE
// ============================================================

app.get(
    "/fertilizer-prediction",
    async (req, res) => {

        try {

            // ----------------------------------------
            // GET LATEST SENSOR DATA
            // ----------------------------------------

            const data = await SensorData
                .findOne()
                .sort({ _id: -1 });


            // ----------------------------------------
            // GET FARM INFORMATION
            // ----------------------------------------

            const farmInfo =
                await getFarmInfo();


            // ----------------------------------------
            // GET WEATHER DATA
            // ----------------------------------------

            let humidity = null;

            try {

                const weather =
                    await getWeatherData();

                humidity =
                    weather.humidity;

                console.log(
                    "Humidity for fertilizer page:",
                    humidity
                );

            }

            catch (weatherError) {

                console.log(
                    "Weather API error for fertilizer page:"
                );

                console.log(
                    weatherError
                );

            }


            // ----------------------------------------
            // CONSOLE
            // ----------------------------------------

            console.log(
                "MongoDB data for fertilizer page:"
            );

            console.log(data);

            console.log(
                "Farm information for fertilizer page:"
            );

            console.log(farmInfo);


            // ----------------------------------------
            // RENDER FERTILIZER PAGE
            // ----------------------------------------

            res.render(
                "fertilizer",
                {

                    prediction:
                        null,

                    error:
                        null,


                    // ==============================
                    // SENSOR DATA
                    // ==============================

                    nitrogen:
                        data
                            ? data.nitrogen
                            : null,

                    phosphorus:
                        data
                            ? data.phosphorus
                            : null,

                    potassium:
                        data
                            ? data.potassium
                            : null,

                    temperature:
                        data
                            ? data.temperature
                            : null,

                    ph:
                        data
                            ? data.pH
                            : null,

                    moisture:
                        data
                            ? data.moisture
                            : null,


                    // ==============================
                    // WEATHER DATA
                    // ==============================

                    humidity:
                        humidity,


                    // ==============================
                    // FARM INFORMATION
                    // ==============================

                    rainfall:
                        farmInfo
                            ? farmInfo.rainfall
                            : 0,

                    soilType:
                        farmInfo
                            ? farmInfo.soilType
                            : "Loamy",

                    cropType:
                        farmInfo
                            ? farmInfo.cropType
                            : "Wheat",

                    season:
                        farmInfo
                            ? farmInfo.season
                            : "Monsoon",

                    irrigationType:
                        farmInfo
                            ? farmInfo.irrigationType
                            : "Drip",

                    waterSource:
                        farmInfo
                            ? farmInfo.waterSource
                            : "Groundwater",

                    fieldArea:
                        farmInfo
                            ? farmInfo.fieldArea
                            : 1,

                    region:
                        farmInfo
                            ? farmInfo.region
                            : "Central"

                }
            );

        }

        catch (error) {

            console.log(
                "MongoDB fetch error for fertilizer page:"
            );

            console.log(error);


            // ----------------------------------------
            // RENDER WITH DEFAULT VALUES
            // ----------------------------------------

            res.render(
                "fertilizer",
                {

                    prediction:
                        null,

                    error:
                        "MongoDB data could not be fetched.",


                    // Sensor data
                    nitrogen:
                        null,

                    phosphorus:
                        null,

                    potassium:
                        null,

                    temperature:
                        null,

                    ph:
                        null,

                    moisture:
                        null,


                    // Weather
                    humidity:
                        null,


                    // Farm information
                    rainfall:
                        0,

                    soilType:
                        "Loamy",

                    cropType:
                        "Wheat",

                    season:
                        "Monsoon",

                    irrigationType:
                        "Drip",

                    waterSource:
                        "Groundwater",

                    fieldArea:
                        1,

                    region:
                        "Central"

                }
            );

        }

    }
);
// ============================================================
// FERTILIZER PREDICTION
// ============================================================

app.post(
    "/fertilizer-predict",

    async (req, res) => {

        try {

            console.log("\nFertilizer Input:");
            console.log(req.body);


            // ----------------------------------------
            // GET LATEST SENSOR DATA
            // ----------------------------------------

            const data = await SensorData
                .findOne()
                .sort({ _id: -1 });


            // ----------------------------------------
            // GET FARM INFORMATION
            // ----------------------------------------

            const farmInfo = await getFarmInfo();


            // ----------------------------------------
            // GET WEATHER DATA
            // ----------------------------------------

            let weather = {
                humidity: null,
                windSpeed: null
            };

            try {

                weather = await getWeatherData();

            } catch (weatherError) {

                console.log(
                    "Weather fetch failed:",
                    weatherError.message
                );

            }


            // ----------------------------------------
            // RUN FERTILIZER MODEL
            // ----------------------------------------

            const result =
                await runPython(
                    FERTILIZER_SCRIPT,
                    req.body
                );


            // ----------------------------------------
            // RENDER RESULT
            // ----------------------------------------

            if (!result.success) {

                return res.render(
                    "fertilizer",
                    {

                        prediction: null,

                        error: result.error,

                        // SENSOR DATA
                        nitrogen:
                            data ? data.nitrogen : null,

                        phosphorus:
                            data ? data.phosphorus : null,

                        potassium:
                            data ? data.potassium : null,

                        temperature:
                            data ? data.temperature : null,

                        ph:
                            data ? data.pH : null,

                        moisture:
                            data ? data.moisture : null,

                        // WEATHER
                        humidity:
                            weather.humidity,

                        windSpeed:
                            weather.windSpeed,

                        // FARM INFORMATION
                        rainfall:
                            farmInfo ? farmInfo.rainfall : null,

                        cropType:
                            farmInfo ? farmInfo.cropType : "Wheat",

                        soilType:
                            farmInfo ? farmInfo.soilType : "Loamy",

                        season:
                            farmInfo ? farmInfo.season : "Monsoon",

                        irrigationType:
                            farmInfo
                                ? farmInfo.irrigationType
                                : "Drip",

                        waterSource:
                            farmInfo
                                ? farmInfo.waterSource
                                : "Groundwater",

                        fieldArea:
                            farmInfo ? farmInfo.fieldArea : 1,

                        region:
                            farmInfo ? farmInfo.region : "Central"

                    }
                );

            }


            // ----------------------------------------
            // SUCCESS
            // ----------------------------------------

            return res.render(
                "fertilizer",
                {

                    prediction:
                        result.prediction,

                    error:
                        null,

                    // SENSOR DATA
                    nitrogen:
                        data ? data.nitrogen : null,

                    phosphorus:
                        data ? data.phosphorus : null,

                    potassium:
                        data ? data.potassium : null,

                    temperature:
                        data ? data.temperature : null,

                    ph:
                        data ? data.pH : null,

                    moisture:
                        data ? data.moisture : null,

                    // WEATHER
                    humidity:
                        weather.humidity,

                    windSpeed:
                        weather.windSpeed,

                    // FARM INFORMATION
                    rainfall:
                        farmInfo ? farmInfo.rainfall : null,

                    cropType:
                        farmInfo ? farmInfo.cropType : "Wheat",

                    soilType:
                        farmInfo ? farmInfo.soilType : "Loamy",

                    season:
                        farmInfo ? farmInfo.season : "Monsoon",

                    irrigationType:
                        farmInfo
                            ? farmInfo.irrigationType
                            : "Drip",

                    waterSource:
                        farmInfo
                            ? farmInfo.waterSource
                            : "Groundwater",

                    fieldArea:
                        farmInfo ? farmInfo.fieldArea : 1,

                    region:
                        farmInfo ? farmInfo.region : "Central"

                }
            );


        }

        catch (error) {

            console.error(
                "Fertilizer prediction error:"
            );

            console.error(error);


            // ----------------------------------------
            // TRY TO GET DATA AGAIN FOR EJS
            // ----------------------------------------

            let data = null;
            let farmInfo = null;

            try {

                data = await SensorData
                    .findOne()
                    .sort({ _id: -1 });

                farmInfo = await getFarmInfo();

            } catch (dbError) {

                console.log(
                    "Could not reload dashboard data:",
                    dbError.message
                );

            }


            return res.render(
                "fertilizer",
                {

                    prediction: null,

                    error:
                        error.message,

                    nitrogen:
                        data ? data.nitrogen : null,

                    phosphorus:
                        data ? data.phosphorus : null,

                    potassium:
                        data ? data.potassium : null,

                    temperature:
                        data ? data.temperature : null,

                    ph:
                        data ? data.pH : null,

                    moisture:
                        data ? data.moisture : null,

                    humidity: null,

                    windSpeed: null,

                    rainfall:
                        farmInfo
                            ? farmInfo.rainfall
                            : 0,

                    cropType:
                        farmInfo
                            ? farmInfo.cropType
                            : "Wheat",

                    soilType:
                        farmInfo
                            ? farmInfo.soilType
                            : "Loamy",

                    season:
                        farmInfo
                            ? farmInfo.season
                            : "Monsoon",

                    irrigationType:
                        farmInfo
                            ? farmInfo.irrigationType
                            : "Drip",

                    waterSource:
                        farmInfo
                            ? farmInfo.waterSource
                            : "Groundwater",

                    fieldArea:
                        farmInfo
                            ? farmInfo.fieldArea
                            : 1,

                    region:
                        farmInfo
                            ? farmInfo.region
                            : "Central"

                }
            );

        }

    }
);

// ============================================================
// ANDROID API - FERTILIZER PREDICTION
// ============================================================

app.post("/api/fertilizer-predict", async (req, res) => {

    console.log("\n========================================");
    console.log("ANDROID FERTILIZER PREDICTION");
    console.log("========================================");

    console.log("Received from Android:");
    console.log(req.body);

    try {

        const result = await runPython(
            FERTILIZER_SCRIPT,
            req.body
        );

        console.log("Fertilizer Python result:");
        console.log(result);

        // Python/model error
        if (!result || !result.success) {

            return res.status(500).json({

                success: false,

                prediction: null,

                fertilizer: null,

                recommendation: null,

                confidence: null,

                message:
                    result?.error ||
                    "Fertilizer prediction failed."

            });

        }

        // SUCCESS
        return res.json({

            success: true,

            prediction:
                result.prediction || null,

            fertilizer:
                result.fertilizer ||
                result.prediction ||
                null,

            recommendation:
                result.recommendation || null,

            confidence:
                result.confidence || null,

            message:
                result.message || null

        });

    } catch (error) {

        console.error(
            "ANDROID FERTILIZER ERROR:"
        );

        console.error(error);

        return res.status(500).json({

            success: false,

            prediction: null,

            fertilizer: null,

            recommendation: null,

            confidence: null,

            message: error.message

        });

    }

});




// ============================================================
// WATER IRRIGATION PAGE
// ============================================================

// ============================================================
// WATER IRRIGATION PAGE
// ============================================================

app.get(
    "/water-irrigation",
    async (req, res) => {

        try {

            // ------------------------------------------------
            // GET LATEST SENSOR DATA
            // ------------------------------------------------

            const data = await SensorData
                .findOne()
                .sort({ _id: -1 });


            // ------------------------------------------------
            // GET FARM INFORMATION
            // ------------------------------------------------

            const farmInfo = await getFarmInfo();


            // ------------------------------------------------
            // GET WEATHER DATA
            // ------------------------------------------------

            let weather = {
                humidity: null,
                windSpeed: null
            };

            try {

                weather = await getWeatherData();

            } catch (weatherError) {

                console.log(
                    "Weather data fetch error:"
                );

                console.log(
                    weatherError
                );

            }


            // ------------------------------------------------
            // DISPLAY DATA IN TERMINAL
            // ------------------------------------------------

            console.log(
                "========================================"
            );

            console.log(
                "Irrigation Page Data"
            );

            console.log(
                "========================================"
            );

            console.log(
                "Sensor Data:"
            );

            console.log(data);

            console.log(
                "Farm Information:"
            );

            console.log(farmInfo);

            console.log(
                "Weather:"
            );

            console.log(weather);

            console.log(
                "========================================"
            );


            // ------------------------------------------------
            // RENDER IRRIGATION PAGE
            // ------------------------------------------------

            res.render(
                "irrigation",
                {

                    // ========================================
                    // PREDICTION VALUES
                    // ========================================

                    prediction: null,

                    confidence: null,

                    recommendation: null,

                    error: null,


                    // ========================================
                    // SENSOR VALUES
                    // ========================================

                    // Soil Moisture
                    moisture:
                        data
                            ? data.moisture
                            : null,


                    // Soil pH
                    pH:
                        data
                            ? data.pH
                            : null,


                    // Temperature
                    temperature:
                        data
                            ? data.temperature
                            : null,


                    // Nitrogen
                    nitrogen:
                        data
                            ? data.nitrogen
                            : null,


                    // Phosphorus
                    phosphorus:
                        data
                            ? data.phosphorus
                            : null,


                    // Potassium
                    potassium:
                        data
                            ? data.potassium
                            : null,


                    // ========================================
                    // WEATHER VALUES
                    // ========================================

                    // Humidity from Open-Meteo
                    humidity:
                        weather.humidity,


                    // Wind Speed from Open-Meteo
                    windSpeed:
                        weather.windSpeed,


                    // ========================================
                    // FARM INFORMATION
                    // ========================================

                    // Rainfall
                    rainfall:
                        farmInfo
                            ? farmInfo.rainfall
                            : 0,


                    // Crop Type
                    cropType:
                        farmInfo
                            ? farmInfo.cropType
                            : "Wheat",


                    // Soil Type
                    soilType:
                        farmInfo
                            ? farmInfo.soilType
                            : "Loamy",


                    // Season
                    season:
                        farmInfo
                            ? farmInfo.season
                            : "Monsoon",


                    // Irrigation Type
                    irrigationType:
                        farmInfo
                            ? farmInfo.irrigationType
                            : "Drip",


                    // Water Source
                    waterSource:
                        farmInfo
                            ? farmInfo.waterSource
                            : "Groundwater",


                    // Field Area
                    fieldArea:
                        farmInfo
                            ? farmInfo.fieldArea
                            : 1,


                    // Region
                    region:
                        farmInfo
                            ? farmInfo.region
                            : "Central"

                }
            );

        }

        catch (error) {

            console.log(
                "MongoDB fetch error for irrigation page:"
            );

            console.log(error);


            // ------------------------------------------------
            // ERROR PAGE
            // ------------------------------------------------

            res.render(
                "irrigation",
                {

                    // Prediction
                    prediction: null,

                    confidence: null,

                    recommendation: null,

                    error:
                        "MongoDB data could not be fetched.",


                    // Sensor values
                    nitrogen: null,

                    phosphorus: null,

                    potassium: null,

                    pH: null,

                    moisture: null,

                    temperature: null,


                    // Weather values
                    humidity: null,

                    windSpeed: null,


                    // Farm values
                    rainfall: 0,

                    cropType: "Wheat",

                    soilType: "Loamy",

                    season: "Monsoon",

                    irrigationType: "Drip",

                    waterSource: "Groundwater",

                    fieldArea: 1,

                    region: "Central"

                }
            );

        }

    }
);


// ============================================================
// WATER IRRIGATION PREDICTION
// ============================================================

// ============================================================
// WATER IRRIGATION PREDICTION
// ============================================================

app.post(
    "/irrigation-predict",

    async (req, res) => {

        try {

            console.log("\n========================================");
            console.log("Irrigation Prediction Input");
            console.log("========================================");

            console.log(req.body);


            // ========================================================
            // GET LATEST SENSOR DATA
            // ========================================================

            const data = await SensorData
                .findOne()
                .sort({ _id: -1 });


            // ========================================================
            // GET FARM INFORMATION
            // ========================================================

            const farmInfo = await getFarmInfo();


            // ========================================================
            // GET WEATHER DATA
            // ========================================================

            let weather = {
                humidity: null,
                windSpeed: null
            };

            try {

                weather = await getWeatherData();

                console.log(
                    "Humidity:",
                    weather.humidity
                );

                console.log(
                    "Wind Speed:",
                    weather.windSpeed
                );

            }

            catch (weatherError) {

                console.log(
                    "Weather fetch failed:"
                );

                console.log(
                    weatherError.message
                );

            }


            // ========================================================
            // RUN IRRIGATION PYTHON MODEL
            // ========================================================

            const result =
                await runPython(
                    IRRIGATION_SCRIPT,
                    req.body
                );


            // ========================================================
            // COMMON VALUES FOR EJS
            // ========================================================

            const pageData = {

                // ----------------------------------------------------
                // Prediction
                // ----------------------------------------------------

                prediction:
                    result.success
                        ? (
                            result.prediction ||
                            result.irrigation_need ||
                            null
                        )
                        : null,

                confidence:
                    result.success
                        ? (
                            result.confidence ||
                            null
                        )
                        : null,

                recommendation:
                    result.success
                        ? (
                            result.recommendation ||
                            null
                        )
                        : null,

                error:
                    result.success
                        ? null
                        : result.error,


                // ----------------------------------------------------
                // SENSOR DATA
                // ----------------------------------------------------

                moisture:
                    data
                        ? data.moisture
                        : null,

                pH:
                    data
                        ? data.pH
                        : null,

                temperature:
                    data
                        ? data.temperature
                        : null,

                nitrogen:
                    data
                        ? data.nitrogen
                        : null,

                phosphorus:
                    data
                        ? data.phosphorus
                        : null,

                potassium:
                    data
                        ? data.potassium
                        : null,


                // ----------------------------------------------------
                // WEATHER DATA
                // ----------------------------------------------------

                humidity:
                    weather.humidity,

                windSpeed:
                    weather.windSpeed,


                // ----------------------------------------------------
                // FARM INFORMATION
                // ----------------------------------------------------

                rainfall:
                    farmInfo
                        ? farmInfo.rainfall
                        : 0,

                soilType:
                    farmInfo
                        ? farmInfo.soilType
                        : "Loamy",

                cropType:
                    farmInfo
                        ? farmInfo.cropType
                        : "Wheat",

                season:
                    farmInfo
                        ? farmInfo.season
                        : "Monsoon",

                irrigationType:
                    farmInfo
                        ? farmInfo.irrigationType
                        : "Drip",

                waterSource:
                    farmInfo
                        ? farmInfo.waterSource
                        : "Groundwater",

                fieldArea:
                    farmInfo
                        ? farmInfo.fieldArea
                        : 1,

                region:
                    farmInfo
                        ? farmInfo.region
                        : "Central"

            };


            // ========================================================
            // PYTHON MODEL ERROR
            // ========================================================

            if (!result.success) {

                console.log(
                    "Irrigation model returned error:"
                );

                console.log(
                    result.error
                );

                return res.render(
                    "irrigation",
                    pageData
                );

            }


            // ========================================================
            // SUCCESS
            // ========================================================

            console.log(
                "Irrigation prediction:"
            );

            console.log(
                result.prediction ||
                result.irrigation_need
            );


            return res.render(
                "irrigation",
                pageData
            );

        }

        catch (error) {

            console.error(
                "Irrigation prediction error:"
            );

            console.error(error);


            // ========================================================
            // TRY TO LOAD DATA AGAIN
            // ========================================================

            let data = null;
            let farmInfo = null;

            try {

                data = await SensorData
                    .findOne()
                    .sort({ _id: -1 });

                farmInfo =
                    await getFarmInfo();

            }

            catch (dbError) {

                console.log(
                    "Could not reload irrigation data:"
                );

                console.log(
                    dbError.message
                );

            }


            // ========================================================
            // WEATHER
            // ========================================================

            let weather = {
                humidity: null,
                windSpeed: null
            };

            try {

                weather =
                    await getWeatherData();

            }

            catch (weatherError) {

                console.log(
                    "Could not reload weather:"
                );

            }


            // ========================================================
            // RENDER ERROR
            // ========================================================

            return res.render(
                "irrigation",
                {

                    // ------------------------------------------------
                    // Prediction
                    // ------------------------------------------------

                    prediction:
                        null,

                    confidence:
                        null,

                    recommendation:
                        null,

                    error:
                        error.message,


                    // ------------------------------------------------
                    // Sensor values
                    // ------------------------------------------------

                    moisture:
                        data
                            ? data.moisture
                            : null,

                    pH:
                        data
                            ? data.pH
                            : null,

                    temperature:
                        data
                            ? data.temperature
                            : null,

                    nitrogen:
                        data
                            ? data.nitrogen
                            : null,

                    phosphorus:
                        data
                            ? data.phosphorus
                            : null,

                    potassium:
                        data
                            ? data.potassium
                            : null,


                    // ------------------------------------------------
                    // Weather values
                    // ------------------------------------------------

                    humidity:
                        weather.humidity,

                    windSpeed:
                        weather.windSpeed,


                    // ------------------------------------------------
                    // Farm information
                    // ------------------------------------------------

                    rainfall:
                        farmInfo
                            ? farmInfo.rainfall
                            : 0,

                    soilType:
                        farmInfo
                            ? farmInfo.soilType
                            : "Loamy",

                    cropType:
                        farmInfo
                            ? farmInfo.cropType
                            : "Wheat",

                    season:
                        farmInfo
                            ? farmInfo.season
                            : "Monsoon",

                    irrigationType:
                        farmInfo
                            ? farmInfo.irrigationType
                            : "Drip",

                    waterSource:
                        farmInfo
                            ? farmInfo.waterSource
                            : "Groundwater",

                    fieldArea:
                        farmInfo
                            ? farmInfo.fieldArea
                            : 1,

                    region:
                        farmInfo
                            ? farmInfo.region
                            : "Central"

                }
            );

        }

    }
);

// ============================================================
// ANDROID API - IRRIGATION PREDICTION
// ============================================================

app.post("/api/irrigation-predict", async (req, res) => {

    console.log("\n========================================");
    console.log("ANDROID IRRIGATION PREDICTION");
    console.log("========================================");

    console.log("Received from Android:");
    console.log(req.body);

    try {

        const result = await runPython(
            IRRIGATION_SCRIPT,
            req.body
        );

        console.log("Irrigation Python result:");
        console.log(result);

        // Python/model error
        if (!result || !result.success) {

            return res.status(500).json({

                success: false,

                prediction: null,

                irrigation_need: null,

                recommendation: null,

                confidence: null,

                message:
                    result?.error ||
                    "Irrigation prediction failed."

            });

        }

        // SUCCESS
        return res.json({

            success: true,

            prediction:
                result.prediction || null,

            irrigation_need:
                result.irrigation_need ||
                result.prediction ||
                null,

            recommendation:
                result.recommendation || null,

            confidence:
                result.confidence || null,

            message:
                result.message || null

        });

    } catch (error) {

        console.error(
            "ANDROID IRRIGATION ERROR:"
        );

        console.error(error);

        return res.status(500).json({

            success: false,

            prediction: null,

            irrigation_need: null,

            recommendation: null,

            confidence: null,

            message: error.message

        });

    }

});

// ============================================================
// ANDROID DASHBOARD API
// ============================================================

app.get(
    "/api/dashboard",
    async (req, res) => {

        try {

            const data = await SensorData
                .findOne()
                .sort({ _id: -1 });

            const farmInfo =
                await getFarmInfo();

            let weather = {
                humidity: null,
                windSpeed: null
            };

            try {

                weather =
                    await getWeatherData();

            } catch (weatherError) {

                console.log(
                    "Weather API error:",
                    weatherError.message
                );

            }

            res.json({

                success: true,

                sensor: {

                    moisture:
                        data
                            ? data.moisture
                            : null,

                    temperature:
                        data
                            ? data.temperature
                            : null,

                    pH:
                        data
                            ? data.pH
                            : null,

                    nitrogen:
                        data
                            ? data.nitrogen
                            : null,

                    phosphorus:
                        data
                            ? data.phosphorus
                            : null,

                    potassium:
                        data
                            ? data.potassium
                            : null

                },

                weather: {

                    humidity:
                        weather.humidity,

                    windSpeed:
                        weather.windSpeed

                },

                farm: {

                    rainfall:
                        farmInfo
                            ? farmInfo.rainfall
                            : 0,

                    cropType:
                        farmInfo
                            ? farmInfo.cropType
                            : "Wheat",

                    soilType:
                        farmInfo
                            ? farmInfo.soilType
                            : "Loamy",

                    season:
                        farmInfo
                            ? farmInfo.season
                            : "Monsoon",

                    irrigationType:
                        farmInfo
                            ? farmInfo.irrigationType
                            : "Drip",

                    waterSource:
                        farmInfo
                            ? farmInfo.waterSource
                            : "Groundwater",

                    fieldArea:
                        farmInfo
                            ? farmInfo.fieldArea
                            : 1,

                    region:
                        farmInfo
                            ? farmInfo.region
                            : "Central"

                }

            });

        }

        catch (error) {

            console.error(
                "Android dashboard API error:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    error.message

            });

        }

    }
);

// ============================================================
// ANDROID - UPDATE FARM INFORMATION
// ============================================================

app.post(
    "/api/update-farm-info",
    async (req, res) => {

        try {

            console.log("\n========================================");
            console.log("ANDROID FARM INFORMATION UPDATE");
            console.log("========================================");

            console.log("Received:");
            console.log(req.body);

            const updatedFarm = await FarmInfo.findOneAndUpdate(
                {},

                {
                    rainfall:
                        Number(req.body.rainfall),

                    cropType:
                        req.body.cropType,

                    soilType:
                        req.body.soilType,

                    season:
                        req.body.season,

                    irrigationType:
                        req.body.irrigationType,

                    waterSource:
                        req.body.waterSource,

                    fieldArea:
                        Number(req.body.fieldArea),

                    region:
                        req.body.region,

                    updatedAt:
                        new Date()
                },

                {
                    upsert: true,
                    new: true,
                    setDefaultsOnInsert: true
                }
            );

            console.log("Updated farm information:");
            console.log(updatedFarm);

            // ========================================================
            // SEND UPDATED FARM DATA TO WEBSITE
            // ========================================================

            const farm = {

                rainfall:
                    updatedFarm.rainfall,

                cropType:
                    updatedFarm.cropType,

                soilType:
                    updatedFarm.soilType,

                season:
                    updatedFarm.season,

                irrigationType:
                    updatedFarm.irrigationType,

                waterSource:
                    updatedFarm.waterSource,

                fieldArea:
                    updatedFarm.fieldArea,

                region:
                    updatedFarm.region

            };


            console.log(
                "Sending updated farm information to website:"
            );

            console.log(farm);


            io.emit(
                "farmInfoUpdated",
                farm
);

            return res.status(200).json({

                success: true,

                message:
                    "Farm information updated successfully.",

                farm: {

                    rainfall:
                        updatedFarm.rainfall,

                    cropType:
                        updatedFarm.cropType,

                    soilType:
                        updatedFarm.soilType,

                    season:
                        updatedFarm.season,

                    irrigationType:
                        updatedFarm.irrigationType,

                    waterSource:
                        updatedFarm.waterSource,

                    fieldArea:
                        updatedFarm.fieldArea,

                    region:
                        updatedFarm.region
                }
            });

        }

        catch (error) {

            console.error(
                "ANDROID FARM UPDATE ERROR:"
            );

            console.error(error);

            return res.status(500).json({

                success: false,

                message:
                    error.message ||
                    "Unable to update farm information."
            });
        }
    }
);


// ============================================================
// 404
// ============================================================

app.use(
    (req, res) => {

        res.status(404).send(
            "AgriSense page not found."
        );

    }
);

// ============================================================
// GET LATEST FARM INFORMATION
// ============================================================

app.get("/api/farm-info", async (req, res) => {

    try {

        const farm = await FarmInfo
            .findOne()
            .sort({ updatedAt: -1 })
            .lean();

        if (!farm) {
            return res.json({});
        }

        res.json({
            rainfall: farm.rainfall,
            cropType: farm.cropType,
            soilType: farm.soilType,
            season: farm.season,
            irrigationType: farm.irrigationType,
            waterSource: farm.waterSource,
            fieldArea: farm.fieldArea,
            region: farm.region
        });

    } catch (error) {

        console.error(
            "Farm information fetch error:",
            error
        );

        res.status(500).json({
            error: "Unable to fetch farm information"
        });

    }

});


// ============================================================
// START SERVER
// ============================================================

// ============================================================
// START SERVER
// ============================================================

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log("");

        console.log(
            "========================================"
        );

        console.log(
            "          AGRISENSE AI"
        );

        console.log(
            "========================================"
        );

        console.log(
            `Server running at: http://localhost:${PORT}`
        );

        console.log(
            `Socket.IO running on the same port: ${PORT}`
        );

        console.log(
            "Website sensor real-time sync: ENABLED"
        );

        console.log(
            "========================================"
        );

        console.log("");

    }
);


