# Commercial readiness assessment

**Status: not approved for commercial production.** A local application and
isolated PostgreSQL verification pass do not establish deployment, legal, or
operational readiness for a real store.

## Approved first-customer architecture

The approved design is a separate DoorFlow app instance, PostgreSQL database,
accounts, secrets, and backup set for each store; server and backups are
required to be in the Russian Federation. Updates are prepared centrally and
installed separately for each client.

**Status: PLANNED.** This is the deployment decision, not a claim that the
customer installations, isolation, server region, location of all backups, or
per-customer release/rollback procedures are deployed and verified. Separate
databases do not by themselves establish compliance with 152-FZ.

DoorFlow developers/support are not to have permanent access to store data.
Temporary support access requires explicit store authorization, a separate
account, minimum time and permissions, logs of all logins/actions, and revocation
when the work ends; the data must not be used by DoorFlow for its own purposes.
**Status: PLANNED.** These mechanisms are not confirmed implemented.

The preliminary legal model is that the store determines purposes and legal
bases and generally acts as operator; DoorFlow may process data on the store's
instructions within the actual service and contract. Any DoorFlow own-purpose
use requires separate legal analysis. **Status: LEGAL REVIEW REQUIRED.** The
parties must review and execute a processing instruction/contract under
Article 6(3) 152-FZ, including the legally required terms. This is not a legal
determination of the parties' roles.

Status labels used below: **IMPLEMENTED**, **VERIFIED LOCALLY**, **PLANNED**,
**CLIENT RESPONSIBILITY**, **LEGAL REVIEW REQUIRED**. These labels distinguish
code, local checks, design decisions, store actions, and legal questions.

## Changes and checks completed in prior readiness work

- **IMPLEMENTED:** replaced the read-then-update login failure counter with an atomic PostgreSQL
  upsert and added a concurrent-attempt integration test.
- **IMPLEMENTED:** disabled admin access when demo mode is enabled, with an integration check.
- **IMPLEMENTED:** removed raw database/configuration/validation details from quote and lead
  logs to reduce risk of personal-data disclosure.
- **IMPLEMENTED:** added baseline response security headers. TLS/HSTS and proxy controls are
  provided as deployment configuration, not assumed in the app.
- **IMPLEMENTED:** added custom-format PostgreSQL backup and restore scripts. Production backups
  require age encryption and an offsite rsync destination; restoration rejects
  the source DB and non-empty target and never uses `--clean`.
- **VERIFIED LOCALLY:** completed a local PostgreSQL 17.11 backup/restore drill between new isolated
  databases. The restored store and WebP logo were present with matching SHA-256
  and byte length; the non-empty-target guard was also exercised.
- **IMPLEMENTED:** added Nginx and systemd deployment templates plus security, deployment, and
  backup documentation.
- **VERIFIED LOCALLY:** production dependency audit reported zero vulnerabilities at the
  time of this check, and tested the local DB integration suite.
- **IMPLEMENTED:** corrected PostgreSQL URL handling used by restore: child database tools
  receive a password-free connection URL, while in-process restore checks
  receive credentials without losing them to URL parsing. Added regression
  tests. Also fixed backup failure cleanup so a `pg_dump` error does not leave
  partial files or get masked by an invalid cleanup call.

## Stage 5.1 rehearsal: confirmed local checks (VERIFIED LOCALLY)

- Production environment validation passed with synthetic values only. It is
  structural validation; it does not connect to PostgreSQL or check a live TLS
  certificate.
- The production build returned HTTP 200 for `/`, `/catalog`, a product detail,
  `/admin/login`, and `/api/health`. Security headers included
  `Content-Security-Policy-Report-Only`; no enforcing CSP header was sent.
- Browser checks confirmed storefront content and the catalog search input,
  and confirmed the admin login fields render. The browser reported inline
  Next.js scripts on all four page routes and `eval` on the product detail.
  Reports were non-blocking by design. The policy is not ready for enforcement;
  authenticated admin pages were not verified.
- `nginx -t` passed in a disposable Nginx 1.28 container using a temporary
  self-signed certificate. This checks template syntax only; it does not test
  a live listener, DNS, a trusted certificate, or external HTTPS.
- All nine Prisma migrations applied successfully to new local synthetic
  databases. The full test suite passed: 25 tests across 10 files, including
  PostgreSQL-backed workflows.
- A local `age` encrypted custom-format dump was restored into a separate,
  newly-created empty PostgreSQL database using matching PostgreSQL 17.11
  client tools. The restore script verified required tables and reported one
  synthetic store, zero assets, and zero leads; the synthetic store record was
  queried after restore. The temporary age identity and encrypted archive were
  removed. The source and restore test databases were not dropped.
- Backup failure behavior was checked with a synthetic invalid password:
  the error was surfaced, no partial archive remained, and the password did
  not appear in output.
- Standalone lint, typecheck, production build, Prisma schema validation, and
  migration status passed. The systemd unit/timer parser check could not run:
  `systemd-analyze` is absent locally, and installing it in a disposable
  container was blocked by Debian package-download 500/503 responses. No
  system services were started or stopped.

## Stage 5.1 rehearsal: unverified or unavailable

- **CLIENT RESPONSIBILITY:** provision the separate Linux host. Nginx was not installed or reloaded on a
  server; HTTPS issuance/renewal, DNS, firewall, trusted proxy behavior, and
  live service startup remain unverified.
- **PLANNED:** verify systemd unit syntax, timer activation, automatic execution,
  successful backup runs, and failure alerting; no systemd parser or Linux host was available locally.
- **CLIENT RESPONSIBILITY:** provision separately administered offsite host/storage.
  `rsync` transfer,
  offsite retention controls, independent-key handling, offsite decryption,
  and offsite restore remain unverified. The local age drill is not evidence
  of offsite recovery.
- **CLIENT RESPONSIBILITY:** configure external uptime monitoring. Local liveness and response
  headers do not establish availability/error alerting or backup monitoring.
- **PLANNED:** repeat protected-admin and CSP checks with a synthetic authenticated
  staging account; no such account was available for this rehearsal, so protected admin
  pages and their CSP behavior remain unverified.

## Stage 5.2 local verification (VERIFIED LOCALLY)

- Zod JIT was disabled with `z.config({ jitless: true })` to remove its dynamic
  `Function` compilation path from the browser configurator. On a rebuilt local
  production server, the product route emitted inline-script CSP Report-Only
  reports but no `eval` reports. Public `/`, `/catalog`, product detail, and
  `/admin/login` rendered; unauthenticated `/admin` resolved to the login page.
- `npm run lint`, `npm run typecheck`, `npm test` (26 tests in 10 files),
  `npm run build`, `npm run db:validate`, and Prisma migration status passed.
  The full test suite used the existing synthetic local integration database;
  no database was dropped or reset. `npm audit` reported zero vulnerabilities.
- Added role-matrix assertions and integration checks for field-worker task
  boundaries and representative cross-store access to products, leads,
  measurements, orders, and installations.
- Created technical privacy-data inventory, gap analysis, requirements, and
  document checklist. They identify unknown infrastructure and legal facts;
  they are not legal documents or a compliance determination.

## Remaining launch blockers

| Area | Status | Remaining work |
|---|---|---|
| Approved per-store architecture | PLANNED | Deploy a separate app, PostgreSQL, accounts, secrets, and backups per customer. Test that customer data is inaccessible across installations; code-level store checks and a separate DB alone do not prove this. |
| Russian server and backup locations | PLANNED | Verify actual Russian regions for every server, primary DB, replica, log store, and backup copy; retain provider evidence. No live region has been confirmed. |
| Release operations | PLANNED | Prepare releases centrally; install and verify individually per client, with version tracking, migration/rollback rehearsal, and per-customer change evidence. |
| Support access | PLANNED | Implement explicit client approval, separate temporary account, minimum time/permissions, complete access/action audit, reliable revocation, and prohibition on DoorFlow own-purpose use. None of these support mechanisms is currently confirmed implemented. |
| Backup/recovery | VERIFIED LOCALLY | Local age encryption and restore passed on synthetic databases. Still verify each customer's Russian offsite destination, transfer, restore of that remote copy, retention/deletion, recovery objectives, and scheduled monitoring. |
| Deployment | CLIENT RESPONSIBILITY | Provision and review actual TLS, firewall, proxy, DNS, least-privilege roles, secret delivery, monitoring and hosting/backup contracts for each installation. Templates and container syntax checks are not a deployed system. |
| Security | PLANNED | Complete independent production configuration/security review; resolve Next.js inline-script CSP reports with a tested policy before enforcement; validate proxy limits; assess MFA/alerting. Local checks are not a deployment review. |
| Dependencies | VERIFIED LOCALLY | `npm audit` reported zero vulnerabilities at the last local check. Continue monitoring; point-in-time status is not a guarantee. |
| Privacy/legal roles and contract | LEGAL REVIEW REQUIRED | Confirm operator/processor roles and any own-purpose processing; review and execute Article 6(3) processing instructions/contracts, legal bases, notices/consent, retention, subject requests, incident duties and regulator notice as applicable. |
| Client's operational/legal duties | CLIENT RESPONSIBILITY | Each store establishes goals/legal bases, retention, subject request and incident processes, employee access, data accuracy, training, and any required regulator filings. |
| Security level and measures | LEGAL REVIEW REQUIRED | Determine the applicable IСПДн security level, threat model and measures with qualified legal/IB specialists; local code checks do not establish these. |
| Hosting and subcontractors | CLIENT RESPONSIBILITY | Obtain and review hosting, backup and other contractor agreements, locations, subprocessor list, access conditions, and contract terms. |
| Store data | CLIENT RESPONSIBILITY | Verify every product, specification, option, price, cost, service, warranty, delivery term, and contact with the actual retailer. |
| Operations | CLIENT RESPONSIBILITY | Train staff, test a controlled inquiry-to-installation workflow, assign incident/recovery owners, and document operating procedures. |
| Product gaps | VERIFIED LOCALLY | Analytics, inventory, supplier integrations, refunds/accounting, and connected telephony/payment services were not found implemented in the reviewed product. Do not represent them as available. |

## Readiness decision

Current code is suitable for continued isolated pilot preparation and
controlled local verification. It is not yet approved to process real customer
data or to be called commercially operational. A named operator should close
each blocker above and record evidence before a pilot decision. Legal status
must be determined by qualified counsel, not by this report.

Before any pilot with real personal data, also confirm the actual Russia-based
server and all backup locations, hosting/subcontractor agreements, the store's
notification duty and exceptions, legal bases per purpose, retention periods,
subject request procedure, deletion/expiry from backups, incident response and
notification duties, applicable ИСПДн security level and measures, and the
temporary support access mechanism. These are currently unresolved and must not
be inferred from the approved design.

The four engineering deliverables for privacy planning are
[PERSONAL_DATA_MAP.md](./PERSONAL_DATA_MAP.md),
[PERSONAL_DATA_GAP_ANALYSIS.md](./PERSONAL_DATA_GAP_ANALYSIS.md),
[PERSONAL_DATA_REQUIREMENTS.md](./PERSONAL_DATA_REQUIREMENTS.md), and
[PERSONAL_DATA_DOCUMENTS.md](./PERSONAL_DATA_DOCUMENTS.md). Their conclusions
describe the repository and unknown deployment assumptions; they do not
certify compliance with 152-ФЗ, Government Decree No. 1119, or FSTEC Order
No. 21.
This assessment is dated 04.11.2026. Currentness and applicability of normative
editions on that date have not been independently confirmed; provisions
entering into force after that date are not applied here.
