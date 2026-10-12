// Thin wrapper around the Node.js API. Every call throws an Error with a message fit to show the cashier.
// The login session lives in an HttpOnly cookie the browser sends automatically; nothing is stored in JS.
async function request(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Can't reach the POS server. Check the Wi-Fi and that the server is running.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Something went wrong. Try again.");
    err.status = res.status; // 401 means the login expired or the account was removed
    throw err;
  }
  return data;
}

export const api = {
  me: () => request("GET", "/api/auth/me"),
  setup: (account) => request("POST", "/api/auth/setup", account),
  login: (username, password) => request("POST", "/api/auth/login", { username, password }),
  logout: () => request("POST", "/api/auth/logout"),
  changePassword: (current, next) => request("POST", "/api/auth/password", { current, next }),

  users: () => request("GET", "/api/users"),
  createUser: (user) => request("POST", "/api/users", user),
  updateUser: (id, user) => request("PUT", `/api/users/${id}`, user),
  deleteUser: (id) => request("DELETE", `/api/users/${id}`),

  state: () => request("GET", "/api/state"),
  orders: (day) => request("GET", `/api/orders?day=${day}`),
  createOrder: (order) => request("POST", "/api/orders", order),
  setVoided: (id, voided) => request("PATCH", `/api/orders/${id}`, { voided }),
  setStatus: (id, status) => request("PATCH", `/api/orders/${id}`, { status }),
  createItem: (item) => request("POST", "/api/menu", item),
  updateItem: (id, item) => request("PUT", `/api/menu/${id}`, item),
  deleteItem: (id) => request("DELETE", `/api/menu/${id}`),
};
