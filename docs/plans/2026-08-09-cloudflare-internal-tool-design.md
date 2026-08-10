# Cloudflare Internal Tool Design

## Goal

Deploy AI Video Studio to Cloudflare as an internal tool whose UI and API routes require one fixed email/password login. Keep login and provider credentials out of browser assets and version control, and prevent unauthenticated visitors from consuming BytePlus, fal.ai, or InterviewCoder APIs.

## Architecture

The deployment uses two Workers and one private R2 bucket. `seedance-internal-tool` serves the login page, application assets, and all provider APIs. The Worker verifies a PBKDF2 password hash stored as a Secret and issues a short-lived HMAC-signed `HttpOnly`, `Secure`, `SameSite=Strict` session cookie. Static assets use `run_worker_first: true`, so HTML, JavaScript, CSS, uploads, and API requests all pass through the same authentication boundary.

`seedance-internal-media` is a narrow media-delivery Worker used only when external generation providers need to fetch uploaded reference media. The app Worker streams uploads directly into the private R2 bucket and returns a short-lived, HMAC-signed media URL. The media Worker verifies the signature and expiry before streaming the R2 object. It exposes no listing endpoint, no API proxy, and no application assets. This separates human authentication from machine-readable reference URLs without making the bucket public.

## Provider data flow

The browser never receives production credentials. Runtime configuration points BytePlus requests to `/api/byteplus/v3`; the app Worker injects `BYTEPLUS_API_KEY` from a Cloudflare Secret. Existing fal.ai and InterviewCoder routes retain their browser-facing paths while the Worker injects `FAL_KEY` and `INTERVIEWCODER_API_KEY` from Secrets.

Uploads are limited by Cloudflare account request-body limits and streamed to R2 to stay within Worker memory constraints. Objects carry an expiration timestamp. Media URLs contain an expiry and HMAC signature and become unusable after expiry. A scheduled cleanup removes expired objects from R2.

MiniMax H3 audio stripping currently invokes a local macOS Swift process. Workers cannot run Swift or child processes. The Cloudflare route will return a clear `501` response when audio removal is requested; native-audio H3 generation remains supported. This is safer than silently returning the wrong media.

## Security and operations

The fixed internal email is non-secret configuration. Only a versioned PBKDF2 hash is stored as `AUTH_PASSWORD_HASH`; the plaintext password is generated once for the user and never written to disk or source. `SESSION_SIGNING_KEY` signs twelve-hour session cookies. Login attempts are protected by Cloudflare's Rate Limiting binding and all protected API routes reject missing, malformed, expired, or tampered cookies before invoking any upstream service. Provider secrets and signing secrets are uploaded with Wrangler Secret commands and are absent from source and `wrangler.jsonc`.

Workers observability is enabled with structured errors that never log passwords, cookies, authorization headers, or secret values. The R2 bucket has no public development URL or custom domain. Deployment verification checks that unauthenticated app and API requests redirect or return 401, login throttling returns 429, signed media URLs reject tampering and expiry, and an authenticated session can reach each configured provider route without exposing credentials.
