import { Router } from "express";
import { listExampleSentences } from "../lib/exampleSentenceSerialize.js";
import { unknownSubtopicMessage } from "../lib/taxonomy.js";
import { normalizeLang } from "../lib/translations.js";

export const examplesRouter = Router();

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
