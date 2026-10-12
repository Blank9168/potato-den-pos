import { useEffect, useState } from "react";
import { api } from "../api.js";
import { C, addonNames, lineName, peso, timeOf } from "../utils.js";

// An order is waiting if it was paid, not voided, and not yet served.
// Orders recorded before the queue existed have no status and count as served.
export const isPending = (o) => o.status === "pending" && !o.voided;

const waitLabel = (ms) => {
  const min = Math.floor(ms / 60000);
  return min < 1 ? "just now" : `${min} min`;
};

export default function QueueView({ loaded, orders, me, onToast }) {
  // Cashiers can cancel only the orders they took; admins can cancel any.
  const canCancel = (o) => me.role === "admin" || o.cashierId === me.id;
  const [now, setNow] = useState(Date.now());
  const [busyId, setBusyId] = useState(null);
  const [armed, setArmed] = useState(null); // order id waiting for a second tap to cancel

  // Tick so the waiting times stay current without any server traffic.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  // The "Tap again" state resets after a few seconds so a stray tap can't cancel later.
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(null), 3000);
    return () => clearTimeout(timer);
  }, [armed]);

  if (!loaded) return <div className="empty">Loading the queue…</div>;

  const pending = orders.filter(isPending).sort((a, b) => a.ts - b.ts); // oldest first
  const served = orders
    .filter((o) => o.status === "done" && !o.voided && o.doneAt)
    .sort((a, b) => b.doneAt - a.doneAt)
    .slice(0, 5);

  const setStatus = async (order, status) => {
    if (busyId) return;
    setBusyId(order.id);
    try {
      await api.setStatus(order.id, status);
      onToast(status === "done" ? `Order #${order.no} served` : `Order #${order.no} back in the queue`);
    } catch (err) {
      onToast(err.message);
    } finally {
      setBusyId(null);
    }
  };

  // Cancelling voids the order: it leaves the queue and the sales totals, and its stock goes back.
  const cancel = async (order) => {
    if (busyId) return;
    if (armed !== order.id) return setArmed(order.id);
    setArmed(null);
    setBusyId(order.id);
    try {
      await api.setVoided(order.id, true);
      onToast(`Order #${order.no} cancelled. Refund ${peso(C(order.total))} (${order.pay === "gcash" ? "GCash" : "cash"}).`);
    } catch (err) {
      onToast(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="wrap">
      <div className="row">
        <h3 className="sec sp">{pending.length ? `${pending.length} waiting` : "Queue"}</h3>
        {pending.length > 0 && <span className="hint">Oldest first</span>}
      </div>

      {me.role !== "admin" && <div className="notice">You're seeing only the orders you took. The admin sees everyone's.</div>}

      {!pending.length && <div className="empty">No orders waiting. New sales show up here as soon as they are recorded.</div>}

      <div className="queue">
        {pending.map((o, i) => {
          const waited = Math.max(0, now - o.ts);
          return (
            <div className={"ticket" + (i === 0 ? " next" : "")} key={o.id}>
              <div className="thead">
                <span className="tno">#{o.no}</span>
                <span className={"twait" + (waited >= 10 * 60000 ? " late" : "")}>{waitLabel(waited)}</span>
              </div>
              <ul className="titems">
                {o.items.map((l) => (
                  <li key={lineName(l)}><b>{l.qty}×</b> {l.name}{l.size && <span className="flv"> · {l.size}</span>}{l.flavor && <span className="flv"> · {l.flavor}</span>}{l.addons?.length > 0 && <small className="adds">+ {addonNames(l)}</small>}</li>
                ))}
              </ul>
              <div className="hint sm">{timeOf(o.ts)}{o.cashier ? ` · ${o.cashier}` : ""}</div>
              <button className="btn go big" disabled={busyId === o.id} onClick={() => setStatus(o, "done")}>
                {busyId === o.id ? "Saving…" : "Served"}
              </button>
              {canCancel(o) && (
                <button className="btn sm line danger" disabled={busyId === o.id} onClick={() => cancel(o)}>
                  {armed === o.id ? "Tap again to cancel" : "Cancel order"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {served.length > 0 && (
        <>
          <h3 className="sec">Recently served</h3>
          <div className="tw">
            <table>
              <tbody>
                {served.map((o) => (
                  <tr key={o.id}>
                    <td><b>#{o.no}</b></td>
                    <td className="items">{o.items.map((l) => `${l.qty}× ${lineName(l)}`).join(", ")}</td>
                    <td>{timeOf(o.doneAt)}{o.doneBy && <><br /><small>{o.doneBy}</small></>}</td>
                    <td><button className="btn sm line" disabled={busyId === o.id} onClick={() => setStatus(o, "pending")}>Undo</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
