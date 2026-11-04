import { describe, expect, it } from "vitest";
import { isSameOriginRequest, roleCan } from "@/lib/admin/auth";
import { hashAdminPassword, verifyAdminPassword } from "@/lib/admin/password";

describe("admin authentication primitives", () => {
  it("uses salted Argon2id password hashes and verifies the password", async () => {
    const first = await hashAdminPassword("a sufficiently long test password");
    const second = await hashAdminPassword("a sufficiently long test password");

    expect(first).toContain("$argon2id$");
    expect(first).not.toBe(second);
    await expect(verifyAdminPassword(first, "a sufficiently long test password")).resolves.toBe(true);
    await expect(verifyAdminPassword(first, "incorrect password")).resolves.toBe(false);
  });

  it("enforces role-based permissions and exact request origins", () => {
    const permissions = [
      "catalog:read",
      "catalog:write",
      "leads:read",
      "leads:write",
      "settings:read",
      "settings:write",
      "users:read",
      "users:write",
      "operations:read",
      "operations:write",
      "measurements:own",
      "installations:own",
    ] as const;
    const expectedPermissions = {
      OWNER: permissions.filter((permission) => !permission.endsWith(":own")),
      ADMIN: permissions.filter((permission) => !permission.startsWith("users:") && !permission.endsWith(":own")),
      MANAGER: ["catalog:read", "leads:read", "leads:write", "operations:read", "operations:write"],
      MEASURER: ["measurements:own"],
      INSTALLER: ["installations:own"],
    } as const;

    for (const [role, allowed] of Object.entries(expectedPermissions) as [
      keyof typeof expectedPermissions,
      readonly string[],
    ][]) {
      for (const permission of permissions) {
        expect(roleCan(role, permission)).toBe(allowed.includes(permission));
      }
    }

    expect(isSameOriginRequest(new Request("https://store.example/api", {
      method: "POST",
      headers: { origin: "https://store.example" },
    }))).toBe(true);
    expect(isSameOriginRequest(new Request("https://store.example/api", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    }))).toBe(false);
    expect(isSameOriginRequest(new Request("https://store.example/api", { method: "POST" }))).toBe(false);
  });
});
