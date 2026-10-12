import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import AuthScreen from "./components/AuthScreen.jsx";
import Register from "./Register.jsx";

// Gate: first-time setup, then login, then the register.
export default function App() {
  const [auth, setAuth] = useState({ checked: false, needsSetup: false, user: null, error: "" });

  const check = useCallback(async () => {
    try {
      const me = await api.me();
      setAuth({ checked: true, needsSetup: me.needsSetup, user: me.user, error: "" });
    } catch (err) {
      setAuth({ checked: true, needsSetup: false, user: null, error: err.message });
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  const onSessionLost = useCallback(() => setAuth((a) => ({ ...a, user: null })), []);

  const logout = async () => {
    try { await api.logout(); } catch { /* the cookie is cleared server-side when reachable; drop the UI either way */ }
    setAuth((a) => ({ ...a, user: null }));
  };

  if (!auth.checked) return <div className="auth"><div className="empty">Opening the register…</div></div>;
  if (!auth.user) {
    return (
      <AuthScreen
        needsSetup={auth.needsSetup}
        serverError={auth.error}
        onRetry={check}
        onDone={(user) => setAuth({ checked: true, needsSetup: false, user, error: "" })}
      />
    );
  }
  return <Register key={auth.user.id} user={auth.user} onLogout={logout} onSessionLost={onSessionLost} />;
}
