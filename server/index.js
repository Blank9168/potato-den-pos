// Potato Den POS server: REST API + live updates + serves the built React app.
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openStore, newId } from "./store.js";
import { createAuth, checkPassword, hashPassword, publicUser, readUser } from "./auth.js";

const PORT = Number(process.env.PORT) || 3000;
const TZ = "Asia/Manila";
const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");

// Storage is MongoDB when MONGODB_URI is set (see .env.example), otherwise server/data/db.json.
let store;
try {
  store = await openStore();
} catch (err) {
  console.error(`\nCould not connect to MongoDB: ${err.message}\nCheck MONGODB_URI in the .env file, that MongoDB is running, and (for Atlas) the internet connection and IP access list.\n`);
  process.exit(1);
}
const { db, save } = store;
const app = express();
app.set("trust proxy", 1); // when hosted (Render), HTTPS ends at the host's proxy; this lets us see that
app.use(express.json({ limit: "100kb" }));
const auth = createAuth(db, () => save(db));

/* ---------- helpers ---------- */
const dayOf = (ts) => new Date(ts).toLocaleDateString("en-CA", { timeZone: TZ });
const timeOf = (ts) => new Date(ts).toLocaleTimeString("en-PH", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const cents = (pesos) => Math.round(Number(pesos) * 100); // do money math in whole centavos
const validDay = (d) => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
const fail = (res, status, error) => res.status(status).json({ error });

// Live updates: every open register keeps an event stream open and refetches when told.
const listeners = new Set();
function commit() {
  save(db);
  for (const res of listeners) res.write(`data: ${Date.now()}\n\n`);
}

function readItem(body) {
  const name = String(body.name ?? "").trim().slice(0, 40);
  const price = Number(body.price);
  if (!name) return { error: "Give the item a name." };
  if (body.price === "" || body.price == null || !Number.isFinite(price) || price < 0) return { error: "Enter a price." };
  let stock = null;
  if (body.stock !== null && body.stock !== undefined && body.stock !== "") {
    stock = Math.floor(Number(body.stock));
    if (!Number.isFinite(stock) || stock < 0) return { error: "Stock must be 0 or more." };
  }
  return {
    item: {
      name,
      price: Math.round(price * 100) / 100,
      category: String(body.category ?? "").trim().slice(0, 20) || "Other",
      active: body.active !== false,
      stock,
    },
  };
}

/* ---------- login ---------- */
// Tells the app whether to show first-time setup, the login screen, or the register.
app.get("/api/auth/me", (req, res) => {
  const user = auth.currentUser(req);
  res.json({ needsSetup: db.users.length === 0, user: user ? publicUser(user) : null });
});

// First run only: the first account created becomes the admin.
app.post("/api/auth/setup", (req, res) => {
  if (db.users.length) return fail(res, 409, "Setup is already done. Log in instead.");
  const u = readUser(req.body || {}, { requirePassword: true });
  if (u.error) return fail(res, 400, u.error);
  const user = { id: newId(), username: u.username, name: u.name, role: "admin", password: hashPassword(u.password) };
  db.users.push(user);
  auth.startSession(res, user);
  res.status(201).json(publicUser(user));
});

app.post("/api/auth/login", (req, res) => {
  const result = auth.login(req.body?.username, req.body?.password);
  if (result.error) return fail(res, result.status, result.error);
  auth.startSession(res, result.user);
  res.json(publicUser(result.user));
});

app.post("/api/auth/logout", (req, res) => {
  auth.endSession(req, res);
  res.json({ ok: true });
});

// Everything below this line needs a logged-in user.
app.use("/api", auth.requireAuth);

app.post("/api/auth/password", (req, res) => {
  const next = String(req.body?.next ?? "");
  if (!checkPassword(req.body?.current, req.user.password)) return fail(res, 400, "Your current password is wrong.");
  if (next.length < 8 || next.length > 200) return fail(res, 400, "New password must be at least 8 characters.");
  req.user.password = hashPassword(next);
  auth.endSessionsOf(req.user.id); // signs out other devices using the old password
  auth.startSession(res, req.user);
  res.json({ ok: true });
});

/* ---------- users (admin only) ---------- */
const adminCount = () => db.users.filter((u) => u.role === "admin").length;

app.get("/api/users", auth.requireAdmin, (req, res) => res.json({ users: db.users.map(publicUser) }));

app.post("/api/users", auth.requireAdmin, (req, res) => {
  const u = readUser(req.body || {}, { requirePassword: true });
  if (u.error) return fail(res, 400, u.error);
  if (db.users.some((x) => x.username === u.username)) return fail(res, 409, "That username is already taken.");
  const user = { id: newId(), username: u.username, name: u.name, role: u.role, password: hashPassword(u.password) };
  db.users.push(user);
  save(db);
  res.status(201).json(publicUser(user));
});

app.put("/api/users/:id", auth.requireAdmin, (req, res) => {
  const user = db.users.find((x) => x.id === req.params.id);
  if (!user) return fail(res, 404, "That account no longer exists.");
  const u = readUser(req.body || {}, { requirePassword: false });
  if (u.error) return fail(res, 400, u.error);
  if (db.users.some((x) => x.username === u.username && x.id !== user.id)) return fail(res, 409, "That username is already taken.");
  if (user.role === "admin" && u.role !== "admin" && adminCount() === 1) return fail(res, 409, "There must be at least one admin.");
  Object.assign(user, { username: u.username, name: u.name, role: u.role });
  if (u.password) {
    user.password = hashPassword(u.password);
    if (user.id !== req.user.id) auth.endSessionsOf(user.id);
  }
  save(db);
  res.json(publicUser(user));
});

app.delete("/api/users/:id", auth.requireAdmin, (req, res) => {
  const user = db.users.find((x) => x.id === req.params.id);
  if (!user) return res.json({ ok: true });
  if (user.id === req.user.id) return fail(res, 409, "You can't delete the account you're logged in with.");
  db.users = db.users.filter((x) => x.id !== user.id);
  auth.endSessionsOf(user.id);
  save(db);
  res.json({ ok: true });
});

/* ---------- API ---------- */
/* ---------- who can see which orders ---------- */
// Admins see every order. A cashier sees only the orders they recorded themselves.
const ownsOrder = (user, o) => o.cashierId === user.id;
const visibleOrders = (user, day) =>
  db.orders.filter((o) => o.day === day && (user.role === "admin" || ownsOrder(user, o)));

// The queue follows the same rule: an admin sees every waiting and recently served order,
// a cashier sees only their own (filtered before picking the last 5 served).
function queueFor(user, day) {
  const mine = visibleOrders(user, day).filter((o) => !o.voided);
  const pending = mine.filter((o) => o.status === "pending");
  const served = mine.filter((o) => o.status === "done" && o.doneAt).sort((a, b) => b.doneAt - a.doneAt).slice(0, 5);
  return [...pending, ...served];
}

app.get("/api/state", (req, res) => {
  const today = dayOf(Date.now());
  res.json({ today, menu: db.menu, orders: visibleOrders(req.user, today), queue: queueFor(req.user, today) });
});

app.get("/api/orders", (req, res) => {
  const day = validDay(req.query.day);
  if (!day) return fail(res, 400, "Pick a valid day.");
  res.json({ day, orders: visibleOrders(req.user, day) });
});

app.get("/api/events", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();
  res.write("retry: 3000\n\n");
  listeners.add(res);
  req.on("close", () => listeners.delete(res));
});
setInterval(() => { for (const res of listeners) res.write(": ping\n\n"); }, 25000).unref();

app.post("/api/menu", auth.requireAdmin, (req, res) => {
  const { item, error } = readItem(req.body || {});
  if (error) return fail(res, 400, error);
  const created = { id: newId(), ...item };
  db.menu.push(created);
  commit();
  res.status(201).json(created);
});

app.put("/api/menu/:id", auth.requireAdmin, (req, res) => {
  const i = db.menu.findIndex((m) => m.id === req.params.id);
  if (i < 0) return fail(res, 404, "That item no longer exists.");
  const { item, error } = readItem(req.body || {});
  if (error) return fail(res, 400, error);
  db.menu[i] = { id: db.menu[i].id, ...item }; // editing also drops the "sample" flag
  commit();
  res.json(db.menu[i]);
});

app.delete("/api/menu/:id", auth.requireAdmin, (req, res) => {
  const before = db.menu.length;
  db.menu = db.menu.filter((m) => m.id !== req.params.id);
  if (db.menu.length !== before) commit();
  res.json({ ok: true });
});

app.post("/api/orders", (req, res) => {
  const body = req.body || {};
  if (!Array.isArray(body.items) || !body.items.length) return fail(res, 400, "The order is empty.");

  // Merge duplicate lines, and take names and prices from the server's menu, never from the client.
  const qtyById = new Map();
  for (const line of body.items) {
    const qty = Math.floor(Number(line?.qty));
    if (!Number.isFinite(qty) || qty < 1 || qty > 999) return fail(res, 400, "Check the quantities and try again.");
    qtyById.set(line.id, (qtyById.get(line.id) || 0) + qty);
  }
  const lines = [];
  for (const [id, qty] of qtyById) {
    const item = db.menu.find((m) => m.id === id);
    if (!item) return fail(res, 409, "An item in this order was removed from the menu. Start the order again.");
    if (item.stock != null && qty > item.stock) {
      return fail(res, 409, item.stock === 0 ? `${item.name} is sold out.` : `Only ${item.stock} left of ${item.name}.`);
    }
    lines.push({ id, name: item.name, price: item.price, qty });
  }

  // Discount: a whole-order percentage in steps of 10 (0, 10, 20 ... 100). The server works out the amount.
  const discountPct = body.discountPct == null || body.discountPct === "" ? 0 : Number(body.discountPct);
  if (!Number.isInteger(discountPct) || discountPct < 0 || discountPct > 100 || discountPct % 10 !== 0) {
    return fail(res, 400, "Discount must be 0% to 100% in steps of 10.");
  }
  const subtotalC = lines.reduce((sum, l) => sum + cents(l.price) * l.qty, 0);
  const discountC = Math.round((subtotalC * discountPct) / 100);
  const totalC = subtotalC - discountC;
  const pay = body.pay === "gcash" ? "gcash" : "cash";
  let tenderedC = totalC;
  if (pay === "cash" && body.tendered !== "" && body.tendered != null) {
    tenderedC = cents(body.tendered);
    if (!Number.isFinite(tenderedC) || tenderedC < totalC) return fail(res, 400, "Cash received is less than the total.");
  }

  const now = Date.now();
  const day = dayOf(now);
  const no = (db.counters[day] || 0) + 1; // one server hands out numbers, so no two devices can clash
  db.counters[day] = no;
  for (const l of lines) {
    const item = db.menu.find((m) => m.id === l.id);
    if (item.stock != null) item.stock -= l.qty;
  }
  const order = {
    id: newId(), no, ts: now, day, items: lines,
    subtotal: subtotalC / 100, discountPct, discount: discountC / 100,
    total: totalC / 100, pay, // total is what the customer paid, after the discount
    tendered: tenderedC / 100, change: (tenderedC - totalC) / 100,
    ref: pay === "gcash" ? String(body.ref ?? "").trim().slice(0, 20) : "",
    cashier: req.user.name, cashierId: req.user.id, // taken from the login, not from the request
    voided: false,
    status: "pending", doneAt: null, doneBy: "", // every new sale joins the queue until it is served
  };
  db.orders.push(order);
  commit();
  res.status(201).json(order);
});

// Update an order: void/restore it, or move it through the queue.
// Voiding puts the stock back; restoring takes it out again.
app.patch("/api/orders/:id", (req, res) => {
  const order = db.orders.find((o) => o.id === req.params.id);
  if (!order) return fail(res, 404, "That order no longer exists.");
  const body = req.body || {};
  let changed = false;
  // Only the cashier who took an order, or an admin, can serve, void or cancel it.
  if (req.user.role !== "admin" && !ownsOrder(req.user, order)) {
    return fail(res, 403, "Only the cashier who took this order, or an admin, can change it.");
  }
  if (typeof body.voided === "boolean" && order.voided !== body.voided) {
    for (const l of order.items) {
      const item = db.menu.find((m) => m.id === l.id);
      if (item && item.stock != null) item.stock = Math.max(0, item.stock + (body.voided ? l.qty : -l.qty));
    }
    order.voided = body.voided;
    order.voidedBy = body.voided ? req.user.name : "";
    changed = true;
  }
  // Queue: "pending" = paid and waiting to be handed over, "done" = served.
  if ((body.status === "pending" || body.status === "done") && order.status !== body.status) {
    order.status = body.status;
    order.doneAt = body.status === "done" ? Date.now() : null;
    order.doneBy = body.status === "done" ? req.user.name : "";
    changed = true;
  }
  if (changed) commit();
  res.json({ ok: true });
});

app.get("/api/export", (req, res) => {
  const day = validDay(req.query.day);
  if (!day) return fail(res, 400, "Pick a valid day.");
  const q = (v) => { v = String(v ?? ""); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  const rows = [["Order no", "Date", "Time", "Cashier", "Item", "Qty", "Unit price", "Line total", "Order subtotal", "Discount %", "Discount", "Order total", "Payment", "GCash ref", "Cash received", "Change", "Status", "Served at"]];
  for (const o of visibleOrders(req.user, day).sort((a, b) => a.ts - b.ts)) {
    for (const l of o.items) {
      rows.push([o.no, o.day, timeOf(o.ts), o.cashier, l.name, l.qty, l.price, (cents(l.price) * l.qty) / 100, o.subtotal ?? o.total, o.discountPct || 0, o.discount || 0, o.total,
        o.pay === "gcash" ? "GCash" : "Cash", o.ref, o.tendered, o.change, o.voided ? "Void" : "Paid", o.doneAt ? timeOf(o.doneAt) : ""]);
    }
  }
  res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="potato-den-sales-${day}.csv"` });
  res.send("﻿" + rows.map((r) => r.map(q).join(",")).join("\r\n"));
});

app.use("/api", (req, res) => fail(res, 404, "Not found."));

/* ---------- the React app ---------- */
if (fs.existsSync(path.join(DIST, "index.html"))) {
  app.use(express.static(DIST));
  app.get("*", (req, res) => res.sendFile(path.join(DIST, "index.html")));
} else {
  app.get("*", (req, res) => res.status(503).send("The app is not built yet. Run: npm run build"));
}

app.use((err, req, res, next) => {
  console.error(err);
  fail(res, err.status === 400 ? 400 : 500, "Something went wrong on the server.");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`\nPotato Den POS is running.\n  Storage:            ${store.kind}${store.note ? ` (${store.note})` : ""}\n  On this computer:   http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === "IPv4" && !net.internal) console.log(`  On other devices:   http://${net.address}:${PORT}  (same Wi-Fi or hotspot)`);
    }
  }
  console.log("");
});

// Ctrl+C: finish writing to the database before the server stops.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await store.close();
    process.exit(0);
  });
}
