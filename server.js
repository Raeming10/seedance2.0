const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { timingSafeEqual } = require('node:crypto');
const { ROOT, loadEnv, redact } = require('./lib/config');
const { MODELS, fail } = require('./lib/catalog');
const { MediaStore, MIME } = require('./lib/media');
const { Providers } = require('./lib/providers');
const { Engine } = require('./lib/engine');

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}
async function body(req) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 32 * 1024 * 1024) fail('JSON exceeds 32 MB. Upload media through /api/assets.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || '{}');
  } catch {
    fail('Invalid JSON body.');
  }
}
function guide(id) {
  if (!MODELS.some((m) => m.id === id)) fail('Unknown model guide.');
  return fs.readFileSync(path.join(ROOT, 'docs', 'guides', id + '.md'), 'utf8');
}
function secureEqual(a, b) {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
function serveFile(req, res, file) {
  const size = fs.statSync(file).size;
  let start = 0,
    end = size - 1,
    code = 200;
  if (req.headers.range) {
    const m = req.headers.range.match(/^bytes=(\d*)-(\d*)$/);
    if (!m || (!m[1] && !m[2])) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      return res.end();
    }
    if (!m[1]) start = Math.max(0, size - Number(m[2]));
    else {
      start = Number(m[1]);
      if (m[2]) end = Math.min(end, Number(m[2]));
    }
    if (start > end || start >= size) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      return res.end();
    }
    code = 206;
  }
  const type =
    MIME[path.extname(file)] ||
    {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
    }[path.extname(file)] ||
    'application/octet-stream';
  res.writeHead(code, {
    'Content-Type': type,
    'Content-Length': Math.max(0, end - start + 1),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(code === 206 ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
  });
  if (req.method === 'HEAD' || !size) return res.end();
  fs.createReadStream(file, { start, end })
    .on('error', () => res.destroy())
    .pipe(res);
}
function createStudio({ dataDir = path.join(ROOT, '.studio'), providers, ffmpeg } = {}) {
  const media = new MediaStore(dataDir);
  const engine = new Engine(dataDir, providers || new Providers(media), media, { ffmpeg });
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = decodeURIComponent(url.pathname);
      if (
        req.headers.origin &&
        ![`http://${req.headers.host}`, `https://${req.headers.host}`].includes(req.headers.origin)
      )
        return json(res, 403, { error: 'Cross-origin requests are not allowed.' });
      if (
        !process.env.STUDIO_API_TOKEN &&
        !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      )
        return json(res, 403, {
          error: 'Use localhost, or configure STUDIO_API_TOKEN for a shared server.',
        });
      // Only this static allowlist is public. Source code, .env, records and legacy config are never served.
      const staticFiles = { '/': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css' };
      if (['GET', 'HEAD'].includes(req.method) && staticFiles[pathname])
        return serveFile(req, res, path.join(ROOT, staticFiles[pathname]));
      const token = process.env.STUDIO_API_TOKEN;
      if (token) {
        const auth = req.headers.authorization || '';
        const cookie = decodeURIComponent(
          req.headers.cookie
            ?.split('; ')
            .find((c) => c.startsWith('studio_session='))
            ?.slice(15) || '',
        );
        if (!secureEqual(auth.replace(/^Bearer /, ''), token) && !secureEqual(cookie || '', token))
          return json(res, 401, { error: 'Studio access token required.' });
      }
      if (req.method === 'POST' && pathname === '/api/session') {
        if (token)
          res.setHeader(
            'Set-Cookie',
            `studio_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/${process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''}`,
          );
        return json(res, 200, { ok: true });
      }
      if (req.method === 'GET' && pathname === '/api/health')
        return json(res, 200, {
          fal: Boolean(process.env.FAL_KEY),
          google: Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY),
          ffmpeg: engine.ffmpeg,
          version: '2.0.0',
        });
      if (req.method === 'GET' && pathname === '/api/example')
        return json(
          res,
          200,
          JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/social-video.json'), 'utf8')),
        );
      if (req.method === 'GET' && pathname === '/api/models')
        return json(res, 200, { models: MODELS });
      if (req.method === 'GET' && pathname.startsWith('/api/guides/'))
        return json(res, 200, {
          model: pathname.split('/').pop(),
          content: guide(pathname.split('/').pop()),
        });
      if (req.method === 'POST' && pathname === '/api/assets')
        return json(
          res,
          201,
          await media.importStream(
            req,
            path.extname(url.searchParams.get('filename') || '').toLowerCase(),
          ),
        );
      if (req.method === 'POST' && pathname === '/api/preview')
        return json(res, 200, engine.preflight(await body(req)));
      if (req.method === 'POST' && pathname === '/api/workflows/preview')
        return json(res, 200, engine.previewWorkflow(await body(req)));
      if (
        req.method === 'POST' &&
        ['/api/jobs', '/api/workflows', '/api/compose'].includes(pathname)
      ) {
        const key = req.headers['idempotency-key'];
        if (typeof key !== 'string' || !/^[A-Za-z0-9._:-]{1,160}$/.test(key))
          fail('Idempotency-Key required (1–160 letters, digits, . _ : -).');
        const input = await body(req);
        const result =
          pathname === '/api/jobs'
            ? engine.submit(input, key)
            : pathname === '/api/compose'
              ? engine.composeExisting(input, key)
              : engine.createWorkflow(input, key);
        json(res, 202, result);
        void engine.tick();
        return;
      }
      for (const kind of ['jobs', 'workflows']) {
        const records = kind === 'jobs' ? engine.jobs : engine.workflows;
        if (req.method === 'GET' && pathname === `/api/${kind}`)
          return json(res, 200, {
            [kind]: [...records.values()]
              .reverse()
              .slice(0, 100)
              .map((j) => engine.public(j, true)),
          });
        const match = pathname.match(new RegExp(`^/api/${kind}/([a-f0-9-]+)$`));
        if (req.method === 'GET' && match) {
          const j = records.get(match[1]);
          return json(res, j ? 200 : 404, j ? engine.public(j) : { error: 'Not found.' });
        }
      }
      const resume = pathname.match(/^\/api\/jobs\/([a-f0-9-]+)\/resume$/);
      if (req.method === 'POST' && resume) return json(res, 200, engine.resume(resume[1]));
      if (['GET', 'HEAD'].includes(req.method) && /^\/(assets|outputs)\//.test(pathname))
        return serveFile(req, res, media.localPath(pathname));
      return json(res, 404, { error: 'Not found.' });
    } catch (error) {
      if (!res.headersSent) json(res, error.status || 500, { error: redact(error.message) });
      else res.destroy();
    }
  });
  server.on('close', () => engine.stop());
  return { server, engine };
}
function start() {
  loadEnv();
  const host = process.env.HOST || '127.0.0.1',
    port = Number(process.env.PORT || 8000);
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !process.env.STUDIO_API_TOKEN)
    throw new Error('Set STUDIO_API_TOKEN before exposing the server on the network.');
  const dataDir = path.resolve(process.env.STUDIO_DATA_DIR || path.join(ROOT, '.studio'));
  fs.mkdirSync(dataDir, { recursive: true });
  const lock = path.join(dataDir, 'server.lock');
  if (fs.existsSync(lock)) {
    const pid = Number(fs.readFileSync(lock, 'utf8'));
    let alive = false;
    try {
      process.kill(pid, 0);
      alive = true;
    } catch (e) {
      if (e.code !== 'ESRCH') alive = true;
    }
    if (alive) throw new Error('Another Studio process is using this data directory.');
    fs.unlinkSync(lock);
  }
  fs.writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
  process.on('exit', () => {
    try {
      fs.unlinkSync(lock);
    } catch {}
  });
  const { server, engine } = createStudio({ dataDir });
  server.listen(port, host, () => {
    console.log(`Seedance Studio: http://${host}:${port}`);
    engine.start();
  });
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.on(signal, () => {
      engine.stop();
      server.close();
      process.exit(0);
    });
}
if (require.main === module) start();
module.exports = { createStudio, guide, start };
