import { useState } from "react";
import { C, peso } from "../utils.js";

// Shown when the cashier taps an item that has flavors or add-ons.
// Flavors only: one tap picks the flavor and adds one to the order.
// With add-ons: pick the flavor (if any), tick the add-ons, then tap "Add to order".
export default function OptionsSheet({ item, onAdd, onClose }) {
  const flavors = item.flavors || [];
  const addons = item.addons || [];
  const [flavor, setFlavor] = useState("");
  const [picked, setPicked] = useState([]); // names of ticked add-ons

  const toggle = (name) => setPicked((list) => (list.includes(name) ? list.filter((n) => n !== name) : [...list, name]));
  const chosen = addons.filter((a) => picked.includes(a.name)); // keep menu order
  const unit = C(item.price) + chosen.reduce((sum, a) => sum + C(a.price), 0);
  const ready = !flavors.length || flavor;

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true">
        <header>
          <h2>{item.name} · {peso(C(item.price))}</h2>
          <button className="btn sm line" onClick={onClose}>Cancel</button>
        </header>

        {flavors.length > 0 && (
          <>
            <div className="hint">Pick a flavor</div>
            <div className="flavors">
              {flavors.map((f) => (
                <button key={f} className="btn" aria-pressed={addons.length ? flavor === f : undefined}
                  onClick={() => (addons.length ? setFlavor(f) : onAdd(f, []))}>{f}</button>
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
            <button className="btn go big" disabled={!ready} onClick={() => onAdd(flavor, chosen.map((a) => a.name))}>
              {ready ? `Add to order · ${peso(unit)}` : "Pick a flavor first"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
