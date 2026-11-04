# DoorFlow

DoorFlow is a specialized storefront and operations platform for independent
entrance-door retailers and retail chains. The first release starts with a
mobile-first public storefront, with commercial quoting and lead-persistence
foundations added as separately testable modules.

## Product principles

- Model door-specific specifications without requiring every field for every
  manufacturer.
- Keep prices, catalog content, and service rules configurable by each store.
- Treat customer and business data as production data: never seed invented
  analytics, contacts, inventory, or sales as real information.
- Keep the initial deployment isolated per store while preserving a path to
  tenant-aware SaaS.
- Prefer server-side validation and authorization for every future write path.

## Implemented foundation

The locally runnable app includes the responsive storefront, searchable demo
catalog, product detail configurator, server-calculated quotes, validated
measurement/order lead endpoints, and a PostgreSQL/Prisma data model. The
admin workspace supports Argon2id-backed sign-in, role-checked catalog and
pricing edits, lead search/status history, store settings and locations, and
owner-managed employee accounts. Operations include scheduled/assigned
measurements, customer timelines and manually recorded notes/calls, orders
created from saved lead quote snapshots, append-only payment records, and
planned/assigned installation tasks with recorded results. The production
catalog reads published non-demo products from the configured store. Demo
fixtures remain separate and visibly marked; demo mode is the default.

This is not yet approved for commercial production. Production still requires
verified store catalog/pricing data, 152-FZ/legal review, documented data
retention, deployment-specific security verification, an encrypted offsite
backup/restore drill, monitoring, and operational review of public lead abuse
controls. Baseline image storage, lead throttling, idempotency, and deployment
templates have been added but are not a production deployment. Sales analytics,
integrated payment/refund processing, and remaining measurement/install
refinements are not implemented. Roles include owner, administrator, manager,
measurer, and installer; field roles see and update only assigned tasks.

Commercial-readiness requirements and procedures are documented in
[SECURITY.md](./SECURITY.md), [DEPLOYMENT.md](./DEPLOYMENT.md),
[BACKUP.md](./BACKUP.md), and [COMMERCIAL_READINESS.md](./COMMERCIAL_READINESS.md).

## Technology

- Next.js App Router, React, and strict TypeScript.
- Tailwind CSS 4 for the utility layer, with project-specific CSS for the
  storefront design system.
- Radix UI Dialog for accessible mobile navigation.
- Lucide React for interface icons.
- PostgreSQL with Prisma ORM and the `pg` adapter.
- Zod validation at quote and lead request boundaries.
- Argon2id password hashing, opaque database-backed admin sessions, and
  server-side role/permission checks.
- Vitest for domain, route, and opt-in local PostgreSQL integration tests.

## Local development

See [README.md](./README.md) for setup and verification commands.
