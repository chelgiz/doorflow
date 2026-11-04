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

    await run("pg_restore", ["--list", isEncrypted ? archivePath : backupFile], { stdio: "ignore" });
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

    const restoreEnv = { ...process.env };
    if (target.password) restoreEnv.PGPASSWORD = target.password;
    await run("pg_restore", [
      "--single-transaction",
      "--exit-on-error",
      "--no-owner",
      "--no-acl",
      "--dbname",
      target.connectionString,
      isEncrypted ? archivePath : backupFile,
    ], { env: restoreEnv });

    targetClient = new pg.Client(targetConnection);
    await targetClient.connect();
    const requiredTables = ["Store", "StoreAsset", "Lead", "Order", "OrderPayment"];
    const restoredTables = await targetClient.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
    `, [requiredTables]);
    const restoredNames = new Set(restoredTables.rows.map(({ table_name }) => table_name));
    const missingTables = requiredTables.filter((name) => !restoredNames.has(name));
    if (missingTables.length > 0) {
      throw new Error("Restored database is missing required DoorFlow tables");
    }
    const counts = await targetClient.query(`
      SELECT
        (SELECT count(*)::text FROM "Store") AS stores,
        (SELECT count(*)::text FROM "StoreAsset") AS assets,
        (SELECT count(*)::text FROM "Lead") AS leads
    `);
    console.info("PostgreSQL restore verified", counts.rows[0]);
  } finally {
    if (targetClient) await targetClient.end().catch(() => undefined);
    await rm(privateDirectory, { recursive: true, force: true });
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
