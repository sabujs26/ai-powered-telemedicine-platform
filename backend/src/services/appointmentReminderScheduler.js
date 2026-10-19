import cron from "node-cron";
import { createAppointmentReminders } from "./appointmentReminders.js";

export function startAppointmentReminderScheduler() {
  return cron.schedule("*/15 * * * *", async () => {
    try {
      const result = await createAppointmentReminders();
      console.log("[appointment-reminders] Check completed:", result);
    } catch (error) {
      console.error("[appointment-reminders] Check failed:", error);
    }
  });
}
