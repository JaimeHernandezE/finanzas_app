# Finanzas App

A full-stack personal and family finance app built to replace a Google Sheets + AppSheet setup that became hard to maintain as rules and scenarios grew.

**Live demo** → https://finanzasapp-demo-production.up.railway.app/

> Railway is the primary hosting target for this project. Render remains an optional alternative. See `finanzas_app/docs/DEPLOYMENT-PRODUCTION.md` for current deployment details.

---

## The problem

I had been tracking my family's finances since 2016 — first with a mobile app, then with AppSheet on top of Google Sheets. It worked well until it didn't: adding new categories became painful, credit card installment debt was impossible to model correctly, and the proportional expense-sharing system my wife and I used was held together with spreadsheet formulas.

I knew exactly what I needed. I just needed to build it.

---

## What it does

**For individuals**
- Track personal income and expenses across multiple accounts
- Credit card purchases split into monthly installments, matched to each card's billing cycle
- Personal budget by category with real-time progress indicators

**For families**
- Shared expense tracking with automatic monthly settlement
- Proportional cost-sharing based on each member's income (if one earns 60% of the household income, they pay 60% of shared expenses)
- Each member sees their own data; shared expenses are visible to all

**Other modules**
- Investment tracking (mutual funds) with return calculation
- Trip budgeting: plan by category, track spending in real time
- Daily backup: full `pg_dump` uploaded to a private Google Drive folder + Google Sheets export for analysis

---

## Demo

The demo environment has two users — Jaime and Gloria — with 15 months of realistic fictional data. Switch between them from the sidebar to see how the app looks from each perspective.

> Data resets on every deploy. No real data is ever stored in the demo.

---

## Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11, Django 4, Django REST Framework |
| Database | PostgreSQL |
| Auth | Firebase Authentication (Google Sign-In) |
| Frontend web | React 18, Vite, TypeScript, SCSS Modules |
| Mobile | React Native, Expo, EAS Build |
| Hosting | Railway (primary), Render (optional) |
| CI/CD | GitHub Actions (pytest on push/PR to `main`) |
| Analytics | Umami Cloud (demo only) |

---

## Architecture highlights

**Monorepo** — backend, frontend web, and mobile live in the same repository. A `shared/` package centralizes reusable API clients and hooks (currently used primarily by mobile, with reusable modules for other clients).

**Hybrid calculation strategy** — not everything is computed on the fly. The approach was chosen based on what scales:

- *On-the-fly*: family settlement amounts, budget progress, investment returns, trip spending vs. budget. These depend on a bounded date range and stay fast regardless of history size.
- *Monthly snapshots*: available cash balance. Since cash is an accumulation of all historical income minus all historical expenses, computing it on the fly over years of data would become increasingly expensive. Instead, a snapshot is stored per month. If a past transaction is edited, a Django signal regenerates only the affected month's snapshot — the rest of the history remains untouched and the cash calculation stays lightweight.

**Billing cycle-aware installments** — credit card logic works in two distinct stages:

*Stage 1 — Installment assignment* (`signals.py`, runs when a transaction is created):
- Uses `dia_facturacion` (card closing date) to determine which month each installment belongs to.
- `purchase_day <= dia_facturacion` → first installment falls in the current month.
- `purchase_day > dia_facturacion` → first installment shifts to the following month.
- No `dia_facturacion` set → calendar month used as fallback.

*Stage 2 — Current month debt* (`views.py`, `cuotas_deuda_pendiente`):
- Uses the relationship between `dia_facturacion` and `dia_vencimiento` (payment due date) to determine which billing cycle maps to the current month's payment.
- `dia_facturacion > dia_vencimiento` (e.g. closing 20th, due 7th) → April's payment covers March installments.
- `dia_facturacion <= dia_vencimiento` (e.g. closing 20th, due 30th) → April's payment covers April installments.
- Only installments with `incluir=True` and status `PENDING` or `BILLED` are included.

In short: `dia_facturacion` decides when a purchase falls into the billing cycle. The `dia_facturacion` vs `dia_vencimiento` comparison decides which month's installments are due right now.

**Proportional family settlement** — at month end, shared expenses are split according to each member's declared income for that month. The system calculates who owes whom and how much, computed on the fly from raw transaction data.

**Demo environment** — isolated instance with `DEMO=True`. Firebase is bypassed for demo login, and seeded fictional data is used for product walkthroughs.

---

## Test coverage

Automated tests cover:
- Catalog endpoints (categories, payment methods, cards)
- Transaction creation with automatic installment generation
- Installment rescheduling logic
- Family settlement calculations
- Investment tracking
- Trip budgeting
- Cross-family data isolation

Firebase is mocked in tests, so credentials are not required for local execution.

```bash
cd finanzas_app/backend
docker-compose exec web pytest --tb=short -q
```

---

## Running locally

### Prerequisites
- Docker and Docker Compose
- Node.js 18+
- A Firebase project with Google Sign-In enabled

### Backend

```bash
cd finanzas_app/backend
cp .env.example .env        # fill in your values
docker-compose up -d
docker-compose exec web python manage.py migrate
docker-compose exec web python manage.py seed_categorias
docker-compose exec web python manage.py crear_admin
```

### Frontend web

```bash
cd finanzas_app/frontend
# Create .env manually with your Firebase + API URL values
npm install
npm run dev
```

### Mobile (Android APK)

```bash
cd finanzas_app/mobile
cp .env.example .env
npm install
eas build --platform android --profile preview
```

See [GUIA-EAS-EXPO-REPLICABLE.md](finanzas_app/docs/frontend/GUIA-EAS-EXPO-REPLICABLE.md) for the full EAS setup guide.

### Deploy your own instance

Full deployment instructions (Railway primary + Firebase + GitHub Actions, with optional Render paths):  
→ [docs/DEPLOYMENT-PRODUCTION.md](finanzas_app/docs/DEPLOYMENT-PRODUCTION.md)

---

## Project structure

```
finanzas_app/
├── backend/                  # Django API
│   ├── applications/
│   │   ├── usuarios/         # Auth, family management
│   │   ├── finanzas/         # Transactions, installments, budgets, snapshots
│   │   ├── inversiones/      # Investment funds
│   │   ├── viajes/           # Trip budgeting
│   │   ├── export/           # Google Sheets export
│   │   └── backup_bd/        # PostgreSQL backup to Google Drive
│   └── tests/                # pytest test suite
├── frontend/                 # React 18 + Vite web app
├── mobile/                   # Expo React Native (Android)
└── shared/                   # Reusable API client/hooks package
```

---

## Roadmap

- [ ] Internationalization (i18n) — currently Spanish only, English support planned via react-i18next
- [ ] iOS support
- [ ] Push notifications for settlement reminders
- [ ] Exchange rate integration for multi-currency support

---

## About

Built by [Jaime Hernández](https://www.linkedin.com/in/jhearquitecto/) — architect and full-stack developer focused on digitizing complex real-world processes.

This project started as a personal tool and evolved into an end-to-end product: domain data modeling, REST API design, two client applications, automated testing, CI/CD, and cloud deployment.

If you want to run your own instance, the deployment guide covers database setup, environment variables, and Firebase configuration. The codebase is open. Feel free to fork it, adapt it, or use it as a reference for your own projects.