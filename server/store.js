// Storage. The server keeps everything in memory while it runs and writes each change through to:
//   - MongoDB, when MONGODB_URI is set (in a .env file next to package.json, or in the environment), or
//   - one JSON file on disk (server/data/db.json) when it is not.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "server", "data");
const FILE = path.join(DIR, "db.json");
const BACKUP = path.join(DIR, "db.backup.json");

// Placeholder menu used only the first time the server starts. Prices are made up.
const SAMPLE_MENU = [
  ["Classic Fries", 40, "Fries"],
  ["Cheese Fries", 50, "Fries"],
  ["BBQ Fries", 50, "Fries"],
  ["Sour Cream Fries", 50, "Fries"],
  ["Mojos", 60, "Snacks"],
  ["Potato Twister", 45, "Snacks"],
  ["Hash Brown", 30, "Snacks"],
  ["Iced Tea", 20, "Drinks"],
  ["Bottled Water", 15, "Drinks"],
];

export const newId = () => randomUUID();

function fresh() {
  return {
    menu: SAMPLE_MENU.map(([name, price, category]) => ({
      id: newId(), name, price, category, active: true, stock: null, sample: true,
    })),
    orders: [],
    counters: {}, // day (YYYY-MM-DD) -> last order number given out that day
    users: [], // { id, username, name, role, password (scrypt hash) }
    sessions: {}, // hashed session token -> { userId, expires }
  };
}

const shape = (data) => ({
  menu: data.menu || [], orders: data.orders || [], counters: data.counters || {},
  users: data.users || [], sessions: data.sessions || {},
});

/* ---------- JSON file ---------- */
const readFile = () => (fs.existsSync(FILE) ? shape(JSON.parse(fs.readFileSync(FILE, "utf8"))) : null);

// Write to a temp file first, then rename, so a crash mid-write can't corrupt the sales record.
function writeFile(file, db) {
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, file);
}

/* ---------- .env ---------- */
// Tiny .env reader (KEY=value per line) so no extra package is needed. Real environment variables win.
function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    const value = m[2].replace(/^(["'])(.*)\1$/, "$2");
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

/* ---------- MongoDB ---------- */
// Collections: menu, orders, users (one document per record, _id = the record's id),
// sessions (_id = hashed token) and counters (_id = day). `_pos` keeps list order.
const LISTS = ["menu", "orders", "users"];
const COLLECTIONS = [...LISTS, "sessions", "counters"];

function toDocs(db) {
  const out = {};
  for (const name of LISTS) {
    out[name] = new Map(db[name].map(({ id, ...rest }, i) => [id, { _id: id, _pos: i, ...rest }]));
  }
  out.sessions = new Map(Object.entries(db.sessions).map(([key, s]) => [key, { _id: key, ...s }]));
  out.counters = new Map(Object.entries(db.counters).map(([day, no]) => [day, { _id: day, no }]));
  return out;
}

function fromDocs(found) {
  const db = { counters: {}, sessions: {} };
  for (const name of LISTS) {
    db[name] = found[name].sort((a, b) => a._pos - b._pos).map(({ _id, _pos, ...rest }) => ({ id: _id, ...rest }));
  }
  for (const { _id, ...s } of found.sessions) db.sessions[_id] = s;
  for (const { _id, no } of found.counters) db.counters[_id] = no;
  return db;
}

async function openMongo(uri) {
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  // Use the database named in the connection string, or "potato_den" if it names none.
  const named = (() => { try { return new URL(uri).pathname.slice(1); } catch { return ""; } })();
  const mdb = client.db(named || process.env.MONGODB_DB || "potato_den");
  await mdb.command({ ping: 1 });

  const found = {};
  for (const name of COLLECTIONS) found[name] = await mdb.collection(name).find().toArray();
  const empty = COLLECTIONS.every((name) => found[name].length === 0);

  let db;
  let note = "";
  let synced = Object.fromEntries(COLLECTIONS.map((name) => [name, new Map()])); // what MongoDB holds, as JSON per _id
  if (!empty) {
    db = fromDocs(found);
    for (const name of COLLECTIONS) for (const [id, doc] of toDocs(db)[name]) synced[name].set(id, JSON.stringify(doc));
  } else {
    const file = readFile();
    db = file || fresh();
    note = file ? "empty database: imported server/data/db.json" : "empty database: started with the sample menu";
  }

  // Each save() works out which documents changed and queues those writes, in order.
  // If MongoDB is unreachable the queue waits and retries, so a Wi-Fi blip does not lose sales.
  const queue = [];
  let working = null;
  let warned = false;

  async function work() {
    while (queue.length) {
      const { name, ops } = queue[0];
      try {
        await mdb.collection(name).bulkWrite(ops, { ordered: true });
        queue.shift();
        if (warned) { console.log("MongoDB is reachable again. Catching up on saved changes."); warned = false; }
      } catch (err) {
        if (!warned) { console.error(`\nCan't save to MongoDB (${err.message}). Still running; will keep retrying.\nA local copy is kept in server/data/db.backup.json.\n`); warned = true; }
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    working = null;
  }

  function save() {
    const now = toDocs(db);
    for (const name of COLLECTIONS) {
      const ops = [];
      const next = new Map();
      for (const [id, doc] of now[name]) {
        const json = JSON.stringify(doc);
        next.set(id, json);
        if (synced[name].get(id) !== json) ops.push({ replaceOne: { filter: { _id: id }, replacement: doc, upsert: true } });
      }
      for (const id of synced[name].keys()) if (!next.has(id)) ops.push({ deleteOne: { filter: { _id: id } } });
      synced[name] = next;
      if (ops.length) queue.push({ name, ops });
    }
    try { writeFile(BACKUP, db); } catch (err) { console.error("Could not write the local backup:", err.message); }
    working ??= work();
  }

  if (empty) save(); // push the imported or sample data up right away

  return {
    db, save, note,
    kind: `MongoDB (${mdb.databaseName})`,
    // Finish any queued writes (give up after a few seconds if MongoDB is unreachable), then disconnect.
    close: async () => {
      await Promise.race([working, new Promise((r) => setTimeout(r, 5000))]);
      await client.close().catch(() => {});
    },
  };
}

/* ---------- entry point ---------- */
export async function openStore() {
  loadEnv();
  const uri = (process.env.MONGODB_URI || "").trim();
  if (uri) return openMongo(uri);
  // A cloud host wipes its disk on every restart, so db.json would silently lose the sales record there.
  if (process.env.RENDER) throw new Error("MONGODB_URI is not set. Add it in the Render dashboard under Environment.");
  const db = readFile() || fresh();
  return { db, save: () => writeFile(FILE, db), kind: "JSON file (server/data/db.json)", note: "", close: async () => {} };
}
