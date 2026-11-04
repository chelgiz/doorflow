# DoorFlow

DoorFlow is a mobile-first entrance-door storefront and operations platform
foundation for independent retailers and retail chains.

## Run locally

Requirements: Node.js 20.9 or newer and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The home page and catalog
work without a database or external service. Demo mode is enabled by default.
Demo product names, specifications, and prices are invented placeholders,
marked `DEMO`, not an offer for sale, and cannot be ordered.

## PostgreSQL and migrations

```bash
cp .env.example .env
npm run db:local:up
npm run db:validate
npm run db:migrate
npm run db:generate
```

The local Compose database binds to loopback and uses development-only
credentials. Never expose or reuse them outside local development. The
database is not populated with store, catalog, or customer data.

## Admin and production catalog

Configure `DATABASE_URL`, `DOORFLOW_DEMO_MODE=false`, and run the interactive
owner bootstrap:

```bash
npm run admin:create
```

The command prompts for the initial store name/slug, owner email, and password.
It creates a non-demo store and Argon2id-hashed owner credential. Set the
printed `DOORFLOW_STORE_ID` in the server environment and restart the app.
Sign in at `/admin/login`. Keep demo mode enabled until verified store catalog
and pricing information is entered and reviewed. Production public pages show
only published records from the configured non-demo store.

Roles currently implemented are owner, administrator, manager, measurer, and
installer. Employee accounts can only be created/managed by the owner from
`/admin/users`. Measurers and installers see only tasks assigned to their own
account. Managers and administrators can schedule or assign tasks.

Owners and administrators can manage the public storefront identity, homepage
content, and color theme at `/admin/storefront`. Changes are stored as a draft;
only publishing makes them visible to public visitors. The editor uses fixed,
validated content fields and uploaded local logo/banner assets, not arbitrary
HTML or CSS. Apply the database migrations before using this section. The
draft, preview, publication, and live-update flow still requires verification
against a dedicated PostgreSQL test database before pilot use.

From a lead detail page, staff can schedule a measurement, create an order
from an order inquiry, and add an internal note or a manually recorded call or
message. Orders keep the saved quote/configuration snapshot from the inquiry;
later catalog changes do not change that snapshot. Discounts, costs, and
prepayments are entered in rubles in the UI and converted to integer kopecks
before the server request. An unknown cost remains unknown; gross profit is
not shown when the cost was not entered. Additional payments are immutable
ledger entries, and the remaining balance is recalculated by the server.

Orders can have an assigned installation with scheduled date/time, installer,
status, result, and comments. Communication entries describe actions staff
recorded manually; DoorFlow does not place calls or send messages. Operational
status and scheduling changes are recorded in an append-only database audit
log. Financial order snapshots and payment records cannot be updated/deleted
through normal application routes, and database guards prevent deletion or
mutation of those records.

`POST /api/quotes` validates product/option/service identifiers and quantities,
then calculates prices on the server. `POST /api/leads` validates
measurement/order requests, records explicit consent and UTM/source fields,
recalculates order prices server-side, and persists the lead with status
history. Personal-data submission requires a real non-demo store, database
configuration, an HTTPS privacy notice URL, and a consent notice version.

## Verify

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

The PostgreSQL integration test requires `DOORFLOW_TEST_DATABASE_URL` pointed
at a local test database. It creates uniquely scoped test records and cleans
them up. Do not point it at a production database.

Storefront personalization adds migrations under `prisma/migrations` and is
covered by a PostgreSQL integration test. Set `DOORFLOW_TEST_DATABASE_URL` to
a dedicated local test database to execute that test; without it, Vitest skips
the database-dependent scenario. Never use a production database for tests.

## Commercial launch blockers

This is not yet approved for commercial production. Production still requires
verified store catalog/pricing data, a legal/152-FZ review, documented
retention, deployment-specific security verification, a matching-version
encrypted offsite backup/restore drill, monitoring, and review of proxy-based
abuse controls. Baseline image upload, lead throttling, idempotency, and
deployment templates exist, but do not replace production configuration or
independent review. Measurement, order, and installation workflows are
implemented; delivery, stock/purchasing, refunds, accounting reconciliation,
analytics, and external integrations remain unimplemented. Order cost is
manually provided and does not yet include a structured cost model for every
option or service. No integrations are simulated.

## Project documents

- [Project overview](./PROJECT.md)
- [Roadmap](./ROADMAP.md)
- [Architecture](./ARCHITECTURE.md)
- [Security](./SECURITY.md)
- [Deployment](./DEPLOYMENT.md)
- [Backup and restore](./BACKUP.md)
- [Commercial readiness](./COMMERCIAL_READINESS.md)
