# DoorFlow roadmap

## Stage 1 — Foundation and local app · Complete

- [x] Inspect the environment and check current framework guidance.
- [x] Document the project, roadmap, and architecture.
- [x] Create an isolated Next.js App Router application.
- [x] Implement the responsive storefront shell and home page.

## Stage 2 — Public storefront · Complete

- [x] Build a specialized, explicitly demo-only entrance-door catalog.
- [x] Add client-side text search, category filters, and price sorting.
- [x] Add responsive product cards and model detail pages.
- [x] Load published non-demo catalog records from PostgreSQL when production
  store mode is explicitly configured.
- [ ] Add configurable catalog facets and verified supplier photography.

## Stage 3 — Commercial domain, persistence, and administration · Complete

- [x] Add PostgreSQL/Prisma models for stores, manufacturers, products,
  specifications, option groups, pricing rules, leads, and status history.
- [x] Calculate quotes on the server in integer minor currency units.
- [x] Validate measurement/order requests, consent, and UTM/source capture;
  demo products cannot be ordered.
- [x] Add admin CRUD for products, manufacturers, pricing/services, store
  settings, locations, and publication state.
- [x] Add Argon2id authentication, opaque database sessions, throttling,
  same-origin mutation checks, and owner-managed staff accounts.

## Storefront personalization · In progress

- [x] Add store-scoped draft and published configurations for store identity,
  homepage content, and validated color themes.
- [x] Add the OWNER/ADMIN browser editor, local logo/banner uploads, contrast
  checks, draft preview, and explicit publication.
- [x] Render only published configuration on public pages and serve its theme
  through same-origin CSS without requiring a new application build.
- [ ] Apply migrations and run authorization, publication, and tenant-isolation
  integration tests against a dedicated PostgreSQL test database.
- [ ] Verify owner/admin editing, private draft assets, preview, publication,
  and live storefront updates in a browser.

## Stage 4 — Store operations and customer workflows · Complete

- [x] Schedule/assign measurements, record flexible results and comments, and
  track transitions with assigned-measurer-only task access.
- [x] Create at most one order per order inquiry using its saved quote and
  configuration snapshots, not current catalog prices.
- [x] Store order discounts, explicitly entered/unknown costs, advances,
  payments, and outstanding balances as integer kopecks.
- [x] Protect immutable order snapshots, payment/customer-activity/audit
  append-only records, and prevent deletion of measurements/installations;
  operational edits are captured in the audit history.
- [x] Plan/assign installations, record completion results, and restrict
  installer access to assigned tasks.
- [x] Aggregate inquiry, status, measurement, order, and manually recorded
  communication history by normalized phone number.
- [x] Journal operational status, schedule, assignment, result, and financial
  changes; preserve existing lead status history.
- [x] Verify the request-to-measurement/order-to-payment-to-completed-
  installation journey with PostgreSQL integration tests.

## Stage 5 — Operations expansion and analytics · Planned

- [ ] Add delivery scheduling, stock/inventory, supplier purchasing, and
  richer sales/order workflows.
- [ ] Add measurement documents, customer approvals, signatures, and
  configurable operational checklists.
- [ ] Record real visits, UTM/source attribution, sales metrics, cost coverage,
  and gross-profit analytics without substituting seeded numbers for actual
  data.
- [ ] Define refund/reversal and accounting reconciliation workflows before
  recording those financial events in production.

## Stage 6 — Release readiness · In progress

- [ ] Review personal-data handling against applicable Russian requirements,
  including 152-FZ; define retention, access, and deletion procedures.
- [x] Add bounded/re-encoded image upload/storage, PostgreSQL backup/restore
  scripts, baseline response headers, lead idempotency, atomic login throttling,
  and deployment templates.
- [x] Run a matching-version local PostgreSQL backup/restore drill into a new
  isolated database and verify image bytes/hash.
- [ ] Verify encrypted offsite transfer and restore, then measure recovery
  objectives.
- [ ] Provision and verify production TLS, reverse proxy, firewall, database
  roles, monitoring, alerting, and backup schedule.
- [ ] Complete independent security review; add and validate a nonce-based CSP
  and deployment-specific abuse controls.
- [ ] Verify store catalog, prices, cost inputs, terms, privacy notices, and
  operational processes with each deploying retailer.
- [ ] Implement integrations only against verified provider APIs and approved
  credentials.
- [ ] Obtain legal review of personal-data processing and 152-FZ obligations;
  no legal-compliance claim is made by this roadmap.

Commercial deployment procedures and residual risks are documented in
`SECURITY.md`, `DEPLOYMENT.md`, `BACKUP.md`, and `COMMERCIAL_READINESS.md`.
