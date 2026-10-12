import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { C, cartKey, niceDay, peso, splitKey } from "./utils.js";
import SellView from "./components/SellView.jsx";
import QueueView, { isPending } from "./components/QueueView.jsx";
import SalesView from "./components/SalesView.jsx";
import MenuView from "./components/MenuView.jsx";
import PaySheet from "./components/PaySheet.jsx";
import ItemSheet from "./components/ItemSheet.jsx";
import OptionsSheet from "./components/OptionsSheet.jsx";
import UsersView from "./components/UsersView.jsx";
import AccountSheet from "./components/AccountSheet.jsx";

// The register itself. Only rendered once someone is logged in (see App.jsx).
export default function Register({ user, onLogout, onSessionLost }) {
  const isAdmin = user.role === "admin";
  const tabs = [["sell", "Sell"], ["queue", "Queue"], ["sales", "Sales"], ...(isAdmin ? [["menu", "Menu"], ["users", "Users"]] : [])];
  const [tab, setTab] = useState("sell");
  const [data, setData] = useState({ loaded: false, today: "", menu: [], orders: [], queue: [] });
  const [online, setOnline] = useState(true);
  const [cart, setCart] = useState({}); // cart key (item + flavor + add-ons, see cartKey) -> quantity
  const [sheet, setSheet] = useState(null); // { type: "pay" } | { type: "item", item } | { type: "options", item }
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
  // An entry is dropped if its flavor or an add-on was removed from the item, or flavors were added to an item that had none.
  const lines = useMemo(() => {
    const out = [];
    data.menu.forEach((item, pos) => {
      const flavors = item.flavors || [];
      for (const [key, qty] of Object.entries(cart)) {
        const [id, flavor, names] = splitKey(key);
        if (id !== item.id || !(qty > 0)) continue;
        if (flavors.length ? !flavors.includes(flavor) : flavor) continue;
        const addons = (item.addons || []).filter((a) => names.includes(a.name));
        if (addons.length !== names.length) continue;
        const price = (C(item.price) + addons.reduce((sum, a) => sum + C(a.price), 0)) / 100; // one unit with its add-ons
        out.push({ ...item, key, flavor, addons, price, qty, pos, fpos: flavors.indexOf(flavor) });
      }
    });
    return out.sort((a, b) => a.pos - b.pos || a.fpos - b.fpos);
  }, [data.menu, cart]);
  const qtyById = {}; // per item, across flavors: for the badge on each tile and for stock checks
  for (const l of lines) qtyById[l.id] = (qtyById[l.id] || 0) + l.qty;
  const total = lines.reduce((sum, l) => sum + C(l.price) * l.qty, 0);
  const count = lines.reduce((sum, l) => sum + l.qty, 0);

  const changeQty = (key, delta) => {
    const [id] = splitKey(key);
    const item = data.menu.find((m) => m.id === id);
    if (!item) return;
    let qty = (cart[key] || 0) + delta;
    const others = (qtyById[id] || 0) - (lines.find((l) => l.key === key)?.qty || 0); // same item, other flavors
    if (item.stock != null && others + qty > item.stock) {
      setToast(`Only ${item.stock} left of ${item.name}`);
      qty = item.stock - others;
    }
    setCart((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[key]; else next[key] = qty;
      return next;
    });
  };

  // Tapping a tile adds one, unless the item has flavors or add-ons: then ask for those first.
  const addItem = (id) => {
    const item = data.menu.find((m) => m.id === id);
    if (item?.flavors?.length || item?.addons?.length) setSheet({ type: "options", item });
    else changeQty(cartKey(id), 1);
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

        {tab === "sell" && <SellView loaded={data.loaded} menu={data.menu} cart={qtyById} onAdd={addItem} />}
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
      {sheet?.type === "options" && (
        <OptionsSheet item={sheet.item} onAdd={(flavor, addons) => { changeQty(cartKey(sheet.item.id, flavor, addons), 1); closeSheet(); }} onClose={closeSheet} />
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
