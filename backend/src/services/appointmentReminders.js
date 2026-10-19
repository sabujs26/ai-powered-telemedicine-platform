
import prisma from "../lib/prisma.js";

export async function createAppointmentReminders({
  now = new Date(),
  windowHours = 23,
  windowMinutes = 60,
  db = prisma,
} = {}) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError("now must be a valid Date");
  }

  if (!Number.isFinite(windowHours) || windowHours < 0) {
    throw new TypeError("windowHours must be a non-negative number");
  }

  if (!Number.isFinite(windowMinutes) || windowMinutes <= 0) {
    throw new TypeError("windowMinutes must be a positive number");
  }

  if (!db?.appointment?.findMany || !db?.notification?.create) {
    throw new TypeError("db must provide appointment.findMany and notification.create");
  }

  const windowStart = new Date(
    now.getTime() + windowHours * 60 * 60 * 1000
  );
  const windowEnd = new Date(
    windowStart.getTime() + windowMinutes * 60 * 1000
  );

  const appointments = await db.appointment.findMany({
    where: {
      status: "CONFIRMED",
      scheduledAt: {
        gte: windowStart,
        lt: windowEnd,
      },
    },
    include: {
      patient: {
        select: { userId: true },
      },
    },
  });

  let created = 0;
  let skipped = 0;

  for (const appointment of appointments) {
    const reminderKey = `appointment:${appointment.id}:24h`;

    try {
      await db.notification.create({
        data: {
          userId: appointment.patient.userId,
          appointmentId: appointment.id,
          reminderKey,
          type: "APPOINTMENT_REMINDER",
          title: "Upcoming appointment reminder",
          message: `You have an appointment scheduled for ${appointment.scheduledAt.toISOString()}.`,
        },
      });

      created += 1;
    } catch (error) {
      if (error?.code === "P2002") {
        skipped += 1;
        continue;
      }

      throw error;
    }
  }

  return { checked: appointments.length, created, skipped };
}
