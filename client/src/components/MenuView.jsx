import { C, peso } from "../utils.js";

export default function MenuView({ loaded, menu, onEdit }) {
  const sorted = [...menu].sort(
    (a, b) => String(a.category || "Other").localeCompare(String(b.category || "Other")) || a.name.localeCompare(b.name)
  );

  return (
    <div className="wrap">
      <div className="row">
        <span className="sp hint">Changes show up on every device right away.</span>
        <button className="btn sm spud" onClick={() => onEdit(null)}>Add item</button>
      </div>

      {!loaded && <div className="empty">Loading the menu…</div>}
      {loaded && !menu.length && <div className="empty">Nothing here yet. Tap Add item to put your first product on the Sell screen.</div>}
      {loaded && menu.some((item) => item.sample) && (
        <div className="notice">These are sample items with made-up prices. Edit or remove them before you open the booth.</div>
      )}

      {sorted.length > 0 && (
        <div className="tw">
          <table>
            <thead>
              <tr><th>Item</th><th>Category</th><th className="num">Price</th><th className="num">Stock left</th><th></th></tr>
            </thead>
            <tbody>
              {sorted.map((item) => (
                <tr key={item.id}>
                  <td>
                    <b>{item.name}</b>
                    {item.active === false && <> <span className="pill">Hidden</span></>}
                    {item.sample && <> <span className="pill">Sample</span></>}
                    {item.flavors?.length > 0 && <><br /><small className="hint sm">{item.flavors.join(", ")}</small></>}
                  </td>
                  <td>{item.category || "Other"}</td>
                  <td className="num">{peso(C(item.price))}</td>
                  <td className="num">{item.stock == null ? "Not tracked" : item.stock}</td>
                  <td><button className="btn sm line" onClick={() => onEdit(item)}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
