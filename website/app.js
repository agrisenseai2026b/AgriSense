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

const PYTHON_PATH = process.env.PYTHON_PATH || "python";

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
    console.log("Website Socket.IO client connected:", socket.id);

    socket.on("disconnect", () => {
        console.log("Website Socket.IO client disconnected:", socket.id);
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

console.log("MongoDB URI loaded:", process.env.MONGODB_URI ? "YES" : "NO");

mongoose
    .connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log("MongoDB Connected Successfully");
        console.log("Database: AgriSenseDB");
        console.log("Collection: sensordatas");

        try {
            const sensorChangeStream = SensorData.watch([], {
                fullDocument: "updateLookup"
            });

            console.log("MongoDB Sensor Change Stream Started");

            sensorChangeStream.on("change", async (change) => {
                console.log("\n========================================");
                console.log("SENSOR DATA CHANGE DETECTED");
                console.log("Operation:", change.operationType);
                console.log("========================================");

                try {
                    const sensor = await getLatestSensorData();
                    console.log("Latest sensor data:", sensor);

                    io.emit("sensorDataUpdated", sensor);
                    console.log("Sensor data sent to website.");
                } catch (error) {
                    console.error("Error while broadcasting sensor data:", error);
                }
            });

            sensorChangeStream.on("error", (error) => {
                console.error("MongoDB Sensor Change Stream Error:", error);
            });

            sensorChangeStream.on("close", () => {
                console.log("MongoDB Sensor Change Stream Closed.");
            });

        } catch (error) {
            console.error("Unable to start MongoDB Sensor Change Stream:", error);
        }
    })
    .catch((error) => {
        console.log("MongoDB Connection Error:", error);
    });

// ============================================================
// REAL-TIME FARM INFORMATION CHANGE STREAM
// ============================================================

mongoose.connection.once("open", () => {
    console.log("MongoDB connection opened - starting FarmInfo Change Stream");

    const farmChangeStream = FarmInfo.watch([], {
        fullDocument: "updateLookup"
    });

    farmChangeStream.on("change", async (change) => {
        console.log("========================================");
        console.log("MONGODB FARM CHANGE DETECTED");
        console.log(change);
        console.log("========================================");

        try {
            const updatedFarm = await FarmInfo.findOne({}).sort({ updatedAt: -1 }).lean();

            if (!updatedFarm) {
                console.log("No farm information found.");
                return;
            }

            const farm = {
                rainfall: updatedFarm.rainfall,
                cropType: updatedFarm.cropType,
                soilType: updatedFarm.soilType,
                season: updatedFarm.season,
                irrigationType: updatedFarm.irrigationType,
                waterSource: updatedFarm.waterSource,
                fieldArea: updatedFarm.fieldArea,
                region: updatedFarm.region
            };

            console.log("Sending Android/MongoDB farm change to website:", farm);
            io.emit("farmInformationUpdated", farm);
            console.log("Farm information sent to website.");
        } catch (error) {
            console.error("Error processing farm change:", error);
        }
    });

    farmChangeStream.on("error", (error) => {
        console.error("Farm Change Stream Error:", error);
    });
});

// ============================================================
// DIRECTORIES
// ============================================================

const AGRISENSE_DIR = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(__dirname, "public");
const UPLOAD_DIR = path.join(PUBLIC_DIR, "uploads", "disease");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// ============================================================
// EJS
// ============================================================

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ============================================================
// PYTHON SCRIPTS
// ============================================================

const CROP_SCRIPT = path.join(__dirname, "..", "crop_recommendation", "predict.py");
const FERTILIZER_SCRIPT = path.join(__dirname, "..", "fertilizer_prediction", "predict.py");
const IRRIGATION_SCRIPT = path.join(__dirname, "..", "water_irrigation", "predict.py");
const DISEASE_SCRIPT = path.join(__dirname, "..", "plant_disease", "predict.py");

const PYTHON_COMMAND = process.env.PYTHON_PATH || "python";

// ============================================================
// PERSISTENT PLANT DISEASE PYTHON WORKER
// ============================================================

let diseaseWorker = null;
let diseaseWorkerReady = false;
let diseaseWorkerStarting = false;
let diseaseWorkerBuffer = "";
let diseaseWorkerRequests = [];
let diseaseWorkerCurrentRequest = null;

// ============================================================
// START DISEASE WORKER
// ============================================================

function startDiseaseWorker() {
    if (diseaseWorkerStarting || diseaseWorker) {
        return;
    }

    diseaseWorkerStarting = true;

    console.log("\n========================================");
    console.log("STARTING PLANT DISEASE WORKER");
    console.log("========================================");

    diseaseWorker = spawn(
        PYTHON_COMMAND,
        [
            path.join(
                __dirname,
                "..",
                "plant_disease",
                "disease_worker.py"
            )
        ],
        {
            cwd: path.join(
                __dirname,
                "..",
                "plant_disease"
            ),
            stdio: ["pipe", "pipe", "pipe"]
        }
    );

    diseaseWorkerStarting = false;

    // STDOUT
    diseaseWorker.stdout.on("data", (data) => {
        diseaseWorkerBuffer += data.toString();
        const lines = diseaseWorkerBuffer.split("\n");
        diseaseWorkerBuffer = lines.pop();

        for (const line of lines) {
            const cleanLine = line.trim();
            if (!cleanLine) continue;

            let message;
            try {
                message = JSON.parse(cleanLine);
            } catch (error) {
                console.log("Disease worker output:", cleanLine);
                continue;
            }

            if (message.type === "ready") {
                diseaseWorkerReady = true;
                console.log("\n========================================");
                console.log("PLANT DISEASE MODEL READY");
                console.log("Model is loaded and waiting for images.");
                console.log("========================================\n");
                processNextDiseaseRequest();
                continue;
            }

            if (message.type === "startup_error") {
                console.error("Disease worker startup error:", message.error);
                continue;
            }

            if (message.type === "result") {
                if (diseaseWorkerCurrentRequest) {
                    const request = diseaseWorkerCurrentRequest;
                    diseaseWorkerCurrentRequest = null;

                    if (message.success) {
                        request.resolve(message);
                    } else {
                        request.reject(new Error(message.error || "Disease prediction failed."));
                    }
                }
                processNextDiseaseRequest();
            }
        }
    });

    // STDERR
    diseaseWorker.stderr.on("data", (data) => {
        console.log("[DISEASE WORKER]", data.toString());
    });

    // ERROR
    diseaseWorker.on("error", (error) => {
        console.error("Disease worker process error:", error);
        diseaseWorkerReady = false;
        diseaseWorkerStarting = false;
    });

    // CLOSE
    diseaseWorker.on("close", (code) => {
        console.log("Disease worker exited with code:", code);
        diseaseWorker = null;
        diseaseWorkerReady = false;
        diseaseWorkerStarting = false;

        if (diseaseWorkerCurrentRequest) {
            diseaseWorkerCurrentRequest.reject(new Error("Disease prediction worker stopped."));
            diseaseWorkerCurrentRequest = null;
        }

        while (diseaseWorkerRequests.length) {
            const request = diseaseWorkerRequests.shift();
            request.reject(new Error("Disease prediction worker stopped."));
        }
    });
}

// ============================================================
// PROCESS NEXT DISEASE REQUEST
// ============================================================

function processNextDiseaseRequest() {
    if (!diseaseWorker || !diseaseWorkerReady || diseaseWorkerCurrentRequest || diseaseWorkerRequests.length === 0) {
        return;
    }

    const request = diseaseWorkerRequests.shift();
    diseaseWorkerCurrentRequest = request;

    console.log("\n========================================");
    console.log("SENDING IMAGE TO DISEASE WORKER");
    console.log(request.imagePath);
    console.log("========================================");

    diseaseWorker.stdin.write(
        JSON.stringify({ image_path: request.imagePath }) + "\n"
    );
}

// ============================================================
// RUN DISEASE PREDICTION (WITH 30s TIMEOUT)
// ============================================================

function runDiseasePrediction(imagePath) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error("Disease prediction request timed out after 30 seconds."));
        }, 30000);

        diseaseWorkerRequests.push({
            imagePath: imagePath,
            resolve: (res) => {
                clearTimeout(timeout);
                resolve(res);
            },
            reject: (err) => {
                clearTimeout(timeout);
                reject(err);
            }
        });
        processNextDiseaseRequest();
    });
}

// Start disease worker process immediately
startDiseaseWorker();

// ============================================================
// MULTER CONFIGURATION
// ============================================================

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOAD_DIR);
    },
    filename: function (req, file, cb) {
        const extension = path.extname(file.originalname).toLowerCase();
        const filename = "plant_" + Date.now() + "_" + Math.round(Math.random() * 100000) + extension;
        cb(null, filename);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
        const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only JPG, PNG and WEBP images are allowed."));
        }
    }
});

// ============================================================
// GEMINI TEST API
// ============================================================

app.post("/api/test-gemini", async (req, res) => {
    try {
        const message = req.body.message;
        if (!message) {
            return res.status(400).json({ success: false, error: "Message is required." });
        }
        const answer = await askGemini(message);
        res.json({ success: true, answer: answer });
    } catch (error) {
        console.error("Gemini API Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// GET FARM INFORMATION
// ============================================================

async function getFarmInfo() {
    let farmInfo = await FarmInfo.findOne().sort({ _id: -1 });

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
    const sensor = await SensorData.findOne().sort({ _id: -1 }).lean();

    return {
        moisture: sensor?.moisture ?? null,
        temperature: sensor?.temperature ?? null,
        pH: sensor?.pH ?? null,
        nitrogen: sensor?.nitrogen ?? null,
        phosphorus: sensor?.phosphorus ?? null,
        potassium: sensor?.potassium ?? null
    };
}

// ============================================================
// GET WEATHER DATA FROM OPEN-METEO (WITH 5s TIMEOUT)
// ============================================================

function getWeatherData() {
    return new Promise((resolve, reject) => {
        const latitude = 21.1458;
        const longitude = 79.0882;

        const url =
            `https://api.open-meteo.com/v1/forecast` +
            `?latitude=${latitude}&longitude=${longitude}` +
            `&current=relative_humidity_2m,wind_speed_10m` +
            `&timezone=Asia%2FKolkata`;

        const req = https.get(url, (response) => {
            let data = "";
            response.on("data", (chunk) => { data += chunk; });
            response.on("end", () => {
                try {
                    const result = JSON.parse(data);
                    resolve({
                        humidity: result.current?.relative_humidity_2m ?? null,
                        windSpeed: result.current?.wind_speed_10m ?? null
                    });
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.setTimeout(5000, () => {
            req.destroy();
            reject(new Error("Weather API network request timed out."));
        });

        req.on("error", (error) => {
            reject(error);
        });
    });
}

// ============================================================
// HOME / DASHBOARD
// ============================================================

app.get("/", async (req, res) => {
    try {
        const data = await SensorData.findOne().sort({ _id: -1 });
        const farmInfo = await getFarmInfo();

        let humidity = null;
        let windSpeed = null;

        try {
            const weather = await getWeatherData();
            humidity = weather.humidity;
            windSpeed = weather.windSpeed;
        } catch (weatherError) {
            console.log("Weather API error:", weatherError.message);
        }

        res.render("index", {
            title: "AgriSense AI | Plant Disease Detection",
            prediction: null,
            confidence: null,
            title_result: null,
            description: null,
            recommendation: null,
            image: null,
            error: null,
            data: data,
            farmInfo: farmInfo,
            humidity: humidity,
            windSpeed: windSpeed
        });
    } catch (error) {
        console.log("Dashboard fetch error:", error);
        res.render("index", {
            title: "AgriSense AI | Plant Disease Detection",
            prediction: null,
            confidence: null,
            title_result: null,
            description: null,
            recommendation: null,
            image: null,
            error: "Unable to load dashboard data.",
            data: null,
            farmInfo: null,
            humidity: null,
            windSpeed: null
        });
    }
});

// ============================================================
// UPDATE FARM INFORMATION - WEBSITE
// ============================================================

app.post("/update-farm-info", async (req, res) => {
    try {
        const updatedFarm = await FarmInfo.findOneAndUpdate(
            {},
            {
                rainfall: Number(req.body.rainfall),
                cropType: req.body.cropType,
                soilType: req.body.soilType,
                season: req.body.season,
                irrigationType: req.body.irrigationType,
                waterSource: req.body.waterSource,
                fieldArea: Number(req.body.fieldArea),
                region: req.body.region,
                updatedAt: new Date()
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        const farm = {
            rainfall: updatedFarm.rainfall,
            cropType: updatedFarm.cropType,
            soilType: updatedFarm.soilType,
            season: updatedFarm.season,
            irrigationType: updatedFarm.irrigationType,
            waterSource: updatedFarm.waterSource,
            fieldArea: updatedFarm.fieldArea,
            region: updatedFarm.region
        };

        io.emit("farmInformationUpdated", farm);
        res.redirect("/");
    } catch (error) {
        console.error("Farm information update error:", error);
        res.status(500).send("Unable to update farm information.");
    }
});

// ============================================================
// PLANT DISEASE PREDICTION
// ============================================================

app.post("/disease-predict", function (req, res) {
    upload.single("plant_image")(req, res, async function (uploadError) {
        let data = { moisture: 0, temperature: 0, pH: 0, nitrogen: 0, phosphorus: 0, potassium: 0 };
        let farmInfo = { rainfall: 0, cropType: "Wheat", soilType: "Loamy", season: "Monsoon", irrigationType: "Drip", waterSource: "Groundwater", fieldArea: 1, region: "Central" };
        let humidity = null;
        let windSpeed = null;

        try {
            const sensorData = await SensorData.findOne().sort({ _id: -1 });
            if (sensorData) {
                data = {
                    moisture: sensorData.moisture ?? 0,
                    temperature: sensorData.temperature ?? 0,
                    pH: sensorData.pH ?? 0,
                    nitrogen: sensorData.nitrogen ?? 0,
                    phosphorus: sensorData.phosphorus ?? 0,
                    potassium: sensorData.potassium ?? 0
                };
            }

            const savedFarmInfo = await getFarmInfo();
            if (savedFarmInfo) {
                farmInfo = {
                    rainfall: savedFarmInfo.rainfall ?? 0,
                    cropType: savedFarmInfo.cropType ?? "Wheat",
                    soilType: savedFarmInfo.soilType ?? "Loamy",
                    season: savedFarmInfo.season ?? "Monsoon",
                    irrigationType: savedFarmInfo.irrigationType ?? "Drip",
                    waterSource: savedFarmInfo.waterSource ?? "Groundwater",
                    fieldArea: savedFarmInfo.fieldArea ?? 1,
                    region: savedFarmInfo.region ?? "Central"
                };
            }

            try {
                const weather = await getWeatherData();
                humidity = weather.humidity;
                windSpeed = weather.windSpeed;
            } catch (weatherError) {
                console.log("Weather fetch failed during disease prediction:", weatherError.message);
            }
        } catch (dashboardError) {
            console.log("Could not load dashboard data for disease page:", dashboardError.message);
        }

        try {
            if (uploadError) {
                return res.render("index", {
                    title: "AgriSense AI | Plant Disease Detection",
                    prediction: null, confidence: null, title_result: null, description: null, recommendation: null, image: null,
                    error: uploadError.message, data: data, farmInfo: farmInfo, humidity: humidity, windSpeed: windSpeed
                });
            }

            if (!req.file) {
                return res.render("index", {
                    title: "AgriSense AI | Plant Disease Detection",
                    prediction: null, confidence: null, title_result: null, description: null, recommendation: null, image: null,
                    error: "Please upload a plant leaf image.", data: data, farmInfo: farmInfo, humidity: humidity, windSpeed: windSpeed
                });
            }

            const imagePath = path.resolve(req.file.path);
            const result = await runDiseasePrediction(imagePath);

            if (!result.success) {
                return res.render("index", {
                    title: "AgriSense AI | Plant Disease Detection",
                    prediction: null, confidence: null, title_result: null, description: null, recommendation: null,
                    image: "/uploads/disease/" + req.file.filename,
                    error: result.error, data: data, farmInfo: farmInfo, humidity: humidity, windSpeed: windSpeed
                });
            }

            return res.render("index", {
                title: "AgriSense AI | Plant Disease Detection",
                prediction: result.prediction,
                confidence: result.confidence,
                title_result: result.title,
                description: result.description,
                recommendation: result.recommendation,
                image: "/uploads/disease/" + req.file.filename,
                error: null,
                data: data, farmInfo: farmInfo, humidity: humidity, windSpeed: windSpeed
            });

        } catch (error) {
            console.error("Disease prediction error:", error);
            return res.render("index", {
                title: "AgriSense AI | Plant Disease Detection",
                prediction: null, confidence: null, title_result: null, description: null, recommendation: null,
                image: req.file ? "/uploads/disease/" + req.file.filename : null,
                error: error.message, data: data, farmInfo: farmInfo, humidity: humidity, windSpeed: windSpeed
            });
        }
    });
});

// ============================================================
// ANDROID API - PLANT DISEASE PREDICTION
// ============================================================

app.post("/api/disease-predict", upload.single("plant_image"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false, prediction: null, confidence: null, title: null, description: null, recommendation: null,
                error: "Please upload a plant leaf image."
            });
        }

        const imagePath = path.resolve(req.file.path);
        const result = await runDiseasePrediction(imagePath);

        if (!result.success) {
            return res.status(500).json({
                success: false, prediction: null, confidence: null, title: null, description: null, recommendation: null,
                error: result.error || "Disease prediction failed."
            });
        }

        return res.status(200).json({
            success: true,
            prediction: result.prediction || null,
            confidence: result.confidence || null,
            title: result.title || null,
            description: result.description || null,
            recommendation: result.recommendation || null,
            error: null,
            message: "Disease prediction successful."
        });

    } catch (error) {
        console.error("ANDROID DISEASE PREDICTION ERROR:", error);
        return res.status(500).json({
            success: false, prediction: null, confidence: null, title: null, description: null, recommendation: null,
            error: error.message || "Disease prediction failed."
        });
    }
});

// ============================================================
// CROP RECOMMENDATION PAGE
// ============================================================

app.get("/crop-recommendation", async (req, res) => {
    try {
        const data = await SensorData.findOne().sort({ _id: -1 });
        const farmInfo = await getFarmInfo();

        let humidity = null;
        try {
            const weather = await getWeatherData();
            humidity = weather.humidity;
        } catch (weatherError) {
            console.log("Weather API error on crop page:", weatherError.message);
        }

        res.render("crop", {
            prediction: null,
            error: null,
            nitrogen: data ? data.nitrogen : null,
            moisture: data ? data.moisture : null,
            phosphorus: data ? data.phosphorus : null,
            potassium: data ? data.potassium : null,
            temperature: data ? data.temperature : null,
            pH: data ? data.pH : null,
            humidity: humidity,
            rainfall: farmInfo ? farmInfo.rainfall : 0
        });
    } catch (error) {
        console.log("Crop page error:", error);
        res.render("crop", {
            prediction: null,
            error: "Unable to load crop recommendation data.",
            nitrogen: null, moisture: null, phosphorus: null, potassium: null, temperature: null, pH: null, humidity: null, rainfall: 0
        });
    }
});

// ============================================================
// FERTILIZER PAGE
// ============================================================

app.get("/fertilizer-prediction", async (req, res) => {
    try {
        const data = await SensorData.findOne().sort({ _id: -1 });
        const farmInfo = await getFarmInfo();

        let humidity = null;
        try {
            const weather = await getWeatherData();
            humidity = weather.humidity;
        } catch (weatherError) {
            console.log("Weather API error for fertilizer page:", weatherError.message);
        }

        res.render("fertilizer", {
            prediction: null,
            error: null,
            nitrogen: data ? data.nitrogen : null,
            phosphorus: data ? data.phosphorus : null,
            potassium: data ? data.potassium : null,
            temperature: data ? data.temperature : null,
            ph: data ? data.pH : null,
            moisture: data ? data.moisture : null,
            humidity: humidity,
            rainfall: farmInfo ? farmInfo.rainfall : 0,
            soilType: farmInfo ? farmInfo.soilType : "Loamy",
            cropType: farmInfo ? farmInfo.cropType : "Wheat",
            season: farmInfo ? farmInfo.season : "Monsoon",
            irrigationType: farmInfo ? farmInfo.irrigationType : "Drip",
            waterSource: farmInfo ? farmInfo.waterSource : "Groundwater",
            fieldArea: farmInfo ? farmInfo.fieldArea : 1,
            region: farmInfo ? farmInfo.region : "Central"
        });
    } catch (error) {
        console.log("MongoDB fetch error for fertilizer page:", error);
        res.render("fertilizer", {
            prediction: null,
            error: "MongoDB data could not be fetched.",
            nitrogen: null, phosphorus: null, potassium: null, temperature: null, ph: null, moisture: null, humidity: null,
            rainfall: 0, soilType: "Loamy", cropType: "Wheat", season: "Monsoon", irrigationType: "Drip", waterSource: "Groundwater", fieldArea: 1, region: "Central"
        });
    }
});

// ============================================================
// WATER IRRIGATION PAGE
// ============================================================

app.get("/water-irrigation", async (req, res) => {
    try {
        const data = await SensorData.findOne().sort({ _id: -1 });
        const farmInfo = await getFarmInfo();

        let weather = { humidity: null, windSpeed: null };
        try {
            weather = await getWeatherData();
        } catch (weatherError) {
            console.log("Weather data fetch error:", weatherError.message);
        }

        res.render("irrigation", {
            prediction: null, confidence: null, recommendation: null, error: null,
            moisture: data ? data.moisture : null,
            pH: data ? data.pH : null,
            temperature: data ? data.temperature : null,
            nitrogen: data ? data.nitrogen : null,
            phosphorus: data ? data.phosphorus : null,
            potassium: data ? data.potassium : null,
            humidity: weather.humidity,
            windSpeed: weather.windSpeed,
            rainfall: farmInfo ? farmInfo.rainfall : 0,
            cropType: farmInfo ? farmInfo.cropType : "Wheat",
            soilType: farmInfo ? farmInfo.soilType : "Loamy",
            season: farmInfo ? farmInfo.season : "Monsoon",
            irrigationType: farmInfo ? farmInfo.irrigationType : "Drip",
            waterSource: farmInfo ? farmInfo.waterSource : "Groundwater",
            fieldArea: farmInfo ? farmInfo.fieldArea : 1,
            region: farmInfo ? farmInfo.region : "Central"
        });
    } catch (error) {
        console.log("MongoDB fetch error for irrigation page:", error);
        res.render("irrigation", {
            prediction: null, confidence: null, recommendation: null, error: "MongoDB data could not be fetched.",
            nitrogen: null, phosphorus: null, potassium: null, pH: null, moisture: null, temperature: null,
            humidity: null, windSpeed: null, rainfall: 0, cropType: "Wheat", soilType: "Loamy", season: "Monsoon",
            irrigationType: "Drip", waterSource: "Groundwater", fieldArea: 1, region: "Central"
        });
    }
});

// ============================================================
// ANDROID DASHBOARD API
// ============================================================

app.get("/api/dashboard", async (req, res) => {
    try {
        const data = await SensorData.findOne().sort({ _id: -1 });
        const farmInfo = await getFarmInfo();

        let weather = { humidity: null, windSpeed: null };
        try {
            weather = await getWeatherData();
        } catch (weatherError) {
            console.log("Weather API error:", weatherError.message);
        }

        res.json({
            success: true,
            sensor: {
                moisture: data ? data.moisture : null,
                temperature: data ? data.temperature : null,
                pH: data ? data.pH : null,
                nitrogen: data ? data.nitrogen : null,
                phosphorus: data ? data.phosphorus : null,
                potassium: data ? data.potassium : null
            },
            weather: {
                humidity: weather.humidity,
                windSpeed: weather.windSpeed
            },
            farm: {
                rainfall: farmInfo ? farmInfo.rainfall : 0,
                cropType: farmInfo ? farmInfo.cropType : "Wheat",
                soilType: farmInfo ? farmInfo.soilType : "Loamy",
                season: farmInfo ? farmInfo.season : "Monsoon",
                irrigationType: farmInfo ? farmInfo.irrigationType : "Drip",
                waterSource: farmInfo ? farmInfo.waterSource : "Groundwater",
                fieldArea: farmInfo ? farmInfo.fieldArea : 1,
                region: farmInfo ? farmInfo.region : "Central"
            }
        });
    } catch (error) {
        console.error("Android dashboard API error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// ANDROID - UPDATE FARM INFORMATION
// ============================================================

app.post("/api/update-farm-info", async (req, res) => {
    try {
        const updatedFarm = await FarmInfo.findOneAndUpdate(
            {},
            {
                rainfall: Number(req.body.rainfall),
                cropType: req.body.cropType,
                soilType: req.body.soilType,
                season: req.body.season,
                irrigationType: req.body.irrigationType,
                waterSource: req.body.waterSource,
                fieldArea: Number(req.body.fieldArea),
                region: req.body.region,
                updatedAt: new Date()
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        const farm = {
            rainfall: updatedFarm.rainfall,
            cropType: updatedFarm.cropType,
            soilType: updatedFarm.soilType,
            season: updatedFarm.season,
            irrigationType: updatedFarm.irrigationType,
            waterSource: updatedFarm.waterSource,
            fieldArea: updatedFarm.fieldArea,
            region: updatedFarm.region
        };

        io.emit("farmInfoUpdated", farm);

        return res.status(200).json({
            success: true,
            message: "Farm information updated successfully.",
            farm: farm
        });
    } catch (error) {
        console.error("ANDROID FARM UPDATE ERROR:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Unable to update farm information."
        });
    }
});

// ============================================================
// GET LATEST FARM INFORMATION API
// ============================================================

app.get("/api/farm-info", async (req, res) => {
    try {
        const farm = await FarmInfo.findOne().sort({ updatedAt: -1 }).lean();

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
        console.error("Farm information fetch error:", error);
        res.status(500).json({ error: "Unable to fetch farm information" });
    }
});

// ============================================================
// 404
// ============================================================

app.use((req, res) => {
    res.status(404).send("AgriSense page not found.");
});

// ============================================================
// START SERVER
// ============================================================

server.listen(PORT, "0.0.0.0", () => {
    console.log("");
    console.log("========================================");
    console.log("          AGRISENSE AI");
    console.log("========================================");
    console.log(`Server running at: http://localhost:${PORT}`);
    console.log("Socket.IO running on port " + PORT);
    console.log("Website sensor real-time sync: ENABLED");
    console.log("========================================");
    console.log("");
});
