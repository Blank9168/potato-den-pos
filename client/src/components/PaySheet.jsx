import { useState } from "react";
import { api } from "../api.js";
import { C, addonNames, baseName, lineName, peso } from "../utils.js";

const BILLS = [50, 100, 200, 500, 1000];

export default function PaySheet({ lines, total: subtotal, onQty, onSold, onClose, onToast }) {
  const [discountPct, setDiscountPct] = useState(0); // whole-order discount, in steps of 10%
  const [pay, setPay] = useState("cash");
  const [tendered, setTendered] = useState(""); // blank means exact amount
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // the saved order, once recorded

  if (done) {
    return (
      <div className="overlay">
        <div className="sheet" role="dialog" aria-modal="true">
          <div className="done">
            <span className="lbl">Order number</span>
            <span className="no">#{done.no}</span>
            <span>{done.items.map((l) => `${l.qty}× ${lineName(l)}`).join(", ")}</span>
          </div>
          {done.discountPct > 0 && <div className="disc"><span>Discount {done.discountPct}%</span><span>−{peso(C(done.discount))}</span></div>}
          <div className="total"><span>{done.pay === "gcash" ? "GCash" : "Cash"}</span><span>{peso(C(done.total))}</span></div>
          {done.pay === "cash" && <div className="change"><span>Change to give</span><b>{peso(C(done.change))}</b></div>}
          <button className="btn spud big" onClick={onClose}>New order</button>
        </div>
      </div>
    );
  }

  // Same math as the server: discount rounded to the centavo, total is what the customer pays.
  const discountC = Math.round((subtotal * discountPct) / 100);
  const total = subtotal - discountC;
  const stepDiscount = (delta) => setDiscountPct((p) => Math.min(100, Math.max(0, p + delta)));
  const tenderedC = tendered === "" ? total : C(tendered);
  const enough = pay === "gcash" || tenderedC >= total;

  const confirm = async () => {
    if (busy || !lines.length || !enough) return;
    setBusy(true);
    try {
      const order = await api.createOrder({
        items: lines.map((l) => ({ id: l.id, flavor: l.flavor, addons: l.addons.map((a) => a.name), qty: l.qty })),
        pay, tendered: pay === "cash" ? tendered : "", ref, discountPct,
      });
      setDone(order);
      onSold();
    } catch (err) {
      onToast(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true">
        <header>
          <h2>Order</h2>
          <button className="btn sm line" onClick={onClose} disabled={busy}>Back</button>
        </header>

        {lines.length === 0 && <div className="empty">This order is empty. Go back and tap some items.</div>}
        <div className="lines">
          {lines.map((l) => (
            <div className="ln" key={l.key}>
              <div className="n">{baseName(l)}<small>{l.addons.length > 0 && `+ ${addonNames(l)} · `}{peso(C(l.price))} each</small></div>
              <div className="step">
                <button aria-label="Remove one" onClick={() => onQty(l.key, -1)}>−</button>
                <span>{l.qty}</span>
                <button aria-label="Add one" onClick={() => onQty(l.key, 1)}>+</button>
              </div>
              <div className="t">{peso(C(l.price) * l.qty)}</div>
            </div>
          ))}
        </div>

        <div className="ln">
          <div className="n">Discount<small>{discountPct ? `−${peso(discountC)} off ${peso(subtotal)}` : "None"}</small></div>
          <div className="step">
            <button aria-label="Discount down 10%" disabled={discountPct <= 0} onClick={() => stepDiscount(-10)}>−</button>
            <span className="pct">{discountPct}%</span>
            <button aria-label="Discount up 10%" disabled={discountPct >= 100} onClick={() => stepDiscount(10)}>+</button>
          </div>
        </div>

        <div className="total"><span>Total</span><span>{peso(total)}</span></div>

        <div className="seg">
          <button aria-pressed={pay === "cash"} onClick={() => setPay("cash")}>Cash</button>
          <button aria-pressed={pay === "gcash"} onClick={() => setPay("gcash")}>GCash</button>
        </div>

        {pay === "cash" ? (
          <>
            <label className="field" htmlFor="tendered">
              Cash received (leave blank for exact amount)
              <input type="number" id="tendered" inputMode="decimal" min="0" step="any" placeholder={String(total / 100)} value={tendered} onChange={(e) => setTendered(e.target.value)} />
            </label>
            <div className="quick">
              {BILLS.filter((b) => b * 100 >= total).map((b) => (
                <button key={b} className="btn sm" onClick={() => setTendered(String(b))}>₱{b}</button>
              ))}
              <button className="btn sm" onClick={() => setTendered("")}>Exact</button>
            </div>
            <div className="change">
              <span>Change</span>
              <b>{enough ? peso(tenderedC - total) : "Short " + peso(total - tenderedC)}</b>
            </div>
          </>
        ) : (
          <>
            <label className="field" htmlFor="gref">
              GCash reference no. (optional)
              <input type="text" id="gref" inputMode="numeric" maxLength={20} placeholder="Last 4 digits is enough" value={ref} onChange={(e) => setRef(e.target.value)} />
            </label>
            <div className="notice">Check the customer's payment screen shows {peso(total)} sent before you record the sale.</div>
          </>
        )}

        <button className="btn go big" disabled={busy || !lines.length || !enough} onClick={confirm}>
          {busy ? "Saving…" : `Record sale · ${peso(total)}`}
        </button>
      </div>
    </div>
  );
}
