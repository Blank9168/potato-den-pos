// Accounts and sessions. Passwords are stored only as salted scrypt hashes; session tokens only as SHA-256 hashes.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const COOKIE = "pd_session";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000; // a login lasts the whole Foundation Week
const MAX_FAILS = 5;
const LOCK_MS = 60 * 1000;

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function checkPassword(password, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(String(password), salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const DUMMY_HASH = hashPassword(randomBytes(8).toString("hex")); // keeps timing the same for unknown usernames
const hashToken = (token) => createHash("sha256").update(token).digest("hex");

export const publicUser = (u) => ({ id: u.id, username: u.username, name: u.name, role: u.role });

export function readUser(body, { requirePassword }) {
  const name = String(body.name ?? "").trim().slice(0, 20);
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!name) return { error: "Enter a name." };
  if (!/^[a-z0-9._-]{3,20}$/.test(username)) return { error: "Username must be 3 to 20 letters, numbers, dots, dashes or underscores." };
  if ((requirePassword || password) && password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password.length > 200) return { error: "That password is too long." };
  return { name, username, password, role: body.role === "admin" ? "admin" : "cashier" };
}

function cookieToken(req) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === COOKIE) return rest.join("=");
  }
  return null;
}

export function createAuth(db, save) {
  const fails = new Map(); // username -> { count, lockedUntil }

  function startSession(res, user) {
    const token = randomBytes(32).toString("hex");
    db.sessions[hashToken(token)] = { userId: user.id, expires: Date.now() + SESSION_MS };
    save();
    // HttpOnly keeps the token away from page scripts; SameSite=Lax stops other sites from using it.
    // Secure is added when the site is served over HTTPS (hosted), so the cookie never travels unencrypted.
    const secure = res.req?.secure ? "; Secure" : "";
    res.setHeader("Set-Cookie", `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}${secure}`);
  }

  function endSession(req, res) {
    const token = cookieToken(req);
    if (token && db.sessions[hashToken(token)]) {
      delete db.sessions[hashToken(token)];
      save();
    }
    res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  }

  // Sign a user out everywhere, e.g. after a password change or when the account is deleted.
  function endSessionsOf(userId) {
    for (const [key, s] of Object.entries(db.sessions)) if (s.userId === userId) delete db.sessions[key];
  }

  function currentUser(req) {
    const token = cookieToken(req);
    if (!token) return null;
    const key = hashToken(token);
    const session = db.sessions[key];
    if (!session) return null;
    if (session.expires < Date.now()) { delete db.sessions[key]; return null; }
    return db.users.find((u) => u.id === session.userId) || null;
  }

  // Returns the user, or an error message. Five wrong passwords lock that username for a minute.
  function login(username, password) {
    username = String(username ?? "").trim().toLowerCase();
    const entry = fails.get(username);
    if (entry && entry.lockedUntil > Date.now()) return { error: "Too many wrong tries. Wait a minute and try again.", status: 429 };
    const user = db.users.find((u) => u.username === username);
    const ok = checkPassword(password, user ? user.password : DUMMY_HASH) && !!user;
    if (!ok) {
      const count = (entry && entry.lockedUntil <= Date.now() && entry.count >= MAX_FAILS ? 0 : entry?.count || 0) + 1;
      fails.set(username, { count, lockedUntil: count >= MAX_FAILS ? Date.now() + LOCK_MS : 0 });
      return { error: "Wrong username or password.", status: 401 };
    }
    fails.delete(username);
    return { user };
  }

  const requireAuth = (req, res, next) => {
    req.user = currentUser(req);
    if (!req.user) return res.status(401).json({ error: "Please log in again." });
    next();
  };
  const requireAdmin = (req, res, next) => {
    if (req.user?.role !== "admin") return res.status(403).json({ error: "Only an admin can do that." });
    next();
  };

  return { startSession, endSession, endSessionsOf, currentUser, login, requireAuth, requireAdmin };
}
