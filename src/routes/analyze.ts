import { Router } from "express";
import { infoHandler, PUBLIC_AUTH, TOKENIZATION_ANALYZE } from "../lib/endpointInfo.js";
import { analyzeBlock } from "../lib/kuromoji.js";
import { asString } from "../lib/pagination.js";

export const analyzeRouter = Router();

analyzeRouter.get(
  "/info",
  infoHandler({
    method: "GET",
    path: "/api/analyze",
    description:
      "Tokeniza un bloque de texto japonés (kuromoji) y devuelve sus tokens con lectura/POS. Mismo comportamiento que POST /api/analyze pero vía query string.",
    auth: PUBLIC_AUTH,
    query: { text: "texto a analizar (alias: q), requerido, máx 4000 caracteres" },
    example_request: "GET /api/analyze?text=食べました",
    response_example: {
      text: "食べました",
      tokens: [
        {
          surface: "食べました",
          reading: "タベマシタ",
          lemma: "食べる",
          pos: "動詞",
          posDetail: "自立",
          conjugatedType: "一段",
          conjugatedForm: "連用形",
          colorType: "verb",
          color: "#10B981",
          parts: [
            { surface: "食べ", lemma: "食べる", reading: "タベ", pos: "動詞" },
            { surface: "まし", lemma: "ます", reading: "マシ", pos: "助動詞" },
            { surface: "た", lemma: "た", reading: "タ", pos: "助動詞" }
          ]
        }
      ]
    },
    tokenization: TOKENIZATION_ANALYZE
  })
);

async function handleAnalyze(raw: string | undefined, res: import("express").Response) {
  const text = raw?.trim();
  if (!text) {
    res.status(400).json({ error: "text is required" });
    return;
  }
  if (text.length > 4000) {
    res.status(400).json({ error: "text is too long" });
    return;
  }

  res.json(await analyzeBlock(text));
}

analyzeRouter.get("/", async (req, res) => {
  await handleAnalyze(asString(req.query.text) ?? asString(req.query.q), res);
});

analyzeRouter.post("/", async (req, res) => {
  const body = req.body as { text?: unknown; content?: unknown };
  const raw =
    typeof body.text === "string"
      ? body.text
      : typeof body.content === "string"
        ? body.content
        : undefined;
  await handleAnalyze(raw, res);
});
