const encoder = new TextEncoder();
const decoder = new TextDecoder();
const PASSWORD_SCHEME = "pbkdf2-sha256";
const PASSWORD_CHALLENGE = encoder.encode("seedance-internal-password-v1");
const SESSION_COOKIE = "seedance_session";
const DEFAULT_PASSWORD_ITERATIONS = 210_000;
const DEFAULT_SESSION_SECONDS = 12 * 60 * 60;

function toBase64Url(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const padding = "=".repeat((4 - value.length % 4) % 4);
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + padding);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

async function derivePasswordKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    passwordKey,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign", "verify"],
  );
}

export async function hashPassword(
  password: string,
  providedSalt?: Uint8Array<ArrayBuffer>,
  iterations = DEFAULT_PASSWORD_ITERATIONS,
): Promise<string> {
  if (!Number.isSafeInteger(iterations) || iterations < 1_000 || iterations > 2_000_000) {
    throw new Error("Invalid PBKDF2 iteration count");
  }
  const salt = providedSalt || crypto.getRandomValues(new Uint8Array(16));
  const key = await derivePasswordKey(password, salt, iterations);
  const verifier = await crypto.subtle.sign("HMAC", key, PASSWORD_CHALLENGE);
  return [PASSWORD_SCHEME, iterations, toBase64Url(salt), toBase64Url(verifier)].join("$");
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const [scheme, iterationsValue, saltValue, verifierValue, ...extra] = encodedHash.split("$");
  if (scheme !== PASSWORD_SCHEME || extra.length > 0) return false;
  const iterations = Number(iterationsValue);
  const salt = fromBase64Url(saltValue || "");
  const verifier = fromBase64Url(verifierValue || "");
  if (!Number.isSafeInteger(iterations) || iterations < 1_000 || iterations > 2_000_000) return false;
  if (!salt || salt.byteLength < 16 || !verifier || verifier.byteLength !== 32) return false;
  try {
    const key = await derivePasswordKey(password, salt, iterations);
    return crypto.subtle.verify("HMAC", key, verifier, PASSWORD_CHALLENGE);
  } catch {
    return false;
  }
}

async function importSessionKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createSessionToken(
  email: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  lifetimeSeconds = DEFAULT_SESSION_SECONDS,
): Promise<string> {
  const payload = toBase64Url(encoder.encode(JSON.stringify({
    email,
    expires: nowSeconds + lifetimeSeconds,
  })));
  const key = await importSessionKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return `${payload}.${toBase64Url(signature)}`;
}

export async function verifySessionToken(
  token: string,
  expectedEmail: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<{ email: string; expires: number } | null> {
  const [payloadValue, signatureValue, ...extra] = token.split(".");
  if (!payloadValue || !signatureValue || extra.length > 0) return null;
  const payloadBytes = fromBase64Url(payloadValue);
  const signature = fromBase64Url(signatureValue);
  if (!payloadBytes || !signature || signature.byteLength !== 32) return null;
  const key = await importSessionKey(secret);
  if (!await crypto.subtle.verify("HMAC", key, signature, encoder.encode(payloadValue))) return null;
  try {
    const parsed: unknown = JSON.parse(decoder.decode(payloadBytes));
    if (!parsed || typeof parsed !== "object") return null;
    const email = "email" in parsed ? parsed.email : null;
    const expires = "expires" in parsed ? parsed.expires : null;
    if (email !== expectedEmail || !Number.isSafeInteger(expires) || Number(expires) <= nowSeconds) {
      return null;
    }
    return { email: String(email), expires: Number(expires) };
  } catch {
    return null;
  }
}

export function buildSessionCookie(token: string, maxAge = DEFAULT_SESSION_SECONDS): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

export function buildClearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export function getSessionCookie(request: Request): string | null {
  const cookieHeader = request.headers.get("Cookie") || "";
  for (const part of cookieHeader.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name === SESSION_COOKIE) return valueParts.join("=") || null;
  }
  return null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderLoginPage(email: string, returnTo = "/", error = ""): Response {
  const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  const errorMarkup = error ? `<p class="error">${escapeHtml(error)}</p>` : "";
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI Video Studio 登录</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#090b12;color:#f6f7fb;font-family:system-ui,sans-serif}.card{width:min(380px,calc(100% - 40px));padding:32px;border:1px solid #2a3042;border-radius:18px;background:#121622;box-shadow:0 24px 70px #0008}h1{margin:0 0 8px;font-size:24px}p{color:#aab1c5}.error{color:#ff8f9b}label{display:block;margin:18px 0 6px}input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #394158;border-radius:10px;background:#0c0f18;color:#fff}button{width:100%;margin-top:22px;padding:12px;border:0;border-radius:10px;background:#7857ff;color:#fff;font-weight:700;cursor:pointer}
</style></head><body><main class="card"><h1>AI Video Studio</h1><p>Internal tool · 仅限授权账号</p>${errorMarkup}<form method="post" action="/auth/login"><input type="hidden" name="returnTo" value="${escapeHtml(safeReturnTo)}"><label for="email">邮箱</label><input id="email" name="email" type="email" autocomplete="username" value="${escapeHtml(email)}" required><label for="password">密码</label><input id="password" name="password" type="password" autocomplete="current-password" required autofocus><button type="submit">登录</button></form></main></body></html>`;
  return new Response(html, {
    status: error ? 401 : 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    },
  });
}
