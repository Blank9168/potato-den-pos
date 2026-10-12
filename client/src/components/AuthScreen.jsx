import { useState } from "react";
import { api } from "../api.js";

// Login screen. On a brand-new install it becomes the "create the admin account" screen instead.
export default function AuthScreen({ needsSetup, serverError, onRetry, onDone }) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const user = needsSetup ? await api.setup({ name, username, password }) : await api.login(username, password);
      onDone(user);
    } catch (err) {
      setError(err.message);
      setPassword("");
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <form className="authcard" onSubmit={submit}>
        <div>
          <h1>Potato Den</h1>
          <p className="hint">{needsSetup ? "First-time setup: create the admin account." : "Log in to open the register."}</p>
        </div>

        {serverError && (
          <div className="notice bad">{serverError} <button type="button" className="btn sm line" onClick={onRetry}>Try again</button></div>
        )}

        {needsSetup && (
          <label className="field" htmlFor="aName">
            Your name (shown on orders)
            <input type="text" id="aName" maxLength={20} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
        )}
        <label className="field" htmlFor="aUser">
          Username
          <input type="text" id="aUser" maxLength={20} autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label className="field" htmlFor="aPass">
          Password{needsSetup && " (at least 8 characters)"}
          <input type="password" id="aPass" maxLength={200} autoComplete={needsSetup ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>

        {error && <div className="notice bad" role="alert">{error}</div>}

        <button className="btn go big" type="submit" disabled={busy}>
          {busy ? "One moment…" : needsSetup ? "Create admin account" : "Log in"}
        </button>
        {needsSetup && <p className="hint sm">The admin can edit the menu and add cashier accounts. Keep this password safe: there is no reset by email.</p>}
      </form>
    </div>
  );
}
