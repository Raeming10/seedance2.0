import { createSignedMediaUrl } from "./media-signing";

const MEDIA_TTL_SECONDS = 2 * 60 * 60;
const MAX_UPLOAD_BYTES = 95 * 1024 * 1024;

function json(status: number, body: object): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function safeFilename(value: string | null): string {
  return String(value || "reference.bin")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120) || "reference.bin";
}

export async function handleUploadReference(
  request: Request,
  env: Env,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<Response> {
  if (!request.body) return json(400, { error: "Upload body is required" });
  const declaredLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES) {
    return json(413, { error: "Upload exceeds 95 MiB" });
  }

  const url = new URL(request.url);
  const filename = safeFilename(url.searchParams.get("filename"));
  const key = `uploads/${crypto.randomUUID()}-${filename}`;
  const expires = nowSeconds + MEDIA_TTL_SECONDS;

  const stored = await env.MEDIA.put(key, request.body, {
    httpMetadata: {
      contentType: request.headers.get("Content-Type") || "application/octet-stream",
    },
    customMetadata: { expiresAt: String(expires) },
  });
  if (stored.size > MAX_UPLOAD_BYTES) {
    await env.MEDIA.delete(key);
    return json(413, { error: "Upload exceeds 95 MiB" });
  }

  const mediaUrl = await createSignedMediaUrl(
    env.MEDIA_BASE_URL,
    key,
    expires,
    env.MEDIA_SIGNING_KEY,
  );
  return json(200, {
    url: mediaUrl,
    bytes: stored.size,
    expires_in_seconds: MEDIA_TTL_SECONDS,
  });
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/upload-status") {
    return json(200, { ready: true, publicBaseUrl: env.MEDIA_BASE_URL });
  }
  if (request.method === "POST" && [
    "/api/upload-reference",
    "/api/upload-reference-video",
  ].includes(url.pathname)) {
    return handleUploadReference(request, env);
  }
  return json(404, { error: "Not found" });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(JSON.stringify({
        message: "request failed",
        error: message,
        method: request.method,
        path: new URL(request.url).pathname,
      }));
      return json(500, { error: "Internal server error" });
    }
  },
} satisfies ExportedHandler<Env>;
