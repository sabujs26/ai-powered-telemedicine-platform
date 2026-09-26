// Step 17: consultation fees are always displayed in Bangladeshi Taka, never $.
// The database itself is unchanged (still a plain Decimal) — this is purely
// a display-layer formatter, used everywhere a fee is shown.
export function formatCurrency(amount) {
  if (amount === null || amount === undefined || amount === "") return null;
  const num = Number(amount);
  if (!Number.isFinite(num)) return null;
  return `৳${num.toLocaleString("en-US")}`;
}
