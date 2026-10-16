# PrintPress — Enterprise Management System

A full-stack front-desk and billing application for a printing press. Staff sign in at a single URL and manage customers, orders, GST tax invoices, payments, inventory and reports from one portal.

The app has exactly **two roles**:

| Role | Access |
|------|--------|
| **Admin** | Everything, including user management, system settings, invoice cancellation, order deletion and historical data import. |
| **Accountant** | Front desk: customers, orders, bills, payments, inventory, reports and the size rate card. |

- **Backend:** Node.js + Express + PostgreSQL (`pg`) + JWT + pdfkit
- **Frontend:** React 19 + Vite 6 + MUI v7 + React Router 7 + Recharts

### Features

- **Customers**: search, duplicate prevention and per-customer order/payment history.
- **Orders**: one-step create-and-invoice, attached design files, comments, edit and admin-only delete (which also removes the uploaded files).
- **GST tax invoices**: race-free sequential numbering per financial year (`TMP/0001/26-27`; the prefix is configurable), CGST/SGST/IGST split, amount in words and a downloadable bill PDF.
- **Payments**: full and partial payments, optional proof uploads, and received/unpaid/outstanding views.
- **Inventory**: a group → category → type taxonomy, stock consume/adjust and usage history.
- **Reports**: summary dashboard plus order export as CSV, Excel or PDF.
- **Historical import** (admin): customers, orders, payments and inventory. Every row is validated in a dry run before anything is written.
- **Settings**: company details, payment accounts with a QR image, and a size rate card.

---

## ⚠️ Prerequisites (please read first)

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Node.js** | **18 LTS or newer (20 LTS recommended)** | Runs the Express API *and* builds the React frontend (Vite 6, React 19). Node 14/16 will not work. |
| **PostgreSQL** | 13+ | A running PostgreSQL server you can connect to. |
| **npm**     | 9+ | Ships with Node 18+. |

> Check your version with `node -v`. If it prints `v14.x` or `v16.x`, install Node 20 LTS from <https://nodejs.org> (or use `nvm`) before continuing.

---

## Project structure

```
Press 1234/
├── Dockerfile                   # single production image (SPA + API)
├── docker-compose.yml           # PostgreSQL + app
├── .github/workflows/           # ci.yml, cd.yml
├── backend/                     # Express REST API (port 5000)
│   ├── src/
│   │   ├── app.js               # Express app (middleware, routes, SPA hosting)
│   │   ├── server.js            # HTTP bootstrap + graceful shutdown
│   │   ├── config/              # env config, pg pool, winston logger
│   │   ├── constants/           # roles, order-status state machine
│   │   ├── middleware/          # auth, validation, upload, error handler
│   │   ├── utils/               # ApiError, jwt, GST, financial year, invoice numbers…
│   │   ├── validators/          # express-validator rule sets
│   │   ├── services/            # business logic (thin controllers call these)
│   │   ├── controllers/         # request/response only
│   │   ├── routes/              # one router per domain + index aggregator
│   │   ├── helpers/             # taxInvoice (bill PDF), reportExport (CSV/Excel/PDF)
│   │   └── database/            # schema.sql, migrate.js, seed.js
│   ├── scripts/                 # verify.mjs, e2e.mjs, inspect-db.mjs
│   ├── public/                  # built SPA served by Express (npm run build:server)
│   ├── uploads/                 # uploaded files (design files, payment proofs, QR)
│   ├── web.config               # Azure App Service (Windows / iisnode)
│   └── .env                     # DB + JWT config (copy from .env.example)
│
└── frontend/                    # React portal (Vite dev server on port 3001)
    ├── scripts/check-imports.mjs
    └── src/
        ├── main.jsx / App.jsx   # entry + router
        ├── theme/               # MUI theme
        ├── config/              # roles, labels, statuses, menus
        ├── context/             # AuthContext
        ├── services/            # axios instance + per-domain API modules
        ├── components/          # layout, routing guards, common UI
        ├── utils/               # formatting, date ranges
        └── pages/               # Dashboard, Customers, Orders, OrderForm, Bills,
                                 #   Payments, Inventory, Reports, Profile,
                                 #   admin/Users, admin/Settings
```

### Why this structure (production notes)

- **Layered backend** — `routes → controllers → services → database`. Controllers stay thin; all business rules live in services and are independently testable.
- **Consistent API envelope** — every response is `{ success, message, data, meta? }`, and every error flows through one central error handler returning `{ success:false, message, details? }`.
- **Validation at the boundary** — `express-validator` rule sets guard each mutating route; a single `validate()` middleware turns failures into `422`s.
- **Order state machine** — status transitions are enforced by an allow-list (`constants/orderStatus.js`) so an order can never jump to an invalid state.
- **Atomic invoice numbering** — an `invoice_sequences` counter is incremented with one UPSERT inside the order transaction, so numbers are never reused or duplicated.
- **Calendar-safe dates** — PostgreSQL `DATE` columns are returned as `YYYY-MM-DD` strings, so invoice dates never shift with the timezone.
- **Security** — helmet, CORS allow-list, rate limiting, bcrypt password hashing, parameterized SQL everywhere, JWT auth, role guards on the backend (not just hidden menu items) and CSV formula-injection escaping in exports.

---

## 1) Backend setup (Node.js + Express)

```powershell
cd backend
npm install
```

Create `backend/.env` by copying `.env.example`, then set your PostgreSQL credentials:

```
NODE_ENV=development
PORT=5000
DB_HOST=127.0.0.1     # use 127.0.0.1, not "localhost", to avoid IPv6 refusals on Windows
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_postgres_password
DB_NAME=printpress
JWT_SECRET=change_me_to_a_long_random_string
JWT_EXPIRES_IN=7d
UPLOAD_DIR=uploads
MAX_FILE_SIZE_MB=10
```

Optional variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `DB_SSL` / `DB_SSL_REJECT_UNAUTHORIZED` | `false` / `true` | TLS for managed PostgreSQL (Azure, RDS, Neon…) |
| `DB_CONNECTION_LIMIT` | `10` | Pool size |
| `CORS_ORIGINS` | `localhost:3001-3008, 5173, 5174` | Comma-separated allow-list |
| `RATE_LIMIT_WINDOW_MINUTES` / `RATE_LIMIT_MAX` | `15` / `300` | API rate limit |
| `CLIENT_DIST_DIR` | `public` | Folder of the built SPA served by Express |

In production, `JWT_SECRET` and `DB_PASSWORD` are required. The server refuses to start without them.

Apply the schema and seed demo data (`migrate` creates the database if it does
not exist and applies the idempotent upgrade steps):

```powershell
npm run migrate      # create DB + tables + upgrades
npm run seed         # demo users, customers, categories, inventory, sample orders + payments
```

Start the API:

```powershell
npm run dev          # nodemon on :5000
npm start            # single run
# or, without dotenv lookup from the cwd:
node --env-file=.env src/server.js
```

The API runs at **http://localhost:5000** — health check: `GET http://localhost:5000/api/v1/health`.

---

## 2) Frontend setup

```powershell
cd frontend
npm install
npm run dev
```

Open **http://localhost:3001**. The Vite dev server proxies `/api` and `/uploads` to the backend on port 5000, so you only interact with one origin. Point the proxy at another backend with `VITE_API_TARGET` (full URL) or `BACKEND_PORT`.

To have Express serve the UI itself (no Vite dev server), build the SPA into `backend/public`:

```powershell
npm run build:server   # then open http://localhost:5000 and hard-refresh (Ctrl+F5)
```

The bundle in `backend/public` is prebuilt, so frontend source changes are not visible on port 5000 until you rebuild.

---

## 3) Login credentials

All demo accounts use the password **`password123`**.

| Role       | Email                        |
|------------|------------------------------|
| Admin      | `admin@printpress.com`       |
| Accountant | `accountant@printpress.com`  |

There is no self-registration. Admins create staff accounts on the **Users** page. Change the demo passwords before going live.

> Upgrading from an older version? The migration **deactivates** accounts that still hold a retired role (manager, billing staff, designer, operator, delivery, customer) rather than deleting them, so history keeps its references.

---

## Order lifecycle

```
new ──► billed ──► completed
  │        │
  └────────┴──► cancelled
```

- **new**: a draft with no invoice yet.
- **billed**: the tax invoice has been issued (`<PREFIX>/<NNNN>/<FY>`, e.g. `TMP/0001/26-27`). Numbering restarts at 1 every financial year (April–March).
- **completed**: the job is closed out. It can be reopened to `billed`.
- **cancelled**: terminal. Only an admin can cancel an issued invoice. The status change and its audit comment are saved together in one transaction.

Payment status (`unpaid` / `partial` / `paid`) is tracked separately from the order status.
Production type (`offset` / `digital`) and priority are descriptive only and are printed on the order and invoice.
Orders created by the earlier production workflow (`printing`, `delivered`, …) still display correctly but can only be closed out.

---

## API surface (v1)

Base URL: `/api/v1` (a `/api` alias is also mounted for convenience).

| Area | Routes |
|------|--------|
| Health | `GET /health` |
| Auth | `POST /auth/login`, `GET/PATCH /auth/me`, `PATCH /auth/change-password` |
| Orders | `GET/POST /orders`, `GET/PUT /orders/:id`, `PATCH /orders/:id/status`, `POST /orders/:id/comments`, `POST /orders/:id/files`, `DELETE /orders/:id` *(admin)* |
| Finance | `GET /finance/{invoices,outstanding,bills,financial-years}`, `GET /finance/invoices/:id`, `GET /finance/orders/:id/bill.pdf`, `POST /finance/orders/:id/cancel` *(admin)* |
| Payments | `GET/POST /payments`, `GET /payments/unpaid` |
| Customers | `GET/POST /customers`, `GET /customers/search`, `GET/PUT /customers/:id`, `DELETE /customers/:id` *(admin)* |
| Employees *(admin)* | `GET/POST /employees`, `GET/PUT /employees/:id`, `PATCH /employees/:id/active` |
| Categories | `GET /categories`; `POST/PUT/DELETE /categories[/:id]` *(admin)* |
| Inventory | `GET/POST /inventory`, `PUT/DELETE /inventory/:id`, `POST /inventory/:id/{consume,adjust}`, `GET /inventory/{taxonomy,usage}`, `POST/PUT/DELETE /inventory/{groups,categories,types}[/:id]` |
| Dashboards | `GET /dashboard/admin`, `GET /dashboard/accountant` |
| Reports | `GET /reports/summary`, `GET /reports/export?format=csv\|excel\|pdf` |
| Settings | `GET /settings`, `PUT /settings` *(admin)*, `GET /settings/payment`, `PUT /settings/payment-accounts` *(admin)*, `POST /settings/payment-qr` *(admin)*, `GET/PUT /settings/size-rates` |
| Notifications | `GET /notifications`, `PATCH /notifications/read-all`, `PATCH /notifications/:id/read` |
| Import *(admin)* | `GET /import/batches`, `GET /import/template/:entity`, `POST /import` (entities: `customers`, `orders`, `payments`, `inventory`) |

Every route except `/health` and `/auth/login` requires `Authorization: Bearer <token>`.

---

## Deployment (Docker) & CI/CD

The app is deployed as **a single service**: the root `Dockerfile` builds the SPA
and copies it into the Express image, which then serves the UI, the REST API and
`/uploads` on one port — no separate frontend host and no CORS configuration.

**One-command full stack** (PostgreSQL + single Node container):

```powershell
docker compose up -d --build
```

- App: http://localhost:3001 (UI at `/`, API at `/api/v1`, media at `/uploads`).
- The image applies the schema on start and, by default, seeds demo data (`SEED_ON_START=true`).

**Without Docker** (any Node host: VPS, Render, Railway, Azure App Service…):

```powershell
cd frontend; npm ci; npm run build:server   # emits backend/public
cd ..\backend; npm ci --omit=dev; npm start # serves SPA + API on $PORT
```

Express serves `backend/public` automatically when that folder contains an
`index.html`; unknown non-`/api` paths fall back to the SPA for client-side
routing. Override the location with `CLIENT_DIST_DIR` if needed.

**Azure App Service (Windows)**: `backend/web.config` routes every request through
iisnode to `src/server.js`, and `PORT` may be a named pipe. Set `DB_SSL=true` for
Azure Database for PostgreSQL.

The `frontend/Dockerfile` + `frontend/nginx.conf` and `backend/Dockerfile` are kept only for the optional
split deployment (SPA behind nginx, API elsewhere).

**CI** (`.github/workflows/ci.yml`) runs on every push/PR to `main`/`master`:
- Backend: `npm ci`, `migrate`, `seed`, then smoke checks (health, admin login, dashboard, orders) against a PostgreSQL 16 service container.
- Frontend: `npm ci`, lint (non-blocking) and a production `build`.

**CD** (`.github/workflows/cd.yml`) runs on push to `main`/`master` and on `v*` tags. It builds the single root `Dockerfile` image and pushes it to `ghcr.io/<owner>/<repo>/app`. To auto-deploy over SSH (`docker compose pull && up -d`), set the repo variable `ENABLE_DEPLOY=true` and the secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` and `DEPLOY_PATH`.

---

## Troubleshooting

- **`SyntaxError: Unexpected token '||='` or Vite/the API fails to start** → you're on Node 14/16. Upgrade to Node 18+ (20 LTS recommended).
- **`ECONNREFUSED` / `password authentication failed` on migrate** → check that PostgreSQL is running and that `DB_USER`/`DB_PASSWORD` are correct. Use `DB_HOST=127.0.0.1` (on Windows `localhost` may resolve to IPv6 `::1` and be refused).
- **`column ... does not exist` (or similar)** → run `npm run migrate` again; it applies the idempotent upgrades to an existing database.
- **UI changes not showing on port 5000** → the backend serves the prebuilt `backend/public`. Run `npm run build:server` in `frontend/` and hard-refresh, or use the Vite dev server on 3001.
- **CORS error in the browser** → the frontend origin must be in `CORS_ORIGINS` (defaults already cover ports 3001–3008, 5173, 5174). Same-origin requests are always allowed.
- **401 loops** → the JWT expired; the app auto-redirects to `/login`. Log in again.

---

## Scripts reference

**Backend**

| Script | Action |
|--------|--------|
| `npm run dev` | Start with auto-reload |
| `npm start` | Start once |
| `npm run migrate` | Create DB + tables + apply upgrades |
| `npm run migrate:fresh` | Drop + recreate the database |
| `npm run seed` | Seed demo data |
| `npm run db:reset` | Drop + recreate + seed |
| `node scripts/verify.mjs` | Static import check + business-logic checks (no DB needed); writes a sample tax-invoice PDF |
| `node scripts/e2e.mjs` | End-to-end flow against a running API (`API_BASE`, default `http://localhost:5000/api/v1`) |
| `node scripts/inspect-db.mjs [db]` | Read-only snapshot of a database (row counts, roles, invoice formats) |

**Frontend**

| Script | Action |
|--------|--------|
| `npm run dev` | Vite dev server (port 3001) |
| `npm run build` | Production build to `frontend/dist` |
| `npm run build:server` | Production build to `backend/public` (served by Express) |
| `npm run preview` | Preview the build |
| `npm run lint` | ESLint |
| `node scripts/check-imports.mjs` | Verify every local import resolves |
