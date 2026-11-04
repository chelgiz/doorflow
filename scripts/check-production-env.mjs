import { pathToFileURL } from "node:url";

const storeIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const remotePattern = /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:\/[A-Za-z0-9_./-]+$/;

export function getProductionEnvironmentErrors(environment = process.env) {
  const errors = [];
  const database = parseDatabaseUrl(environment.DATABASE_URL);
  const privacyNotice = parseUrl(environment.DOORFLOW_PRIVACY_NOTICE_URL);

  if (environment.NODE_ENV !== "production") errors.push("NODE_ENV");
  if (!database) {
    errors.push("DATABASE_URL");
  } else if (!["verify-full", "verify-ca"].includes(database.searchParams.get("sslmode") ?? "")) {
    errors.push("DATABASE_URL sslmode (use verify-full or verify-ca)");
  }
  if (environment.DOORFLOW_DEMO_MODE !== "false") errors.push("DOORFLOW_DEMO_MODE");
  if (!environment.DOORFLOW_STORE_ID || !storeIdPattern.test(environment.DOORFLOW_STORE_ID)) {
    errors.push("DOORFLOW_STORE_ID");
  }
  if (!environment.DOORFLOW_CONSENT_NOTICE_VERSION?.trim()
    || environment.DOORFLOW_CONSENT_NOTICE_VERSION.length > 40) {
    errors.push("DOORFLOW_CONSENT_NOTICE_VERSION");
  }
  if (!privacyNotice || privacyNotice.protocol !== "https:") {
    errors.push("DOORFLOW_PRIVACY_NOTICE_URL");
  }
  if (!environment.DOORFLOW_RATE_LIMIT_SECRET
    || environment.DOORFLOW_RATE_LIMIT_SECRET.length < 32) {
    errors.push("DOORFLOW_RATE_LIMIT_SECRET");
  }
  if (!isIntegerInRange(environment.DOORFLOW_PUBLIC_LEAD_RATE_LIMIT ?? "5", 1, 100)) {
    errors.push("DOORFLOW_PUBLIC_LEAD_RATE_LIMIT");
  }
  if (!isIntegerInRange(environment.DOORFLOW_PUBLIC_LEAD_WINDOW_SECONDS ?? "900", 60, 86_400)) {
    errors.push("DOORFLOW_PUBLIC_LEAD_WINDOW_SECONDS");
  }
  if (!environment.DOORFLOW_BACKUP_DIR?.startsWith("/")) errors.push("DOORFLOW_BACKUP_DIR");
  if (!environment.DOORFLOW_BACKUP_AGE_RECIPIENT?.startsWith("age1")
    || environment.DOORFLOW_BACKUP_AGE_RECIPIENT.length < 40) {
    errors.push("DOORFLOW_BACKUP_AGE_RECIPIENT");
  }
  if (!environment.DOORFLOW_BACKUP_REMOTE
    || !remotePattern.test(environment.DOORFLOW_BACKUP_REMOTE)
    || environment.DOORFLOW_BACKUP_REMOTE.includes("/../")
    || environment.DOORFLOW_BACKUP_REMOTE.endsWith("/..")) {
    errors.push("DOORFLOW_BACKUP_REMOTE");
  }
  if (!isNodeSupported(process.versions.node)) errors.push("Node.js version (20.9 or newer)");

  return errors;
}

function parseDatabaseUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["postgres:", "postgresql:"].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function parseUrl(value) {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isIntegerInRange(value, min, max) {
  if (!/^\d+$/.test(value)) return false;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max;
}

function isNodeSupported(value) {
  const [major, minor] = value.split(".").map(Number);
  return Number.isInteger(major) && Number.isInteger(minor)
    && (major > 20 || (major === 20 && minor >= 9));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = getProductionEnvironmentErrors();
  if (errors.length > 0) {
    console.error("Production environment check failed:", errors.join(", "));
    process.exitCode = 1;
  } else {
    console.info("Production environment configuration passed structural checks.");
  }
}
