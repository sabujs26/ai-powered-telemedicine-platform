import prisma from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { createAiRouter } from "./aiRouter.js";

// Production wiring. All logic lives in aiRouter.js so it can be unit-tested without a database.
export default createAiRouter({ prisma, requireAuth, requireRole });
