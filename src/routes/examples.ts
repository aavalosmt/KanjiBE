import { Router } from "express";
import { infoHandler, PUBLIC_AUTH } from "../lib/endpointInfo.js";
import { listExampleSentences } from "../lib/exampleSentenceSerialize.js";
import { unknownSubtopicMessage } from "../lib/taxonomy.js";
import { normalizeLang } from "../lib/translations.js";

export const examplesRouter = Router();

examplesRouter.get(
  "/:topic/:subtopic/info",
  infoHandler({
    method: "GET",
    path: "/api/examples/:topic/:subtopic",
    description: "Lista las frases de ejemplo (base en inglés) de un (topic, subtopic).",
    auth: PUBLIC_AUTH,
    params: { topic: "requerido — slug de topic registrado", subtopic: "requerido — slug de subtopic registrado" },
    query: { lang: "opcional — locale para la traducción overlay, default en" },
    response_example: {
      topic: "body",
      subtopic: "fingers",
      data: [
        {
          sentence_index: 0,
          text: "指が痛い。",
          furigana: "[指](furigana:ゆび)が痛い。",
          translation: "My finger hurts.",
          translationLang: "en",
          notes: null
        }
      ]
    }
  })
);

examplesRouter.get("/:topic/:subtopic", async (req, res) => {
  const { topic, subtopic } = req.params;

  const subtopicError = await unknownSubtopicMessage(topic, subtopic);
  if (subtopicError) {
    res.status(404).json({ error: subtopicError });
    return;
  }

  const lang = normalizeLang(req.query.lang);
  const data = await listExampleSentences(topic, subtopic, lang);
  res.json({ topic, subtopic, data });
});
