import { Router } from "express";
import { infoHandler, PUBLIC_AUTH, TOKENIZATION_LOOKUP } from "../lib/endpointInfo.js";
import { lookupExpression } from "../lib/kuromoji.js";
import { asString } from "../lib/pagination.js";

export const lookupRouter = Router();

const lookupResponseExample = {
  query: "食べた",
  lemma: "食べる",
  lemmas: ["食べる"],
  reading: "タベタ",
  pos: "動詞",
  posEn: "verb",
  conjugatedType: "一段",
  conjugatedForm: "連用タ接続",
  verbClassEn: "ichidan",
  formEn: "past",
  inflectionEn: "past",
  grammarEn: null,
  lookupKeys: ["食べた", "食べる"],
  tokens: [
    {
      surface: "食べ",
      lemma: "食べる",
      reading: "タベ",
      pronunciation: "タベ",
      pos: "動詞",
      posDetail: "自立",
      conjugatedType: "一段",
      conjugatedForm: "連用形"
    },
    {
      surface: "た",
      lemma: "た",
      reading: "タ",
      pronunciation: "タ",
      pos: "助動詞",
      posDetail: "",
      conjugatedType: "特殊・タ",
      conjugatedForm: "基本形"
    }
  ]
};

async function handleLookup(raw: string | undefined, res: import("express").Response) {
  const query = raw?.trim();
  if (!query) {
    res.status(400).json({ error: "q is required" });
    return;
  }
  if (query.length > 80) {
    res.status(400).json({ error: "q is too long" });
    return;
  }

  const result = await lookupExpression(query);
  res.json(result);
}

lookupRouter.get(
  "/info",
  infoHandler({
    method: "GET",
    path: "/api/lookup",
    description:
      "Busca una expresión japonesa y devuelve su lema, lectura y POS. Equivalente a GET /api/lookup/:q pero vía query string.",
    auth: PUBLIC_AUTH,
    query: { q: "expresión a buscar (alias: text, word), requerido, máx 80 caracteres" },
    example_request: "GET /api/lookup?q=食べた",
    response_example: lookupResponseExample,
    tokenization: TOKENIZATION_LOOKUP
  })
);

lookupRouter.get("/", async (req, res) => {
  await handleLookup(
    asString(req.query.q) ?? asString(req.query.text) ?? asString(req.query.word),
    res
  );
});

lookupRouter.get(
  "/:q/info",
  infoHandler({
    method: "GET",
    path: "/api/lookup/:q",
    description: "Busca una expresión japonesa pasada como segmento de path y devuelve su lema, lectura y POS.",
    auth: PUBLIC_AUTH,
    params: { q: "expresión a buscar, requerido, máx 80 caracteres" },
    example_request: "GET /api/lookup/食べた",
    response_example: lookupResponseExample,
    tokenization: TOKENIZATION_LOOKUP
  })
);

lookupRouter.get("/:q", async (req, res) => {
  await handleLookup(req.params.q, res);
});
