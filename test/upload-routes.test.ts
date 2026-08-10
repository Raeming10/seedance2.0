import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { handleUploadReference } from "../src/app-worker";
import { verifyMediaSignature } from "../src/media-signing";

describe("private reference uploads", () => {
  it("streams an upload to R2 and returns a short-lived signed URL", async () => {
    const request = new Request(
      "https://app.example.test/api/upload-reference?filename=reference%20clip.mp4",
      {
        method: "POST",
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": "10",
        },
        body: "0123456789",
      },
    );

    const response = await handleUploadReference(request, env, 1_900_000_000);
    expect(response.status).toBe(200);
    const body = await response.json<{ url: string; bytes: number; expires_in_seconds: number }>();
    expect(body.bytes).toBe(10);
    expect(body.expires_in_seconds).toBe(7_200);

    const mediaUrl = new URL(body.url);
    expect(mediaUrl.origin).toBe("https://media.example.test");
    expect(mediaUrl.pathname).toMatch(/^\/media\/uploads\/[0-9a-f-]+-reference-clip\.mp4$/);
    const key = decodeURIComponent(mediaUrl.pathname.slice("/media/".length));
    const expires = Number(mediaUrl.searchParams.get("expires"));
    const signature = mediaUrl.searchParams.get("signature") || "";
    await expect(
      verifyMediaSignature(key, expires, signature, env.MEDIA_SIGNING_KEY, 1_900_000_000),
    ).resolves.toBe(true);

    const stored = await env.MEDIA.get(key);
    expect(stored?.httpMetadata?.contentType).toBe("video/mp4");
    await expect(stored?.text()).resolves.toBe("0123456789");
  });

  it("rejects missing bodies and declared uploads over 95 MiB", async () => {
    const missing = await handleUploadReference(
      new Request("https://app.example.test/api/upload-reference", { method: "POST" }),
      env,
    );
    expect(missing.status).toBe(400);

    const oversized = await handleUploadReference(
      new Request("https://app.example.test/api/upload-reference", {
        method: "POST",
        headers: { "Content-Length": String(95 * 1024 * 1024 + 1) },
        body: "x",
      }),
      env,
    );
    expect(oversized.status).toBe(413);
  });
});
