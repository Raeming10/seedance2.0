import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  buildClearSessionCookie,
  buildSessionCookie,
  createSessionToken,
  hashPassword,
  verifyPassword,
  verifySessionToken,
} from "../src/auth";
import { handleAppRequest } from "../src/app-worker";

const EMAIL = "studio-admin@internal.local";
const PASSWORD = "correct horse battery staple";
const SESSION_SECRET = "test-session-signing-key-with-32-bytes";

async function testEnv(rateLimitSuccess = true): Promise<Env> {
  return {
    MEDIA: env.MEDIA,
    ASSETS: env.ASSETS,
    MEDIA_BASE_URL: env.MEDIA_BASE_URL,
    AUTH_EMAIL: EMAIL,
    AUTH_PASSWORD_HASH: await hashPassword(PASSWORD, new Uint8Array(16).fill(7), 1_000),
    SESSION_SIGNING_KEY: SESSION_SECRET,
    BYTEPLUS_API_KEY: "test-byteplus-key",
    FAL_KEY: "test-fal-key",
    INTERVIEWCODER_API_KEY: "test-interviewcoder-key",
    MEDIA_SIGNING_KEY: "test-media-signing-key-with-32-bytes",
    LOGIN_RATE_LIMITER: {
      async limit() {
        return { success: rateLimitSuccess };
      },
    },
  };
}

describe("fixed account credentials", () => {
  it("verifies the correct password and rejects wrong or malformed hashes", async () => {
    const encoded = await hashPassword(PASSWORD, new Uint8Array(16).fill(3), 1_000);

    await expect(verifyPassword(PASSWORD, encoded)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", encoded)).resolves.toBe(false);
    await expect(verifyPassword(PASSWORD, "not-a-password-hash")).resolves.toBe(false);
  });

  it("accepts a signed session and rejects tampering or expiry", async () => {
    const token = await createSessionToken(EMAIL, SESSION_SECRET, 1_900_000_000, 3_600);

    await expect(verifySessionToken(token, EMAIL, SESSION_SECRET, 1_900_000_100))
      .resolves.toEqual({ email: EMAIL, expires: 1_900_003_600 });
    await expect(verifySessionToken(`${token}x`, EMAIL, SESSION_SECRET, 1_900_000_100))
      .resolves.toBeNull();
    await expect(verifySessionToken(token, EMAIL, SESSION_SECRET, 1_900_003_600))
      .resolves.toBeNull();
  });

  it("uses hardened session and logout cookie attributes", () => {
    expect(buildSessionCookie("token-value", 43_200)).toBe(
      "seedance_session=token-value; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Strict",
    );
    expect(buildClearSessionCookie()).toBe(
      "seedance_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict",
    );
  });
});

describe("application authentication boundary", () => {
  it("redirects unauthenticated pages and returns JSON 401 for APIs", async () => {
    const bindings = await testEnv();
    const page = await handleAppRequest(new Request("https://app.example.test/"), bindings);
    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toBe("/login?returnTo=%2F");

    const api = await handleAppRequest(
      new Request("https://app.example.test/api/upload-status"),
      bindings,
    );
    expect(api.status).toBe(401);
    await expect(api.json()).resolves.toEqual({ error: "Authentication required" });
  });

  it("logs in with the fixed credentials and authorizes the resulting cookie", async () => {
    const bindings = await testEnv();
    const login = await handleAppRequest(new Request("https://app.example.test/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.5" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    }), bindings, 1_900_000_000);

    expect(login.status).toBe(204);
    const cookie = login.headers.get("set-cookie");
    expect(cookie).toContain("seedance_session=");
    const requestCookie = cookie?.split(";", 1)[0] || "";

    const protectedResponse = await handleAppRequest(new Request(
      "https://app.example.test/api/upload-status",
      { headers: { Cookie: requestCookie } },
    ), bindings, 1_900_000_100);
    expect(protectedResponse.status).toBe(200);
  });

  it("rejects bad credentials, throttles login, and clears logout sessions", async () => {
    const bindings = await testEnv();
    const badLogin = await handleAppRequest(new Request("https://app.example.test/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: "wrong" }),
    }), bindings);
    expect(badLogin.status).toBe(401);
    expect(badLogin.headers.has("set-cookie")).toBe(false);

    const throttled = await handleAppRequest(new Request("https://app.example.test/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    }), await testEnv(false));
    expect(throttled.status).toBe(429);

    const logout = await handleAppRequest(
      new Request("https://app.example.test/auth/logout", { method: "POST" }),
      bindings,
    );
    expect(logout.status).toBe(204);
    expect(logout.headers.get("set-cookie")).toBe(buildClearSessionCookie());
  });
});
