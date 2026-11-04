import { jsonResponse } from "@/lib/http/json";

export type BinaryRequestResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; response: Response };

export async function readBoundedBinaryRequest(
  request: Request,
  maxBytes: number,
): Promise<BinaryRequestResult> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) {
    return { ok: false, response: jsonResponse({ error: "Image is too large" }, 413) };
  }
  const reader = request.body?.getReader();
  if (!reader) {
    return { ok: false, response: jsonResponse({ error: "Image body is required" }, 400) };
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return { ok: false, response: jsonResponse({ error: "Image is too large" }, 413) };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (totalBytes === 0) {
    return { ok: false, response: jsonResponse({ error: "Image body is empty" }, 400) };
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}
