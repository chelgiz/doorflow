# PostgreSQL backup and recovery

## Scope and safety

DoorFlow stores catalog, customer, order, audit, and image data in PostgreSQL.
The custom-format `pg_dump` archive includes the `StoreAsset` byte data. Backup
files therefore contain personal and confidential business data. Limit access,
encrypt before offsite transfer, and set retention with the store/operator.

The restore script refuses the configured source database, checks that the
target has no user tables, and restores in one transaction without `--clean`.
Never use a production database as a restore target. A failed restore should be
discarded by the DBA only after confirming the exact isolated target database.

## Prerequisites

- PostgreSQL client tools (`pg_dump`, `pg_restore`) matching or newer than the
  server major version.
- `age` for encryption and decryption.
- `rsync` and SSH keys for offsite transfer.
- A private backup directory and a separate offsite host/account.
- A key recipient whose corresponding private identity is stored separately
  from both the app server and the backup destination.

Generate and store an age identity using your organization's key-management
procedure. Do not place a private identity on the application server. Set:

```dotenv
DOORFLOW_BACKUP_DIR=/var/backups/doorflow
DOORFLOW_BACKUP_AGE_RECIPIENT=age1...
DOORFLOW_BACKUP_REMOTE=backup-user@backup.example.ru:/srv/backups/doorflow
```

On a dedicated key-management workstation, an operator may create an age
identity and obtain its public recipient with:

```bash
age-keygen -o ./doorflow-backup-identity.txt
age-keygen -y ./doorflow-backup-identity.txt
```

Keep the identity file in approved secret storage; only the public `age1...`
recipient belongs in the server configuration. Never include a private key in
application files, logs, tickets, or shell history.

In production (`NODE_ENV=production`), the backup script refuses to run unless
both encryption and offsite destination are configured. It uses PostgreSQL
custom format, verifies the archive, writes owner-only files, and does not
delete older backups. Offsite copies are encrypted before `rsync`.

The supplied systemd backup service uses the dedicated SSH key at
`/etc/doorflow/backup_ed25519` and known-hosts file at
`/etc/doorflow/backup_known_hosts`; provision them root-owned and readable only
by the `doorflow` group. Restrict the remote authorized key to the backup
destination. For recovery from an `.age` archive, securely mount/copy the
private identity to the recovery host and set
`DOORFLOW_BACKUP_AGE_IDENTITY` to its path for the restore command. Remove the
temporary identity after the drill.

## Scheduled backup

Run from the application directory with the production service environment:

```bash
cd /srv/doorflow/app
NODE_ENV=production npm run db:backup
```

The supplied timer is scheduled at 02:15 local system time with a randomized
delay up to 15 minutes and `Persistent=true`. Enabling it schedules future
runs; it does not execute or prove a backup immediately. Verify the unit file
and next/last run on the target host after installation.

Schedule this command with the host's protected systemd timer or equivalent.
Send success/failure status to the operator's monitoring system; this app does
not configure monitoring for you. Alert if a backup is missing, archive
verification fails, encryption fails, or offsite transfer fails. Restrict
SSH/rsync access to the backup account and destination directory. Define and
test retention separately; the script intentionally performs no pruning.

## Restore drill

1. Create a new, empty PostgreSQL database on a non-production instance with
   adequate disk space and a role allowed to create the restored schema.
2. Make the source application's `DATABASE_URL` available to the restore
   command and set `RESTORE_DATABASE_URL` to that distinct empty database.
   Choose a target database name different from the source database name.
3. Set `BACKUP_FILE` to the encrypted archive (or a local unencrypted archive
   used only for a controlled test) and run:

   ```bash
   DATABASE_URL='postgresql://app:REDACTED@source/db?schema=public' \
   RESTORE_DATABASE_URL='postgresql://restore:REDACTED@restore-host/doorflow_restore?schema=public' \
   BACKUP_FILE='/secure/path/doorflow-20261104T020000Z.dump.age' \
   npm run db:restore
   ```

4. For an `.age` archive, securely make the appropriate private identity
   available and set `DOORFLOW_BACKUP_AGE_IDENTITY` to its path. Keep that
   identity off the application/backup server.
5. The script decrypts into a private temporary directory, validates the
   archive, verifies the target is empty, restores transactionally, and checks
   that core DoorFlow tables exist. Verify the app against the restored
   database in an isolated environment, including row counts, a representative
   asset, a login, and the lead/order workflow. Do not point a live app at the
   test restore.
6. Record the archive timestamp, source/target identifiers (not credentials),
   result, duration, and operator. Do not copy test customer data to an
   unapproved environment.

To test age encryption and the script locally, use a brand-new isolated test
database with synthetic fixture data, a temporary age identity, and a
temporary local directory. An optional local `rsync` to another directory
tests command behavior only; it is **not** an offsite transfer or offsite
recovery test. A real offsite test requires a separately administered host and
must restore that remote encrypted file into a new empty database. Do not
reclassify local verification as evidence of offsite recoverability. A real
recovery-time objective and recovery-point objective must be agreed and
measured by the operator.

## Recovery in an incident

Provision a replacement PostgreSQL instance and an empty database; restore the
latest verified encrypted archive; apply any required point-in-time recovery
only if separately configured and tested; validate schema/data and asset
availability; then deploy the matching DoorFlow application version and
configure its environment. Change DNS or application routing only after
validation and an incident owner approves the cutover. This repository does
not configure WAL archiving, point-in-time recovery, replication, or automatic
failover.
