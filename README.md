# PrintPress — Enterprise Management System

A production-grade, full-stack web application for running a printing-press business. It is a **single unified portal**: every role (admin, manager, accountant, designer, operator, delivery, customer) signs in at the same URL and automatically lands on a dashboard and navigation tailored to their role.

- **Backend:** Node.js + Express + PostgreSQL (pg) + JWT
- **Frontend:** React 19 + Vite + MUI v7 (dark theme, unified portal)

---

## ⚠️ Prerequisites (please read first)

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Node.js** | **18 LTS or newer (20 LTS recommended)** | Runs the Express API *and* builds the React frontend (Vite 5, React 19). Node 14/16 will not work. |
| **PostgreSQL** | 13+ | A running PostgreSQL server you can connect to. |
| **npm**     | 9+ | Ships with Node 18+. |

> Check your version with `node -v`. If it prints `v14.x` or `v16.x`, install Node 20 LTS from <https://nodejs.org> (or use `nvm`) before continuing.

---

## Project structure

```
Press/
├── backend/                     # Express REST API (port 5000)
│   ├── src/
│   │   ├── app.js               # Express app (middleware, routes wiring)
│   │   ├── server.js            # HTTP bootstrap + graceful shutdown
│   │   ├── config/              # env config, mysql pool, winston logger
│   │   ├── constants/           # roles, order-status state machine
│   │   ├── middleware/          # auth, validation, upload, error handler
│   │   ├── utils/               # ApiError, ApiResponse, asyncHandler, jwt…
│   │   ├── validators/          # express-validator rule sets
│   │   ├── services/            # business logic (thin controllers call these)
│   │   ├── controllers/         # request/response only
│   │   ├── routes/              # one router per domain + index aggregator
│   │   ├── helpers/             # pdfGenerator (delivery slips)
│   │   └── database/            # schema.sql, migrate.js, seed.js
│   ├── uploads/                 # uploaded files (screenshots, designs, slips)
│   └── .env                     # DB + JWT config
│
└── frontend/                    # React unified portal (port 3001)
    └── src/
        ├── main.jsx / App.jsx   # entry + unified router
        ├── theme/               # role-accented dark MUI theme
        ├── config/              # roles, colors, labels, menus, statuses
        ├── context/             # AuthContext (login/register/logout)
        ├── services/            # axios instance + per-domain API modules
        ├── components/          # layout (UnifiedLayout), routing, common UI
        └── pages/               # admin / accountant / designer / operator /
                                 #   delivery / customer / shared
```

### Why this structure (production notes)

- **Layered backend** — `routes → controllers → services → database`. Controllers stay thin; all business rules live in services and are independently testable.
- **Consistent API envelope** — every response is `{ success, message, data, meta? }`, and every error flows through one central error handler returning `{ success:false, message, details? }`.
- **Validation at the boundary** — `express-validator` rule sets guard each mutating route; a single `validate()` middleware turns failures into `422`s.
- **Order state machine** — status transitions are enforced by an allow-list (`constants/orderStatus.js`) so an order can never jump to an invalid state.
- **Security** — helmet, CORS allow-list, rate limiting, bcrypt password hashing, parameterized SQL everywhere, JWT auth, and role-based route guards.
- **Feature-based frontend** — per-domain API service modules, a re-themeable unified layout, protected routes, and reusable UI primitives.

---

## 1) Backend setup (Node.js + Express)

```powershell
cd backend
npm install
```

Configure `backend/.env` (copy from `.env.example`). Set your PostgreSQL credentials:

```
DB_HOST=127.0.0.1     # use 127.0.0.1, not "localhost", to avoid IPv6 refusals on Windows
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_postgres_password
DB_NAME=printpress
JWT_SECRET=change_me_to_a_long_random_string
PORT=5000
```

Apply the schema and seed demo data (`migrate` creates the database if it does
not exist and applies the idempotent upgrade steps):

```powershell
npm run migrate      # create DB + tables + upgrades
npm run seed         # demo users, categories, inventory taxonomy, sample orders
```

Start the API:

```powershell
npm run dev          # nodemon on :5000
npm start            # single run
```

The API runs at **http://localhost:5000** — health check: `GET http://localhost:5000/api/v1/health`.

---

## 2) Frontend setup

```powershell
cd frontend
npm install
npm run dev
```

Open **http://localhost:3001**. The Vite dev server proxies `/api` and `/uploads` to the backend on port 5000, so you only interact with one origin.

---

## 3) Login credentials

All demo accounts use the password **`password123`**.

| Role       | Email                        |
|------------|------------------------------|
| Admin      | `admin@printpress.com`       |
| Manager    | `manager@printpress.com`     |
| Accountant | `accountant@printpress.com`  |
| Billing Staff | `billing@printpress.com`  |
| Designer   | `designer1@printpress.com`   |
| Offset Operator  | `offset@printpress.com`  |
| Digital Operator | `digital@printpress.com` |
| Delivery   | `delivery1@printpress.com`   |
| Customer   | `amit@example.com`           |

Customers can also self-register from the login screen (**Create Account** tab).

---

## Order lifecycle

```
new → billed → accountant_approved → [plate_making →] printing
    → ready_for_delivery → out_for_delivery → delivered
```

Also supported: `designing`, `design_approved`, `cutting`, `finishing`,
`on_hold`, `cancelled`, `rejected`.

- **Customer / Designer** places an order → `new` (reference `DRAFT-<id>`)
- **Billing staff** create the bill → `billed`, which assigns the formal Order ID
- **Accountant** reviews the payment (full / partial / rejected) → `accountant_approved`
- **Operator** advances through production → `ready_for_delivery`.
  Offset orders must pass through `plate_making` first; digital go straight to `printing`.
- **Delivery** picks up → `out_for_delivery` → delivers → `delivered`.
  Dispatch is blocked while a balance is due unless the accountant permits it.

---

## API surface (v1)

Base URL: `/api/v1` (a `/api` alias is also mounted for convenience).

| Area | Routes |
|------|--------|
| Auth | `POST /auth/login`, `POST /auth/register`, `GET/PATCH /auth/me`, `PATCH /auth/change-password` |
| Orders | `GET/POST /orders`, `GET /orders/:id`, `PATCH /orders/:id/status`, `PATCH /orders/:id/assign`, `POST /orders/:id/comments`, `POST /orders/:id/files`, `POST /orders/:id/payment-proof` |
| Dashboards | `GET /dashboard/{admin\|accountant\|billing\|designer\|operator\|delivery\|customer}`, `GET /operator/history` |
| Delivery | `GET /delivery/queue`, `GET /delivery/history`, `POST /delivery/:id/out-for-delivery`, `POST /delivery/:id/delivered`, `POST /delivery/:id/slip` |
| Finance | `GET /finance/{invoices,quotations,outstanding,bills,completed}`, `GET /finance/invoices/:id`; `POST /finance/orders/:id/{bill,review,permit-delivery}`, `GET /finance/orders/:id/{quotation,bill}.pdf`; `GET/POST /payments` |
| Catalog | `GET/POST/PUT/DELETE /categories`; `GET/POST/PUT/DELETE /inventory`, `POST /inventory/:id/consume`, `GET /inventory/{taxonomy,usage}`, `POST/PUT/DELETE /inventory/{groups,categories,types}` |
| People | `GET/POST/PUT /customers`, `GET/POST/PUT/PATCH /employees`, `GET /employees/by-role/:role` |
| Misc | `GET /reports/summary`, `GET /reports/export`, `GET/PUT /settings`, `GET /settings/payment`, `PUT /settings/payment-accounts`, `POST /settings/payment-qr`, `GET /notifications`, `PATCH /notifications/read-all`, `GET /design/queue` |

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

The `frontend/Dockerfile` + `frontend/nginx.conf` are kept only for the optional
split deployment (SPA behind nginx, API elsewhere).

**CI** (`.github/workflows/ci.yml`) runs on every push/PR:
- Backend: `npm ci`, `npm run migrate` and API smoke checks against a PostgreSQL service container.
- Frontend: `npm ci`, lint, and a production `build`.

**CD** (`.github/workflows/cd.yml`) on push to `main`/tags builds the backend and frontend Docker images and pushes them to GHCR. To auto-deploy over SSH, set the repo variable `ENABLE_DEPLOY=true` and secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_PATH`.

---

## Troubleshooting

- **`SyntaxError: Unexpected token '||='` or Vite/the API fails to start** → you're on Node 14/16. Upgrade to Node 18+ (20 LTS recommended).
- **`ECONNREFUSED` / `password authentication failed` on migrate** → check that PostgreSQL is running and that `DB_USER`/`DB_PASSWORD` are correct. Use `DB_HOST=127.0.0.1` (on Windows `localhost` may resolve to IPv6 `::1` and be refused).
- **`Unknown column 'production_type'` (or similar)** → run `npm run migrate` again; it applies the idempotent column upgrades to an existing database.
- **CORS error in the browser** → the frontend origin must be in `CORS_ORIGINS` (defaults already cover ports 3001–3008, 5173, 5174).
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

**Frontend**

| Script | Action |
|--------|--------|
| `npm run dev` | Vite dev server (port 3001) |
| `npm run build` | Production build |
| `npm run preview` | Preview the build |
