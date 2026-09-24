import { Router } from "express";
import { prisma } from "../db.js";
import { infoHandler, PUBLIC_AUTH } from "../lib/endpointInfo.js";
import { asString } from "../lib/pagination.js";

export const subtopicsRouter = Router();

subtopicsRouter.get(
  "/info",
  infoHandler({
    method: "GET",
    path: "/api/subtopics",
    description: "Lista subtopics registrados, opcionalmente filtrados por topic.",
    auth: PUBLIC_AUTH,
    query: { topic: "opcional — slug de topic para filtrar (ej. body)" },
    example_request: "GET /api/subtopics?topic=body",
    response_example: {
      data: [{ id: "clx...", topicSlug: "body", slug: "fingers", label: "Fingers" }]
    }
  })
);

subtopicsRouter.get("/", async (req, res) => {
  const topicSlug = asString(req.query.topic);

  const subtopics = await prisma.subtopic.findMany({
    where: topicSlug ? { topicSlug } : {},
    orderBy: { label: "asc" },
    select: { id: true, topicSlug: true, slug: true, label: true }
  });

  res.json({ data: subtopics });
});
