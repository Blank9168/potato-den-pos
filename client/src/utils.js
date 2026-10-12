const TZ = "Asia/Manila";

// Money math is done in whole centavos to avoid floating-point rounding.
export const C = (pesos) => Math.round((Number(pesos) || 0) * 100);

export const peso = (centavos) =>
  "₱" + (centavos / 100).toLocaleString("en-PH", { minimumFractionDigits: centavos % 100 ? 2 : 0, maximumFractionDigits: 2 });

// Cart entries are keyed by item id, plus the flavor when the item has flavors.
export const cartKey = (id, flavor) => (flavor ? `${id}|${flavor}` : id);
export const splitKey = (key) => {
  const i = key.indexOf("|");
  return i < 0 ? [key, ""] : [key.slice(0, i), key.slice(i + 1)];
};

// How an order line reads on screen: "Classic Fries (Cheese)".
export const lineName = (l) => (l.flavor ? `${l.name} (${l.flavor})` : l.name);

export const timeOf = (ts) =>
  new Date(ts).toLocaleTimeString("en-PH", { timeZone: TZ, hour: "numeric", minute: "2-digit" });

export const niceDay = (day) =>
  day ? new Date(day + "T12:00:00+08:00").toLocaleDateString("en-PH", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" }) : "";
