import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { signMediaPath } from "../src/media-signing";
import { cleanupExpiredMedia, handleMediaRequest } from "../src/media-worker";

async function signedRequest(key: string, expires: number, range?: string): Promise<Request> {
  const signature = await signMediaPath(key, expires, env.MEDIA_SIGNING_KEY);
  return new Request(
    `https://media.example.test/media/${key}?expires=${expires}&signature=${signature}`,
    { headers: range ? { Range: range } : undefined },
  );
}

describe("public signed media Worker", () => {
  it("rejects unsigned and expired media requests", async () => {
    const unsigned = await handleMediaRequest(
      new Request("https://media.example.test/media/uploads/private.mp4"),
      env,
      1_900_000_000,
    );
    expect(unsigned.status).toBe(401);

    const expired = await handleMediaRequest(
      await signedRequest("uploads/private.mp4", 1_900_000_000),
      env,
      1_900_000_000,
    );
    expect(expired.status).toBe(401);
  });

  it("streams a valid object with its stored HTTP metadata", async () => {
    const key = `uploads/${crypto.randomUUID()}.mp4`;
    const expires = 1_900_000_000;
    await env.MEDIA.put(key, "video-body", {
      httpMetadata: { contentType: "video/mp4" },
      customMetadata: { expiresAt: String(expires) },
    });

    const response = await handleMediaRequest(
      await signedRequest(key, expires),
      env,
      expires - 1,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = new TextDecoder().decode(await response.arrayBuffer());
    expect(body).toBe("video-body");
  });

  it("supports one byte range for provider media fetches", async () => {
    const key = `uploads/${crypto.randomUUID()}.mp4`;
    const expires = 1_900_000_000;
    await env.MEDIA.put(key, "0123456789", {
      httpMetadata: { contentType: "video/mp4" },
      customMetadata: { expiresAt: String(expires) },
    });

    const response = await handleMediaRequest(
      await signedRequest(key, expires, "bytes=2-5"),
      env,
      expires - 1,
    );

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 2-5/10");
    const body = new TextDecoder().decode(await response.arrayBuffer());
    expect(body).toBe("2345");
  });

  it("deletes expired upload objects during scheduled cleanup", async () => {
    const expiredKey = `uploads/${crypto.randomUUID()}-expired.bin`;
    const liveKey = `uploads/${crypto.randomUUID()}-live.bin`;
    await env.MEDIA.put(expiredKey, "old", { customMetadata: { expiresAt: "100" } });
    await env.MEDIA.put(liveKey, "new", { customMetadata: { expiresAt: "300" } });

    const deleted = await cleanupExpiredMedia(env.MEDIA, 200);

    expect(deleted).toBeGreaterThanOrEqual(1);
    await expect(env.MEDIA.get(expiredKey)).resolves.toBeNull();
    await expect(env.MEDIA.get(liveKey)).resolves.not.toBeNull();
  });
});
