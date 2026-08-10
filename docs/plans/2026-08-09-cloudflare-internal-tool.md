# Cloudflare Internal Tool Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deploy AI Video Studio as a Cloudflare Access-protected Worker with private provider secrets and signed R2 media delivery.

**Architecture:** A private application Worker serves assets and proxies provider APIs; a minimal public media Worker serves only short-lived HMAC-signed R2 objects required by external model providers. Cloudflare Access protects the application Worker by name, and R2 remains private.

**Tech Stack:** Cloudflare Workers, Wrangler 4, TypeScript, Workers Static Assets, R2, Web Crypto, Vitest Workers integration.

---

### Task 1: Add the Cloudflare project scaffold

**Files:**
- Create: `package.json`
- Create: `wrangler.jsonc`
- Create: `wrangler.media.jsonc`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.assetsignore`
- Generate: `worker-configuration.d.ts`

1. Install current Wrangler, TypeScript, Vitest, and the Cloudflare Workers Vitest integration.
2. Configure both Workers with compatibility date `2026-08-09`, `nodejs_compat`, observability, static asset routing, the shared R2 binding, and a cleanup cron on the media Worker.
3. Run `wrangler types` and `tsc --noEmit` to validate bindings and configuration.
4. Commit the scaffold.

### Task 2: Implement signed media utilities with TDD

**Files:**
- Create: `src/media-signing.ts`
- Create: `test/media-signing.test.ts`

1. Write failing tests for valid signatures, tampered keys, expired URLs, and fixed-length constant-time comparisons.
2. Run the focused Vitest command and confirm the expected failures.
3. Implement HMAC-SHA-256 signing and verification with Web Crypto.
4. Re-run the focused tests and commit when green.

### Task 3: Implement private R2 uploads and public signed delivery with TDD

**Files:**
- Create: `src/media-worker.ts`
- Create: `test/media-worker.test.ts`
- Create: `src/app-worker.ts`
- Create: `test/upload-routes.test.ts`

1. Write failing tests proving uploads stream to R2, filenames are sanitized, output URLs are signed, unsigned media requests fail, expired media requests fail, range-capable downloads stream, and cleanup deletes expired objects.
2. Implement only the R2 upload, signed delivery, and scheduled cleanup behavior needed by those tests.
3. Run focused Workers-runtime tests and commit when green.

### Task 4: Move provider credentials behind Worker proxies with TDD

**Files:**
- Modify: `src/app-worker.ts`
- Create: `test/provider-routes.test.ts`
- Modify: `app.js`
- Modify: `seedance_api.js`
- Modify: `index.html`
- Modify: existing Node tests where runtime configuration behavior changes.

1. Write failing tests for BytePlus task creation/status, fal.ai submit/status/result, InterviewCoder model/video/content routes, missing Secrets, unsupported models, and upstream streaming.
2. Implement strict route allowlists, bounded JSON parsing, Secret injection, request timeouts, and streamed upstream responses.
3. Add `/runtime-config.js` and update the browser to use server-managed authentication without embedding an API key.
4. Preserve local `server.js` behavior for local development.
5. Run focused and legacy test suites and commit when green.

### Task 5: Serve all assets through the application Worker

**Files:**
- Modify: `src/app-worker.ts`
- Modify: `.assetsignore`
- Create: `test/assets-routing.test.ts`

1. Write a failing test showing unknown API routes return JSON 404 while valid asset requests use the `ASSETS` binding.
2. Implement runtime config, secure response headers, asset fallback, explicit errors, and structured logging.
3. Verify `run_worker_first: true` in Wrangler’s schema and dry-run output.
4. Commit when green.

### Task 6: Provision Cloudflare resources and Secrets

**Cloudflare resources:**
- Worker: `seedance-internal-tool`
- Worker: `seedance-internal-media`
- R2 bucket: `seedance-internal-media`
- Secrets: `BYTEPLUS_API_KEY`, `FAL_KEY`, `INTERVIEWCODER_API_KEY`, `MEDIA_SIGNING_KEY`

1. Authenticate Wrangler and confirm the exact personal Cloudflare account.
2. Create the R2 bucket without public access.
3. Upload provider Secrets directly from ignored local files without printing values.
4. Generate a random 32-byte media signing key and upload the same value to both Workers without writing it to disk.
5. Run both deployment dry-runs, then deploy the media Worker followed by the application Worker.

### Task 7: Configure Cloudflare Access

1. Create a self-hosted Access application targeting `seedance-internal-tool` by Worker name, including preview deployments.
2. Create one Allow policy whose selector is exactly the user-provided email.
3. Use Cloudflare’s identity provider or OTP and keep deny-by-default behavior.
4. Confirm there is no `Everyone`, whole-domain, or login-method-only allow rule.

### Task 8: Production verification and source publication

1. Verify unauthenticated application and API requests are intercepted by Access.
2. Verify unsigned and expired media URLs return 401/404.
3. Authenticate and smoke-test the UI, upload status, one upload, and provider proxy health/error behavior.
4. Run `npm test`, `npm run typecheck`, both Wrangler dry-runs, and `git diff --check` fresh.
5. Commit deployment metadata, push `codex/cloudflare-internal-tool`, and merge/push only after validation.

