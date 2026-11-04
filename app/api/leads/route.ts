import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { calculateDoorQuote, QuoteValidationError } from "@/lib/commerce/pricing";
import { getQuoteSource, QuoteSourceConfigurationError } from "@/lib/commerce/quote-source";
import { leadRequestSchema, normalizePhone } from "@/lib/commerce/leads";
import { getConfiguredStore } from "@/lib/db/config";
import { getPrismaClient } from "@/lib/db/prisma";
import { checkPublicSubmissionLimit } from "@/lib/commerce/public-submission-limit";
import { jsonResponse, readJsonRequest } from "@/lib/http/json";

export async function POST(request: Request) {
  const configuredStore = getConfiguredStore();
  if (!configuredStore) {
    return jsonResponse(
      {
        error:
          "Приём заявок отключён: сначала настройте реальный магазин, базу данных и уведомление о персональных данных.",
      },
      503,
    );
  }

  const rateLimit = await checkPublicSubmissionLimit(request, configuredStore.storeId);
  if (!rateLimit.ok) {
    return jsonResponse(
      { error: rateLimit.status === 429 ? "Слишком много обращений. Попробуйте позже." : "Приём заявок временно недоступен." },
      rateLimit.status,
    );
  }

  const requestBody = await readJsonRequest(request);
  if (!requestBody.ok) return requestBody.response;

  const parsed = leadRequestSchema.safeParse(requestBody.body);
  if (!parsed.success) {
    return jsonResponse(
      { error: "Проверьте поля формы", issues: z.treeifyError(parsed.error) },
      400,
    );
  }
  const leadRequest = parsed.data;
  const idempotencyKeyValue = request.headers.get("idempotency-key");
  const idempotencyKey = idempotencyKeyValue
    ? z.uuid().safeParse(idempotencyKeyValue)
    : null;
  if (idempotencyKey && !idempotencyKey.success) {
    return jsonResponse({ error: "Invalid idempotency key" }, 400);
  }
  const idempotencyHash = idempotencyKey
    ? createHash("sha256")
        .update(JSON.stringify({ ...leadRequest, phone: normalizePhone(leadRequest.phone) }))
        .digest("hex")
    : null;

  const prisma = getPrismaClient();
  const store = await prisma.store.findUnique({
    where: { id: configuredStore.storeId },
    select: { id: true, isDemo: true },
  });
  if (!store || store.isDemo) {
    return jsonResponse({ error: "Настроенный рабочий магазин не найден" }, 503);
  }

  let productId: string | undefined;
  let quoteSnapshot: Prisma.InputJsonValue | undefined;
  let selectedConfiguration: Prisma.InputJsonValue | undefined;

  if (leadRequest.type === "order") {
    let source;
    try {
      source = await getQuoteSource(leadRequest.productSlug);
    } catch (error) {
      if (error instanceof QuoteSourceConfigurationError) {
        console.error("DoorFlow order quote source is unavailable", {
          category: error.name,
        });
        return jsonResponse({ error: "Стоимость товара сейчас недоступна" }, 503);
      }
      throw error;
    }

    if (!source || source.product.isDemo || !source.productId) {
      return jsonResponse({ error: "Заказ для этой модели сейчас недоступен" }, 422);
    }

    let quote: ReturnType<typeof calculateDoorQuote>;
    try {
      quote = calculateDoorQuote(source.product, source.pricing, {
        productSlug: leadRequest.productSlug,
        quantity: leadRequest.quantity,
        selections: leadRequest.selections,
        services: leadRequest.services,
      });
    } catch (error) {
      if (error instanceof QuoteValidationError) {
        return jsonResponse({ error: error.message }, 422);
      }
      if (error instanceof z.ZodError) {
        console.error("DoorFlow order configuration is invalid", {
          category: error.name,
        });
        return jsonResponse({ error: "Order configuration is unavailable" }, 503);
      }
      throw error;
    }
    if (quote.isDemo) {
      return jsonResponse({ error: "Заказ для демонстрационной модели недоступен" }, 422);
    }

    productId = source.productId;
    selectedConfiguration = {
      quantity: leadRequest.quantity,
      selections: leadRequest.selections,
      services: leadRequest.services,
    };
    quoteSnapshot = quote satisfies Prisma.InputJsonValue;
  } else if (leadRequest.productSlug) {
    let source;
    try {
      source = await getQuoteSource(leadRequest.productSlug);
    } catch (error) {
      if (error instanceof QuoteSourceConfigurationError) {
        console.error("DoorFlow measurement product lookup is unavailable", {
          category: error.name,
        });
        return jsonResponse({ error: "Выбранная модель сейчас недоступна" }, 503);
      }
      throw error;
    }
    if (!source || source.product.isDemo || !source.productId) {
      return jsonResponse({ error: "Выбранная модель сейчас недоступна" }, 422);
    }
    productId = source.productId;
  }

  const attribution = leadRequest.attribution;
  try {
    const savedLead = await prisma.lead.create({
      data: {
      storeId: store.id,
      productId,
      type: leadRequest.type === "order" ? "ORDER" : "MEASUREMENT",
      customerName: leadRequest.name,
      phone: normalizePhone(leadRequest.phone),
      address: leadRequest.address,
      comment: leadRequest.comment,
      source: attribution?.source,
      utmSource: attribution?.utmSource,
      utmMedium: attribution?.utmMedium,
      utmCampaign: attribution?.utmCampaign,
      utmContent: attribution?.utmContent,
      utmTerm: attribution?.utmTerm,
      selectedConfiguration,
      quoteSnapshot,
      personalDataConsentAt: new Date(),
      consentNoticeVersion: configuredStore.consentNoticeVersion,
      ...(idempotencyKey?.success
        ? { idempotencyKey: idempotencyKey.data, idempotencyHash }
        : {}),
      statusHistory: {
        create: {
          from: null,
          to: "NEW",
        },
      },
    },
    select: { id: true, createdAt: true },
    });

    return jsonResponse(
      {
        id: savedLead.id,
        createdAt: savedLead.createdAt.toISOString(),
        message: "Обращение сохранено",
      },
      201,
    );
  } catch (error) {
    if (
      idempotencyKey?.success &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.lead.findFirst({
        where: { storeId: store.id, idempotencyKey: idempotencyKey.data },
        select: { id: true, createdAt: true, idempotencyHash: true },
      });
      if (existing?.idempotencyHash === idempotencyHash) {
        return jsonResponse({
          id: existing.id,
          createdAt: existing.createdAt.toISOString(),
          message: "Обращение уже сохранено",
        });
      }
      if (existing) return jsonResponse({ error: "Idempotency key was already used" }, 409);
    }
    console.error("DoorFlow public lead could not be saved", {
      category: error instanceof Error ? error.name : "unknown",
      ...(error instanceof Prisma.PrismaClientKnownRequestError ? { code: error.code } : {}),
    });
    return jsonResponse({ error: "Не удалось сохранить обращение. Попробуйте позже." }, 503);
  }
}
