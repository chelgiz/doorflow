import { z } from "zod";
import { calculateDoorQuote, QuoteValidationError } from "@/lib/commerce/pricing";
import { quoteRequestSchema } from "@/lib/commerce/model";
import { getQuoteSource, QuoteSourceConfigurationError } from "@/lib/commerce/quote-source";
import { jsonResponse, readJsonRequest } from "@/lib/http/json";

export async function POST(request: Request) {
  const requestBody = await readJsonRequest(request);
  if (!requestBody.ok) return requestBody.response;

  const parsed = quoteRequestSchema.safeParse(requestBody.body);
  if (!parsed.success) {
    return jsonResponse(
      { error: "Invalid quote request", issues: z.treeifyError(parsed.error) },
      400,
    );
  }

  let source;
  try {
    source = await getQuoteSource(parsed.data.productSlug);
  } catch (error) {
    if (error instanceof QuoteSourceConfigurationError) {
      console.error("DoorFlow quote source is unavailable", {
        category: error.name,
      });
      return jsonResponse({ error: "Store pricing is not configured" }, 503);
    }
    throw error;
  }
  if (!source) {
    return jsonResponse({ error: "Product not found" }, 404);
  }

  try {
    const quote = calculateDoorQuote(source.product, source.pricing, parsed.data);
    return jsonResponse({
      quote,
      disclaimer: quote.isDemo
        ? "Демонстрационный расчёт по условным данным, не оферта."
        : "Предварительный расчёт по настройкам магазина, не публичная оферта.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("DoorFlow quote configuration is invalid", {
        category: error.name,
      });
      return jsonResponse({ error: "Quote configuration is unavailable" }, 500);
    }
    if (error instanceof QuoteValidationError) {
      return jsonResponse({ error: error.message }, 422);
    }
    throw error;
  }
}
