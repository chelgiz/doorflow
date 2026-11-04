import { describe, expect, it } from "vitest";
import { contentSecurityPolicyReportOnly } from "@/lib/security/content-security-policy";

describe("Content Security Policy rollout", () => {
  it("uses a restrictive report-only candidate without inline script exceptions", () => {
    expect(contentSecurityPolicyReportOnly).toContain("default-src 'self'");
    expect(contentSecurityPolicyReportOnly).toContain("object-src 'none'");
    expect(contentSecurityPolicyReportOnly).toContain("frame-ancestors 'none'");
    expect(contentSecurityPolicyReportOnly).toContain("script-src 'self'");
    expect(contentSecurityPolicyReportOnly).not.toContain("unsafe-inline");
    expect(contentSecurityPolicyReportOnly).not.toContain("unsafe-eval");
  });
});
