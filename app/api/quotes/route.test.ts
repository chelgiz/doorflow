import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/quotes/route";

function postQuote(body: unknown) {
  return POST(
    new Request("http://localhost/api/quotes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/quotes", () => {
  const validRequest = {
    productSlug: "df-a01-graphite",
    quantity: 1,
    selections: {
      "lock-set": ["lock-standard"],
      "interior-panel": ["panel-standard"],
    },
    services: { delivery: 1 },
  };

  it("calculates price on the server and marks demo estimates", async () => {
    const response = await postQuote(validRequest);
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.quote.totalPriceMinor).toBe(5_140_000);
    expect(result.quote.isDemo).toBe(true);
    expect(result.disclaimer).toContain("не оферта");
    expect(result.disclaimer).toContain("Демонстрационный расчёт");
  });

  it("rejects client-supplied amounts", async () => {
    const response = await postQuote({ ...validRequest, totalPriceMinor: 1 });
    expect(response.status).toBe(400);
  });

  it("rejects unavailable options and unknown products", async () => {
    const invalidOptionResponse = await postQuote({
      ...validRequest,
      selections: {
        "lock-set": ["not-configured"],
        "interior-panel": ["panel-standard"],
      },
    });
    expect(invalidOptionResponse.status).toBe(422);

    const unknownProductResponse = await postQuote({
      ...validRequest,
      productSlug: "missing-product",
    });
    expect(unknownProductResponse.status).toBe(404);
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{invalid-json",
      }),
    );
    expect(response.status).toBe(400);
  });
});
