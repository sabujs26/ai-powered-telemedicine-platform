/**
 * Scheduling helpers for Doctor Availability + Real Appointment Scheduling.
 *
 * TIMEZONE STRATEGY (see also the header comment in schema.prisma):
 * This app is for Bangladesh (Asia/Dhaka, UTC+6, no DST — a fixed offset
 * year-round). We deliberately do NOT pull in a timezone library
 * (date-fns-tz, luxon, etc.) — a fixed, DST-free offset makes that
 * unnecessary complexity for this MVP. Instead:
 *   - A "calendar date" (YYYY-MM-DD) from the frontend always means a date
 *     in Asia/Dhaka.
 *   - Appointment.scheduledAt is stored as a genuine UTC instant.
 *   - Converting a Dhaka wall-clock date+time into that UTC instant is a
 *     simple, explicit subtraction of the fixed 6-hour offset — done here,
 *     in one place, so the rest of the codebase never has to think about it.
 */

export const DHAKA_OFFSET_MINUTES = 6 * 60; // Asia/Dhaka = UTC+6
export const DEFAULT_SLOT_DURATION_MINUTES = 30; // Step 3: MVP default; extend to a per-doctor field later if needed
export const MAX_BOOKING_WINDOW_DAYS = 30; // Step 6

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidDateStr(dateStr) {
  return typeof dateStr === "string" && DATE_RE.test(dateStr);
}

export function isValidTimeStr(timeStr) {
  return typeof timeStr === "string" && TIME_RE.test(timeStr);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Parses a "YYYY-MM-DD" string into {y, m, d} (m is 1-indexed, as written). */
function parseDateOnly(dateStr) {
  const match = DATE_RE.exec(dateStr);
  if (!match) throw new Error(`Invalid date: ${dateStr}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/**
 * Day of week (0=Sunday..6=Saturday) for a Dhaka calendar date. This is pure
 * calendar arithmetic — using Date.UTC with the raw Y/M/D and reading
 * getUTCDay() back gives the correct weekday for that calendar date
 * regardless of timezone, since we never let it interact with a real clock
 * offset here.
 */
export function dayOfWeekForDate(dateStr) {
  const { y, m, d } = parseDateOnly(dateStr);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Converts a Dhaka wall-clock date ("YYYY-MM-DD") + time ("HH:mm") into the
 * real UTC instant it represents. Dhaka is UTC+6, so the UTC instant is the
 * Dhaka wall-clock time minus 6 hours.
 */
export function dhakaDateTimeToUtc(dateStr, timeStr) {
  const { y, m, d } = parseDateOnly(dateStr);
  const [hh, mm] = timeStr.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm, 0) - DHAKA_OFFSET_MINUTES * 60 * 1000);
}

/** Today's date, as a "YYYY-MM-DD" string, in Asia/Dhaka. */
export function todayDhakaDateStr() {
  const nowInDhaka = new Date(Date.now() + DHAKA_OFFSET_MINUTES * 60 * 1000);
  return `${nowInDhaka.getUTCFullYear()}-${pad2(nowInDhaka.getUTCMonth() + 1)}-${pad2(nowInDhaka.getUTCDate())}`;
}

/** Inclusive date range check for the booking window (Step 6): today..today+30 days, in Dhaka. */
export function isWithinBookingWindow(dateStr) {
  const today = parseDateOnly(todayDhakaDateStr());
  const requested = parseDateOnly(dateStr);
  const todayUtcMidnight = Date.UTC(today.y, today.m - 1, today.d);
  const requestedUtcMidnight = Date.UTC(requested.y, requested.m - 1, requested.d);
  const diffDays = Math.round((requestedUtcMidnight - todayUtcMidnight) / 86400000);
  return diffDays >= 0 && diffDays <= MAX_BOOKING_WINDOW_DAYS;
}

/** True if [aStart,aEnd) and [bStart,bEnd) overlap. All args are "HH:mm" strings (lexicographic compare is valid for zero-padded 24h). */
export function timeRangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Generates real, concrete bookable slots for one doctor on one real Dhaka
 * calendar date, from their recurring weekly availability rows.
 *
 * @param {Array<{dayOfWeek:number, startTime:string, endTime:string, active:boolean}>} availabilityRows
 * @param {string} dateStr - "YYYY-MM-DD", a Dhaka calendar date
 * @param {Set<string>} bookedInstantsIso - ISO strings of already-booked (non-cancelled) scheduledAt values for this doctor
 * @param {number} durationMinutes
 * @returns {Array<{time:string, datetime:string}>} time = "HH:mm", datetime = ISO UTC instant
 */
export function generateSlotsForDate(
  availabilityRows,
  dateStr,
  bookedInstantsIso,
  durationMinutes = DEFAULT_SLOT_DURATION_MINUTES
) {
  const dow = dayOfWeekForDate(dateStr);
  const now = new Date();

  const applicableRows = availabilityRows.filter((row) => row.active && row.dayOfWeek === dow);

  const slots = [];
  for (const row of applicableRows) {
    const [startH, startM] = row.startTime.split(":").map(Number);
    const [endH, endM] = row.endTime.split(":").map(Number);
    const endMinutes = endH * 60 + endM;

    for (let cursor = startH * 60 + startM; cursor + durationMinutes <= endMinutes; cursor += durationMinutes) {
      const hh = Math.floor(cursor / 60);
      const mm = cursor % 60;
      const timeStr = `${pad2(hh)}:${pad2(mm)}`;
      const instant = dhakaDateTimeToUtc(dateStr, timeStr);

      if (instant <= now) continue; // Step 12: never return past slots
      if (bookedInstantsIso.has(instant.toISOString())) continue; // already booked

      slots.push({ time: timeStr, datetime: instant.toISOString() });
    }
  }

  slots.sort((a, b) => a.datetime.localeCompare(b.datetime));
  return slots;
}
