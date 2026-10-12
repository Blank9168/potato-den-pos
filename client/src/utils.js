const TZ = "Asia/Manila";

// Money math is done in whole centavos to avoid floating-point rounding.
export const C = (pesos) => Math.round((Number(pesos) || 0) * 100);

export const peso = (centavos) =>
  "₱" + (centavos / 100).toLocaleString("en-PH", { minimumFractionDigits: centavos % 100 ? 2 : 0, maximumFractionDigits: 2 });

// Cart entries are keyed by item id + chosen flavor + chosen add-on names, so each combination is its own line.
export const cartKey = (id, flavor = "", addons = []) => JSON.stringify([id, flavor, addons]);
export const splitKey = (key) => {
  try {
    const [id, flavor, addons] = JSON.parse(key);
    return [id, flavor || "", Array.isArray(addons) ? addons : []];
  } catch {
    return [key, "", []];
  }
};

// How an order line reads on screen: "Classic Fries (Cheese) + Extra Cheese + Bacon".
export const baseName = (l) => (l.flavor ? `${l.name} (${l.flavor})` : l.name);
export const addonNames = (l) => (l.addons || []).map((a) => a.name).join(", ");
export const lineName = (l) => [baseName(l), ...(l.addons || []).map((a) => a.name)].join(" + ");

export const timeOf = (ts) =>
  new Date(ts).toLocaleTimeString("en-PH", { timeZone: TZ, hour: "numeric", minute: "2-digit" });

export const niceDay = (day) =>
  day ? new Date(day + "T12:00:00+08:00").toLocaleDateString("en-PH", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" }) : "";
