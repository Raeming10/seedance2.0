const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createServer } = require('node:net');
const test = require('node:test');

async function getUnusedPort() {
    const server = createServer();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { port } = server.address();
    server.close();
    await once(server, 'close');
    return port;
}

function waitForOutput(child, expected) {
    return new Promise((resolve, reject) => {
        const onData = chunk => {
            if (chunk.toString().includes(expected)) {
                cleanup();
                resolve();
            }
        };
        const onExit = code => {
            cleanup();
            reject(new Error(`Server exited before startup with code ${code}`));
        };
        const cleanup = () => {
            child.stdout.off('data', onData);
            child.off('exit', onExit);
        };
        child.stdout.on('data', onData);
        child.on('exit', onExit);
    });
}

test('an upstream response stream error does not terminate the local server', { timeout: 5_000 }, async () => {
    const port = await getUnusedPort();
    const childScript = `
        global.fetch = async () => new Response(new ReadableStream({
            start(controller) {
                controller.enqueue(new Uint8Array([1]));
                setTimeout(() => controller.error(new DOMException(
                    'The operation was aborted due to timeout',
                    'TimeoutError'
                )), 20);
            }
        }), {
            status: 200,
            headers: { 'content-type': 'video/mp4' }
        });
        require('./server.js');
    `;
    const child = spawn(process.execPath, ['-e', childScript], {
        cwd: __dirname,
        env: {
            ...process.env,
            PORT: String(port),
            PUBLIC_BASE_URL: 'https://example.test',
            INTERVIEWCODER_API_KEY: 'test-key',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', chunk => {
        stderr += chunk.toString();
    });

    try {
        await waitForOutput(child, `http://127.0.0.1:${port}/`);
        await fetch(`http://127.0.0.1:${port}/api/interviewcoder/videos/test-id/content`)
            .then(response => response.arrayBuffer())
            .catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 100));

        assert.equal(child.exitCode, null, `Local server crashed:\n${stderr}`);
        const homeResponse = await fetch(`http://127.0.0.1:${port}/`);
        assert.equal(homeResponse.status, 200);
    } finally {
        if (child.exitCode === null) {
            child.kill('SIGTERM');
            await once(child, 'exit');
        }
    }
});

test('accepts generic reference media uploads and serves their MIME type', { timeout: 5_000 }, async () => {
    const port = await getUnusedPort();
    const child = spawn(process.execPath, ['server.js'], {
        cwd: __dirname,
        env: {
            ...process.env,
            PORT: String(port),
            PUBLIC_BASE_URL: 'https://example.test',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    try {
        await waitForOutput(child, `http://127.0.0.1:${port}/`);
        const uploadResponse = await fetch(
            `http://127.0.0.1:${port}/api/upload-reference?filename=voice.wav`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'audio/wav' },
                body: Buffer.from('RIFF-test-audio'),
            }
        );
        assert.equal(uploadResponse.status, 200);
        const uploaded = await uploadResponse.json();
        const pathname = new URL(uploaded.url).pathname;
        const mediaResponse = await fetch(`http://127.0.0.1:${port}${pathname}`);
        assert.equal(mediaResponse.status, 200);
        assert.equal(mediaResponse.headers.get('content-type'), 'audio/wav');
    } finally {
        if (child.exitCode === null) {
            child.kill('SIGTERM');
            await once(child, 'exit');
        }
    }
});

test('proxies all production Unfiltered models and rejects the removed experiment', { timeout: 5_000 }, async () => {
    const port = await getUnusedPort();
    const childScript = `
        global.fetch = async (_url, options) => new Response(options.body, {
            status: 200,
            headers: { 'content-type': 'application/json' }
        });
        require('./server.js');
    `;
    const child = spawn(process.execPath, ['-e', childScript], {
        cwd: __dirname,
        env: {
            ...process.env,
            PORT: String(port),
            PUBLIC_BASE_URL: 'https://example.test',
            INTERVIEWCODER_API_KEY: 'test-key',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    try {
        await waitForOutput(child, `http://127.0.0.1:${port}/`);
        for (const model of [
            'seedance-2.0-unfiltered',
            'seedance-2.0-fast-unfiltered',
            'seedance-2.0-mini-unfiltered',
        ]) {
            const payload = {
                model,
                prompt: 'animate',
                duration_seconds: 5,
                resolution: '720p',
                aspect_ratio: '16:9',
                generate_audio: false,
            };
            const response = await fetch(`http://127.0.0.1:${port}/api/interviewcoder/videos`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Idempotency-Key': `test-${model}`,
                },
                body: JSON.stringify(payload),
            });
            assert.equal(response.status, 200);
            assert.deepEqual(await response.json(), payload);
        }

        const removedResponse = await fetch(`http://127.0.0.1:${port}/api/interviewcoder/videos`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Idempotency-Key': 'test-removed-model',
            },
            body: JSON.stringify({ model: 'seedance-2.0-mini-unfiltered-content-i2v' }),
        });
        assert.equal(removedResponse.status, 400);
    } finally {
        if (child.exitCode === null) {
            child.kill('SIGTERM');
            await once(child, 'exit');
        }
    }
});

test('proxies MiniMax H3 submission, status, and result requests to fal', { timeout: 5_000 }, async () => {
    const port = await getUnusedPort();
    const childScript = `
        global.fetch = async (url, options) => new Response(JSON.stringify({
            url: String(url),
            method: options.method,
            body: options.body ? JSON.parse(options.body) : null,
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        });
        require('./server.js');
    `;
    const child = spawn(process.execPath, ['-e', childScript], {
        cwd: __dirname,
        env: {
            ...process.env,
            PORT: String(port),
            PUBLIC_BASE_URL: 'https://example.test',
            FAL_KEY: 'test-key',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    try {
        await waitForOutput(child, `http://127.0.0.1:${port}/`);
        const payload = {
            prompt: 'animate',
            image_url: 'data:image/jpeg;base64,YWJj',
            duration: 5,
            resolution: '768P',
        };
        const submitResponse = await fetch(`http://127.0.0.1:${port}/api/fal/minimax-h3/requests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        assert.equal(submitResponse.status, 200);
        assert.deepEqual(await submitResponse.json(), {
            url: 'https://queue.fal.run/minimax/h3/image-to-video',
            method: 'POST',
            body: payload,
        });

        for (const [suffix, expectedUrl] of [
            ['status', 'https://queue.fal.run/minimax/h3/requests/h3-123/status'],
            ['result', 'https://queue.fal.run/minimax/h3/requests/h3-123'],
        ]) {
            const response = await fetch(
                `http://127.0.0.1:${port}/api/fal/minimax-h3/requests/h3-123/${suffix}`
            );
            assert.equal(response.status, 200);
            assert.equal((await response.json()).url, expectedUrl);
        }
    } finally {
        if (child.exitCode === null) {
            child.kill('SIGTERM');
            await once(child, 'exit');
        }
    }
});

test('rejects non-fal media URLs for H3 audio stripping', { timeout: 5_000 }, async () => {
    const port = await getUnusedPort();
    const child = spawn(process.execPath, ['server.js'], {
        cwd: __dirname,
        env: {
            ...process.env,
            PORT: String(port),
            PUBLIC_BASE_URL: 'https://example.test',
            FAL_KEY: 'test-key',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    try {
        await waitForOutput(child, `http://127.0.0.1:${port}/`);
        const response = await fetch(`http://127.0.0.1:${port}/api/fal/minimax-h3/strip-audio`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ video_url: 'https://example.com/video.mp4' }),
        });
        assert.equal(response.status, 400);
        assert.match((await response.json()).error, /fal media URL/i);
    } finally {
        if (child.exitCode === null) {
            child.kill('SIGTERM');
            await once(child, 'exit');
        }
    }
});

test('submits Kling V3 Pro requests to the Pro fal endpoint', { timeout: 5_000 }, async () => {
    const port = await getUnusedPort();
    const childScript = `
        global.fetch = async (url, options) => new Response(JSON.stringify({
            url: String(url),
            method: options.method,
            body: options.body ? JSON.parse(options.body) : null,
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        });
        require('./server.js');
    `;
    const child = spawn(process.execPath, ['-e', childScript], {
        cwd: __dirname,
        env: {
            ...process.env,
            PORT: String(port),
            PUBLIC_BASE_URL: 'https://example.test',
            FAL_KEY: 'test-key',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    try {
        await waitForOutput(child, `http://127.0.0.1:${port}/`);
        const payload = {
            prompt: 'animate between frames',
            start_image_url: 'data:image/jpeg;base64,YWJj',
            end_image_url: 'data:image/jpeg;base64,ZGVm',
            duration: '5',
            generate_audio: false,
        };
        const response = await fetch(`http://127.0.0.1:${port}/api/fal/kling-v3-pro/requests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
            url: 'https://queue.fal.run/fal-ai/kling-video/v3/pro/image-to-video',
            method: 'POST',
            body: payload,
        });
    } finally {
        if (child.exitCode === null) {
            child.kill('SIGTERM');
            await once(child, 'exit');
        }
    }
});

test('keeps the former Kling V3 Standard route compatible with stale browser tabs', { timeout: 5_000 }, async () => {
    const port = await getUnusedPort();
    const childScript = `
        global.fetch = async (url, options) => new Response(JSON.stringify({
            url: String(url),
            method: options.method,
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        });
        require('./server.js');
    `;
    const child = spawn(process.execPath, ['-e', childScript], {
        cwd: __dirname,
        env: {
            ...process.env,
            PORT: String(port),
            PUBLIC_BASE_URL: 'https://example.test',
            FAL_KEY: 'test-key',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    try {
        await waitForOutput(child, `http://127.0.0.1:${port}/`);
        const response = await fetch(`http://127.0.0.1:${port}/api/fal/kling-v3-standard/requests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: 'animate' }),
        });

        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
            url: 'https://queue.fal.run/fal-ai/kling-video/v3/pro/image-to-video',
            method: 'POST',
        });
    } finally {
        if (child.exitCode === null) {
            child.kill('SIGTERM');
            await once(child, 'exit');
        }
    }
});
