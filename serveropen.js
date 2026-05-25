import express from "express";
import multer from "multer";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import { OpenAI } from "openai";
import "dotenv/config";

const app = express();

app.use(cors());
app.use(helmet());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

const SIZE = 1024;

// FRAME FIXO
const FRAME_PATH = path.resolve("./frames/frame.png");

app.post("/sticker", upload.single("face"), async (req, res) => {
  const faceFile = req.file;

  if (!faceFile) {
    return res.status(400).json({
      error: "Envie a foto do rosto",
    });
  }

  let preparedFacePath = null;

  try {
    // VERIFICA FRAME
    if (!fs.existsSync(FRAME_PATH)) {
      if (fs.existsSync(faceFile.path)) {
        fs.unlinkSync(faceFile.path);
      }

      return res.status(500).json({
        error: "frame.png não encontrado em ./frames/frame.png",
      });
    }

    console.log("🖼️ Validando imagem...");

    // VALIDA IMAGEM
    const metadata = await sharp(faceFile.path).metadata();

    if (!metadata.format) {
      fs.unlinkSync(faceFile.path);

      return res.status(400).json({
        error: "Arquivo inválido",
      });
    }

    const allowedFormats = ["jpeg", "jpg", "png", "webp"];

    if (!allowedFormats.includes(metadata.format)) {
      fs.unlinkSync(faceFile.path);

      return res.status(400).json({
        error: "Formato inválido. Use JPG, PNG ou WEBP",
      });
    }

    console.log("✅ Imagem válida");

    // PREPARA IMAGEM
    preparedFacePath = `uploads/prepared-${Date.now()}.png`;

    await sharp(faceFile.path)
      .resize(SIZE, SIZE, {
        fit: "cover",
        position: "center",
      })
      .png()
      .toFile(preparedFacePath);

    console.log("🤖 Enviando para OpenAI...");

    /**
     * MUITO IMPORTANTE:
     * NÃO USAR createReadStream()
     * OPENAI EXIGE MIME REAL
     */

    const faceBuffer = fs.readFileSync(preparedFacePath);

    const frameBuffer = fs.readFileSync(FRAME_PATH);

    const faceImage = new File(
      [faceBuffer],
      "face.png",
      {
        type: "image/png",
      }
    );

    const frameImage = new File(
      [frameBuffer],
      "frame.png",
      {
        type: "image/png",
      }
    );

    const result = await openai.images.edit({
      model: "gpt-image-1",

      image: [
        faceImage,
        frameImage,
      ],

      prompt: `
A primeira imagem é o rosto ORIGINAL REAL da pessoa.
A segunda imagem é uma moldura oficial de figurinha da copa.

REGRAS IMPORTANTES:
- manter EXATAMENTE o mesmo rosto,
- preservar identidade facial 100%,
- não modificar cabelo,
- não modificar olhos,
- não modificar nariz,
- não modificar boca,
- não modificar expressão,
- não transformar em desenho,
- não mudar idade,
- não mudar tom de pele.

TAREFA:
- encaixar perfeitamente o rosto na moldura,
- integrar no uniforme do Brasil,
- deixar hiper realista,
- estilo figurinha Panini oficial,
- iluminação profissional,
- ultra HD,
- qualidade máxima.

O rosto deve continuar exatamente igual ao original.
      `,

      size: "1024x1024",
    });

    console.log("⬇️ Convertendo figurinha...");

    const imageBase64 = result.data[0].b64_json;

    const finalBuffer = Buffer.from(
      imageBase64,
      "base64"
    );

    const sticker = await sharp(finalBuffer)
      .resize(512, 512)
      .webp({
        quality: 100,
      })
      .toBuffer();

    // LIMPEZA
    if (fs.existsSync(faceFile.path)) {
      fs.unlinkSync(faceFile.path);
    }

    if (
      preparedFacePath &&
      fs.existsSync(preparedFacePath)
    ) {
      fs.unlinkSync(preparedFacePath);
    }

    console.log("✅ Figurinha criada!");

    res.set("Content-Type", "image/webp");

    return res.send(sticker);
  } catch (err) {
    console.error("❌ ERRO:", err);

    // LIMPEZA
    if (faceFile?.path && fs.existsSync(faceFile.path)) {
      fs.unlinkSync(faceFile.path);
    }

    if (
      preparedFacePath &&
      fs.existsSync(preparedFacePath)
    ) {
      fs.unlinkSync(preparedFacePath);
    }

    return res.status(500).json({
      error: err.message,
    });
  }
});

app.listen(3333, () => {
  console.log(
    "🔥 Server rodando em http://localhost:3333"
  );
});