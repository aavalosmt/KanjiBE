import { Router } from "express";
import { prisma } from "../db.js";
import { asString, parsePagination } from "../lib/pagination.js";
import { toConversation, toConversationSummary } from "../lib/serialize.js";

export const conversationsRouter = Router();

conversationsRouter.get("/", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const topic = asString(req.query.topic);
  const level = asString(req.query.level);
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

  res.json({
    data: rows.map(toConversationSummary),
    pagination: { page, limit, total }
  });
});

conversationsRouter.get("/:id", async (req, res) => {
  const conversation = await prisma.conversation.findUnique({
    where: { id: req.params.id }
  });

  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  res.json(toConversation(conversation));
});
