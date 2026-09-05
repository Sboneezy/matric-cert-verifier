const express = require("express");
const multer = require("multer");
const path = require("path");

const IntakePipeline = require("./lib/intake/IntakePipeline");
const { getProvider } = require("./lib/providers/ProviderRegistry");

const app = express();

const upload = multer({
    dest: path.join(__dirname, "uploads")
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.json({
        name: "Matric Certificate Verifier",
        status: "running",
        version: "1.0.0"
    });
});

app.get("/health", (req, res) => {
    res.json({
        status: "ok"
    });
});

app.post("/verify", upload.single("certificate"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: "No certificate file uploaded."
            });
        }

        const pipeline = new IntakePipeline();

        const result = await pipeline.process(req.file.path);

        const provider = getProvider("umalusi");

        res.json({
            success: true,
            provider: provider.name,
            candidate: result.candidate,
            decision: result.decision
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Matric Certificate Verifier running on http://localhost:${PORT}`);
});