const fs = require('node:fs');
const path = require('node:path');
const { loadEnv } = require('./config');
loadEnv();
const base = (process.env.STUDIO_URL || `http://127.0.0.1:${process.env.PORT || 8000}`).replace(
  /\/$/,
  '',
);
async function api(route, data, key, method) {
  const res = await fetch(base + route, {
    method: method || (data === undefined ? 'GET' : 'POST'),
    headers: {
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(process.env.STUDIO_API_TOKEN
        ? { Authorization: `Bearer ${process.env.STUDIO_API_TOKEN}` }
        : {}),
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(30000),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`);
  return result;
}
async function upload(file) {
  const p = path.resolve(file),
    size = fs.statSync(p).size;
  if (size > 512 * 1024 * 1024) throw new Error('File exceeds 512 MB.');
  const res = await fetch(`${base}/api/assets?filename=${encodeURIComponent(path.basename(p))}`, {
    method: 'POST',
    headers: {
      ...(process.env.STUDIO_API_TOKEN
        ? { Authorization: `Bearer ${process.env.STUDIO_API_TOKEN}` }
        : {}),
    },
    body: fs.createReadStream(p),
    duplex: 'half',
    signal: AbortSignal.timeout(180000),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error);
  return result;
}
async function waitFor(kind, id, timeoutMs = 30 * 60 * 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await api(`/api/${kind}/${encodeURIComponent(id)}`);
    if (['completed', 'failed', 'unknown', 'paused'].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(
    `Wait timed out. Work continues on the server. Query ${kind}/${id}; do not resubmit with a new key.`,
  );
}
module.exports = { api, upload, waitFor, base };
