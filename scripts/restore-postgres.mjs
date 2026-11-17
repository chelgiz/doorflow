import "dotenv/config";
import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  databaseIdentity,
  getClientConnectionString,
  parseDatabaseConnection,
} from "./postgres-connection.mjs";
import { describeClient, listArchive, resolvePgClient, restoreArchive } from "./pg-client.mjs";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.stdio ?? "inherit",
      env: options.env ?? process.env,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed (${signal ?? `exit ${code}`})`));
    });
  });
}

async function main() {
  const sourceUrl = process.env.DATABASE_URL;
  const targetUrl = process.env.RESTORE_DATABASE_URL;
  const backupFile = process.env.BACKUP_FILE;
  if (!sourceUrl || !targetUrl || !backupFile) {
    throw new Error("DATABASE_URL, RESTORE_DATABASE_URL, and BACKUP_FILE are required");
  }

  const source = parseDatabaseConnection(sourceUrl, "DATABASE_URL");
  const target = parseDatabaseConnection(targetUrl, "RESTORE_DATABASE_URL");
  if (
    databaseIdentity(source.url) === databaseIdentity(target.url) ||
    decodeURIComponent(source.url.pathname) === decodeURIComponent(target.url.pathname)
  ) {
    throw new Error("Refusing to restore into the source application database");
  }
  const backupInfo = await stat(backupFile);
  if (!backupInfo.isFile()) throw new Error("BACKUP_FILE must refer to a regular file");

  const privateDirectory = await mkdtemp(path.join(os.tmpdir(), "doorflow-restore-"));
  process.umask(0o077);
  const archivePath = path.join(privateDirectory, "restore.dump");
  const targetConnection = getClientConnectionString(target);
  let targetClient;

  try {
    const isEncrypted = backupFile.endsWith(".age");
    if (isEncrypted) {
      const identity = process.env.DOORFLOW_BACKUP_AGE_IDENTITY;
      if (!identity) throw new Error("Set DOORFLOW_BACKUP_AGE_IDENTITY for encrypted archives");
      await run("age", ["--decrypt", "--identity", identity, "--output", archivePath, backupFile]);
    }

    const restoreClient = await resolvePgClient(target);
    console.info(`PostgreSQL restore client: ${describeClient(restoreClient)}`);

    await listArchive({
      client: restoreClient,
      connection: target,
      filePath: isEncrypted ? archivePath : backupFile,
    });
    targetClient = new pg.Client(targetConnection);
    await targetClient.connect();
    const existing = await targetClient.query(`
      SELECT count(*)::text AS count
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
        AND relation.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
    `);
    if (Number(existing.rows[0]?.count) !== 0) {
      throw new Error("Restore target must be an empty database; no changes were made");
    }
    await targetClient.end();
    targetClient = undefined;

    await restoreArchive({
      client: restoreClient,
      connection: target,
      filePath: isEncrypted ? archivePath : backupFile,
    });

    await verifyRestoreAgainstSource(source, targetConnection);
  } finally {
    if (targetClient) await targetClient.end().catch(() => undefined);
    await rm(privateDirectory, { recursive: true, force: true });
  }
}

const TABLE_QUERY = `
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ORDER BY table_name
`;
const MIGRATION_COUNT_QUERY = `
  SELECT count(*)::text AS count
  FROM "_prisma_migrations"
  WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
`;

async function verifyRestoreAgainstSource(source, targetConnectionString) {
  const sourceClient = new pg.Client(getClientConnectionString(source));
  const targetClient = new pg.Client(targetConnectionString);
  await sourceClient.connect();
  await targetClient.connect();

  try {
    const sourceTables = (await sourceClient.query(TABLE_QUERY)).rows.map((row) => row.table_name);
    const targetTables = (await targetClient.query(TABLE_QUERY)).rows.map((row) => row.table_name);
    const missing = sourceTables.filter((name) => !targetTables.includes(name));
    const unexpected = targetTables.filter((name) => !sourceTables.includes(name));
    if (missing.length > 0) {
      throw new Error(`Restored database is missing source tables: ${missing.join(", ")}`);
    }
    if (unexpected.length > 0) {
      throw new Error(`Restored database has tables absent from the source: ${unexpected.join(", ")}`);
    }

    const sourceMigrations = (await sourceClient.query(MIGRATION_COUNT_QUERY)).rows[0]?.count;
    const targetMigrations = (await targetClient.query(MIGRATION_COUNT_QUERY)).rows[0]?.count;
    if (sourceMigrations !== targetMigrations) {
      throw new Error(
        `Applied migration count differs: source ${sourceMigrations}, restored ${targetMigrations}`,
      );
    }

    console.info("PostgreSQL restore verified", {
      tables: targetTables.length,
      appliedMigrations: targetMigrations,
    });
  } finally {
    await sourceClient.end().catch(() => undefined);
    await targetClient.end().catch(() => undefined);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("PostgreSQL restore failed", {
      category: error instanceof Error ? error.name : "unknown",
      message: error instanceof Error ? error.message : "unknown failure",
    });
    process.exitCode = 1;
  });
}
