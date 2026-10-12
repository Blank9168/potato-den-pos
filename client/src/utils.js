const TZ = "Asia/Manila";

// Money math is done in whole centavos to avoid floating-point rounding.
export const C = (pesos) => Math.round((Number(pesos) || 0) * 100);

export const peso = (centavos) =>
  "₱" + (centavos / 100).toLocaleString("en-PH", { minimumFractionDigits: centavos % 100 ? 2 : 0, maximumFractionDigits: 2 });

export const timeOf = (ts) =>
  new Date(ts).toLocaleTimeString("en-PH", { timeZone: TZ, hour: "numeric", minute: "2-digit" });

export const niceDay = (day) =>
  day ? new Date(day + "T12:00:00+08:00").toLocaleDateString("en-PH", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" }) : "";
