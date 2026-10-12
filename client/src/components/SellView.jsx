import { useState } from "react";
import { C, peso } from "../utils.js";

export default function SellView({ loaded, menu, cart, onAdd }) {
  const [category, setCategory] = useState("All");

  if (!loaded) return <div className="empty">Loading the menu…</div>;
  const items = menu.filter((item) => item.active !== false);
  if (!items.length) return <div className="empty">No items on the menu yet. Open the Menu tab and add your first one.</div>;

  const categories = ["All", ...new Set(items.map((item) => item.category || "Other"))];
  const current = categories.includes(category) ? category : "All";
  const shown = items.filter((item) => current === "All" || (item.category || "Other") === current);

  return (
    <div className="wrap tight">
      {categories.length > 2 && (
        <div className="chips">
          {categories.map((c) => (
            <button key={c} aria-pressed={c === current} onClick={() => setCategory(c)}>{c}</button>
          ))}
        </div>
      )}
      <div className="grid">
        {shown.map((item) => {
          const qty = cart[item.id] || 0;
          const soldOut = item.stock === 0;
          return (
            <button key={item.id} className={"tile" + (qty ? " on" : "")} disabled={soldOut} onClick={() => onAdd(item.id)}>
              {qty > 0 && <span className="q">{qty}</span>}
              <span className="nm">{item.name}{(item.flavors?.length > 0 || item.addons?.length > 0) && (
                <small className="fl">{[item.flavors?.length > 0 && `${item.flavors.length} flavors`, item.addons?.length > 0 && "add-ons"].filter(Boolean).join(" · ")}</small>
              )}</span>
              <span>
                <span className="pr">{peso(C(item.price))}</span>
                <br />
                {item.stock != null && (
                  <span className={"st" + (item.stock <= 5 ? " low" : "")}>{soldOut ? "Sold out" : `${item.stock} left`}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
