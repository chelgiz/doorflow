# DoorFlow security notes

## Deployment and support model

The approved first-customer design is one separate DoorFlow application,
PostgreSQL database, set of accounts and secrets, and backup set per store.
Servers and backups are required to be located in the Russian Federation;
updates are prepared centrally and deployed separately to each customer.
**Status: PLANNED.** This design decision is not evidence that installations,
tenant isolation, Russian hosting, backup locations, or customer-by-customer
release and rollback have been implemented or verified. A separate database
does not by itself establish compliance with 152-FZ or prove all access paths
are isolated.

DoorFlow support is not to have permanent access to store leads, orders,
contacts, or other personal data. Temporary access is permitted only with the
store's explicit authorization, a separate account, minimum time and
permissions, logs of logins and actions, and revocation when support ends.
Support must not use store data for DoorFlow's own purposes. **Status:
PLANNED.** The temporary-account, approval, time-scope, audit, and revocation
mechanisms have not been confirmed as implemented. Contracts must define the
actual processing and support arrangement.

The preliminary legal model is that the store determines purposes and legal
bases and generally acts as the personal-data operator. DoorFlow may process
data on the operator's instructions within the actual service and contract; if
DoorFlow uses data for its own purposes, the legal role must be reassessed.
**Status: LEGAL REVIEW REQUIRED.** The parties must review and execute a
processing instruction/contract with conditions required by Article 6(3) of
Federal Law No. 152-FZ. This document does not determine the parties' legal
roles or establish compliance.

## Current controls (IMPLEMENTED)

- Admin passwords are hashed with Argon2id. Opaque random session tokens are
  stored as hashes; cookies are `HttpOnly`, `SameSite=Strict`, and `Secure` in
  production.
- Protected API handlers perform server-side session and role checks. Mutating
  routes validate the request origin. Measurer and installer task access is
  scoped to the assigned employee and store.
- API input is parsed with Zod; quote totals are recomputed server-side using
  integer kopecks. Order and payment snapshots are protected by database
  constraints/triggers and transactional updates.
- Public lead submission uses a database-backed limit keyed by an HMAC of the
  trusted client IP; it does not persist the raw IP. Request and payment
  idempotency keys protect supported write paths.
- Uploaded product and logo images are bounded, decoded, re-encoded as WebP,
  and stored in PostgreSQL. SVG uploads are rejected.
- Server logs avoid request bodies, phone numbers, emails, passwords,
  connection strings, SQL parameters, and raw Prisma errors.
- Application responses add `nosniff`, frame denial, referrer, and browser
  permissions headers. A restrictive candidate CSP is currently sent in
  `Content-Security-Policy-Report-Only`; it does not block the app. Zod's
  runtime JIT is disabled to avoid dynamic `Function`/`eval` in the product
  configurator. A local production-browser check observed Next.js inline
  bootstrap scripts, but no `eval` violations on `/`, `/catalog`, the product
  page, or `/admin/login`. Do not enable enforcement until inline script
  handling and authenticated admin routes are verified in staging. Nonce
  enforcement is not a drop-in change while Cache Components/PPR is enabled.
  The Nginx template is intended to add HTTPS and HSTS; an actual deployment
  has not been verified (**PLANNED**).

## Deployment requirements

1. **PLANNED:** deploy a separate app instance, PostgreSQL database, accounts,
   secrets, and backups for every store. Do not treat `DOORFLOW_STORE_ID` as
   complete shared-database tenant isolation. Verify absence of cross-store
   access on each actual installation.
2. **PLANNED:** place each server and every backup in the Russian Federation.
   The actual region of production server, database, replicas, logs, and backup
   copies is not confirmed. Obtain and retain provider evidence.
3. **PLANNED:** prepare releases centrally, but deploy and verify them
   separately for each customer; document version, migration, rollback, and
   outcome per installation.
4. **PLANNED:** implement the support access procedure described above before
   support personnel can access customer data. Until then, no temporary-support
   mechanism is confirmed.
5. **CLIENT RESPONSIBILITY:** keep `DOORFLOW_DEMO_MODE=true` until a verified non-demo store has been
   created and configured. Public submissions and admin access fail closed
   when their required configuration is missing.
6. **CLIENT RESPONSIBILITY:** use a reverse proxy that drops incoming `X-Forwarded-For` and
   `X-Real-IP` values and sets them from the actual client connection. The
   built-in lead limiter trusts those headers. Do not expose the app port
   directly to the internet.
7. **CLIENT RESPONSIBILITY:** put the app behind HTTPS, keep database ports private, use least-privilege
   database credentials, restrict the environment file to the service account,
   and rotate credentials through an approved operational process.
8. **CLIENT RESPONSIBILITY:** apply proxy-level request limits to login and public API endpoints. The
   database limiter applies to lead submissions; it is not a general WAF,
   bot-management, or DDoS control.
9. **CLIENT RESPONSIBILITY:** encrypt backups, restrict backup access, test restoration
   to an empty separate database, and monitor job completion. See
   [BACKUP.md](./BACKUP.md).
10. **LEGAL REVIEW REQUIRED:** approve the privacy notice and whether/which
    consent applies. **CLIENT RESPONSIBILITY:** publish approved notices over
    HTTPS and do not enable public submissions before that.

## Findings and residual risks

| Severity | Finding | Status | Required action |
|---|---|---|---|
| High | No per-customer production installation, proxy, TLS termination, or offsite backup target is provisioned/verified by this repository. | PLANNED | Provision and verify separately for every customer; confirm server and all backups are in Russia. |
| High | Approved design is one store per app/database; `storeId` is not a shared-database tenant boundary. | PLANNED | Implement and test isolated customer deployments. Separate DB alone is not legal compliance evidence. |
| High | Temporary, explicitly authorized, least-privilege, audited support access with revocation is not confirmed implemented. | PLANNED | Implement and test temporary accounts, consent workflow, time/permission bounds, action logs, revocation, and no own-purpose use. |
| Medium | An enforcing CSP is not configured. Local reports include Next.js inline bootstrap scripts; no collector exists. | VERIFIED LOCALLY | Keep Report-Only; resolve and verify compatible policy in staging before enforcement. |
| Medium | Built-in rate limiting protects lead submission only and depends on trusted proxy headers. | IMPLEMENTED | Add and verify infrastructure limits and proxy configuration per installation. |
| Medium | Backup includes personal data; retention, subject requests, and incident procedures are not automated. | PLANNED | Set per-store retention, restore-with-deletion process, and incident procedures. |
| Medium | Offsite restore, real Linux deployment, TLS, Nginx/systemd and support-access operations are unverified. | VERIFIED LOCALLY | Complete actual deployment and offsite recovery checks on approved non-production infrastructure. |
| Medium | No MFA, centralized audit export, or alerting is implemented. | PLANNED | Assess and implement controls required by the store's threat model and selected security level. |

## Stage 5.2 local verification (VERIFIED LOCALLY)

- Current full `npm audit` reports zero vulnerabilities after updating the
  transitive `minimatch` dependency through the package override. This is a
  point-in-time dependency result, not a guarantee about future advisories.
- Full lint, typecheck, test suite (26 tests across 10 files), Prisma schema
  validation, migration status, and production build passed in the local
  environment. The integration suite used the existing synthetic local
  database; no production database was accessed.
- Regression tests cover the role permission matrix, field-worker task scope,
  representative cross-store access to products/leads/measurements/orders/
  installations, and existing protected workflow operations. These tests are
  not a substitute for an exhaustive deployment-specific access review of
  every endpoint and account configuration.
- Browser verification of a local production build confirmed the storefront,
  demo catalog, product route, and admin login page rendered. Unauthenticated
  `/admin` redirected to `/admin/login`. The product route had no observed
  `eval` CSP reports after enabling Zod `jitless`; Next.js inline script
  reports remain. All are Report-Only and did not block rendering.
- Authenticated admin page behavior, every role/API permutation, a real proxy,
  production TLS, and CSP enforcement remain unverified.

These are engineering observations, not a certification or guarantee that the
system is secure. Report suspected security issues privately to the project
maintainer; do not include customer data or credentials in issue reports.

## Russian personal-data law

**LEGAL REVIEW REQUIRED.** No legal compliance determination is made here. Before processing real
customer data, qualified counsel and the store/operator must review at least:

- which entity is the personal-data operator, purposes, legal grounds, and
  whether separate consent is required;
- the privacy notice and the exact consent wording/version captured with each
  request;
- Russian database localization and any cross-border transfer or subprocessors;
- processing records, access controls, retention periods, destruction,
  correction, and subject-request procedures;
- processor/vendor contracts, employee confidentiality and access controls,
  incident response, and any required regulator notices or filings;
- whether the store's website needs additional cookie, analytics, advertising,
  or call-recording disclosures.

Product features do not replace the operator's legal obligations.
The approved deployment-in-Russia requirement is a project decision
(**PLANNED**), not a verified region. Confirm the hosting and backup contractors,
actual locations of all copies/logs and any administrator access, and contracts
before processing real data. Store and DoorFlow should document the actual
processing instruction under Article 6(3) 152-FZ after legal review.
The engineering inventory and gap analysis are in
[PERSONAL_DATA_MAP.md](./PERSONAL_DATA_MAP.md),
[PERSONAL_DATA_GAP_ANALYSIS.md](./PERSONAL_DATA_GAP_ANALYSIS.md),
[PERSONAL_DATA_REQUIREMENTS.md](./PERSONAL_DATA_REQUIREMENTS.md), and
[PERSONAL_DATA_DOCUMENTS.md](./PERSONAL_DATA_DOCUMENTS.md). These are not
operator policies, consent forms, legal opinions, or evidence of compliance.
This legal overview is dated 04.11.2026. Currentness and applicability of
normative editions on that date have not been independently confirmed; no
provisions entering into force after that date are applied here.
