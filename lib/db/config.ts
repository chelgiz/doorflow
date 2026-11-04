import { z } from "zod";

const storeIdSchema = z.string().uuid();
const databaseUrlSchema = z.string().url().refine((value) => {
  const url = new URL(value);
  return ["postgres:", "postgresql:"].includes(url.protocol);
});
const privacyNoticeUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" || url.hostname === "localhost";
  });

export function isDemoMode() {
  return process.env.DOORFLOW_DEMO_MODE !== "false";
}

export function getDatabaseConfig() {
  const databaseUrl = databaseUrlSchema.safeParse(process.env.DATABASE_URL);
  if (!databaseUrl.success) return null;
  return { databaseUrl: databaseUrl.data };
}

export function getAdminStoreId() {
  if (isDemoMode()) return null;
  const database = getDatabaseConfig();
  const storeId = storeIdSchema.safeParse(process.env.DOORFLOW_STORE_ID);
  if (!database || !storeId.success) return null;
  return { ...database, storeId: storeId.data };
}

export function getConfiguredStore() {
  const database = getDatabaseConfig();
  const storeId = storeIdSchema.safeParse(process.env.DOORFLOW_STORE_ID);
  const consentNoticeVersion = process.env.DOORFLOW_CONSENT_NOTICE_VERSION?.trim();
  const rateLimitSecret = process.env.DOORFLOW_RATE_LIMIT_SECRET;
  const rateLimit = Number(process.env.DOORFLOW_PUBLIC_LEAD_RATE_LIMIT ?? 5);
  const rateWindowSeconds = Number(process.env.DOORFLOW_PUBLIC_LEAD_WINDOW_SECONDS ?? 900);
  const privacyNoticeUrl = privacyNoticeUrlSchema.safeParse(
    process.env.DOORFLOW_PRIVACY_NOTICE_URL,
  );

  if (
    isDemoMode() ||
    !database ||
    !storeId.success ||
    !rateLimitSecret ||
    rateLimitSecret.length < 32 ||
    !Number.isSafeInteger(rateLimit) ||
    rateLimit < 1 ||
    rateLimit > 100 ||
    !Number.isSafeInteger(rateWindowSeconds) ||
    rateWindowSeconds < 60 ||
    rateWindowSeconds > 86_400 ||
    !privacyNoticeUrl.success ||
    !consentNoticeVersion ||
    consentNoticeVersion.length > 40
  ) {
    return null;
  }

  return {
    databaseUrl: database.databaseUrl,
    storeId: storeId.data,
    consentNoticeVersion,
    privacyNoticeUrl: privacyNoticeUrl.data,
  };
}

export function areSubmissionsEnabled() {
  return getConfiguredStore() !== null;
}
