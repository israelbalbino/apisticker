import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import sharp from "sharp";

import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

// =========================
// GEMINI
// =========================

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// =========================
// JOBS EM MEMÓRIA
// =========================

const jobs = new Map();

function createJob() {
  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  jobs.set(jobId, {
    status: "processing",
    ready: false,
    result: null,
    error: null,
    createdAt: Date.now(),
  });

  return jobId;
}

function updateJob(jobId, data) {
  const job = jobs.get(jobId);

  if (!job) return;

  jobs.set(jobId, {
    ...job,
    ...data,
  });
}

// limpa jobs antigos depois de 30 minutos
setInterval(() => {
  const now = Date.now();

  for (const [jobId, job] of jobs.entries()) {
    if (now - job.createdAt > 30 * 60 * 1000) {
      jobs.delete(jobId);
    }
  }
}, 5 * 60 * 1000);

// =========================
// MULTER
// =========================

const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

// =========================
// FRAMES
// =========================

const BRAZIL_FRAME_PATH = path.resolve("./frames/frame.png");
const DEFAULT_FRAME_PATH = path.resolve("./frames/framepr.png");

// =========================
// COUNTRY -> JERSEY STYLE
// =========================

function getCountryStyle(team) {
  const country = team?.toLowerCase()?.trim();

  const styles = {
    argentina:
      "Argentina national football jersey, sky blue and white stripes",

    brazil:
      "Brazil national football jersey, yellow and green",

    brasil:
      "Brazil national football jersey, yellow and green",

    france:
      "France national football jersey, dark blue",

    germany:
      "Germany national football jersey, white and black",

    spain:
      "Spain national football jersey, red and yellow",

    portugal:
      "Portugal national football jersey, red and green",

    england:
      "England national football jersey, white",

    italy:
      "Italy national football jersey, blue",

    netherlands:
      "Netherlands national football jersey, orange",

    mexico:
      "Mexico national football jersey, green",

    usa:
      "USA national football jersey, white and blue",

    japan:
      "Japan national football jersey, blue",

    belgium:
      "Belgium national football jersey, red",

    croatia:
      "Croatia national football jersey, red and white checkerboard",

    uruguay:
      "Uruguay national football jersey, sky blue",

    colombia:
      "Colombia national football jersey, yellow blue red",

    chile:
      "Chile national football jersey, red and blue",

    morocco:
      "Morocco national football jersey, red and green",
  };

  return styles[country] || `${team} national football jersey`;
}

// =========================
// DYNAMIC FRAME
// =========================

function getFramePath(team) {
  const country = team?.toLowerCase()?.trim();

  if (country === "brasil" || country === "brazil") {
    return BRAZIL_FRAME_PATH;
  }

  return DEFAULT_FRAME_PATH;
}

// =========================
// CLEANUP
// =========================

function cleanup(paths = []) {
  for (const filePath of paths) {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

// =========================
// START ROUTE
// =========================

app.post("/sticker/start", upload.single("face"), async (req, res) => {
  const faceFile = req.file;

  if (!faceFile) {
    return res.status(400).json({
      error: "Envie uma foto",
    });
  }

  const jobId = createJob();

  // responde rápido para não dar timeout no Cloudflare
  res.json({
    success: true,
    ready: false,
    jobId,
    status: "processing",
  });

  // roda a geração em segundo plano
  processStickerJob(jobId, faceFile, req.body);
});

// =========================
// GEMINI PROCESS
// =========================

async function processStickerJob(jobId, faceFile, body) {
  let preparedPath = null;

  try {
    const { name, birthDate, height, weight, team } = body;

    const FRAME_PATH = getFramePath(team);

    console.log("🖼️ Frame selecionado:", FRAME_PATH);

    if (!fs.existsSync(FRAME_PATH)) {
      throw new Error("Frame não encontrado");
    }

    preparedPath = `uploads/prepared-${Date.now()}.png`;

    await sharp(faceFile.path)
      .rotate()
      .resize(1200, 1200, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toFile(preparedPath);

    const selfieBase64 = fs.readFileSync(preparedPath).toString("base64");
    const frameBase64 = fs.readFileSync(FRAME_PATH).toString("base64");

    const jerseyStyle = getCountryStyle(team);

    console.log("🌍 Team:", team);
    console.log("👕 Jersey:", jerseyStyle);
    console.log("🧠 Gerando figurinha com Gemini...");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",

      contents: [
        {
          role: "user",

          parts: [
            {
              text: `
Create an ultra realistic FIFA World Cup sticker.

IMAGE 1:
Use as the REAL person's face.

IMAGE 2:
Use as the FIFA sticker frame.

PLAYER DATA:

Name: ${name}
Nasc: ${birthDate}
Alt: ${height}
KG: ${weight}
Time: ${team}

IMPORTANT PLAYER RULES:

- preserve EXACT facial identity
- do NOT create another face
- do NOT stylize the face
- realistic football player portrait
- realistic skin texture
- realistic lighting
- realistic neck and shoulders
- remove original selfie background
- do NOT paste rectangular selfie
- face must be centered
- head and shoulders must overflow outside frame
- official Panini FIFA sticker style
- premium collectible sticker quality
- ultra realistic

TEAM RULES:

- create the jersey based on the country team
- jersey style: ${jerseyStyle}
- jersey must match the official colors of ${team}
- professional football uniform
- realistic fabric texture

TEXT RULES:

- print the player's name at bottom
- print birth date
- print height
- print weight
- print team name
- realistic FIFA typography
- text integrated into frame
- professional sticker layout

FRAME RULES:

- preserve the exact style of the provided frame
- integrate the player naturally into the frame
- keep the original sticker borders
- maintain collectible sticker appearance

FINAL RESULT:

Generate ONE final sticker image only.
`,
            },

            {
              inlineData: {
                mimeType: "image/png",
                data: selfieBase64,
              },
            },

            {
              inlineData: {
                mimeType: "image/png",
                data: frameBase64,
              },
            },
          ],
        },
      ],

      config: {
        responseModalities: ["IMAGE"],
      },
    });

    let imageBuffer = null;

    const parts = response?.candidates?.[0]?.content?.parts || [];

    for (const part of parts) {
      if (part.inlineData?.data) {
        imageBuffer = Buffer.from(part.inlineData.data, "base64");
      }
    }

    if (!imageBuffer) {
      throw new Error("Gemini não retornou imagem");
    }

    const finalImage = await sharp(imageBuffer)
      .webp({
        quality: 100,
      })
      .toBuffer();

    const imageBase64 = finalImage.toString("base64");
    const imageUrl = `data:image/webp;base64,${imageBase64}`;

    cleanup([faceFile.path, preparedPath]);

    updateJob(jobId, {
      status: "succeeded",
      ready: true,
      result: {
        mimeType: "image/webp",
        imageBase64,
        imageUrl,
      },
    });

    console.log("✅ Figurinha criada:", jobId);
  } catch (err) {
    cleanup([faceFile?.path, preparedPath]);

    updateJob(jobId, {
      status: "failed",
      ready: true,
      error: err?.message || "Erro ao gerar figurinha",
    });

    console.error("❌ ERRO JOB:", err);
  }
}

// =========================
// STATUS / POLLING
// =========================

app.get("/sticker/status/:jobId", (req, res) => {
  const { jobId } = req.params;

  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({
      success: false,
      ready: true,
      error: "Job não encontrado",
    });
  }

  // ainda processando
  if (job.status === "processing") {
    return res.json({
      success: true,
      ready: false,
      jobId,
      status: "processing",
      imageUrl: null,
    });
  }

  // erro
  if (job.status === "failed") {
    return res.status(500).json({
      success: false,
      ready: true,
      jobId,
      status: "failed",
      error: job.error,
      imageUrl: null,
    });
  }

  // SUCESSO -> RETORNA IMAGEM
  return res.json({
    success: true,
    ready: true,
    jobId,
    status: "succeeded",

    mimeType: job.result.mimeType,

    imageBase64: job.result.imageBase64,

    // AQUI VEM A IMAGEM
    imageUrl: job.result.imageUrl,
  });
});

// =========================
// COMPATIBILIDADE COM ROTA ANTIGA
// =========================

app.post("/sticker", upload.single("face"), async (req, res) => {
  const faceFile = req.file;

  if (!faceFile) {
    return res.status(400).json({
      error: "Envie uma foto",
    });
  }

  const jobId = createJob();

  res.json({
    success: true,
    ready: false,
    jobId,
    status: "processing",
    message:
      "Geração iniciada. Consulte /sticker/status/" + jobId,
  });

  processStickerJob(jobId, faceFile, req.body);
});

// =========================
// SERVER
// =========================

const PORT = process.env.PORT || 3333;

app.listen(PORT, () => {
  console.log(`🔥 Server rodando na porta ${PORT}`);
});
