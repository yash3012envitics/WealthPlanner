# WealthPlanner

Personal portfolio management for **insurance**, **stocks / mutual funds**, **property**, and **liabilities** — with a live **net worth** view and **renewal / payment alerts**.

## Stack

| Layer | Tech |
|-------|------|
| Backend | Python · FastAPI · SQLAlchemy · SQLite · JWT |
| Web | React · Vite |
| Mobile | React Native · Expo |

## Features

- Track health, term, life, auto, home, and other insurance policies
- Track stocks, mutual funds, ETFs, and bonds
- **Edit any portfolio record** from web and mobile
- **Attach documents** (policy PDFs, sale deeds, statements, KYC, etc.) to insurance, investments, property, and liabilities
- **Recurring premiums / SIPs / EMIs** — set frequency + term; the system auto-creates every installment child and notifies before each due date
- **Sync equity from Zerodha Kite and mutual funds from Coin** (Kite Connect)
- Track property and loans/liabilities
- **Other assets** — gold, silver, fixed deposits, cash, home payments, PPF/EPF/NPS, crypto, and custom types (included in net worth)
- **Live India gold & silver prices** (INR spot) with one-click refresh of holdings by quantity × purity
- **Cashflow** — fixed monthly income/expense defaults, plus optional per-month amounts (plan uses month values when set, otherwise defaults)
- **Net worth target** — amount + date goal on its own screen
- **Wealth plan** — suggests monthly spend and how much more/less to invest vs current SIPs, with a month-by-month schedule
- Live net worth = investments + property + other assets − liabilities
- Automatic alerts for insurance renewals, liability dues, and installment occurrences
- Background renewal/installment scan every 6 hours on the API
- Optional scheduled Kite/Coin re-sync (requires a valid daily access token)
- Optional scheduled gold/silver revaluation (default every 6 hours)

## Project layout

```
WealthPlanner/
  backend/   FastAPI API
  web/       React web app
  mobile/    React Native (Expo) app
```

## Quick start

### 1. Backend

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
python -m app.seed
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API docs: http://127.0.0.1:8000/docs

**Demo login**


- Email: `urvi@wealthplanner.app` (empty account) · Password: `Envitcs@123`

### 2. Web app

```bash
cd web
npm install
npm run dev
```

Open http://127.0.0.1:5173

### 3. Mobile app

```bash
cd mobile
npm install
npx expo start
```

- iOS Simulator / web: API already points to `http://127.0.0.1:8000`
- Android emulator: change `API_BASE` in `mobile/src/api.js` to `http://10.0.2.2:8000`
- Physical device: use your computer’s LAN IP, e.g. `http://192.168.1.10:8000`

## Net worth formula

```
Net Worth = Σ(investment qty × current price)
          + Σ(property current value)
          − Σ(liability outstanding)
```

Insurance sum assured is **coverage**, not a liquid asset, so it is shown on the dashboard but not added to net worth.

## Zerodha Kite + Coin sync

Coin mutual funds and Kite equity holdings both use **Kite Connect**.

1. Create an app at [developers.kite.trade](https://developers.kite.trade/)
2. Set the app redirect URL to something like `http://127.0.0.1:5173/investments`
3. Copy `backend/.env.example` → `backend/.env` and fill `KITE_API_KEY` / `KITE_API_SECRET` (optional; you can also paste keys in the web UI)
4. Install the new dependency: `pip install -r requirements.txt`
5. Restart the API
6. In the web app → **Investments**:
   - Save API key/secret
   - Open Kite login
   - After redirect, complete session (request token is picked up automatically when possible)
   - Click **Sync now**

### What gets imported

| Source | API | Stored as |
|--------|-----|-----------|
| Kite equity holdings | `GET /portfolio/holdings` | `source=kite` stocks/ETFs |
| Coin mutual funds | `GET /mf/holdings` | `source=coin` mutual funds |
| Coin SIPs | `GET /mf/sips` | Recurring SIP plans + installment dues (this/next month on dashboard) |
| Coin MF orders | `GET /mf/orders` | Marks recent (~7 day) SIP payments as paid |

Synced holdings are upserted by `(source, external_id)` and removed if they disappear from Zerodha. Manual holdings are left untouched. SIP plans use `source=coin` + Coin `sip_id`.

**Note:** Kite Connect does **not** expose full mutual-fund purchase history. Monthly SIP amounts and due dates come from active SIPs (`mf_sips`); recent orders help mark the latest payment paid.

### Important

- Kite `access_token` expires around **6 AM IST** every day — re-login when sync starts failing
- Never put `api_secret` in the mobile app; keep it on the backend only
- Portfolio APIs are free on Kite Connect’s current plan for holdings/account management

### API routes

- `POST /api/kite/credentials` — save api_key + api_secret
- `POST /api/kite/credentials/from-env` — load keys from `.env`
- `GET /api/kite/login-url` — Zerodha login URL
- `POST /api/kite/session` — `{ "request_token": "..." }`
- `POST /api/kite/sync` — pull Kite + Coin into investments
- `GET /api/kite/status` — connection / last sync
- `DELETE /api/kite/session` — disconnect

## Live gold & silver (India / INR)

WealthPlanner can price gold and silver holdings from live **INR spot** quotes:

1. Add a gold/silver asset with **quantity** (grams, kg, or tola) and gold **purity** (24K / 22K / 18K).
2. On **Other assets**, click **Refresh gold / silver** — current value becomes `qty × ₹/gram × (karat/24)`.
3. Optional background refresh every `METALS_AUTO_REFRESH_HOURS` (default 6).

| Env | Purpose |
|-----|---------|
| `GOLD_API_KEY` | Optional [GoldAPI.io](https://www.goldapi.io/) key for more reliable quotes |
| `METALS_AUTO_REFRESH_HOURS` | Scheduled revaluation (0 to disable) |
| `METALS_CACHE_SECONDS` | In-memory price cache (default 300) |

Without a key, WealthPlanner uses **international USD spot × live USD/INR** (works without signup). These are **spot** prices in INR — jeweller making charges / GST / local premiums are not included.

### API routes

- `GET /api/assets/metals/prices` — live gold/silver INR quotes
- `POST /api/assets/metals/refresh` — revalue your gold/silver assets

## Attachments (documents)


Upload and download files linked to any portfolio record:

| Entity | `entity_type` value |
|--------|---------------------|
| Insurance | `insurance` |
| Investment | `investment` |
| Property | `property` |
| Liability | `liability` |

- `GET /api/attachments?entity_type=insurance&entity_id=1`
- `POST /api/attachments` — multipart form: `entity_type`, `entity_id`, `file`, optional `title` / `notes`
- `GET /api/attachments/{id}/download`
- `PATCH /api/attachments/{id}` — update title/notes
- `DELETE /api/attachments/{id}`

Allowed types: PDF, images, Office docs, CSV, TXT, ZIP (max 15 MB). Files are stored under `backend/uploads/`.

On web and mobile, open any record with **Edit** to update fields and manage its documents.

## Recurring installments (premiums / SIPs / EMIs)

Create a **master plan** with frequency and term; the API generates every **child installment** between start and end.

Examples:
- Term plan: yearly premium, `term_years=10` → 10 child premium dues
- Mutual fund SIP: monthly, `term_years=10` (or `total_installments=120`) → 120 SIP children
- Home loan EMI: monthly for loan tenure

### API

- `GET /api/recurring/plans`
- `POST /api/recurring/plans` — body includes `frequency`, `installment_amount`, `start_date`, and one of `term_years` / `total_installments` / `end_date`
- `GET /api/recurring/plans/{id}` — includes all child installments + summary
- `PUT /api/recurring/plans/{id}` — updates schedule and regenerates unpaid children
- `POST /api/recurring/plans/{id}/regenerate`
- `PATCH /api/recurring/installments/{id}` — mark `paid` / `skipped` / `pending`
- `GET /api/recurring/installments?upcoming_days=30`

Notifications (`installment_due`) are created automatically for dues in the next 30 days.

Web: **Recurring** page, plus panels inside Insurance / Investments / Liabilities edit modals.  
Mobile: **Recurring** tab.

## Main API routes

- `POST /api/auth/register` · `POST /api/auth/login` · `GET /api/auth/me`
- `GET/POST /api/insurance` · renewals via `GET /api/insurance/upcoming`
- `GET/POST /api/investments`
- `GET/POST /api/properties`
- `GET/POST /api/liabilities`
- `GET /api/networth` · `GET /api/dashboard`
- `GET /api/notifications` · `POST /api/notifications/refresh`

## Notes

- SQLite database file is created at `backend/wealthplanner.db`
- Change `secret_key` in `backend/app/config.py` before any real deployment
- Web CRUD screens can add/delete portfolio items; mobile focuses on viewing net worth, policies, holdings, and alerts
