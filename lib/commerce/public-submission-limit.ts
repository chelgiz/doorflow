import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { Prisma } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/db/prisma";

const defaultLimit = 5;
const defaultWindowSeconds = 15 * 60;

export function getPublicSubmissionConfiguration() {
  const secret = process.env.DOORFLOW_RATE_LIMIT_SECRET;
  const limit = Number(process.env.DOORFLOW_PUBLIC_LEAD_RATE_LIMIT ?? defaultLimit);
  const windowSeconds = Number(
    process.env.DOORFLOW_PUBLIC_LEAD_WINDOW_SECONDS ?? defaultWindowSeconds,
  );
  if (
    !secret ||
    secret.length < 32 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isSafeInteger(windowSeconds) ||
    windowSeconds < 60 ||
    windowSeconds > 86_400
  ) {
    return null;
  }
  return { secret, limit, windowSeconds };
}

function getTrustedProxyClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const candidate = forwarded || realIp;
  return candidate && isIP(candidate) ? candidate : null;
}

export async function checkPublicSubmissionLimit(request: Request, storeId: string) {
  const configuration = getPublicSubmissionConfiguration();
  const clientIp = getTrustedProxyClientIp(request);
  if (!configuration || !clientIp) {
    return { ok: false as const, status: 503 };
  }

  const fingerprintHash = createHmac("sha256", configuration.secret)
    .update(`${storeId}:${clientIp}`)
    .digest("hex");
  const now = new Date();
  const resetBefore = new Date(now.getTime() - configuration.windowSeconds * 1000);
  const blockedUntil = new Date(now.getTime() + configuration.windowSeconds * 1000);
  let attempt: { attempts: number } | undefined;
  try {
    [attempt] = await getPrismaClient().$queryRaw<Array<{ attempts: number }>>`
      INSERT INTO "PublicSubmissionLimit"
        ("id", "storeId", "fingerprintHash", "attempts", "windowStartedAt", "updatedAt")
      VALUES
        (${randomUUID()}::uuid, ${storeId}::uuid, ${fingerprintHash}, 1, ${now}, ${now})
      ON CONFLICT ("storeId", "fingerprintHash")
      DO UPDATE SET
        "attempts" = CASE
          WHEN "PublicSubmissionLimit"."windowStartedAt" <= ${resetBefore}
            THEN 1
          ELSE "PublicSubmissionLimit"."attempts" + 1
        END,
        "windowStartedAt" = CASE
          WHEN "PublicSubmissionLimit"."windowStartedAt" <= ${resetBefore}
            THEN ${now}
          ELSE "PublicSubmissionLimit"."windowStartedAt"
        END,
        "blockedUntil" = CASE
          WHEN (
            CASE
              WHEN "PublicSubmissionLimit"."windowStartedAt" <= ${resetBefore} THEN 1
              ELSE "PublicSubmissionLimit"."attempts" + 1
            END
          ) > ${configuration.limit}
            THEN ${blockedUntil}::timestamptz
          ELSE NULL
        END,
        "updatedAt" = ${now}
      RETURNING "attempts"
    `;
  } catch (error) {
    console.error("DoorFlow public submission limit unavailable", {
      category: error instanceof Error ? error.name : "unknown",
      ...(error instanceof Prisma.PrismaClientKnownRequestError ? { code: error.code } : {}),
    });
    return { ok: false as const, status: 503 };
  }

  return (attempt?.attempts ?? configuration.limit + 1) > configuration.limit
    ? { ok: false as const, status: 429 }
    : { ok: true as const };
}
