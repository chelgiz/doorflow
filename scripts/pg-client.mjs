import { spawn } from "node:child_process";
import { closeSync, createReadStream, openSync } from "node:fs";
import { rm } from "node:fs/promises";
import pg from "pg";
import { getClientConnectionString } from "./postgres-connection.mjs";

/**
 * Shared selection of the `pg_dump`/`pg_restore` client for DoorFlow scripts.
 *
 * PostgreSQL refuses to dump a newer server with an older client, so the client
 * major version must match the server major version. Two supported modes:
 *
 * 1. `DOORFLOW_DB_CONTAINER` is set: the matching client lives inside that
 *    Docker container (the container ships the same version as its server).
 * 2. Otherwise a local client is used, but only when its major version equals
 *    the server major version. A mismatch fails with actionable guidance
 *    instead of a cryptic `pg_dump` error.
 */

export const CONTAINER_VARIABLE = "DOORFLOW_DB_CONTAINER";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function parseClientMajor(versionOutput) {
  const match = /PostgreSQL\)\s*(\d+)/i.exec(String(versionOutput ?? ""));
  if (!match) {
    throw new Error("Unable to determine the pg_dump/pg_restore major version");
  }
  return Number(match[1]);
}

/**
 * Pure client decision, kept separate so it can be tested without a database.
 */
export function selectClientMode({ container, localMajor, serverMajor }) {
  if (container) return { mode: "container", container };
  if (localMajor == null) {
    throw new Error(
      `No PostgreSQL client found. Install pg_dump/pg_restore ${serverMajor ?? ""}`.trim() +
        `, or set ${CONTAINER_VARIABLE} to the database container name.`,
    );
  }
  if (serverMajor == null) {
    throw new Error("Unable to determine the PostgreSQL server version");
  }
  if (localMajor !== serverMajor) {
    throw new Error(
      `pg_dump/pg_restore ${localMajor} cannot work with PostgreSQL ${serverMajor}. ` +
        `Set ${CONTAINER_VARIABLE} to the database container name or install a matching client.`,
    );
  }
  return { mode: "local", localMajor, serverMajor };
}

export function describeClient(client) {
  return client.mode === "container"
    ? `client inside container ${client.container}`
    : `local client ${client.localMajor}`;
}

function databaseTarget(connection) {
  const { url } = connection;
  return {
    host: url.hostname,
    port: url.port || "5432",
    username: url.username ? decodeURIComponent(url.username) : undefined,
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
  };
}

function redact(text, secrets) {
  let output = String(text ?? "");
  for (const secret of secrets) {
    if (secret && secret.length >= 4) output = output.split(secret).join("[redacted]");
  }
  return output;
}

function failureMessage(command, code, signal, stderr, secrets) {
  const detail = redact(stderr, secrets).trim();
  const suffix = detail ? `: ${detail}` : "";
  return new Error(`${command} failed (${signal ?? `exit ${code}`})${suffix}`);
}

function runCaptured(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], env });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve(stdout);
      else reject(failureMessage(command, code, signal, stderr, []));
    });
  });
}

async function runWithStreams({ command, args, env, stdoutPath, stdinPath, secrets = [] }) {
  let stdoutHandle;
  if (stdoutPath) {
    await rm(stdoutPath, { force: true });
    stdoutHandle = openSync(stdoutPath, "w", 0o600);
  }

  const stdinStream = stdinPath ? createReadStream(stdinPath) : "ignore";

  try {
    await new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: [stdinStream, stdoutHandle ?? "ignore", "pipe"],
        env,
      });
      let stderr = "";
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (code === 0) resolve();
        else reject(failureMessage(command, code, signal, stderr, secrets));
      });
    });
  } finally {
    if (stdoutHandle !== undefined) closeSync(stdoutHandle);
    if (stdinStream !== "ignore") stdinStream.destroy();
  }
}

export async function readServerMajor(connection) {
  const client = new pg.Client({ connectionString: getClientConnectionString(connection) });
  await client.connect();
  try {
    const { rows } = await client.query("show server_version_num");
    const value = Number(rows[0]?.server_version_num);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error("PostgreSQL server returned an unexpected version number");
    }
    return Math.floor(value / 10000);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function readLocalClientMajor(tool) {
  try {
    const output = await runCaptured(tool, ["--version"], process.env);
    return parseClientMajor(output);
  } catch {
    return null;
  }
}

/**
 * Resolves the client to use, verifying version compatibility when local tools
 * are selected. `overrides` exists for tests; production callers pass nothing.
 */
export async function resolvePgClient(connection, overrides = {}) {
  const container = (overrides.container ?? process.env[CONTAINER_VARIABLE])?.trim() || undefined;
  const probeServerMajor = overrides.probeServerMajor ?? (() => readServerMajor(connection));
  const probeLocalMajor =
    overrides.probeLocalMajor ?? (() => readLocalClientMajor("pg_dump"));

  if (container) {
    const target = databaseTarget(connection);
    if (!LOOPBACK_HOSTS.has(target.host.toLowerCase())) {
      throw new Error(
        `${CONTAINER_VARIABLE} only supports a database reachable on this host; ` +
          `DATABASE_URL points at ${target.host}`,
      );
    }
    const running = await runCaptured(
      "docker",
      ["inspect", "--format", "{{.State.Running}}", container],
      process.env,
    ).catch(() => null);
    if (running === null) {
      throw new Error(`${CONTAINER_VARIABLE} names a container that Docker cannot inspect`);
    }
    if (running.trim() !== "true") {
      throw new Error(`Container ${container} is not running`);
    }
    return { mode: "container", container };
  }

  const [localMajor, serverMajor] = await Promise.all([probeLocalMajor(), probeServerMajor()]);
  return selectClientMode({ container: undefined, localMajor, serverMajor });
}

function dockerEnvArgs(connection) {
  return connection.password ? ["-e", "PGPASSWORD"] : [];
}

function childEnv(connection) {
  const env = { ...process.env };
  if (connection.password) env.PGPASSWORD = connection.password;
  return env;
}

export async function dumpToFile({ client, connection, filePath }) {
  const env = childEnv(connection);
  const secrets = [connection.password];
  const commonArgs = ["--format=custom", "--no-owner", "--no-acl"];

  if (client.mode === "container") {
    await runWithStreams({
      command: "docker",
      args: [
        "exec",
        "-i",
        ...dockerEnvArgs(connection),
        client.container,
        "pg_dump",
        ...commonArgs,
        "--username",
        databaseTarget(connection).username ?? "postgres",
        "--dbname",
        databaseTarget(connection).database,
      ],
      env,
      stdoutPath: filePath,
      secrets,
    });
    return;
  }

  await runWithStreams({
    command: "pg_dump",
    args: [...commonArgs, "--file", filePath, "--dbname", connection.connectionString],
    env,
    secrets,
  });
}

export async function listArchive({ client, connection, filePath }) {
  const env = childEnv(connection);
  const secrets = [connection.password];

  if (client.mode === "container") {
    await runWithStreams({
      command: "docker",
      args: ["exec", "-i", ...dockerEnvArgs(connection), client.container, "pg_restore", "--list"],
      env,
      stdinPath: filePath,
      secrets,
    });
    return;
  }

  await runWithStreams({
    command: "pg_restore",
    args: ["--list", filePath],
    env,
    secrets,
  });
}

export async function restoreArchive({ client, connection, filePath }) {
  const env = childEnv(connection);
  const secrets = [connection.password];
  const commonArgs = ["--single-transaction", "--exit-on-error", "--no-owner", "--no-acl"];

  if (client.mode === "container") {
    await runWithStreams({
      command: "docker",
      args: [
        "exec",
        "-i",
        ...dockerEnvArgs(connection),
        client.container,
        "pg_restore",
        ...commonArgs,
        "--username",
        databaseTarget(connection).username ?? "postgres",
        "--dbname",
        databaseTarget(connection).database,
      ],
      env,
      stdinPath: filePath,
      secrets,
    });
    return;
  }

  await runWithStreams({
    command: "pg_restore",
    args: [...commonArgs, "--dbname", connection.connectionString, filePath],
    env,
    secrets,
  });
}
