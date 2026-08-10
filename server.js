const { createServer } = require('node:http');
const { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } = require('node:fs');
const { extname, join, normalize, resolve } = require('node:path');
const { spawn } = require('node:child_process');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const PORT = Number(process.env.PORT || 8000);
const ROOT = __dirname;
const UPLOAD_DIR = join(ROOT, '.uploads');
const OUTPUT_DIR = join(ROOT, '.outputs');
const MAX_UPLOAD_BYTES = 512 * 1024 * 1024;
const UPLOAD_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_FAL_REQUEST_BYTES = 25 * 1024 * 1024;
const INTERVIEWCODER_API_TIMEOUT_MS = 30 * 1000;
const INTERVIEWCODER_MEDIA_TIMEOUT_MS = 15 * 60 * 1000;
const KLING_V3_PRO_ENDPOINT = 'fal-ai/kling-video/v3/pro/image-to-video';
const KLING_QUEUE_APP = 'fal-ai/kling-video';
const MINIMAX_H3_ENDPOINT = 'minimax/h3/image-to-video';
const MINIMAX_H3_QUEUE_APP = 'minimax/h3';
const FAL_QUEUE_BASE_URL = 'https://queue.fal.run';
const INTERVIEWCODER_BASE_URL = 'https://www.interviewcoder.ai';
const INTERVIEWCODER_UNFILTERED_MODELS = new Set([
    'seedance-2.0-unfiltered',
    'seedance-2.0-fast-unfiltered',
    'seedance-2.0-mini-unfiltered',
]);

function loadLocalEnv() {
    const envPath = join(ROOT, '.env');
    if (!existsSync(envPath)) return;

    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!match || process.env[match[1]]) continue;
        let value = match[2];
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        process.env[match[1]] = value;
    }
}

loadLocalEnv();

let publicBaseUrl = process.env.PUBLIC_BASE_URL || null;

mkdirSync(UPLOAD_DIR, { recursive: true });
mkdirSync(OUTPUT_DIR, { recursive: true });

const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.wav': 'audio/wav',
    '.webp': 'image/webp',
};

function json(res, statusCode, body) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(body));
}

function safeFilename(filename) {
    const base = String(filename || 'reference-video.mp4')
        .replace(/[/\\?%*:|"<>]/g, '-')
        .replace(/\s+/g, '-')
        .slice(0, 120);
    return `${Date.now()}-${Math.random().toString(36).slice(2)}-${base || 'reference-video.mp4'}`;
}

function removeExpiredUploads() {
    const now = Date.now();
    for (const name of readdirSync(UPLOAD_DIR)) {
        const filePath = join(UPLOAD_DIR, name);
        try {
            if (now - statSync(filePath).mtimeMs > UPLOAD_TTL_MS) {
                unlinkSync(filePath);
            }
        } catch (_) {
            // Ignore races with active uploads/deletes.
        }
    }
}

function serveStatic(req, res, pathname) {
    const hiddenSegments = pathname.split('/').filter(segment => (
        segment.startsWith('.') && segment !== '.uploads' && segment !== '.outputs'
    ));
    if (hiddenSegments.length > 0) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    let filePath = pathname === '/' ? join(ROOT, 'index.html') : join(ROOT, pathname);
    filePath = normalize(filePath);

    if (!resolve(filePath).startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end('Not found');
        return;
    }

    res.writeHead(200, {
        'Content-Type': mimeTypes[extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': pathname.startsWith('/.uploads/') || pathname.startsWith('/.outputs/')
            ? 'public, max-age=7200'
            : 'no-cache',
    });
    createReadStream(filePath).pipe(res);
}

function handleUpload(req, res, url) {
    if (!publicBaseUrl) {
        json(res, 503, {
            error: 'Public tunnel is not ready yet. Please try again in a few seconds.',
        });
        return;
    }

    const filename = safeFilename(url.searchParams.get('filename'));
    const filePath = join(UPLOAD_DIR, filename);
    const output = createWriteStream(filePath);
    let received = 0;
    let failed = false;

    req.on('data', chunk => {
        received += chunk.length;
        if (received > MAX_UPLOAD_BYTES) {
            failed = true;
            req.destroy();
            output.destroy();
            try { unlinkSync(filePath); } catch (_) {}
            json(res, 413, { error: 'Video is larger than 512 MB.' });
        }
    });

    req.on('error', () => {
        failed = true;
        output.destroy();
        try { unlinkSync(filePath); } catch (_) {}
    });

    output.on('finish', () => {
        if (failed) return;
        removeExpiredUploads();
        json(res, 200, {
            url: `${publicBaseUrl}/.uploads/${encodeURIComponent(filename)}`,
            bytes: received,
            expires_in_seconds: Math.floor(UPLOAD_TTL_MS / 1000),
        });
    });

    req.pipe(output);
}

function readJsonBody(req, maxBytes = MAX_FAL_REQUEST_BYTES) {
    return new Promise((resolveBody, rejectBody) => {
        const chunks = [];
        let received = 0;

        req.on('data', chunk => {
            received += chunk.length;
            if (received > maxBytes) {
                rejectBody(new Error('Request body is too large.'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            try {
                resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
            } catch (_) {
                rejectBody(new Error('Invalid JSON request body.'));
            }
        });
        req.on('error', rejectBody);
    });
}

async function forwardFalRequest(res, targetUrl, options = {}) {
    const falKey = process.env.FAL_KEY;
    if (!falKey) {
        json(res, 503, { error: 'Missing FAL_KEY in the local server environment.' });
        return;
    }

    const response = await fetch(targetUrl, {
        ...options,
        headers: {
            'Authorization': `Key ${falKey}`,
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
        signal: AbortSignal.timeout(30_000),
    });
    const responseText = await response.text();
    res.writeHead(response.status, {
        'Content-Type': response.headers.get('content-type') || 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
    });
    res.end(responseText);
}

function isAllowedFalMediaUrl(value) {
    try {
        const mediaUrl = new URL(String(value || ''));
        const isFalMedia = mediaUrl.hostname === 'fal.media' || mediaUrl.hostname.endsWith('.fal.media');
        const isFalGoogleStorage = mediaUrl.hostname === 'storage.googleapis.com'
            && mediaUrl.pathname.startsWith('/falserverless/');
        return mediaUrl.protocol === 'https:' && (isFalMedia || isFalGoogleStorage);
    } catch (_) {
        return false;
    }
}

function runAudioStripper(inputPath, outputPath) {
    return new Promise((resolveStrip, rejectStrip) => {
        const child = spawn('/usr/bin/swift', [join(ROOT, 'strip_audio.swift'), inputPath, outputPath], {
            stdio: ['ignore', 'ignore', 'pipe'],
        });
        let stderr = '';
        const timeout = setTimeout(() => {
            child.kill('SIGKILL');
            rejectStrip(new Error('Removing the H3 audio track timed out.'));
        }, INTERVIEWCODER_MEDIA_TIMEOUT_MS);

        child.stderr.on('data', chunk => {
            stderr = `${stderr}${chunk}`.slice(-8_000);
        });
        child.on('error', error => {
            clearTimeout(timeout);
            rejectStrip(error);
        });
        child.on('exit', code => {
            clearTimeout(timeout);
            if (code === 0) resolveStrip();
            else rejectStrip(new Error(stderr.trim() || `Audio removal exited with code ${code}.`));
        });
    });
}

async function createMutedH3Video(videoUrl) {
    const sourceName = safeFilename('h3-source.mp4');
    const outputName = safeFilename('h3-no-audio.mp4');
    const sourcePath = join(UPLOAD_DIR, sourceName);
    const outputPath = join(OUTPUT_DIR, outputName);

    try {
        const response = await fetch(videoUrl, {
            signal: AbortSignal.timeout(INTERVIEWCODER_MEDIA_TIMEOUT_MS),
        });
        if (!response.ok || !response.body) {
            throw new Error(`Could not download the H3 result (${response.status}).`);
        }
        await pipeline(Readable.fromWeb(response.body), createWriteStream(sourcePath));
        await runAudioStripper(sourcePath, outputPath);
        return `/.outputs/${encodeURIComponent(outputName)}`;
    } catch (error) {
        try { unlinkSync(outputPath); } catch (_) {}
        throw error;
    } finally {
        try { unlinkSync(sourcePath); } catch (_) {}
    }
}

async function handleFalApi(req, res, url) {
    const requestHostname = new URL(`http://${req.headers.host || 'localhost'}`).hostname;
    if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(requestHostname)) {
        json(res, 403, { error: 'The fal.ai proxy is only available from this computer.' });
        return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/fal/minimax-h3/strip-audio') {
        const input = await readJsonBody(req);
        if (!isAllowedFalMediaUrl(input.video_url)) {
            json(res, 400, { error: 'A valid fal media URL is required.' });
            return true;
        }
        const videoUrl = await createMutedH3Video(input.video_url);
        json(res, 200, { video: { url: videoUrl } });
        return true;
    }

    const isKlingSubmitPath = [
        '/api/fal/kling-v3-pro/requests',
        '/api/fal/kling-v3-standard/requests',
    ].includes(url.pathname);
    if (req.method === 'POST' && isKlingSubmitPath) {
        const input = await readJsonBody(req);
        await forwardFalRequest(res, `${FAL_QUEUE_BASE_URL}/${KLING_V3_PRO_ENDPOINT}`, {
            method: 'POST',
            body: JSON.stringify(input),
        });
        return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/fal/minimax-h3/requests') {
        const input = await readJsonBody(req);
        await forwardFalRequest(res, `${FAL_QUEUE_BASE_URL}/${MINIMAX_H3_ENDPOINT}`, {
            method: 'POST',
            body: JSON.stringify(input),
        });
        return true;
    }

    const match = url.pathname.match(/^\/api\/fal\/kling-v3-(?:pro|standard)\/requests\/([^/]+)\/(status|result)$/);
    if (req.method === 'GET' && match) {
        const requestId = encodeURIComponent(decodeURIComponent(match[1]));
        const suffix = match[2] === 'status' ? '/status' : '';
        await forwardFalRequest(
            res,
            `${FAL_QUEUE_BASE_URL}/${KLING_QUEUE_APP}/requests/${requestId}${suffix}`,
            { method: 'GET' }
        );
        return true;
    }

    const minimaxMatch = url.pathname.match(/^\/api\/fal\/minimax-h3\/requests\/([^/]+)\/(status|result)$/);
    if (req.method === 'GET' && minimaxMatch) {
        const requestId = encodeURIComponent(decodeURIComponent(minimaxMatch[1]));
        const suffix = minimaxMatch[2] === 'status' ? '/status' : '';
        await forwardFalRequest(
            res,
            `${FAL_QUEUE_BASE_URL}/${MINIMAX_H3_QUEUE_APP}/requests/${requestId}${suffix}`,
            { method: 'GET' }
        );
        return true;
    }

    return false;
}

async function forwardInterviewCoderRequest(req, res, targetUrl, options = {}) {
    const apiKey = process.env.INTERVIEWCODER_API_KEY;
    if (!apiKey) {
        json(res, 503, { error: 'Missing INTERVIEWCODER_API_KEY in the local server environment.' });
        return;
    }

    const { timeoutMs = INTERVIEWCODER_API_TIMEOUT_MS, ...fetchOptions } = options;
    const response = await fetch(targetUrl, {
        ...fetchOptions,
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            ...(fetchOptions.body ? { 'Content-Type': 'application/json' } : {}),
            ...(req.headers.range ? { Range: req.headers.range } : {}),
            ...(fetchOptions.headers || {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
    });
    const responseHeaders = {
        'Content-Type': response.headers.get('content-type') || 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
    };
    for (const name of ['content-length', 'content-range', 'accept-ranges']) {
        const value = response.headers.get(name);
        if (value) responseHeaders[name] = value;
    }
    res.writeHead(response.status, responseHeaders);
    if (!response.body) {
        res.end();
        return;
    }
    await pipeline(Readable.fromWeb(response.body), res);
}

async function handleInterviewCoder(req, res, url) {
    const requestHostname = new URL(`http://${req.headers.host || 'localhost'}`).hostname;
    if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(requestHostname)) {
        json(res, 403, { error: 'The InterviewCoder proxy is only available from this computer.' });
        return true;
    }

    if (req.method === 'GET' && url.pathname === '/api/interviewcoder/models') {
        await forwardInterviewCoderRequest(
            req,
            res,
            `${INTERVIEWCODER_BASE_URL}/v1/videos/models`,
            { method: 'GET' }
        );
        return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/interviewcoder/videos') {
        const payload = await readJsonBody(req);
        if (!INTERVIEWCODER_UNFILTERED_MODELS.has(payload.model)) {
            json(res, 400, { error: 'Unsupported InterviewCoder Unfiltered model.' });
            return true;
        }
        const idempotencyKey = req.headers['idempotency-key'];
        if (!idempotencyKey) {
            json(res, 400, { error: 'Idempotency-Key is required.' });
            return true;
        }
        await forwardInterviewCoderRequest(req, res, `${INTERVIEWCODER_BASE_URL}/v1/videos`, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Idempotency-Key': idempotencyKey },
        });
        return true;
    }

    const match = url.pathname.match(/^\/api\/interviewcoder\/videos\/([^/]+)(\/content)?$/);
    if (req.method === 'GET' && match) {
        const taskId = encodeURIComponent(decodeURIComponent(match[1]));
        const suffix = match[2] || '';
        await forwardInterviewCoderRequest(
            req,
            res,
            `${INTERVIEWCODER_BASE_URL}/v1/videos/${taskId}${suffix}`,
            {
                method: 'GET',
                timeoutMs: suffix ? INTERVIEWCODER_MEDIA_TIMEOUT_MS : INTERVIEWCODER_API_TIMEOUT_MS,
            }
        );
        return true;
    }

    return false;
}

function startTunnel() {
    if (publicBaseUrl) return;

    const child = spawn('cloudflared', ['tunnel', '--url', `http://127.0.0.1:${PORT}`, '--no-autoupdate'], {
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    const readOutput = chunk => {
        const text = chunk.toString();
        const match = text.match(/https:\/\/[-a-z0-9]+\.trycloudflare\.com/i);
        if (match && !publicBaseUrl) {
            publicBaseUrl = match[0];
            console.log(`Public tunnel ready: ${publicBaseUrl}`);
        }
    };

    child.stdout.on('data', readOutput);
    child.stderr.on('data', readOutput);
    child.on('error', error => {
        console.warn(`Could not start cloudflared tunnel: ${error.message}`);
    });
}

const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || `127.0.0.1:${PORT}`}`);

    try {
        if (req.method === 'GET' && url.pathname === '/api/upload-status') {
            json(res, 200, { ready: Boolean(publicBaseUrl), publicBaseUrl });
            return;
        }

        if (req.method === 'POST' && (
            url.pathname === '/api/upload-reference'
            || url.pathname === '/api/upload-reference-video'
        )) {
            handleUpload(req, res, url);
            return;
        }

        if (url.pathname.startsWith('/api/fal/') && await handleFalApi(req, res, url)) {
            return;
        }

        if (url.pathname.startsWith('/api/interviewcoder/') && await handleInterviewCoder(req, res, url)) {
            return;
        }

        if (req.method === 'GET' || req.method === 'HEAD') {
            serveStatic(req, res, decodeURIComponent(url.pathname));
            return;
        }

        res.writeHead(405);
        res.end('Method not allowed');
    } catch (error) {
        if (!res.headersSent) {
            const statusCode = error.message === 'Request body is too large.' ? 413 : 502;
            json(res, statusCode, { error: error.message });
        } else {
            res.end();
        }
    }
});

server.listen(PORT, () => {
    console.log(`Seedance Studio local server: http://127.0.0.1:${PORT}/`);
    startTunnel();
});

setInterval(removeExpiredUploads, 10 * 60 * 1000).unref();
