const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): ArrayBuffer | null {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=";
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
  } catch {
    return null;
  }
}

async function importSigningKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signMediaPath(
  key: string,
  expires: number,
  secret: string,
): Promise<string> {
  const signingKey = await importSigningKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    signingKey,
    encoder.encode(`${key}\n${expires}`),
  );
  return toBase64Url(new Uint8Array(signature));
}

export async function verifyMediaSignature(
  key: string,
  expires: number,
  providedSignature: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!Number.isSafeInteger(expires) || expires <= nowSeconds) return false;
  const signature = fromBase64Url(providedSignature);
  if (!signature) return false;
  const signingKey = await importSigningKey(secret);
  return crypto.subtle.verify(
    "HMAC",
    signingKey,
    signature,
    encoder.encode(`${key}\n${expires}`),
  );
}

export async function createSignedMediaUrl(
  baseUrl: string,
  key: string,
  expires: number,
  secret: string,
): Promise<string> {
  const signature = await signMediaPath(key, expires, secret);
  const url = new URL(baseUrl);
  url.pathname = `/media/${key}`;
  url.search = new URLSearchParams({
    expires: String(expires),
    signature,
  }).toString();
  return url.toString();
}
