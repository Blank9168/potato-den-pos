import { useState } from "react";
import { api } from "../api.js";

// Opened from the name button in the header: change your own password, or log out.
export default function AccountSheet({ user, onLogout, onClose, onToast }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);

  const change = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await api.changePassword(current, next);
      onToast("Password changed");
      onClose();
    } catch (err) {
      onToast(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true">
        <header>
          <h2>{user.name}</h2>
          <button className="btn sm line" onClick={onClose} disabled={busy}>Close</button>
        </header>
        <div className="hint">Logged in as <b>{user.username}</b> ({user.role === "admin" ? "Admin" : "Cashier"}). Sales you record carry your name.</div>

        <form className="lines" onSubmit={change}>
          <label className="field" htmlFor="pCur">
            Current password
            <input type="password" id="pCur" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </label>
          <label className="field" htmlFor="pNew">
            New password (at least 8 characters)
            <input type="password" id="pNew" autoComplete="new-password" minLength={8} maxLength={200} value={next} onChange={(e) => setNext(e.target.value)} required />
          </label>
          <button className="btn big" type="submit" disabled={busy}>{busy ? "Saving…" : "Change password"}</button>
        </form>

        <button className="btn spud big" onClick={onLogout} disabled={busy}>Log out</button>
      </div>
    </div>
  );
}
