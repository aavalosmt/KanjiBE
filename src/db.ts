import { PrismaClient } from "@prisma/client";
import { databaseUrl } from "./dbUrl.js";

export const prisma = new PrismaClient({
  datasources: {
    db: { url: databaseUrl }
  }
});
