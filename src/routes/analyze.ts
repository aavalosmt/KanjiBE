import { Router } from "express";
import { infoHandler, PUBLIC_AUTH } from "../lib/endpointInfo.js";
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
    response_example: {
      text: "食べた",
      tokens: [{ surface: "食べ", lemma: "食べる", reading: "タベ", pos: "verb", colorType: "verb", color: "#10B981" }]
    }
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
