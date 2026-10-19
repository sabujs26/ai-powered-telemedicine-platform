
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAppointmentReminders } from "../src/services/appointmentReminders.js";

function createMockDb({ appointments = [], duplicate = false } = {}) {
  const createdNotifications = [];

  return {
    createdNotifications,
    appointment: {
      async findMany(args) {
        assert.equal(args.where.status, "CONFIRMED");
        return appointments;
      },
    },
    notification: {
      async create(args) {
        if (duplicate) {
          const error = new Error("Unique constraint violation");
          error.code = "P2002";
          throw error;
        }

        createdNotifications.push(args.data);
        return args.data;
      },
    },
  };
}

test("reminder service module loads", () => {
  assert.equal(typeof createAppointmentReminders, "function");
});

test("rejects an invalid current time", async () => {
  await assert.rejects(
    createAppointmentReminders({ now: new Date("invalid") }),
    TypeError
  );
});

test("rejects a negative reminder window", async () => {
  await assert.rejects(
    createAppointmentReminders({ windowHours: -1 }),
    TypeError
  );
});

test("rejects a non-positive window length", async () => {
  await assert.rejects(
    createAppointmentReminders({ windowMinutes: 0 }),
    TypeError
  );
});

test("creates a reminder for the appointment's patient", async () => {
  const appointment = {
    id: "appointment-123",
    scheduledAt: new Date("2026-10-18T12:00:00.000Z"),
    patient: { userId: "patient-user-456" },
  };
  const db = createMockDb({ appointments: [appointment] });

  const result = await createAppointmentReminders({
    now: new Date("2026-10-17T12:00:00.000Z"),
    db,
  });

  assert.deepEqual(result, { checked: 1, created: 1, skipped: 0 });
  assert.equal(db.createdNotifications.length, 1);
  assert.equal(db.createdNotifications[0].userId, "patient-user-456");
  assert.equal(db.createdNotifications[0].appointmentId, "appointment-123");
  assert.equal(
    db.createdNotifications[0].reminderKey,
    "appointment:appointment-123:24h"
  );
  assert.equal(
    db.createdNotifications[0].type,
    "APPOINTMENT_REMINDER"
  );
});

test("skips a duplicate reminder safely", async () => {
  const db = createMockDb({
    appointments: [{
      id: "appointment-123",
      scheduledAt: new Date("2026-10-18T12:00:00.000Z"),
      patient: { userId: "patient-user-456" },
    }],
    duplicate: true,
  });

  const result = await createAppointmentReminders({
    now: new Date("2026-10-17T12:00:00.000Z"),
    db,
  });

  assert.deepEqual(result, { checked: 1, created: 0, skipped: 1 });
  assert.equal(db.createdNotifications.length, 0);
});

test("does not create notifications when no appointments match", async () => {
  const db = createMockDb();

  const result = await createAppointmentReminders({
    now: new Date("2026-10-17T12:00:00.000Z"),
    db,
  });

  assert.deepEqual(result, { checked: 0, created: 0, skipped: 0 });
  assert.equal(db.createdNotifications.length, 0);
});
