import { Router } from "express";
import { prisma } from "../db.js";
import { ADMIN_AUTH, infoHandler, PUBLIC_AUTH } from "../lib/endpointInfo.js";

export const topicsRouter = Router();

topicsRouter.get(
  "/info",
  infoHandler({
    method: "GET",
    path: "/api/topics",
    description: "Lista todos los topics registrados (taxonomía compartida con vocabulary/conversations/examples).",
    auth: PUBLIC_AUTH,
    example_request: "GET /api/topics",
    response_example: {
      data: [{ id: "clx...", slug: "body", label: "Body" }]
    },
    create: {
      method: "POST",
      path: "/api/admin/topics",
      description: "Registra un topic nuevo. slug debe ser snake_case y único; 409 si ya existe.",
      auth: ADMIN_AUTH,
      body_example: { slug: "body", label: "Body" }
    }
  })
);

topicsRouter.get("/", async (_req, res) => {
  const topics = await prisma.topic.findMany({
    orderBy: { label: "asc" },
    select: { id: true, slug: true, label: true }
  });

  res.json({ data: topics });
});
