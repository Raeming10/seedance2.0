import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          BYTEPLUS_API_KEY: "test-byteplus-key",
          FAL_KEY: "test-fal-key",
          INTERVIEWCODER_API_KEY: "test-interviewcoder-key",
          MEDIA_SIGNING_KEY: "test-media-signing-key-with-32-bytes",
          MEDIA_BASE_URL: "https://media.example.test",
        },
        r2Buckets: ["MEDIA"],
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
  },
});
