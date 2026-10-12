import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { C, niceDay, peso } from "./utils.js";
import SellView from "./components/SellView.jsx";
import QueueView, { isPending } from "./components/QueueView.jsx";
import SalesView from "./components/SalesView.jsx";
import MenuView from "./components/MenuView.jsx";
import PaySheet from "./components/PaySheet.jsx";
import ItemSheet from "./components/ItemSheet.jsx";
import UsersView from "./components/UsersView.jsx";
import AccountSheet from "./components/AccountSheet.jsx";

// The register itself. Only rendered once someone is logged in (see App.jsx).
export default function Register({ user, onLogout, onSessionLost }) {
  const isAdmin = user.role === "admin";
  const tabs = [["sell", "Sell"], ["queue", "Queue"], ["sales", "Sales"], ...(isAdmin ? [["menu", "Menu"], ["users", "Users"]] : [])];
  const [tab, setTab] = useState("sell");
  const [data, setData] = useState({ loaded: false, today: "", menu: [], orders: [], queue: [] });
  const [online, setOnline] = useState(true);
  const [cart, setCart] = useState({}); // item id -> quantity
  const [sheet, setSheet] = useState(null); // { type: "pay" } | { type: "item", item }
  const [toast, setToast] = useState("");

  const refresh = useCallback(async () => {
    try {
      const next = await api.state();
      setData({ loaded: true, ...next });
      setOnline(true);
    } catch (err) {
      if (err.status === 401) onSessionLost(); // login expired or account removed: back to the login screen
      else setOnline(false);
    }
  }, [onSessionLost]);

  // Load once, then refetch whenever the server says something changed (another register sold, menu edited...).
  useEffect(() => {
    refresh();
    const events = new EventSource("/api/events");
    events.onmessage = refresh;
    events.onopen = refresh;
    events.onerror = () => setOnline(false);
    const timer = setInterval(refresh, 20000); // safety net if the event stream drops
    return () => { events.close(); clearInterval(timer); };
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  // Cart lines always use the current menu, so a price edit or deleted item is reflected right away.
  const lines = useMemo(
    () => data.menu.filter((item) => cart[item.id] > 0).map((item) => ({ ...item, qty: cart[item.id] })),
    [data.menu, cart]
  );
  const total = lines.reduce((sum, l) => sum + C(l.price) * l.qty, 0);
  const count = lines.reduce((sum, l) => sum + l.qty, 0);

  const changeQty = (id, delta) => {
    const item = data.menu.find((m) => m.id === id);
    if (!item) return;
    let qty = (cart[id] || 0) + delta;
    if (item.stock != null && qty > item.stock) {
      setToast(`Only ${item.stock} left of ${item.name}`);
      qty = item.stock;
    }
    setCart((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[id]; else next[id] = qty;
      return next;
    });
  };

  const closeSheet = () => setSheet(null);
  const waiting = data.queue.filter(isPending).length;

  return (
    <>
      <div className="wrap">
        <div className="top">
          <div className="brand">
            <h1>Potato Den</h1>
            <span>Foundation Week{data.today ? " · " + niceDay(data.today) : ""}</span>
          </div>
          <button className="btn sm line" onClick={() => setSheet({ type: "account" })}>
            {user.name} · {isAdmin ? "Admin" : "Cashier"}
          </button>
        </div>

        <div className="tabs" role="tablist">
          {tabs.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
              {label}{id === "queue" && waiting > 0 && <span className="count">{waiting}</span>}
            </button>
          ))}
        </div>

        {!online && (
          <div className="notice bad">Can't reach the POS server. Check the Wi-Fi and that the server is still running. Sales can't be recorded until it's back.</div>
        )}

        {tab === "sell" && <SellView loaded={data.loaded} menu={data.menu} cart={cart} onAdd={(id) => changeQty(id, 1)} />}
        {tab === "queue" && <QueueView loaded={data.loaded} orders={data.queue} me={user} onToast={setToast} />}
        {tab === "sales" && <SalesView isAdmin={isAdmin} today={data.today} todayOrders={data.loaded ? data.orders : null} onToast={setToast} />}
        {tab === "menu" && isAdmin && <MenuView loaded={data.loaded} menu={data.menu} onEdit={(item) => setSheet({ type: "item", item })} />}
        {tab === "users" && isAdmin && <UsersView me={user} onToast={setToast} />}
      </div>

      {tab === "sell" && (
        <div className="bar">
          <div className="in">
            <div className="sum">
              <b>{peso(total)}</b>
              <small>{count ? `${count} ${count === 1 ? "item" : "items"}` : "Tap items to start an order"}</small>
            </div>
            {count > 0 && <button className="btn sm line" onClick={() => setCart({})}>Clear</button>}
            <button className="btn go" disabled={!count} onClick={() => setSheet({ type: "pay" })}>Charge</button>
          </div>
        </div>
      )}

      {sheet?.type === "pay" && (
        <PaySheet lines={lines} total={total} onQty={changeQty} onSold={() => setCart({})} onClose={closeSheet} onToast={setToast} />
      )}
      {sheet?.type === "item" && (
        <ItemSheet item={sheet.item} menu={data.menu} onClose={closeSheet} onToast={setToast} />
      )}

      {sheet?.type === "account" && (
        <AccountSheet user={user} onLogout={onLogout} onClose={closeSheet} onToast={setToast} />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
