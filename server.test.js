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
