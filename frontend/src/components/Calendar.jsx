import { useState } from "react";
import { DAY_LABELS_SHORT, toDateKey } from "../lib/dateFormat.js";

/**
 * A real month-grid calendar — today, available dates, unavailable dates,
 * selected date, and disabled past/out-of-window dates are all visually
 * distinct (Step 16). This component only handles date SELECTION; the
 * actual list of bookable time slots for the chosen date always comes from
 * a fresh backend call (GET /api/doctors/:id/slots) made by the parent.
 *
 * `availableDaysOfWeek` is a Set of 0-6 (Sunday=0) built from the doctor's
 * recurring weekly availability template — used only to grey out days that
 * structurally can't have slots, as a UX hint. It is NOT a guarantee that a
 * given date still has open slots (some may already be booked) — that is
 * only known once the backend returns real slots for the clicked date.
 */
export default function Calendar({ selectedDate, onSelect, availableDaysOfWeek, minDate, maxDate }) {
  const [viewMonth, setViewMonth] = useState(() => {
    const d = selectedDate || minDate || new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));

  function isDisabled(date) {
    if (!date) return true;
    if (date < today) return true;
    if (minDate && date < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate())) return true;
    if (maxDate && date > new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate())) return true;
    if (availableDaysOfWeek && availableDaysOfWeek.size > 0 && !availableDaysOfWeek.has(date.getDay())) return true;
    return false;
  }

  function isToday(date) {
    return date && toDateKey(date) === toDateKey(today);
  }
  function isSelected(date) {
    return date && selectedDate && toDateKey(date) === toDateKey(selectedDate);
  }

  const canGoPrev = new Date(year, month, 1) > new Date(today.getFullYear(), today.getMonth(), 1);

  return (
    <div className="border border-line rounded-lg bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => canGoPrev && setViewMonth(new Date(year, month - 1, 1))}
          disabled={!canGoPrev}
          className="text-sm text-muted hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1"
          aria-label="Previous month"
        >
          ←
        </button>
        <p className="text-sm font-medium text-ink">
          {viewMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </p>
        <button
          type="button"
          onClick={() => setViewMonth(new Date(year, month + 1, 1))}
          className="text-sm text-muted hover:text-ink px-2 py-1"
          aria-label="Next month"
        >
          →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_LABELS_SHORT.map((d) => (
          <div key={d} className="text-center text-xs text-muted py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={i} />;
          const disabled = isDisabled(date);
          const selected = isSelected(date);
          return (
            <button
              type="button"
              key={i}
              disabled={disabled}
              onClick={() => onSelect(date)}
              className={`aspect-square rounded-md text-sm transition-colors ${
                selected
                  ? "bg-teal text-white font-medium"
                  : disabled
                  ? "text-muted/40 cursor-not-allowed"
                  : isToday(date)
                  ? "border border-teal text-teal hover:bg-teal-light"
                  : "text-ink hover:bg-teal-light"
              }`}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-line text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full border border-teal inline-block" /> Today
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-teal inline-block" /> Selected
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-muted/30 inline-block" /> Unavailable
        </span>
      </div>
    </div>
  );
}
