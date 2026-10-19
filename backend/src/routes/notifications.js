
import { Router } from "express";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// GET /api/notifications — return only the signed-in user's notifications.
router.get("/", requireAuth, async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  res.json(notifications);
});

// PATCH /api/notifications/:id/read — mark one of the user's notifications as read.
router.patch("/:id/read", requireAuth, async (req, res) => {
  const result = await prisma.notification.updateMany({
    where: {
      id: req.params.id,
      userId: req.user.id,
      read: false,
    },
    data: {
      read: true,
      readAt: new Date(),
    },
  });

  if (result.count === 0) {
    return res.status(404).json({ error: "Notification not found" });
  }

  res.json({ success: true });
});

export default router;
