import { Router } from "express";
import Stripe from "stripe";
import prisma from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

// POST /api/payments/checkout — FR-14: create a Stripe Checkout session for an appointment.
router.post("/checkout", requireAuth, requireRole("PATIENT"), async (req, res) => {
  const { appointmentId } = req.body;

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { doctor: true },
  });
  if (!appointment) return res.status(404).json({ error: "Appointment not found" });

  const amount = Number(appointment.doctor.consultationFee || 0);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: "Telemedicine Consultation" },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      },
    ],
    metadata: { appointmentId },
    success_url: `${process.env.FRONTEND_ORIGIN}/appointments/${appointmentId}?paid=1`,
    cancel_url: `${process.env.FRONTEND_ORIGIN}/appointments/${appointmentId}?paid=0`,
  });

  await prisma.payment.create({
    data: { appointmentId, amount, status: "PENDING", stripeRef: session.id },
  });

  res.json({ checkoutUrl: session.url });
});

/**
 * POST /api/payments/webhook — SEC-08 / NFR-04: the ONLY place an appointment
 * is allowed to move to CONFIRMED. Client-reported "payment succeeded" is
 * never trusted — this handler verifies Stripe's signature first.
 *
 * IMPORTANT: this route must receive the RAW request body (not JSON-parsed)
 * for signature verification to work — see index.js for the raw-body wiring.
 */
router.post("/webhook", async (req, res) => {
  const signature = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const appointmentId = session.metadata.appointmentId;

    await prisma.$transaction([
      prisma.payment.updateMany({
        where: { appointmentId },
        data: { status: "PAID" },
      }),
      prisma.appointment.update({
        where: { id: appointmentId },
        data: { status: "CONFIRMED" },
      }),
    ]);
  }

  res.json({ received: true });
});

export default router;
