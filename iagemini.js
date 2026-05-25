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

const BRAZIL_FRAME_PATH =
  path.resolve("./frames/frame.png");

const DEFAULT_FRAME_PATH =
  path.resolve("./frames/framepr.png");

// =========================
// COUNTRY -> JERSEY STYLE
// =========================

function getCountryStyle(team) {
  const country =
    team?.toLowerCase()?.trim();

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

  return (
    styles[country] ||
    `${team} national football jersey`
  );
}

// =========================
// DYNAMIC FRAME
// =========================

function getFramePath(team) {
  const country =
    team?.toLowerCase()?.trim();

  // Brasil usa frame.png
  if (
    country === "brasil" ||
    country === "brazil"
  ) {
    return BRAZIL_FRAME_PATH;
  }

  // Outros países usam framepr.png
  return DEFAULT_FRAME_PATH;
}

// =========================
// ROUTE
// =========================

app.post(
  "/sticker",
  upload.single("face"),

  async (req, res) => {
    const faceFile = req.file;

    const {
      name,
      birthDate,
      height,
      weight,
      team,
    } = req.body;

    if (!faceFile) {
      return res.status(400).json({
        error: "Envie uma foto",
      });
    }

    let preparedPath = null;

    try {
      // =========================
      // SELECT FRAME
      // =========================

      const FRAME_PATH =
        getFramePath(team);

      console.log(
        "🖼️ Frame selecionado:",
        FRAME_PATH
      );

      // =========================
      // VALIDATE FRAME
      // =========================

      if (!fs.existsSync(FRAME_PATH)) {
        return res.status(500).json({
          error:
            "Frame não encontrado",
        });
      }

      // =========================
      // PREPARE IMAGE
      // =========================

      preparedPath = `uploads/prepared-${Date.now()}.png`;

      await sharp(faceFile.path)

        .rotate()

        .resize(1200, 1200, {
          fit: "inside",
          withoutEnlargement: true,
        })

        .png()

        .toFile(preparedPath);

      // =========================
      // FILES
      // =========================

      const selfieBase64 = fs
        .readFileSync(preparedPath)
        .toString("base64");

      const frameBase64 = fs
        .readFileSync(FRAME_PATH)
        .toString("base64");

      // =========================
      // DYNAMIC JERSEY
      // =========================

      const jerseyStyle =
        getCountryStyle(team);

      console.log(
        "🌍 Team:",
        team
      );

      console.log(
        "👕 Jersey:",
        jerseyStyle
      );

      console.log(
        "🧠 Gerando figurinha IA..."
      );

      // =========================
      // GEMINI IMAGE GENERATION
      // =========================

      const response =
        await ai.models.generateContent({
            model: "gemini-3.1-flash-image-preview",

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
Birth Date: ${birthDate}
Height: ${height}
Weight: ${weight}
Country Team: ${team}

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
            responseModalities: [
              "IMAGE",
            ],
          },
        });

      // =========================
      // GET IMAGE
      // =========================

      let imageBuffer = null;

      for (const part of response
        .candidates[0].content.parts) {
        if (part.inlineData) {
          imageBuffer = Buffer.from(
            part.inlineData.data,
            "base64"
          );
        }
      }

      if (!imageBuffer) {
        throw new Error(
          "Gemini não retornou imagem"
        );
      }

      // =========================
      // FINAL WEBP
      // =========================

      const finalImage = await sharp(
        imageBuffer
      )

        .webp({
          quality: 100,
        })

        .toBuffer();

      // =========================
      // CLEANUP
      // =========================

      if (
        faceFile?.path &&
        fs.existsSync(faceFile.path)
      ) {
        fs.unlinkSync(faceFile.path);
      }

      if (
        preparedPath &&
        fs.existsSync(preparedPath)
      ) {
        fs.unlinkSync(preparedPath);
      }

      // =========================
      // RESPONSE
      // =========================

      res.set(
        "Content-Type",
        "image/webp"
      );

      console.log(
        "✅ Figurinha criada com IA"
      );

      return res.send(finalImage);
    } catch (err) {
      console.error(
        "❌ ERRO:",
        err
      );

      // =========================
      // CLEANUP ERROR
      // =========================

      if (
        faceFile?.path &&
        fs.existsSync(faceFile.path)
      ) {
        fs.unlinkSync(faceFile.path);
      }

      if (
        preparedPath &&
        fs.existsSync(preparedPath)
      ) {
        fs.unlinkSync(preparedPath);
      }

      return res.status(500).json({
        error:
          err?.message ||
          "Erro ao gerar figurinha",
      });
    }
  }
);

// =========================
// SERVER
// =========================
const PORT = process.env.PORT || 3334;

app.listen(PORT, () => {
  console.log(`🔥 Server rodando na porta ${PORT}`);
});