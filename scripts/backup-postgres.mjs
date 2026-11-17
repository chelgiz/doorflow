import "dotenv/config";
import { spawn } from "node:child_process";
import { access, chmod, link, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDatabaseConnection } from "./postgres-connection.mjs";
import { describeClient, dumpToFile, listArchive, resolvePgClient } from "./pg-client.mjs";

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

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function validateRemoteDestination(value) {
  if (!/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:\/[A-Za-z0-9_./-]+$/.test(value)) {
    throw new Error("DOORFLOW_BACKUP_REMOTE must be user@host:/absolute/path using safe characters");
  }
  if (value.includes("/../") || value.endsWith("/..")) {
    throw new Error("DOORFLOW_BACKUP_REMOTE must not contain parent-directory segments");
  }
}

async function main() {
  process.umask(0o077);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const recipient = process.env.DOORFLOW_BACKUP_AGE_RECIPIENT;
  const remote = process.env.DOORFLOW_BACKUP_REMOTE;
  if (remote && !recipient) {
    throw new Error("Offsite backup transfers require DOORFLOW_BACKUP_AGE_RECIPIENT");
  }
  if (process.env.NODE_ENV === "production") {
    if (!recipient) throw new Error("Production backups require DOORFLOW_BACKUP_AGE_RECIPIENT");
    if (!remote) throw new Error("Production backups require DOORFLOW_BACKUP_REMOTE");
  }
  if (remote) validateRemoteDestination(remote);

  const connection = parseDatabaseConnection(databaseUrl, "DATABASE_URL");
  const backupDirectory = path.resolve(process.env.DOORFLOW_BACKUP_DIR ?? "backups");
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  await chmod(backupDirectory, 0o700);
  const timestamp = new Date().toISOString().replaceAll(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const extension = recipient ? ".dump.age" : ".dump";
  const outputPath = path.join(backupDirectory, `doorflow-${timestamp}${extension}`);
  const temporaryDump = `${outputPath}.${process.pid}.partial`;
  const temporaryEncrypted = `${outputPath}.${process.pid}.encrypted-partial`;

  for (const candidate of [outputPath, temporaryDump, temporaryEncrypted]) {
    if (await pathExists(candidate)) throw new Error(`Refusing to overwrite existing backup file`);
  }

  const client = await resolvePgClient(connection);
  console.info(`PostgreSQL backup client: ${describeClient(client)}`);

  try {
    await dumpToFile({ client, connection, filePath: temporaryDump });
    await listArchive({ client, connection, filePath: temporaryDump });

    if (recipient) {
      await run("age", ["--encrypt", "--recipient", recipient, "--output", temporaryEncrypted, temporaryDump]);
      await link(temporaryEncrypted, outputPath);
      await rm(temporaryEncrypted);
      await rm(temporaryDump);
    } else {
      await link(temporaryDump, outputPath);
      await rm(temporaryDump);
    }

    if (remote) {
      await run("rsync", ["--archive", "--partial", "--protect-args", outputPath, remote]);
    }
    console.info(`PostgreSQL backup completed: ${outputPath}`);
  } catch (error) {
    await rm(temporaryDump, { force: true });
    await rm(temporaryEncrypted, { force: true });
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("PostgreSQL backup failed", {
      category: error instanceof Error ? error.name : "unknown",
      message: error instanceof Error ? error.message : "unknown failure",
    });
    process.exitCode = 1;
  });
}
