# Potato Den POS

Booth point-of-sale for Potato Den at Foundation Week. React front end, Node.js (Express) back end.
One laptop runs the server; every cashier opens the POS in a phone or laptop browser on the same Wi-Fi or hotspot, and all devices share one sales record.

## Requirements

- Node.js 18 or newer (https://nodejs.org)

## Run it at the booth

```
npm install        # first time only
npm run build      # first time, and after changing anything in client/
npm start
```

The terminal prints two addresses:

- `http://localhost:3000` for the laptop running the server
- `http://<laptop-ip>:3000` for the other devices. They must be on the same Wi-Fi or phone hotspot as the laptop.
  If Windows asks about the firewall the first time, allow Node.js on private networks.

Keep the terminal window open while the booth is running. The laptop must stay on and awake.

## Storage: db.json or MongoDB

By default everything is saved in `server/data/db.json`. To use MongoDB instead:

1. Copy `.env.example` to `.env` (same folder as `package.json`).
2. Set `MONGODB_URI` in it:
   - MongoDB on this laptop (no internet needed): `mongodb://127.0.0.1:27017/potato_den`
   - MongoDB Atlas (needs internet at the booth): the `mongodb+srv://...` string from Atlas > Connect > Drivers, with `/potato_den` after the host.
3. Run `npm install` once (adds the MongoDB driver), then `npm start`.

The start-up message shows which storage is in use. The first time it connects to an empty database it imports your existing `db.json` (menu, orders, accounts), so nothing is lost. Delete `.env` to go back to `db.json`.

- Collections: `menu`, `orders`, `users`, `sessions`, `counters`. Open them in MongoDB Compass with the same connection string.
- The server reads the database once at start-up and writes every change to it. Edits made directly in Compass while the server is running are not picked up until it restarts, and may be overwritten. Run only one POS server per database.
- If MongoDB becomes unreachable the POS keeps selling and retries the writes until it is back. `server/data/db.backup.json` always holds a full local copy.
- If MongoDB can't be reached at start-up the server stops with a message instead of starting empty.

## Hosting it online (no laptop at the booth)

Phones and tablets can't run the server, so without a laptop it runs on Render with MongoDB Atlas as the database.

- Render web service: runtime Node, region Singapore, build command `npm install --include=dev && npm run build`, start command `npm start`.
- Environment variable `MONGODB_URI` = the Atlas connection string (with `/potato_den` after the host). The server refuses to start on Render without it, because Render's disk is wiped on every restart.
- In Atlas, Network Access must allow `0.0.0.0/0` (Render's address changes).
- Every device opens the Render address (`https://<name>.onrender.com`) and needs mobile data or Wi-Fi for the whole shift.
- On Render's free plan the server sleeps after 15 minutes with no register open; the first page load after that takes about a minute. Open the POS a few minutes before the booth opens.

## Logging in

- The first time you open the POS it asks you to create the **admin** account. Do this yourself before sharing the address.
- The admin adds one account per cashier in the **Users** tab. Every sale records the name of whoever was logged in.
- **Admin**: sell, run the queue, see everyone's sales, void or cancel any order, export everything, edit the menu, manage users.
- **Cashier**: sell, run the queue, and see, void, cancel and export **only the orders they recorded**. Totals in the Sales tab are their own. The server enforces this, so another cashier's orders never reach their device.
- The Queue follows the same rule: a cashier sees, serves and cancels only the orders they took (waiting and recently served). The admin sees the whole booth's queue, so use an admin login on the device that runs the queue for everyone. Orders recorded before logins existed are visible to admins only.
- Tap your name at the top to change your password or log out. A login lasts 7 days on that device.
- Five wrong passwords lock that username for one minute.
- Forgot the only admin password? Stop the server, open `server/data/db.json`, set `"users": []` and `"sessions": {}`, and start again: the setup screen comes back and sales are kept. On MongoDB, delete all documents in the `users` and `sessions` collections instead.

## Develop

Run these in two terminals:

```
npm run dev:server   # API on port 3000, restarts on changes
npm run dev:client   # React dev server on port 5173 with hot reload
```

Then open http://localhost:5173.

## Using the register

- **Sell**: tap items, press Charge, choose Cash (with change calculator) or GCash (optional reference number). A recorded sale shows the order number and the change to give. Order numbers restart at 1 each day.
- **Queue**: every recorded sale waits here, oldest first, with its order number, items and waiting time. Tap **Served** when the food is handed over, or **Cancel order** (two taps) if the customer backs out: that voids the sale, puts the stock back and reminds you how much to refund. A cancelled order can be brought back with Restore in the Sales tab. Recently served orders stay listed below with an Undo. The tab shows how many orders are waiting, and it updates live on every device. Cashiers see only their own orders here; an admin login sees the whole booth's queue.
- **Sales**: totals for any day split by cash and GCash, sales per item, the order list with Void/Restore, and Export CSV. Admins also get **Delete** (two taps), which removes an order completely, for test sales or duplicates; its stock goes back unless it was already voided. Use Void for real sales that were refunded, so they stay on record.
- **Menu**: add, edit, hide or delete items. Stock is optional per item; it goes down with each sale and comes back when an order is voided. Each item can also have **sizes** (each with its own price, e.g. Small ₱40 / Medium ₱55 / Large ₱70), **flavors** (same price) and priced **add-ons**; the cashier picks them when the item is tapped. Sizes, flavors and add-ons share the item's stock.

The first start creates nine sample items with made-up prices. Replace them in the Menu tab.

## Project layout

```
server/index.js     Express API, live updates (server-sent events), serves the built app
server/auth.js      Accounts: password hashing (scrypt), login sessions, role checks
server/store.js     Storage: reads and writes server/data/db.json
client/index.html   Vite entry page
client/src/         React app (App.jsx = login gate, Register.jsx = the register, components/, api.js, utils.js, styles.css)
vite.config.js      Vite config: builds client/ into dist/
```

## Data

All sales and the menu are saved in `server/data/db.json` (created on first run). Back this file up at the end of each day.
Deleting it resets the POS to the sample menu with no sales.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/auth/me` | Who is logged in, and whether first-time setup is needed |
| POST | `/api/auth/setup`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/password` | Create the first admin, log in, log out, change own password |
| GET / POST / PUT / DELETE | `/api/users`, `/api/users/:id` | Manage accounts (admin only) |
| GET | `/api/state` | Menu plus today's orders |
| GET | `/api/orders?day=YYYY-MM-DD` | Orders for one day |
| POST | `/api/orders` | Record a sale `{ items:[{id,qty}], pay, tendered, ref }` (cashier comes from the login) |
| PATCH | `/api/orders/:id` | Void or restore `{ voided }`, or move through the queue `{ status: "pending" \| "done" }` |
| POST / PUT / DELETE | `/api/menu`, `/api/menu/:id` | Manage menu items (admin only) |
| GET | `/api/export?day=YYYY-MM-DD` | Download the day's sales as CSV |
| GET | `/api/events` | Event stream that tells open registers to refresh |

Every route except `/api/auth/me`, `setup`, `login` and `logout` needs a logged-in user.

Prices come from the server's menu when a sale is recorded, and money is added up in whole centavos.
Days and times use the Asia/Manila time zone.

## Notes

- Passwords are stored only as salted scrypt hashes, and the login cookie is HttpOnly. The server uses plain HTTP, though, so passwords cross the Wi-Fi unencrypted: use a hotspot or Wi-Fi you control, and do not reuse a password from another account.
- `legacy-claude-artifact/` holds the earlier single-page version that only runs inside Claude.
