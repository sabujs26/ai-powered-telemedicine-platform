import { Router } from "express";

const router = Router();

// GET /api/health — used to confirm the backend is up and reachable.
router.get("/", (req, res) => {
  res.json({ status: "ok", service: "telemed-backend", time: new Date().toISOString() });
});

export default router;
