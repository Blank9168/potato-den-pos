import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";

// Admin only: add cashiers, reset passwords, remove accounts.
export default function UsersView({ me, onToast }) {
  const [users, setUsers] = useState(null);
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new, object = edit

  const load = useCallback(() => {
    api.users().then((r) => setUsers(r.users), (err) => onToast(err.message));
  }, [onToast]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="wrap">
      <div className="row">
        <span className="sp hint">Give each cashier their own login so every sale shows who recorded it.</span>
        <button className="btn sm spud" onClick={() => setEditing(null)}>Add user</button>
      </div>

      {!users && <div className="empty">Loading accounts…</div>}
      {users && (
        <div className="tw">
          <table>
            <thead><tr><th>Name</th><th>Username</th><th>Role</th><th></th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.name}</b>{u.id === me.id && <> <span className="pill">You</span></>}</td>
                  <td>{u.username}</td>
                  <td>{u.role === "admin" ? "Admin" : "Cashier"}</td>
                  <td><button className="btn sm line" onClick={() => setEditing(u)}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing !== undefined && (
        <UserSheet user={editing} isMe={editing?.id === me.id} onClose={() => setEditing(undefined)} onSaved={load} onToast={onToast} />
      )}
    </div>
  );
}

function UserSheet({ user, isMe, onClose, onSaved, onToast }) {
  const [name, setName] = useState(user?.name ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(user?.role ?? "cashier");
  const [busy, setBusy] = useState(false);
  const [armDelete, setArmDelete] = useState(false);

  const run = async (action, doneMessage) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      onToast(doneMessage);
      onSaved();
      onClose();
    } catch (err) {
      onToast(err.message);
      setBusy(false);
    }
  };

  const save = (e) => {
    e.preventDefault();
    const body = { name, username, password, role };
    run(() => (user ? api.updateUser(user.id, body) : api.createUser(body)), "Saved");
  };

  const remove = () => {
    if (!armDelete) return setArmDelete(true);
    run(() => api.deleteUser(user.id), "Account deleted");
  };

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <form className="sheet" role="dialog" aria-modal="true" onSubmit={save}>
        <header>
          <h2>{user ? "Edit user" : "Add user"}</h2>
          <button type="button" className="btn sm line" onClick={onClose} disabled={busy}>Cancel</button>
        </header>
        <label className="field" htmlFor="uName">
          Name (shown on orders)
          <input type="text" id="uName" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="field" htmlFor="uUser">
          Username
          <input type="text" id="uUser" maxLength={20} autoCapitalize="none" spellCheck={false} autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label className="field" htmlFor="uPass">
          {user ? "New password (blank = keep the current one)" : "Password (at least 8 characters)"}
          <input type="password" id="uPass" maxLength={200} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required={!user} />
        </label>
        <div className="seg">
          <button type="button" aria-pressed={role === "cashier"} onClick={() => setRole("cashier")}>Cashier</button>
          <button type="button" aria-pressed={role === "admin"} onClick={() => setRole("admin")}>Admin</button>
        </div>
        <div className="hint sm">Cashiers can sell, see sales and void orders. Admins can also edit the menu and manage users.</div>
        <button className="btn go big" type="submit" disabled={busy}>{busy ? "Saving…" : "Save user"}</button>
        {user && !isMe && (
          <button type="button" className="btn line danger" disabled={busy} onClick={remove}>{armDelete ? "Tap again to delete" : "Delete account"}</button>
        )}
      </form>
    </div>
  );
}
