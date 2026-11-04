import { connection } from "next/server";
import { getConfiguredStore, isDemoMode } from "@/lib/db/config";
import { getPrismaClient } from "@/lib/db/prisma";
import { jsonResponse } from "@/lib/http/json";

export async function GET() {
  await connection();
  const configuredStore = getConfiguredStore();
  if (!configuredStore) {
    return jsonResponse({
      demoMode: isDemoMode(),
      submissionEnabled: false,
      privacyNoticeUrl: null,
    });
  }

  const store = await getPrismaClient().store.findUnique({
    where: { id: configuredStore.storeId },
    select: { isDemo: true },
  });

  return jsonResponse({
    demoMode: isDemoMode(),
    submissionEnabled: Boolean(store && !store.isDemo),
    privacyNoticeUrl: store && !store.isDemo ? configuredStore.privacyNoticeUrl : null,
  });
}
