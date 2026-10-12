import { useState } from "react";
import { C, peso, priceRange } from "../utils.js";

// Shown when the cashier taps an item that has sizes, flavors or add-ons.
// If there is only one thing to pick (just sizes, or just flavors) and no add-ons, one tap adds it to the order.
// Otherwise: pick the size and flavor, tick any add-ons, then tap "Add to order".
export default function OptionsSheet({ item, onAdd, onClose }) {
  const sizes = item.sizes || [];
  const flavors = item.flavors || [];
  const addons = item.addons || [];
  const [size, setSize] = useState("");
  const [flavor, setFlavor] = useState("");
  const [picked, setPicked] = useState([]); // names of ticked add-ons

  const quick = !addons.length && (sizes.length > 0) !== (flavors.length > 0); // exactly one choice to make
  const toggle = (name) => setPicked((list) => (list.includes(name) ? list.filter((n) => n !== name) : [...list, name]));
  const chosen = addons.filter((a) => picked.includes(a.name)); // keep menu order
  const sizeObj = sizes.find((s) => s.name === size);
  const unit = C(sizeObj ? sizeObj.price : item.price) + chosen.reduce((sum, a) => sum + C(a.price), 0);
  const missing = sizes.length && !size ? "Pick a size first" : flavors.length && !flavor ? "Pick a flavor first" : "";
  const [lo, hi] = priceRange(item);

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true">
        <header>
          <h2>{item.name} · {lo === hi ? peso(lo) : `from ${peso(lo)}`}</h2>
          <button className="btn sm line" onClick={onClose}>Cancel</button>
        </header>

        {sizes.length > 0 && (
          <>
            <div className="hint">Pick a size</div>
            <div className="flavors">
              {sizes.map((s) => (
                <button key={s.name} className="btn" aria-pressed={quick ? undefined : size === s.name}
                  onClick={() => (quick ? onAdd("", [], s.name) : setSize(s.name))}>
                  {s.name}<small>{peso(C(s.price))}</small>
                </button>
              ))}
            </div>
          </>
        )}

        {flavors.length > 0 && (
          <>
            <div className="hint">Pick a flavor</div>
            <div className="flavors">
              {flavors.map((f) => (
                <button key={f} className="btn" aria-pressed={quick ? undefined : flavor === f}
                  onClick={() => (quick ? onAdd(f, [], "") : setFlavor(f))}>{f}</button>
              ))}
            </div>
          </>
        )}

        {addons.length > 0 && (
          <>
            <div className="hint">Add-ons (optional)</div>
            <div className="flavors">
              {addons.map((a) => (
                <button key={a.name} className="btn" aria-pressed={picked.includes(a.name)} onClick={() => toggle(a.name)}>
                  {a.name}<small>{C(a.price) ? `+${peso(C(a.price))}` : "Free"}</small>
                </button>
              ))}
            </div>
          </>
        )}

        {!quick && (
          <button className="btn go big" disabled={!!missing} onClick={() => onAdd(flavor, chosen.map((a) => a.name), size)}>
            {missing || `Add to order · ${peso(unit)}`}
          </button>
        )}
      </div>
    </div>
  );
}
