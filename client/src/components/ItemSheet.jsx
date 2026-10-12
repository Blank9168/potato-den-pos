import { useState } from "react";
import { api } from "../api.js";

export default function ItemSheet({ item, menu, onClose, onToast }) {
  const [name, setName] = useState(item?.name ?? "");
  const [price, setPrice] = useState(item ? String(item.price) : "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [flavors, setFlavors] = useState((item?.flavors || []).join(", "));
  const [addons, setAddons] = useState((item?.addons || []).map((a) => ({ name: a.name, price: String(a.price) })));
  const [stock, setStock] = useState(item?.stock == null ? "" : String(item.stock));
  const [active, setActive] = useState(item ? item.active !== false : true);
  const [busy, setBusy] = useState(false);
  const [armDelete, setArmDelete] = useState(false);

  const categories = [...new Set(menu.map((m) => m.category || "Other"))];

  const run = async (action, doneMessage) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      onToast(doneMessage);
      onClose();
    } catch (err) {
      onToast(err.message);
      setBusy(false);
    }
  };

  const save = () => {
    const body = { name, price, category, flavors, addons: addons.filter((a) => a.name.trim()), active, stock: stock.trim() === "" ? null : stock };
    run(() => (item ? api.updateItem(item.id, body) : api.createItem(body)), "Saved");
  };

  const setAddon = (i, patch) => setAddons((list) => list.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  const remove = () => {
    if (!armDelete) return setArmDelete(true); // first tap arms, second tap deletes
    run(() => api.deleteItem(item.id), "Item deleted");
  };

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true">
        <header>
          <h2>{item ? "Edit item" : "Add item"}</h2>
          <button className="btn sm line" onClick={onClose} disabled={busy}>Cancel</button>
        </header>
        <label className="field" htmlFor="fName">
          Name
          <input type="text" id="fName" maxLength={40} placeholder="Cheese Fries" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field" htmlFor="fPrice">
          Price (₱)
          <input type="number" id="fPrice" inputMode="decimal" min="0" step="any" placeholder="50" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label className="field" htmlFor="fCat">
          Category
          <input type="text" id="fCat" maxLength={20} list="catList" placeholder="Fries" value={category} onChange={(e) => setCategory(e.target.value)} />
        </label>
        <datalist id="catList">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        <label className="field" htmlFor="fFlavors">
          Flavors (optional, separate with commas)
          <input type="text" id="fFlavors" maxLength={400} placeholder="Cheese, BBQ, Sour Cream" value={flavors} onChange={(e) => setFlavors(e.target.value)} />
        </label>
        <div className="hint sm">If you list flavors, the cashier is asked to pick one each time this item is tapped. All flavors share the same price and stock.</div>
        <div className="field">
          Add-ons (optional extras with their own price)
          {addons.map((a, i) => (
            <div className="addon" key={i}>
              <input type="text" aria-label="Add-on name" maxLength={30} placeholder="Extra Cheese" value={a.name} onChange={(e) => setAddon(i, { name: e.target.value })} />
              <input type="number" aria-label="Add-on price" inputMode="decimal" min="0" step="any" placeholder="₱10" value={a.price} onChange={(e) => setAddon(i, { price: e.target.value })} />
              <button type="button" className="btn sm line" aria-label="Remove add-on" onClick={() => setAddons((list) => list.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          {addons.length < 10 && (
            <button type="button" className="btn sm" onClick={() => setAddons((list) => [...list, { name: "", price: "" }])}>+ Add an add-on</button>
          )}
        </div>
        <div className="hint sm">The cashier can tick any add-ons when this item is tapped. Each one adds its price to the item.</div>
        <label className="field" htmlFor="fStock">
          Stock on hand (blank = don't track)
          <input type="number" id="fStock" inputMode="numeric" min="0" step="1" placeholder="Not tracked" value={stock} onChange={(e) => setStock(e.target.value)} />
        </label>
        <div className="hint sm">Stock goes down with every sale and comes back if an order is voided. Update the count when you restock.</div>
        <label className="check" htmlFor="fActive">
          <input type="checkbox" id="fActive" checked={active} onChange={(e) => setActive(e.target.checked)} /> Show on the Sell screen
        </label>
        <button className="btn go big" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save item"}</button>
        {item && (
          <button className="btn line danger" disabled={busy} onClick={remove}>{armDelete ? "Tap again to delete" : "Delete item"}</button>
        )}
      </div>
    </div>
  );
}
