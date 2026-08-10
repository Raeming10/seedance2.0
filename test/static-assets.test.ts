import { describe, expect, it, vi } from "vitest";
import { createSessionToken } from "../src/auth";
import { handleAppRequest } from "../src/app-worker";

const EMAIL = "studio-admin@internal.local";
const SESSION_SECRET = "test-session-signing-key-with-32-bytes";
const NOW = 1_900_000_000;

async function authenticatedRequest(path: string): Promise<Request> {
  const token = await createSessionToken(EMAIL, SESSION_SECRET, NOW);
  return new Request(`https://tool.example${path}`, {
    headers: { Cookie: `seedance_session=${token}` },
  });
}

function testEnv(assetFetch = vi.fn(async () => new Response("asset", {
  headers: { "Content-Type": "text/html" },
}))) {
  return {
    MEDIA_BASE_URL: "https://media.example.test",
    AUTH_EMAIL: EMAIL,
    AUTH_PASSWORD_HASH: "unused",
    SESSION_SIGNING_KEY: SESSION_SECRET,
    BYTEPLUS_API_KEY: "byteplus",
    FAL_KEY: "fal",
    INTERVIEWCODER_API_KEY: "interviewcoder",
    MEDIA_SIGNING_KEY: "media",
    ASSETS: { fetch: assetFetch },
  } as unknown as Env;
}

describe("protected application assets", () => {
  it("serves a private runtime config that selects the Worker proxy", async () => {
    const response = await handleAppRequest(
      await authenticatedRequest("/runtime-config.js"), testEnv(), NOW + 1,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("javascript");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toContain('baseUrl: "/api/byteplus/v3"');
    expect(await (await handleAppRequest(
      new Request("https://tool.example/runtime-config.js"), testEnv(), NOW + 1,
    )).status).toBe(302);
  });

  it("serves authenticated static files with browser security headers", async () => {
    const assetFetch = vi.fn(async () => new Response("<html></html>", {
      headers: { "Content-Type": "text/html" },
    }));
    const response = await handleAppRequest(
      await authenticatedRequest("/"), testEnv(assetFetch), NOW + 1,
    );
    expect(assetFetch).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  it("does not send unknown API routes to static assets", async () => {
    const assetFetch = vi.fn(async () => new Response("asset"));
    const response = await handleAppRequest(
      await authenticatedRequest("/api/not-real"), testEnv(assetFetch), NOW + 1,
    );
    expect(response.status).toBe(404);
    expect(assetFetch).not.toHaveBeenCalled();
  });
});
