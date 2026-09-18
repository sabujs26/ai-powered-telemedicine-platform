import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import healthRoutes from "./routes/health.js";
import authRoutes from "./routes/auth.js";
import doctorRoutes from "./routes/doctors.js";
import appointmentRoutes from "./routes/appointments.js";
import paymentRoutes from "./routes/payments.js";
import aiRoutes from "./routes/ai.js";

const app = express();

// --- Security middleware (Section 6: SEC-05, SEC-06) ---
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
    credentials: true,
  })
);
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Rate limit sensitive endpoints (SEC-05) — auth and AI prediction calls.
const sensitiveLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });

// Stripe webhook needs the RAW body for signature verification, so this one
// path gets express.raw() BEFORE the global express.json() body parser below
// picks up every other route.
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

app.use("/api/health", healthRoutes);
app.use("/api/auth", sensitiveLimiter, authRoutes);
app.use("/api/doctors", doctorRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/payments", paymentRoutes); // includes /checkout (json) and /webhook (raw, mounted above)
app.use("/api/ai", sensitiveLimiter, aiRoutes);

// Generic error handler — avoids leaking internals (SEC-09 spirit: don't log/echo sensitive data).
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`telemed-backend listening on http://localhost:${PORT}`);
});
