# New-store deployment

This procedure targets one DoorFlow deployment and one PostgreSQL database per
store. It is an operator checklist, not evidence that a specific host is
production-ready. Keep demo mode enabled until the real store is configured and
reviewed.

## 1. Prepare infrastructure

- Provision a maintained Linux server with Node.js 20.9+, npm, PostgreSQL,
  PostgreSQL client tools at least as new as the server, Nginx, `age`, `rsync`,
  SSH, and systemd (or equivalent).
- Use a Russian data center when required by the operator's legal review.
  Keep PostgreSQL private; only the application host and approved operators
  should be able to connect.
- Create separate database roles for application runtime, migration/bootstrap,
  and backup/restore. Do not run the app as a PostgreSQL superuser. Grant only
  the permissions required for each task; run migrations with the schema
  owner/migration role.
- Provision a separate encrypted offsite backup destination and test SSH
  access. Keep the age private key away from the app host.

## 2. Install and configure

1. Create `/srv/doorflow/releases` and deploy each reviewed build to an
   immutable release directory `/srv/doorflow/releases/<release-id>` owned by
   the unprivileged `doorflow` account. Use a root-controlled
   `/srv/doorflow/current` symlink for the active release.
2. Install from the committed lockfile in the release directory and generate Prisma client:

   ```bash
   cd /srv/doorflow/releases/<release-id>
   npm ci
   npm run db:generate
   npm run db:validate
   ```

3. Create `/etc/doorflow/doorflow.env`, owned by `root:doorflow` with mode
   `0640`. Set at minimum:

   ```dotenv
   NODE_ENV=production
   DATABASE_URL=postgresql://doorflow_app:REDACTED@db-host/doorflow?schema=public
   DOORFLOW_DEMO_MODE=false
   DOORFLOW_STORE_ID=
   DOORFLOW_CONSENT_NOTICE_VERSION=2026-01
   DOORFLOW_PRIVACY_NOTICE_URL=https://shop.example.ru/privacy
   DOORFLOW_RATE_LIMIT_SECRET=GENERATE_A_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS
   DOORFLOW_PUBLIC_LEAD_RATE_LIMIT=5
   DOORFLOW_PUBLIC_LEAD_WINDOW_SECONDS=900
   DOORFLOW_BACKUP_DIR=/var/backups/doorflow
   DOORFLOW_BACKUP_AGE_RECIPIENT=age1...
   DOORFLOW_BACKUP_REMOTE=backup-user@backup.example.ru:/srv/backups/doorflow
   ```

   Generate `DOORFLOW_RATE_LIMIT_SECRET` with a cryptographically secure
   generator such as `openssl rand -hex 32`. Use a migration-role connection
   only for `npm run db:migrate`; do not store it in the runtime environment.
   Set the runtime PostgreSQL URL to `sslmode=verify-full` (recommended) or
   `verify-ca`, install the issuing CA in the system trust store, and
   URL-encode special characters in credentials. Never commit or print
   production secrets.

   The systemd pre-start check validates production settings without printing
   their values. It requires a real non-demo store, HTTPS privacy notice, at
   least 32 characters of rate-limit secret, encrypted backup recipient,
   offsite destination, and TLS-verified PostgreSQL URL.

4. Apply migrations from the new release directory with the migration role:

   ```bash
   DATABASE_URL='postgresql://doorflow_migrator:REDACTED@db-host/doorflow?schema=public' \
     npm run db:migrate
   ```

5. Create the first store and owner interactively using the approved
   bootstrap/migration connection:

   ```bash
   DATABASE_URL='postgresql://doorflow_migrator:REDACTED@db-host/doorflow?schema=public' \
     npm run admin:create
   ```

   The password is read without echo and stored as an Argon2id hash. Set the
   printed `DOORFLOW_STORE_ID` in the protected environment file, restart the
   service, and verify admin sign-in and role behavior.
6. Enter only store-verified products, specifications, costs, option prices,
   service rules, locations, and contacts. Check unpublished records first;
   publish only after owner review. Keep generic/demo fixtures out of the
   production catalog.

## 3. HTTPS and reverse proxy

1. Create DNS `A`/`AAAA` records for the chosen hostname and confirm they
   resolve only to the intended server. Open inbound TCP 80/443 at the firewall;
   keep application and PostgreSQL ports private.
2. Install Nginx and Certbot from the distribution's supported packages.
   Install the DoorFlow Nginx file under `/etc/nginx/conf.d/` because its
   `limit_req_zone` directives belong in the `http {}` context. Copy the proxy
   snippet to `/etc/nginx/snippets/doorflow-proxy.conf`. Replace the example
   hostname and check for conflicting default servers or rate-limit zone names.
3. Before certificates exist, configure an HTTP-only server block for the
   hostname with the `/.well-known/acme-challenge/` webroot and no HTTPS
   redirect. Create the webroot and request a certificate:

   ```bash
   sudo install -d -o root -g www-data -m 0755 \
     /var/www/letsencrypt/.well-known/acme-challenge
   sudo certbot certonly --webroot \
     -w /var/www/letsencrypt -d shop.example.ru
   ```

   Use the platform web-server group where it is not `www-data`. Confirm the
   certificate chain and private-key paths reported by Certbot.
4. Install the supplied final port-80 and TLS server blocks, restore the ACME
   challenge location, replace `shop.example.ru` and certificate paths, and
   run `nginx -t`. Reload Nginx only after the configuration passes. Verify
   renewal with `certbot renew --dry-run` and configure the distribution's
   supported renewal deploy hook to reload Nginx.
5. The proxy snippet overwrites forwarded-IP headers with `$remote_addr`.
   Do not add a forwarding chain unless each proxy hop is explicitly trusted.
   The HTTP redirect uses the fixed canonical hostname, not the incoming Host
   header.

Do not run Certbot or reload system services until DNS, firewall, hostname,
and certificate paths have been reviewed on the target server.

## 4. Build and run

```bash
cd /srv/doorflow/releases/<release-id>
npm ci
npm run db:generate
npm run env:check
npm run build
```

After review, atomically select the first/current release:

```bash
sudo ln -s /srv/doorflow/releases/<release-id> /srv/doorflow/current.new
sudo mv -Tf /srv/doorflow/current.new /srv/doorflow/current
```

Copy `deploy/systemd/doorflow.service`,
`deploy/systemd/doorflow-backup.service`, and
`deploy/systemd/doorflow-backup.timer` into `/etc/systemd/system/`, adjusting
Node/npm executable paths for the host. Create `/var/backups/doorflow` owned
by `doorflow` with mode `0700`. Provision the dedicated backup SSH key and
known-hosts file with restrictive permissions. The backup timer runs daily
and does not prune old copies.

```bash
sudo systemd-analyze verify /etc/systemd/system/doorflow.service \
  /etc/systemd/system/doorflow-backup.service \
  /etc/systemd/system/doorflow-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now doorflow
sudo systemctl enable --now doorflow-backup.timer
sudo systemctl status doorflow
sudo systemctl list-timers doorflow-backup.timer
```

The app binds only to loopback port 3000. The service's `ExecStartPre` checks
production environment structure before starting. Confirm systemd status and
service logs in a controlled staging start.

## 5. CSP Report-Only rollout

The app currently sends `Content-Security-Policy-Report-Only`, not an enforcing
CSP. The initial candidate intentionally excludes inline script/style
exceptions; Next.js may report framework inline code. It does not block page
behavior. On the staging hostname, inspect browser console violations on:

- `/`, `/catalog`, and a product detail page;
- `/admin/login` and protected admin pages using a staging-only test account;
- configurator, image-upload, and settings flows when enabled in staging.

Check the response header and functional behavior. Investigate unexpected
external origins or inline-code reports. Do not copy production data or
credentials to staging. No CSP report collector is configured; this rollout
uses browser developer tools. Do not enforce the policy until a nonce-capable
policy has been implemented and verified with zero unexplained reports.

In the local production-build rehearsal, the home page, catalog, product detail,
and admin login rendered with Report-Only enabled. The browser reported inline
Next.js scripts (`script-src-elem`) on all four routes and `eval`
(`script-src`) on the product detail. Those reports did not block behavior
because the header is Report-Only. The catalog search input and admin login
fields rendered; authenticated admin pages were not tested. Treat these
observations as a blocker to enforcement, not as evidence that the candidate
policy is clean.

## 6. Availability and error monitoring

- Configure an independent uptime monitor to request
  `https://shop.example.ru/api/health` every minute. Expect HTTP 200 and
  `{"status":"ok"}`. This is an application liveness check; it does not prove
  database or backup availability.
- Alert on failed probes, TLS expiry/renewal, elevated HTTP 5xx/429 responses,
  low disk/database capacity, failed `doorflow.service`, failed backup jobs,
  and a missing successful backup within the agreed window.
- Application `stdout`/`stderr` are captured by journald:

  ```bash
  sudo journalctl -u doorflow --since '1 hour ago' --no-pager
  sudo journalctl -u doorflow -p err --since '24 hours ago' --no-pager
  sudo systemctl --failed
  sudo systemctl list-timers doorflow-backup.timer
  sudo journalctl -u doorflow-backup.service --since '7 days ago' --no-pager
  ```

- Forward service and Nginx error logs to the operator's approved monitoring
  destination. Do not augment logs with credentials, request bodies, phone
  numbers, or customer data.

## 7. Update and rollback

1. Schedule a maintenance window. Take an encrypted backup, verify its archive,
   confirm offsite transfer, and retain the prior immutable application release.
2. Prepare a new release directory. Run `npm ci`, `db:generate`, `db:validate`,
   `env:check`, lint, typecheck, tests, and build. Review migrations for
   backward compatibility; do not assume they can be reversed.
3. If migrations are not guaranteed compatible with the running version, stop
   the application during the approved migration window. Apply forward
   migrations with the migration role, atomically move the `current` symlink,
   then start/restart the service.
4. Smoke-test `/api/health`, public pages/catalog, admin login and role
   boundaries, a server-calculated quote, and logs. Monitor 5xx and performance
   through the agreed observation window.
5. For an application-only fault, point `current` back to the prior immutable
   release and restart. This is safe only while the new schema remains
   compatible with the old app. Otherwise, do not point old code at the newer
   database: restore the verified backup to a separate database, validate it,
   then coordinate a controlled cutover.

Keep old releases and backups until the change is accepted. Record release IDs,
migrations, backup reference, checks, and operator. See [BACKUP.md](./BACKUP.md)
for restore steps.

## 8. Go-live gates

- HTTPS, DNS, Nginx limits, forwarded-IP behavior, and response headers verified.
- Production secret permissions and database least privilege checked.
- Store identity, non-demo catalog/prices, privacy notice, consent version, and
  staff roles reviewed by the store.
- Backup archive encrypted and transferred offsite; restore tested on another
  empty database.
- Logs, disk/database capacity, service restarts, backup failures, and security
  incidents have named operators and alerting.
- Legal counsel has reviewed personal-data handling, including 152-FZ
  obligations. No legal compliance is asserted by this deployment guide.

Do not treat a successful `npm run build` as a production readiness approval.
