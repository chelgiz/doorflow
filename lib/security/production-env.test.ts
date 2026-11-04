import { describe, expect, it } from "vitest";
import { getProductionEnvironmentErrors } from "../../scripts/check-production-env.mjs";

const validEnvironment = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://doorflow:placeholder@db.example.test/doorflow?sslmode=verify-full",
  DOORFLOW_DEMO_MODE: "false",
  DOORFLOW_STORE_ID: "2f0f3ca1-6c8c-4aef-85c6-89234567abcd",
  DOORFLOW_CONSENT_NOTICE_VERSION: "pilot-v1",
  DOORFLOW_PRIVACY_NOTICE_URL: "https://shop.example.test/privacy",
  DOORFLOW_RATE_LIMIT_SECRET: "not-a-production-secret-placeholder-0001",
  DOORFLOW_PUBLIC_LEAD_RATE_LIMIT: "5",
  DOORFLOW_PUBLIC_LEAD_WINDOW_SECONDS: "900",
  DOORFLOW_BACKUP_DIR: "/var/backups/doorflow",
  DOORFLOW_BACKUP_AGE_RECIPIENT: `age1${"a".repeat(58)}`,
  DOORFLOW_BACKUP_REMOTE: "backup@backup.example.test:/srv/backups/doorflow",
} as const;

describe("production environment validation", () => {
  it("accepts structurally valid settings without printing secret values", () => {
    expect(getProductionEnvironmentErrors(validEnvironment)).toEqual([]);
  });

  it("reports invalid setting names only", () => {
    const errors = getProductionEnvironmentErrors({
      ...validEnvironment,
      DATABASE_URL: "postgresql://private-user:private-password@db.example.test/doorflow",
      DOORFLOW_DEMO_MODE: "true",
      DOORFLOW_RATE_LIMIT_SECRET: "short",
      DOORFLOW_BACKUP_REMOTE: "backup@host:/srv/../unsafe",
    });

    expect(errors).toContain("DATABASE_URL sslmode (use verify-full or verify-ca)");
    expect(errors).toContain("DOORFLOW_DEMO_MODE");
    expect(errors).toContain("DOORFLOW_RATE_LIMIT_SECRET");
    expect(errors).toContain("DOORFLOW_BACKUP_REMOTE");
    expect(errors.join(" ")).not.toContain("private-password");
  });
});
