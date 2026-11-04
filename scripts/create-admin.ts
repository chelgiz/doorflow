import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { randomUUID } from "node:crypto";
import { stdin, stdout } from "node:process";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../generated/prisma/client";
import { hashAdminPassword } from "../lib/admin/password";
import { createStorefrontConfiguration } from "../lib/storefront/config";

async function readSecret(prompt: string) {
  if (!stdin.isTTY || !stdin.setRawMode) {
    throw new Error("Run this setup command in an interactive terminal.");
  }

  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  return new Promise<string>((resolve, reject) => {
    let value = "";
    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          stdin.setRawMode(false);
          stdin.off("data", onData);
          reject(new Error("Admin setup cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          stdin.setRawMode(false);
          stdin.off("data", onData);
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += character;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !["postgres:", "postgresql:"].includes(new URL(databaseUrl).protocol)) {
    throw new Error("Configure DATABASE_URL with a PostgreSQL connection before setup.");
  }

  const prompts = createInterface({ input: stdin, output: stdout });
  const storeName = (await prompts.question("Store name: ")).trim();
  const storeSlug = (await prompts.question("Store slug (lowercase, hyphens): "))
    .trim()
    .toLowerCase();
  const email = (await prompts.question("Owner email: ")).trim().toLowerCase();
  prompts.close();

  if (storeName.length < 2 || storeName.length > 160) {
    throw new Error("Store name must be between 2 and 160 characters.");
  }
  if (!/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/.test(storeSlug)) {
    throw new Error("Store slug must be 3-80 lowercase letters, digits, or hyphens.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error("Enter a valid owner email.");
  }

  const password = await readSecret("Owner password (minimum 12 characters): ");
  if (password.length < 12 || password.length > 128) {
    throw new Error("Password must contain 12-128 characters.");
  }
  const confirmation = await readSecret("Confirm password: ");
  if (password !== confirmation) throw new Error("Passwords do not match.");

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });
  try {
    const storeId = randomUUID();
    const passwordHash = await hashAdminPassword(password);
    const storefront = createStorefrontConfiguration({ name: storeName, settings: {} }, []);
    await prisma.$transaction(async (transaction) => {
      await transaction.store.create({
        data: { id: storeId, slug: storeSlug, name: storeName, isDemo: false },
      });
      await transaction.storefront.create({
        data: {
          storeId,
          draft: storefront as Prisma.InputJsonValue,
          published: storefront as Prisma.InputJsonValue,
        },
      });
      await transaction.adminUser.create({
        data: {
          storeId,
          email,
          passwordHash,
          role: "OWNER",
        },
      });
    });

    console.info("\nStore and owner account created.");
    console.info(`Set DOORFLOW_STORE_ID=${storeId} in the server environment.`);
    console.info("Keep demo mode enabled until verified catalog data is published.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Admin setup failed", {
    category: error instanceof Error ? error.name : "unknown",
    ...(error instanceof Prisma.PrismaClientKnownRequestError ? { code: error.code } : {}),
  });
  process.exitCode = 1;
});
