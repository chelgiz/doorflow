# DoorFlow architecture

## Current application

DoorFlow is a standalone Next.js App Router application. Demo mode is isolated
from the production store catalog, while quotes, leads, and admin operations
use validated commerce logic and PostgreSQL persistence.

- `app/` owns route composition and metadata; `components/` contains reusable
  presentation components.
- `lib/products.ts` provides typed, visibly demo-only catalog fixtures.
  Production storefront routes load published, non-demo products from the
  configured store. Generic local SVGs are not supplier photography.
- `lib/commerce/` defines extensible door specifications, configurable options,
  pricing rules, quote calculation, and lead validation. Prices use integer
  minor units; client requests submit option/service identifiers and
  quantities, never authoritative prices.
- `app/api/quotes/route.ts` validates requests and returns server-calculated
  quotes from demo fixtures or store-scoped Prisma records.
- `app/api/leads/route.ts` validates consent and UTM/source data, recalculates
  order prices on the server, and saves the lead with its configuration and
  status history.
- `prisma/schema.prisma` and migrations define stores, products,
  manufacturer-specific specifications, option groups, pricing rules, leads,
  admin users/sessions/login throttles, store locations, measurements, orders,
  order payments, installations, customer activities, and operational audit
  records.
- `lib/admin/` implements Argon2id password helpers, database-backed sessions,
  login throttling, role/permission checks, request schemas, page guards, and
  shared append-only operation audit writes.
  Protected API handlers enforce permissions server-side; mutation routes
  require a same-origin `Origin` header.
- `app/admin/` and `components/admin/` provide protected catalog/options,
  manufacturer, pricing/service, lead, store-settings/location, and
  owner-managed staff workspaces. `/admin/storefront` lets owners and
  administrators edit fixed identity, homepage, and theme fields as a private
  draft, preview them, and publish explicitly. Lead pages schedule measurements
  and create orders; order pages record payments and schedule installations;
  field staff receive task-only screens.
- The `Storefront` row stores separate validated draft/published JSON
  configurations. Public pages, metadata, and the same-origin theme stylesheet
  read only published configuration. Publication invalidates the
  store-specific cache; content edits do not require a Next.js rebuild.
  Uploaded logo/banner assets remain private until referenced by published
  configuration. This flow has not yet been verified against a dedicated
  PostgreSQL test database.
- `lib/admin/customer-history.ts` groups inquiries, lead status changes,
  measurements, orders, and manually recorded communications by store-scoped
  normalized phone variants.
- `scripts/create-admin.ts` interactively creates the initial non-demo store
  and owner. Passwords are not printed or stored in plaintext.
- `components/door-configurator.tsx` and `components/lead-request-form.tsx`
  provide the client interfaces. Demo products show illustrative calculations
  but cannot create orders.
- Shared responsive storefront/admin styles live in `app/globals.css`;
  Radix UI Dialog provides keyboard-accessible mobile navigation.

Demo prices, specifications, and stock labels are placeholders and must never
be presented as store facts.

## Module boundaries

Keep dependencies flowing inward:

1. **Presentation** — Server-rendered public and admin routes; client
   components only for interactions that need browser state.
2. **Application services** — Use cases for catalog, quote calculation, leads,
   measurements, installations, and analytics.
3. **Domain** — Door specifications, configurable pricing rules, CRM statuses,
   and access policy; independent of UI and persistence.
4. **Infrastructure** — Prisma repositories, authentication, file storage,
   messaging, and verified external API adapters.

Validate untrusted input at server boundaries with Zod. Keep pricing and
permission decisions on the server. Do not have UI components query Prisma
directly or treat hidden controls as authorization.

## Data and deployment

The first production deployment can use one database per store. Store-owned
catalog, pricing, lead, employee, and location records are scoped to a `Store`.
Admin access additionally requires an explicitly configured non-demo store and
an active employee session. This is a SaaS foundation, not a complete
multi-tenant deployment.

PostgreSQL is managed through Prisma migrations. Manufacturer-specific
specifications are extensible JSON validated before quote use; option groups
and pricing rules remain relational. Demo fixtures remain separate from real
database catalog records.

An `Order` is created from an `ORDER` lead and its persisted quote/configuration
snapshot; a unique constraint on `Order.leadId` prevents duplicate conversions
even under concurrent requests. The transaction copies customer/address,
currency, original quote lines, subtotal, discount, total, and the explicitly
entered cost into the order. Snapshots and agreed amounts are protected by a
PostgreSQL trigger from later mutation. Catalog edits therefore cannot rewrite
historical orders. Payments are separate immutable `OrderPayment` ledger
entries; the order's paid and balance aggregates are changed transactionally
with a check constraint enforcing `paid + balance = total`. All money is
integer kopecks in application requests and `BIGINT` in PostgreSQL.

Measurement and installation assignments point only to active employees with
the corresponding role in the current store. Managers can schedule and assign;
measurers/installers may read and update only records assigned to their own
user ID. Assignment is rechecked in the conditional database update to avoid
stale task ownership. Important creates, status transitions, schedule,
assignment, payment, and result changes are written to `OperationAudit`.
Payments, customer activities, and audit entries are append-only; orders,
measurements, and installations cannot be deleted through normal operations.

## Security and operations

Demo mode is the default. Admin sign-in requires `DOORFLOW_DEMO_MODE=false`,
`DATABASE_URL`, and a configured `DOORFLOW_STORE_ID` for a non-demo store.
`npm run admin:create` bootstraps the first owner interactively. Public lead
intake additionally requires an HTTPS privacy notice URL and consent notice
version. The configured store must exist and must not be marked as demo.

Passwords use Argon2id; sessions use opaque random tokens stored only as hashes
in PostgreSQL and are scoped to active users and their store. Owner, admin,
manager, measurer, and installer roles are implemented. Staff management is
restricted to the owner. Managers/admins can manage operational records;
measurer and installer roles have only assigned-task permissions and cannot
read the general lead/order workspaces.

Login failures and public lead limits use atomic PostgreSQL upserts.
Public-lead client identity depends on a reverse proxy that replaces forwarded
IP headers; proxy-level limits should also cover login, quote, and other public
routes. Never expose the application port directly. Baseline security response
headers are set by Next.js; the Nginx deployment template adds TLS, HSTS, and
request limits. A restrictive CSP candidate is currently Report-Only; it must
be reviewed in a staging browser before nonce-based enforcement.

`GET /api/health` is a liveness endpoint only. It reports process availability
without exposing database details and does not check database or backup
readiness. Use external uptime checks plus journald/systemd monitoring.

Image uploads are decoded, size-limited, converted to WebP, and stored as
PostgreSQL `BYTEA`, so database backups include images. `npm run db:backup`
creates and verifies a custom-format dump; production mode requires `age`
encryption and offsite `rsync`. `npm run db:restore` requires a distinct empty
target and never drops or cleans existing objects. See the runbooks for
permissions, key handling, schedules, and recovery verification.

The current readiness report leaves deployment provisioning, real offsite
restore drills, external monitoring, independent security review, nonce-based
CSP enforcement, and legal review as launch gates. No 152-FZ compliance claim
is made. Costs are currently a
manually entered order-level figure rather than a complete per-option/service
cost model. Delivery, stock, refunds, accounting reconciliation, and analytics
are not implemented. No external integrations are implemented. Call/message
timeline entries are manual records, not connected communication services.
Integrations must use verified provider APIs and approved credentials.
