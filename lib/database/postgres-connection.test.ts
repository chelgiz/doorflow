import { describe, expect, it } from "vitest";
import {
  getClientConnectionString,
  parseDatabaseConnection,
} from "../../scripts/postgres-connection.mjs";

describe("PostgreSQL connection parsing", () => {
  it("keeps passwords out of command connection strings", () => {
    const parsed = parseDatabaseConnection(
      "postgresql://test-user:synthetic-password@db.example.test:5432/doorflow?schema=public&sslmode=verify-full",
      "DATABASE_URL",
    );

    expect(parsed.password).toBe("synthetic-password");
    expect(parsed.connectionString).toBe(
      "postgresql://test-user@db.example.test:5432/doorflow?sslmode=verify-full",
    );
    expect(parsed.connectionString).not.toContain("synthetic-password");
  });

  it("restores the password only for an in-process PostgreSQL client", () => {
    const parsed = parseDatabaseConnection(
      "postgresql://test-user:synthetic-password@db.example.test:5432/doorflow?sslmode=verify-full",
      "DATABASE_URL",
    );

    expect(getClientConnectionString(parsed)).toBe(
      "postgresql://test-user:synthetic-password@db.example.test:5432/doorflow?sslmode=verify-full",
    );
  });
});
