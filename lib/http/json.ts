const defaultMaxRequestBytes = 16_384;

export type JsonRequestResult =
  | { ok: true; body: unknown }
  | { ok: false; response: Response };

export function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function readJsonRequest(
  request: Request,
  maxRequestBytes = defaultMaxRequestBytes,
): Promise<JsonRequestResult> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxRequestBytes) {
    return {
      ok: false,
      response: jsonResponse({ error: "Request body is too large" }, 413),
    };
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return {
      ok: false,
      response: jsonResponse({ error: "Request body is required" }, 400),
    };
  }

  const decoder = new TextDecoder();
  let text = "";
  let bytesRead = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxRequestBytes) {
        await reader.cancel();
        return {
          ok: false,
          response: jsonResponse({ error: "Request body is too large" }, 413),
        };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  try {
    return { ok: true, body: JSON.parse(text) as unknown };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        ok: false,
        response: jsonResponse({ error: "Request body must be valid JSON" }, 400),
      };
    }
    throw error;
  }
}
