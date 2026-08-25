import { Router } from "express";
import { prisma } from "../db.js";
import { asString } from "../lib/pagination.js";

export const subtopicsRouter = Router();

subtopicsRouter.get("/", async (req, res) => {
  const topicSlug = asString(req.query.topic);

  const subtopics = await prisma.subtopic.findMany({
    where: topicSlug ? { topicSlug } : {},
    orderBy: { label: "asc" },
    select: { id: true, topicSlug: true, slug: true, label: true }
  });

  res.json({ data: subtopics });
});
