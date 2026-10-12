import { C, peso } from "../utils.js";

// Shown when the cashier taps an item that has flavors. One tap picks the flavor and adds one to the order.
export default function FlavorSheet({ item, onPick, onClose }) {
  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true">
        <header>
          <h2>{item.name} · {peso(C(item.price))}</h2>
          <button className="btn sm line" onClick={onClose}>Cancel</button>
        </header>
        <div className="hint">Pick a flavor</div>
        <div className="flavors">
          {item.flavors.map((flavor) => (
            <button key={flavor} className="btn" onClick={() => onPick(flavor)}>{flavor}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
