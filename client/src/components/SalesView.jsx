import { useEffect, useState } from "react";
import { api } from "../api.js";
import { C, baseName, lineName, niceDay, peso, timeOf } from "../utils.js";
import { isPending } from "./QueueView.jsx";

function summarize(orders) {
  const s = { gross: 0, count: 0, cash: 0, gcash: 0, voids: 0, discounts: 0, items: {} };
  for (const o of orders) {
    if (o.voided) { s.voids++; continue; }
    const t = C(o.total);
    s.gross += t;
    s.count++;
    s.discounts += C(o.discount);
    if (o.pay === "gcash") s.gcash += t; else s.cash += t;
    for (const l of o.items) {
      // Each flavor gets its own row at the item's base price; each add-on gets a row of its own ("+ Extra Cheese").
      const addons = l.addons || [];
      const add = (name, amt) => {
        s.items[name] ??= { qty: 0, amt: 0 };
        s.items[name].qty += l.qty;
        s.items[name].amt += amt * l.qty;
      };
      add(baseName(l), C(l.price) - addons.reduce((sum, a) => sum + C(a.price), 0));
      for (const a of addons) add(`+ ${a.name}`, C(a.price));
    }
  }
  return s;
}

export default function SalesView({ isAdmin, today, todayOrders, onToast }) {
  const [picked, setPicked] = useState(""); // "" follows today
  const [past, setPast] = useState(null); // orders of a picked earlier day; null while loading
  const [armed, setArmed] = useState(null); // order id waiting for a second tap to void

  const day = picked || today;
  const isToday = day === today;

  // Earlier days are fetched on demand; today's orders arrive live from App. Refetch when anything changes.
  useEffect(() => {
    if (isToday || !day) return;
    let cancelled = false;
    api.orders(day).then(
      (r) => { if (!cancelled) setPast(r.orders); },
      (err) => { if (!cancelled) { setPast([]); onToast(err.message); } }
    );
    return () => { cancelled = true; };
  }, [day, isToday, todayOrders, onToast]);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(null), 3000);
    return () => clearTimeout(timer);
  }, [armed]);

  const orders = isToday ? todayOrders : past;

  const toggleVoid = async (order) => {
    if (!order.voided && armed !== order.id) return setArmed(order.id);
    setArmed(null);
    try {
      await api.setVoided(order.id, !order.voided);
      onToast(`Order #${order.no} ${order.voided ? "restored" : "voided"}`);
    } catch (err) {
      onToast(err.message);
    }
  };

  const s = orders ? summarize(orders) : null;
  const names = s ? Object.keys(s.items).sort((a, b) => s.items[b].qty - s.items[a].qty) : [];
  const sorted = orders ? [...orders].sort((a, b) => b.ts - a.ts) : [];

  return (
    <div className="wrap">
      <div className="row">
        <label className="field inline" htmlFor="repDay">
          Day
          <input type="date" id="repDay" value={day} max={today} onChange={(e) => { setPast(null); setPicked(e.target.value === today ? "" : e.target.value); }} />
        </label>
        <span className="sp"></span>
        <a className="btn sm spud" href={`/api/export?day=${day}`} aria-disabled={!orders?.length}>Export CSV</a>
      </div>

      {!isAdmin && <div className="notice">You're seeing only the sales you recorded. The admin sees everyone's.</div>}

      {!orders && <div className="empty">Loading sales…</div>}

      {orders && (
        <>
          <div className="stats">
            <div className="stat"><span>{isAdmin ? "Total sales" : "Your sales"}</span><b>{peso(s.gross)}</b><small>{s.count} {s.count === 1 ? "order" : "orders"}</small></div>
            <div className="stat"><span>Cash</span><b>{peso(s.cash)}</b><small>should be in the cash box</small></div>
            <div className="stat"><span>GCash</span><b>{peso(s.gcash)}</b><small>check against the app</small></div>
            <div className="stat"><span>Average order</span><b>{peso(s.count ? Math.round(s.gross / s.count) : 0)}</b><small>{s.voids} voided</small></div>
          </div>

          {!orders.length && <div className="empty">No sales recorded on {niceDay(day)}.</div>}

          {names.length > 0 && (
            <>
              <h3 className="sec">By item</h3>
              <div className="tw">
                <table>
                  <thead><tr><th>Item</th><th className="num">Sold</th><th className="num">Sales</th></tr></thead>
                  <tbody>
                    {names.map((n) => (
                      <tr key={n}><td>{n}</td><td className="num">{s.items[n].qty}</td><td className="num">{peso(s.items[n].amt)}</td></tr>
                    ))}
                    {s.discounts > 0 && <tr><td>Discounts given</td><td className="num"></td><td className="num">−{peso(s.discounts)}</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {sorted.length > 0 && (
            <>
              <h3 className="sec">Orders</h3>
              <div className="tw">
                <table>
                  <thead><tr><th>No.</th><th>Time</th><th>Items</th><th className="num">Total</th><th>Paid</th><th></th></tr></thead>
                  <tbody>
                    {sorted.map((o) => (
                      <tr key={o.id} className={o.voided ? "voided" : ""}>
                        <td><b>#{o.no}</b></td>
                        <td>{timeOf(o.ts)}{o.cashier && <><br /><small>{o.cashier}</small></>}</td>
                        <td className="items">{o.items.map((l) => `${l.qty}× ${lineName(l)}`).join(", ")}</td>
                        <td className="num">{peso(C(o.total))}{o.discountPct > 0 && <><br /><small>−{o.discountPct}%</small></>}</td>
                        <td>
                          {isPending(o) && <><span className="pill wait">In queue</span> </>}
                          {o.voided ? <span className="pill void">Void</span>
                            : o.pay === "gcash" ? <span className="pill gcash">GCash</span>
                            : <span className="pill">Cash</span>}
                        </td>
                        <td>
                          <button className={"btn sm line" + (o.voided ? "" : " danger")} onClick={() => toggleVoid(o)}>
                            {o.voided ? "Restore" : armed === o.id ? "Tap again" : "Void"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
