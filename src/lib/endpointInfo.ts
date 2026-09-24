import type { Request, RequestHandler, Response } from "express";

export const PUBLIC_AUTH = "None";
export const ADMIN_AUTH =
  "Admin required: header X-Admin-Key: <ADMIN_API_KEY> or Authorization: Bearer <ADMIN_API_KEY>";

export interface EndpointInfo {
  method: "GET";
  path: string;
  description: string;
  auth: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
  response_example: unknown;
}

// Mounted as a sibling "/info" route next to the GET endpoint it documents
// (e.g. GET /api/stories/:id/info describes GET /api/stories/:id). Always
// public and side-effect free, even when the endpoint it documents requires
// admin auth — it only describes usage, it never returns real data.
export function infoHandler(info: EndpointInfo): RequestHandler {
  return (_req: Request, res: Response) => {
    res.json(info);
  };
}
