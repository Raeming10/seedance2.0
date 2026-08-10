import { verifyMediaSignature } from "./media-signing";

type MediaBindings = Pick<MediaEnv, "MEDIA" | "MEDIA_SIGNING_KEY">;
type ByteRange = { offset: number; length: number };

function json(status: number, body: object): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function parseRange(value: string | null, size: number): ByteRange | null {
  if (!value) return null;
  const match = value.match(/^bytes=(\d+)-(\d*)$/);
  if (!match) return null;
  const offset = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(requestedEnd)) return null;
  if (offset < 0 || requestedEnd < offset || offset >= size) return null;
  const end = Math.min(requestedEnd, size - 1);
  return { offset, length: end - offset + 1 };
}

export async function handleMediaRequest(
  request: Request,
  env: MediaBindings,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<Response> {
  const url = new URL(request.url);
  if (!["GET", "HEAD"].includes(request.method) || !url.pathname.startsWith("/media/")) {
    return json(404, { error: "Not found" });
  }

  let key: string;
  try {
    key = decodeURIComponent(url.pathname.slice("/media/".length));
  } catch {
    return json(400, { error: "Invalid media path" });
  }
  if (!key.startsWith("uploads/") || key.includes("..")) {
    return json(404, { error: "Not found" });
  }

  const expires = Number(url.searchParams.get("expires"));
  const signature = url.searchParams.get("signature") || "";
  if (!await verifyMediaSignature(key, expires, signature, env.MEDIA_SIGNING_KEY, nowSeconds)) {
    return json(401, { error: "Invalid or expired media URL" });
  }

  const head = await env.MEDIA.head(key);
  if (!head) return json(404, { error: "Media not found" });
  const storedExpiry = Number(head.customMetadata?.expiresAt);
  if (!Number.isSafeInteger(storedExpiry) || storedExpiry !== expires || storedExpiry <= nowSeconds) {
    return json(404, { error: "Media expired" });
  }

  const rangeHeader = request.headers.get("Range");
  const range = parseRange(rangeHeader, head.size);
  if (rangeHeader && !range) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${head.size}` },
    });
  }

  const object = await env.MEDIA.get(key, range ? { range } : undefined);
  if (!object || !object.body) return json(404, { error: "Media not found" });

  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    ETag: object.httpEtag,
  });
  object.writeHttpMetadata(headers);
  if (range) {
    headers.set("Content-Length", String(range.length));
    headers.set(
      "Content-Range",
      `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}`,
    );
  } else {
    headers.set("Content-Length", String(head.size));
  }

  return new Response(request.method === "HEAD" ? null : object.body, {
    status: range ? 206 : 200,
    headers,
  });
}

export async function cleanupExpiredMedia(
  bucket: R2Bucket,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<number> {
  let cursor: string | undefined;
  let deleted = 0;
  do {
    const listed = await bucket.list({
      prefix: "uploads/",
      cursor,
      include: ["customMetadata"],
    });
    const expiredKeys = listed.objects
      .filter((object) => Number(object.customMetadata?.expiresAt) <= nowSeconds)
      .map((object) => object.key);
    if (expiredKeys.length > 0) {
      await bucket.delete(expiredKeys);
      deleted += expiredKeys.length;
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return deleted;
}

export default {
  fetch(request: Request, env: MediaEnv): Promise<Response> {
    return handleMediaRequest(request, env);
  },

  scheduled(_controller: ScheduledController, env: MediaEnv, ctx: ExecutionContext): void {
    ctx.waitUntil(cleanupExpiredMedia(env.MEDIA).then((deleted) => {
      console.log(JSON.stringify({ message: "expired media cleanup", deleted }));
    }));
  },
} satisfies ExportedHandler<MediaEnv>;
