import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getDatabaseConfig } from "@/lib/db/config";

declare global {
  var doorflowPrisma: PrismaClient | undefined;
}

export function getPrismaClient() {
  const config = getDatabaseConfig();
  if (!config) {
    throw new Error("Database access is disabled until DATABASE_URL is configured.");
  }

  if (!globalThis.doorflowPrisma) {
    const adapter = new PrismaPg({ connectionString: config.databaseUrl });
    globalThis.doorflowPrisma = new PrismaClient({ adapter });
  }

  return globalThis.doorflowPrisma;
}
