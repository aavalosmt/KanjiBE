import { Router } from "express";
import { prisma } from "../db.js";

export const topicsRouter = Router();

topicsRouter.get("/", async (_req, res) => {
  const topics = await prisma.topic.findMany({
    orderBy: { label: "asc" },
    select: { id: true, slug: true, label: true }
  });

  res.json({ data: topics });
});
