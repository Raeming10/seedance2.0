import { describe, expect, it, vi } from "vitest";
import { handleProviderRequest } from "../src/providers";

const providerEnv = {
  BYTEPLUS_API_KEY: "byteplus-secret",
  FAL_KEY: "fal-secret",
  INTERVIEWCODER_API_KEY: "interviewcoder-secret",
} as Env;

function captureFetch(response = Response.json({ ok: true })) {
  const requests: Request[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init));
    return response;
  }) as typeof fetch;
  return { fetcher, requests };
}

describe("provider proxy allowlist", () => {
  it("forwards BytePlus task creation and status with server credentials", async () => {
    const { fetcher, requests } = captureFetch();
    const create = await handleProviderRequest(new Request(
      "https://tool.example/api/byteplus/v3/contents/generations/tasks",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"model":"demo"}' },
    ), providerEnv, fetcher);
    expect(create?.status).toBe(200);
    expect(requests[0].url).toBe("https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks");
    expect(requests[0].headers.get("authorization")).toBe("Bearer byteplus-secret");
    expect(await requests[0].text()).toBe('{"model":"demo"}');

    await handleProviderRequest(new Request(
      "https://tool.example/api/byteplus/v3/contents/generations/tasks/task%2Fone",
    ), providerEnv, fetcher);
    expect(requests[1].url).toBe("https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/task%2Fone");
    expect(requests[1].method).toBe("GET");
  });

  it("maps Kling and MiniMax queue routes without exposing the fal key", async () => {
    const { fetcher, requests } = captureFetch();
    await handleProviderRequest(new Request("https://tool.example/api/fal/kling-v3-pro/requests", {
      method: "POST", body: "{}", headers: { "Content-Type": "application/json" },
    }), providerEnv, fetcher);
    await handleProviderRequest(new Request("https://tool.example/api/fal/kling-v3-standard/requests/id-1/result"), providerEnv, fetcher);
    await handleProviderRequest(new Request("https://tool.example/api/fal/minimax-h3/requests", {
      method: "POST", body: "{}", headers: { "Content-Type": "application/json" },
    }), providerEnv, fetcher);
    await handleProviderRequest(new Request("https://tool.example/api/fal/minimax-h3/requests/id-2/status"), providerEnv, fetcher);

    expect(requests.map((request) => request.url)).toEqual([
      "https://queue.fal.run/fal-ai/kling-video/v3/pro/image-to-video",
      "https://queue.fal.run/fal-ai/kling-video/requests/id-1",
      "https://queue.fal.run/minimax/h3/image-to-video",
      "https://queue.fal.run/minimax/h3/requests/id-2/status",
    ]);
    expect(requests.every((request) => request.headers.get("authorization") === "Key fal-secret")).toBe(true);
  });

  it("validates InterviewCoder model and idempotency key before forwarding", async () => {
    const { fetcher, requests } = captureFetch();
    const invalid = await handleProviderRequest(new Request("https://tool.example/api/interviewcoder/videos", {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": "once" },
      body: '{"model":"unsupported"}',
    }), providerEnv, fetcher);
    expect(invalid?.status).toBe(400);
    expect(requests).toHaveLength(0);

    const valid = await handleProviderRequest(new Request("https://tool.example/api/interviewcoder/videos", {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": "once" },
      body: '{"model":"seedance-2.0-unfiltered"}',
    }), providerEnv, fetcher);
    expect(valid?.status).toBe(200);
    expect(requests[0].url).toBe("https://www.interviewcoder.ai/v1/videos");
    expect(requests[0].headers.get("authorization")).toBe("Bearer interviewcoder-secret");
    expect(requests[0].headers.get("idempotency-key")).toBe("once");
  });

  it("preserves range metadata when streaming InterviewCoder content", async () => {
    const upstream = new Response("video", {
      status: 206,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Range": "bytes 0-4/5",
        "Accept-Ranges": "bytes",
        "Content-Length": "5",
      },
    });
    const { fetcher, requests } = captureFetch(upstream);
    const response = await handleProviderRequest(new Request(
      "https://tool.example/api/interviewcoder/videos/job-1/content",
      { headers: { Range: "bytes=0-4" } },
    ), providerEnv, fetcher);

    expect(requests[0].headers.get("range")).toBe("bytes=0-4");
    expect(response?.status).toBe(206);
    expect(response?.headers.get("content-range")).toBe("bytes 0-4/5");
    expect(await response?.text()).toBe("video");
  });

  it("rejects unsupported audio processing and ignores unknown routes", async () => {
    const { fetcher } = captureFetch();
    const strip = await handleProviderRequest(new Request(
      "https://tool.example/api/fal/minimax-h3/strip-audio",
      { method: "POST", body: "{}" },
    ), providerEnv, fetcher);
    expect(strip?.status).toBe(501);
    expect(await strip?.json()).toEqual({ error: "Audio stripping is not available in this deployment" });

    await expect(handleProviderRequest(
      new Request("https://tool.example/api/fal/not-allowed"), providerEnv, fetcher,
    )).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
