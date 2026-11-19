/**
 * Imports a dealer door price list exported from Excel into the store catalogue.
 *
 * Usage:
 *   npx tsx scripts/import-catalog.ts --json /tmp/doorflow-catalog/products.json \
 *     --photos /tmp/doorflow-catalog/photos --dry-run
 *   npx tsx scripts/import-catalog.ts --json ... --photos ... --apply
 *
 * The JSON is produced by the extraction step (see AGENTS.md). Products are
 * created unpublished (`isActive=false`), so the owner reviews prices, texts and
 * photos in the admin before anything appears on the storefront.
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import sharp from "sharp";
import { Prisma, PrismaClient } from "../generated/prisma/client";

type SourceProduct = {
  row: number;
  category: string;
  model: string;
  description: string;
  optPrice: number | null;
  retailPrice: number | null;
  sizes: string[];
  photos: string[];
};

type SourceFile = {
  categories: string[];
  products: SourceProduct[];
  skipped: SourceProduct[];
};

const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .split("")
    .map((char) => CYRILLIC[char] ?? char)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "model";
}

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const CATALOG_DESCRIPTION_LIMIT = 2000;
const MAX_IMAGE_WIDTH = 1600;
const MAX_IMAGE_BYTES = 1024 * 1024;

function parseSpecifications(product: SourceProduct) {
  const specifications: Record<string, string> = {};
  let lastKey: string | null = null;
  for (const rawLine of product.description.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = /^([А-Яа-яЁёA-Za-z][^:]{1,40}):\s*(.*)$/.exec(line);
    if (match) {
      lastKey = match[1].trim();
      specifications[lastKey] = match[2].trim();
    } else if (lastKey) {
      specifications[lastKey] = `${specifications[lastKey]} ${line}`.trim();
    }
  }
  if (product.sizes.length > 0) {
    specifications["Размеры"] = `${product.sizes.join(" / ")} (ширина × 2050 мм)`;
  }
  specifications["Гарантия"] = "1 год";
  specifications["Наличие"] = "в наличии; отдельные позиции — поставка до 2 недель";
  for (const [key, value] of Object.entries(specifications)) {
    specifications[key] = value.replace(/\s+/g, " ").trim().slice(0, 500);
  }
  return specifications;
}

async function normalizePhoto(filePath: string) {
  const bytes = await readFile(filePath);
  const normalized = await sharp(bytes)
    .rotate()
    .resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  if (normalized.byteLength > MAX_IMAGE_BYTES) {
    const smaller = await sharp(bytes).rotate().resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 70 }).toBuffer();
    return smaller;
  }
  return normalized;
}

async function main() {
  const jsonPath = argument("--json");
  const photosDir = argument("--photos");
  const dryRun = process.argv.includes("--dry-run") || !process.argv.includes("--apply");
  if (!jsonPath) throw new Error("Usage: --json <products.json> [--photos <dir>] [--apply|--dry-run]");

  const source = JSON.parse(await readFile(jsonPath, "utf8")) as SourceFile;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  const storeId = process.env.DOORFLOW_STORE_ID;
  const store = storeId
    ? await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true } })
    : await prisma.store.findFirst({ where: { slug: "dvermont" }, select: { id: true, name: true } });
  if (!store) throw new Error("Store not found (set DOORFLOW_STORE_ID)");

  console.log(`store: ${store.name} (${store.id}) | товаров: ${source.products.length} | режим: ${dryRun ? "dry-run" : "apply"}`);

  const summary = { created: 0, skipped: 0, photos: 0, photoErrors: 0 };
  for (const product of source.products) {
    const slug = slugify(product.model);
    const existing = await prisma.product.findUnique({
      where: { storeId_slug: { storeId: store.id, slug } },
      select: { id: true },
    });
    if (existing) {
      summary.skipped += 1;
      console.log(`  = ${product.model} — уже есть (${slug})`);
      continue;
    }
    const basePriceMinor = BigInt(Math.round((product.retailPrice ?? 0) * 100));
    const costMinor = product.optPrice ? BigInt(Math.round(product.optPrice * 100)) : null;
    if (basePriceMinor <= BigInt(0)) {
      summary.skipped += 1;
      console.log(`  ! ${product.model} — нет цены`);
      continue;
    }
    const data = {
      storeId: store.id,
      slug,
      model: product.model.slice(0, 100),
      name: product.model.slice(0, 160),
      description: product.description.slice(0, CATALOG_DESCRIPTION_LIMIT),
      category: product.category.slice(0, 80),
      basePriceMinor,
      costMinor,
      specifications: parseSpecifications(product) as Prisma.InputJsonValue,
      isActive: false,
    };
    if (dryRun) {
      summary.created += 1;
      summary.photos += product.photos.length;
      console.log(`  + ${product.model} | ${product.retailPrice} ₽ | фото: ${product.photos.length} | ${product.category}`);
      continue;
    }
    const created = await prisma.product.create({ data, select: { id: true } });
    summary.created += 1;
    let sortOrder = 0;
    if (photosDir) {
      for (const photo of product.photos) {
        try {
          const normalized = await normalizePhoto(join(photosDir, photo));
          await prisma.storeAsset.create({
            data: {
              storeId: store.id,
              productId: created.id,
              type: "PRODUCT_IMAGE",
              contentType: "image/webp",
              byteSize: normalized.byteLength,
              sha256: createHash("sha256").update(normalized).digest("hex"),
              data: normalized,
              sortOrder,
            },
          });
          sortOrder += 1;
          summary.photos += 1;
        } catch (error) {
          summary.photoErrors += 1;
          console.warn(`    фото ${photo} не импортировано: ${error instanceof Error ? error.message : error}`);
        }
      }
    }
    console.log(`  + ${product.model} (${slug}) | фото: ${sortOrder}`);
  }

  console.log(`\nитого: создано ${summary.created}, пропущено ${summary.skipped}, фото ${summary.photos}, ошибок фото ${summary.photoErrors}`);
  await prisma.$disconnect();
}

void main();
