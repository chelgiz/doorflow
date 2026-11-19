import { describe, expect, it, vi } from "vitest";
import {
  buildLeadMessage,
  getTelegramConfig,
  notifyNewLead,
  sendTelegramMessage,
  type LeadNotification,
} from "@/lib/notifications/telegram";

const TOKEN = "123456789:AAHtest-token-with-enough-length-1234";

function lead(overrides: Partial<LeadNotification> = {}): LeadNotification {
  return {
    id: "9f1d2c3b-4a5e-4f60-8a71-2b3c4d5e6f70",
    type: "ORDER",
    customerName: "Иван Петров",
    phone: "+79000000001",
    address: "ул. Ленина, 1",
    comment: "Позвонить после 18:00",
    productLabel: "Дверь «Гранит» · DF-A01",
    totalMinor: 7_330_000,
    source: null,
    utmSource: "yandex",
    createdAt: new Date("2026-11-19T02:15:00.000Z"),
    adminBaseUrl: "https://двермонт.рф",
    ...overrides,
  };
}

describe("telegram configuration", () => {
  it("is disabled without a token or chats", () => {
    expect(getTelegramConfig({})).toBeNull();
    expect(getTelegramConfig({ DOORFLOW_TELEGRAM_BOT_TOKEN: TOKEN })).toBeNull();
    expect(getTelegramConfig({ DOORFLOW_TELEGRAM_CHAT_IDS: "123" })).toBeNull();
  });

  it("rejects placeholder tokens and malformed chat ids", () => {
    expect(getTelegramConfig({ DOORFLOW_TELEGRAM_BOT_TOKEN: "CHANGEME", DOORFLOW_TELEGRAM_CHAT_IDS: "123" })).toBeNull();
    expect(getTelegramConfig({ DOORFLOW_TELEGRAM_BOT_TOKEN: TOKEN, DOORFLOW_TELEGRAM_CHAT_IDS: "@channel" })).toBeNull();
  });

  it("parses several chats, including groups with a minus sign", () => {
    const config = getTelegramConfig({
      DOORFLOW_TELEGRAM_BOT_TOKEN: ` ${TOKEN} `,
      DOORFLOW_TELEGRAM_CHAT_IDS: "123456789, -1001234567890",
    });
    expect(config).toEqual({ token: TOKEN, chatIds: ["123456789", "-1001234567890"] });
  });
});

describe("lead message", () => {
  it("contains the fields a manager needs to call back", () => {
    const message = buildLeadMessage(lead());
    expect(message).toContain("Новая заявка: заказ");
    expect(message).toContain("Клиент: Иван Петров");
    expect(message).toContain("Телефон: +79000000001");
    expect(message).toContain("Адрес: ул. Ленина, 1");
    expect(message).toContain("Модель: Дверь «Гранит» · DF-A01");
    // Intl.NumberFormat uses a non-breaking space as the thousands separator.
    expect(message).toContain("Сумма: 73\u00a0300,00 ₽");
    expect(message).toContain("Источник: yandex");
    expect(message).toContain("Комментарий: Позвонить после 18:00");
    expect(message).toContain("https://двермонт.рф/admin/leads/9f1d2c3b-4a5e-4f60-8a71-2b3c4d5e6f70");
  });

  it("skips optional lines and labels a measurement lead", () => {
    const message = buildLeadMessage(
      lead({ type: "MEASUREMENT", address: null, comment: null, productLabel: null, totalMinor: null, utmSource: null }),
    );
    expect(message).toContain("Новая заявка: замер");
    expect(message).not.toContain("Адрес:");
    expect(message).not.toContain("Комментарий:");
    expect(message).not.toContain("Сумма:");
    expect(message).not.toContain("Модель:");
    expect(message).not.toContain("Источник:");
  });

  it("keeps customer input as plain text", () => {
    const message = buildLeadMessage(lead({ customerName: "<b>Иван</b>", comment: "<script>alert(1)</script>" }));
    expect(message).toContain("<b>Иван</b>");
    expect(message).toContain("<script>alert(1)</script>");
  });
});

describe("sending", () => {
  it("does nothing without configuration", async () => {
    const fetchImpl = vi.fn();
    const sent = await sendTelegramMessage("text", { config: null, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(sent).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts the message to every configured chat", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const sent = await sendTelegramMessage("hello", {
      config: { token: TOKEN, chatIds: ["111", "222"] },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(sent).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const first = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(first[0]).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect(JSON.parse(String(first[1].body))).toMatchObject({ chat_id: "111", text: "hello" });
  });

  it("never throws when the transport fails or the API rejects the message", async () => {
    const logger = vi.fn();
    const failing = vi.fn(async () => {
      throw new TypeError("network down");
    });
    const rejected = vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 400 }));

    await expect(
      sendTelegramMessage("hello", {
        config: { token: TOKEN, chatIds: ["111"] },
        fetchImpl: failing as unknown as typeof fetch,
        logger,
      }),
    ).resolves.toBe(false);
    await expect(
      sendTelegramMessage("hello", {
        config: { token: TOKEN, chatIds: ["111"] },
        fetchImpl: rejected as unknown as typeof fetch,
        logger,
      }),
    ).resolves.toBe(false);
    expect(logger).toHaveBeenCalledTimes(2);
    expect(String(logger.mock.calls[0][0])).not.toContain("hello");
  });

  it("notifies with a built message", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const sent = await notifyNewLead(lead(), {
      config: { token: TOKEN, chatIds: ["111"] },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(sent).toBe(true);
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.text).toContain("Иван Петров");
  });
});
