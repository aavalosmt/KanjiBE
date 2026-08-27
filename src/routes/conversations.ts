import { Router } from "express";
import { prisma } from "../db.js";
import { asString, parsePagination } from "../lib/pagination.js";
import { toConversation, toConversationSummary } from "../lib/serialize.js";
import { fetchTranslationOverlay, normalizeLang } from "../lib/translations.js";

export const conversationsRouter = Router();

conversationsRouter.get("/", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const topic = asString(req.query.topic);
  const level = asString(req.query.level);
  const lang = normalizeLang(req.query.lang);
  const where = {
    ...(topic ? { topic } : {}),
    ...(level ? { level } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        topic: true,
        level: true,
        translation: true,
        coverUrl: true
      }
    }),
    prisma.conversation.count({ where })
  ]);

  const overlay = await fetchTranslationOverlay(
    "conversation",
    rows.map((row) => row.id),
    lang
  );

  res.json({
    data: rows.map((row) => toConversationSummary(row, lang, overlay.get(row.id))),
    pagination: { page, limit, total }
  });
});

conversationsRouter.get("/:id", async (req, res) => {
  const lang = normalizeLang(req.query.lang);
  const conversation = await prisma.conversation.findUnique({
    where: { id: req.params.id }
  });

  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const overlay = await fetchTranslationOverlay("conversation", [conversation.id], lang);
  res.json(toConversation(conversation, lang, overlay.get(conversation.id)));
});
