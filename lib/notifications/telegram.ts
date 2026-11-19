/**
 * Telegram notifications for new public leads.
 *
 * A store owner works on installations all day, so a lead that only exists in
 * the admin panel is effectively lost. Every new lead is pushed to one or more
 * Telegram chats.
 *
 * Configuration lives in the environment, not in the database: one installation
 * serves exactly one store, so the chat list is deployment configuration.
 *
 * Notification failures must never break the public form: the lead is already
 * saved by the time we send, and the customer must get a 201 regardless.
 */
import { formatMinorUnits } from "@/lib/money";

export type TelegramConfig = {
  token: string;
  chatIds: string[];
};

export type LeadNotification = {
  id: string;
  type: "ORDER" | "MEASUREMENT";
  customerName: string;
  phone: string;
  address: string | null;
  comment: string | null;
  productLabel: string | null;
  totalMinor: number | null;
  source: string | null;
  utmSource: string | null;
  createdAt: Date;
  /** Origin of the running app, used to link straight to the lead card. */
  adminBaseUrl: string;
};

/** Reads and validates the bot configuration; returns null when disabled. */
export function getTelegramConfig(
  environment: Record<string, string | undefined> = process.env,
): TelegramConfig | null {
  const token = environment.DOORFLOW_TELEGRAM_BOT_TOKEN?.trim() ?? "";
  const chatIds = (environment.DOORFLOW_TELEGRAM_CHAT_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  // Basic shape check: "<bot id>:<secret>". Rejects placeholders like "CHANGEME".
  if (!/^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(token)) return null;
  if (chatIds.length === 0) return null;
  if (!chatIds.every((value) => /^-?\d{4,20}$/.test(value))) return null;
  return { token, chatIds };
}

function typeLabel(type: LeadNotification["type"]) {
  return type === "ORDER" ? "заказ" : "замер";
}

/** Plain-text message: no parse_mode, so customer input can never inject markup. */
export function buildLeadMessage(lead: LeadNotification): string {
  const lines = [
    `Новая заявка: ${typeLabel(lead.type)}`,
    `Клиент: ${lead.customerName}`,
    `Телефон: ${lead.phone}`,
  ];
  if (lead.address) lines.push(`Адрес: ${lead.address}`);
  if (lead.productLabel) lines.push(`Модель: ${lead.productLabel}`);
  if (lead.totalMinor !== null) lines.push(`Сумма: ${formatMinorUnits(lead.totalMinor)}`);
  const source = lead.utmSource ?? lead.source;
  if (source) lines.push(`Источник: ${source}`);
  if (lead.comment) lines.push(`Комментарий: ${lead.comment}`);
  lines.push(`Время: ${lead.createdAt.toLocaleString("ru-RU", { timeZone: "Asia/Yekaterinburg" })}`);
  lines.push(`Открыть: ${lead.adminBaseUrl.replace(/\/$/, "")}/admin/leads/${lead.id}`);
  return lines.join("\n");
}

export type TelegramDependencies = {
  config?: TelegramConfig | null;
  fetchImpl?: typeof fetch;
  logger?: (message: string) => void;
};

/**
 * Sends one message to every configured chat. Never throws: transport errors,
 * timeouts and Telegram API rejections are logged without personal data.
 */
export async function sendTelegramMessage(
  text: string,
  { config = getTelegramConfig(), fetchImpl = fetch, logger = console.error }: TelegramDependencies = {},
): Promise<boolean> {
  if (!config) return false;
  let delivered = false;
  await Promise.all(
    config.chatIds.map(async (chatId) => {
      try {
        const response = await fetchImpl(`https://api.telegram.org/bot${config.token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
          signal: AbortSignal.timeout(5_000),
        });
        if (!response.ok) {
          logger("DoorFlow Telegram notification was rejected by the API");
          return;
        }
        delivered = true;
      } catch (error) {
        logger(`DoorFlow Telegram notification failed: ${error instanceof Error ? error.name : "unknown"}`);
      }
    }),
  );
  return delivered;
}

/** Builds and sends the new-lead message; safe to call without configuration. */
export async function notifyNewLead(
  lead: LeadNotification,
  dependencies: TelegramDependencies = {},
): Promise<boolean> {
  return sendTelegramMessage(buildLeadMessage(lead), dependencies);
}
