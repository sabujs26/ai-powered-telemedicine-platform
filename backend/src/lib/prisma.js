import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient instance across the app (avoids exhausting
// DB connections during development hot-reloads).
const prisma = new PrismaClient();

export default prisma;
