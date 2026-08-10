import { createSignedMediaUrl } from "./media-signing";
import { handleProviderRequest } from "./providers";
import {
  buildClearSessionCookie,
  buildSessionCookie,
  createSessionToken,
  getSessionCookie,
  renderLoginPage,
  verifyPassword,
  verifySessionToken,
} from "./auth";

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

async function handleProtectedRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const providerResponse = await handleProviderRequest(request, env);
  if (providerResponse) return providerResponse;
  if (request.method === "GET" && url.pathname === "/runtime-config.js") {
    return new Response([
      "window.SEEDANCE_CONFIG = {",
      '  baseUrl: "/api/byteplus/v3",',
      '  model: "dreamina-seedance-2-0-260128",',
      "  serverManagedAuth: true,",
      "};",
    ].join("\n"), {
      headers: {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (request.method === "GET" && url.pathname === "/api/upload-status") {
    return json(200, { ready: true, publicBaseUrl: env.MEDIA_BASE_URL });
  }
  if (request.method === "POST" && [
    "/api/upload-reference",
    "/api/upload-reference-video",
  ].includes(url.pathname)) {
    return handleUploadReference(request, env);
  }
  if (url.pathname.startsWith("/api/")) return json(404, { error: "Not found" });
  if (["GET", "HEAD"].includes(request.method)) {
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-cache");
    headers.set("Content-Security-Policy", [
      "default-src 'self'",
      "script-src 'self' https://unpkg.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "connect-src 'self' https:",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'self'",
    ].join("; "));
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "DENY");
    return new Response(response.body, { status: response.status, headers });
  }
  return json(404, { error: "Not found" });
}

function safeReturnTo(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

async function readLoginInput(request: Request): Promise<{
  email: string;
  password: string;
  returnTo: string;
  wantsJson: boolean;
} | null> {
  const declaredLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > 8_192) return null;
  const contentType = request.headers.get("Content-Type") || "";
  if (contentType.includes("application/json")) {
    try {
      const body: unknown = await request.json();
      if (!body || typeof body !== "object") return null;
      return {
        email: "email" in body ? String(body.email || "") : "",
        password: "password" in body ? String(body.password || "") : "",
        returnTo: safeReturnTo("returnTo" in body ? String(body.returnTo || "") : "/"),
        wantsJson: true,
      };
    } catch {
      return null;
    }
  }
  try {
    const form = new URLSearchParams(await request.text());
    return {
      email: form.get("email") || "",
      password: form.get("password") || "",
      returnTo: safeReturnTo(form.get("returnTo")),
      wantsJson: false,
    };
  } catch {
    return null;
  }
}

export async function handleAppRequest(
  request: Request,
  env: Env,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "POST" && url.pathname === "/auth/logout") {
    return new Response(null, {
      status: 204,
      headers: { "Set-Cookie": buildClearSessionCookie(), "Cache-Control": "no-store" },
    });
  }

  if (request.method === "POST" && url.pathname === "/auth/login") {
    const input = await readLoginInput(request);
    if (!input) return json(400, { error: "Invalid login request" });
    const actor = `${request.headers.get("CF-Connecting-IP") || "unknown"}:${input.email.toLowerCase()}`;
    const rateLimit = await env.LOGIN_RATE_LIMITER.limit({ key: actor });
    if (!rateLimit.success) {
      return json(429, { error: "Too many login attempts. Try again later." });
    }

    const emailMatches = input.email.trim().toLowerCase() === env.AUTH_EMAIL.toLowerCase();
    const passwordMatches = await verifyPassword(input.password, env.AUTH_PASSWORD_HASH);
    if (!emailMatches || !passwordMatches) {
      return input.wantsJson
        ? json(401, { error: "Invalid email or password" })
        : renderLoginPage(env.AUTH_EMAIL, input.returnTo, "邮箱或密码错误");
    }

    const token = await createSessionToken(env.AUTH_EMAIL, env.SESSION_SIGNING_KEY, nowSeconds);
    const headers = new Headers({
      "Set-Cookie": buildSessionCookie(token),
      "Cache-Control": "no-store",
    });
    if (input.wantsJson) return new Response(null, { status: 204, headers });
    headers.set("Location", input.returnTo);
    return new Response(null, { status: 303, headers });
  }

  const sessionToken = getSessionCookie(request);
  const session = sessionToken
    ? await verifySessionToken(sessionToken, env.AUTH_EMAIL, env.SESSION_SIGNING_KEY, nowSeconds)
    : null;

  if (request.method === "GET" && url.pathname === "/login") {
    if (session) return Response.redirect(new URL("/", url), 302);
    return renderLoginPage(env.AUTH_EMAIL, safeReturnTo(url.searchParams.get("returnTo")));
  }

  if (!session) {
    if (url.pathname.startsWith("/api/")) {
      return json(401, { error: "Authentication required" });
    }
    const location = `/login?returnTo=${encodeURIComponent(`${url.pathname}${url.search}`)}`;
    return new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store" } });
  }

  return handleProtectedRequest(request, env);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleAppRequest(request, env);
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
