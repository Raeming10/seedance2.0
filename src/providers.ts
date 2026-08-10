const BYTEPLUS_BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3";
const FAL_QUEUE_BASE_URL = "https://queue.fal.run";
const INTERVIEWCODER_BASE_URL = "https://www.interviewcoder.ai";
const MAX_JSON_BYTES = 25 * 1024 * 1024;

const INTERVIEWCODER_MODELS = new Set([
  "seedance-2.0-unfiltered",
  "seedance-2.0-fast-unfiltered",
  "seedance-2.0-mini-unfiltered",
]);

function json(status: number, body: object): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function readJson(request: Request): Promise<{ value?: Record<string, unknown>; error?: Response }> {
  const declaredLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BYTES) {
    return { error: json(413, { error: "Request body is too large" }) };
  }
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) {
      return { error: json(413, { error: "Request body is too large" }) };
    }
    const value: unknown = JSON.parse(text || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { error: json(400, { error: "A JSON object is required" }) };
    }
    return { value: value as Record<string, unknown> };
  } catch {
    return { error: json(400, { error: "Invalid JSON request body" }) };
  }
}

function upstreamResponse(response: Response): Response {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": response.headers.get("Content-Type") || "application/json; charset=utf-8",
  });
  for (const name of [
    "Accept-Ranges",
    "Content-Disposition",
    "Content-Length",
    "Content-Range",
    "Retry-After",
  ]) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(response.body, { status: response.status, headers });
}

async function forward(
  target: string,
  init: RequestInit,
  fetcher: typeof fetch,
): Promise<Response> {
  const response = await fetcher(target, {
    ...init,
    signal: AbortSignal.timeout(30_000),
  });
  return upstreamResponse(response);
}

async function handleBytePlus(
  request: Request,
  env: Env,
  fetcher: typeof fetch,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const collection = "/api/byteplus/v3/contents/generations/tasks";
  const isCreate = request.method === "POST" && path === collection;
  const taskMatch = path.match(/^\/api\/byteplus\/v3\/contents\/generations\/tasks\/([^/]+)$/);
  const isRead = request.method === "GET" && taskMatch;
  if (!isCreate && !isRead) return null;
  if (!env.BYTEPLUS_API_KEY) return json(503, { error: "BytePlus provider is not configured" });

  let body: string | undefined;
  if (isCreate) {
    const parsed = await readJson(request);
    if (parsed.error) return parsed.error;
    body = JSON.stringify(parsed.value);
  }
  const suffix = isRead && taskMatch ? `/${taskMatch[1]}` : "";
  return forward(`${BYTEPLUS_BASE_URL}/contents/generations/tasks${suffix}`, {
    method: request.method,
    headers: {
      Authorization: `Bearer ${env.BYTEPLUS_API_KEY}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body,
  }, fetcher);
}

async function handleFal(
  request: Request,
  env: Env,
  fetcher: typeof fetch,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (request.method === "POST" && path === "/api/fal/minimax-h3/strip-audio") {
    return json(501, { error: "Audio stripping is not available in this deployment" });
  }

  const klingSubmit = request.method === "POST" && [
    "/api/fal/kling-v3-pro/requests",
    "/api/fal/kling-v3-standard/requests",
  ].includes(path);
  const minimaxSubmit = request.method === "POST" && path === "/api/fal/minimax-h3/requests";
  const klingRead = request.method === "GET"
    ? path.match(/^\/api\/fal\/kling-v3-(?:pro|standard)\/requests\/([^/]+)\/(status|result)$/)
    : null;
  const minimaxRead = request.method === "GET"
    ? path.match(/^\/api\/fal\/minimax-h3\/requests\/([^/]+)\/(status|result)$/)
    : null;
  if (!klingSubmit && !minimaxSubmit && !klingRead && !minimaxRead) return null;
  if (!env.FAL_KEY) return json(503, { error: "fal.ai provider is not configured" });

  let target: string;
  let body: string | undefined;
  if (klingSubmit || minimaxSubmit) {
    const parsed = await readJson(request);
    if (parsed.error) return parsed.error;
    body = JSON.stringify(parsed.value);
    target = klingSubmit
      ? `${FAL_QUEUE_BASE_URL}/fal-ai/kling-video/v3/pro/image-to-video`
      : `${FAL_QUEUE_BASE_URL}/minimax/h3/image-to-video`;
  } else {
    const match = klingRead || minimaxRead;
    const app = klingRead ? "fal-ai/kling-video" : "minimax/h3";
    const suffix = match?.[2] === "status" ? "/status" : "";
    target = `${FAL_QUEUE_BASE_URL}/${app}/requests/${match?.[1]}${suffix}`;
  }
  return forward(target, {
    method: request.method,
    headers: {
      Authorization: `Key ${env.FAL_KEY}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body,
  }, fetcher);
}

async function handleInterviewCoder(
  request: Request,
  env: Env,
  fetcher: typeof fetch,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const isModels = request.method === "GET" && path === "/api/interviewcoder/models";
  const isCreate = request.method === "POST" && path === "/api/interviewcoder/videos";
  const videoMatch = request.method === "GET"
    ? path.match(/^\/api\/interviewcoder\/videos\/([^/]+)(\/content)?$/)
    : null;
  if (!isModels && !isCreate && !videoMatch) return null;
  if (!env.INTERVIEWCODER_API_KEY) {
    return json(503, { error: "InterviewCoder provider is not configured" });
  }

  let target = `${INTERVIEWCODER_BASE_URL}/v1/videos/models`;
  let body: string | undefined;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.INTERVIEWCODER_API_KEY}`,
  };
  if (isCreate) {
    const parsed = await readJson(request);
    if (parsed.error) return parsed.error;
    if (!INTERVIEWCODER_MODELS.has(String(parsed.value?.model || ""))) {
      return json(400, { error: "Unsupported InterviewCoder Unfiltered model" });
    }
    const idempotencyKey = request.headers.get("Idempotency-Key");
    if (!idempotencyKey) return json(400, { error: "Idempotency-Key is required" });
    body = JSON.stringify(parsed.value);
    target = `${INTERVIEWCODER_BASE_URL}/v1/videos`;
    headers["Content-Type"] = "application/json";
    headers["Idempotency-Key"] = idempotencyKey;
  } else if (videoMatch) {
    target = `${INTERVIEWCODER_BASE_URL}/v1/videos/${videoMatch[1]}${videoMatch[2] || ""}`;
    const range = request.headers.get("Range");
    if (range) headers.Range = range;
  }
  return forward(target, { method: request.method, headers, body }, fetcher);
}

export async function handleProviderRequest(
  request: Request,
  env: Env,
  fetcher: typeof fetch = fetch,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path.startsWith("/api/byteplus/")) return handleBytePlus(request, env, fetcher);
  if (path.startsWith("/api/fal/")) return handleFal(request, env, fetcher);
  if (path.startsWith("/api/interviewcoder/")) return handleInterviewCoder(request, env, fetcher);
  return null;
}
