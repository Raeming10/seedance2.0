const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined)
      process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
function redact(value) {
  let s = String(value);
  for (const name of ['FAL_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'STUDIO_API_TOKEN'])
    if (process.env[name]) s = s.split(process.env[name]).join('[REDACTED]');
  return s.replace(/data:[^;]+;base64,[A-Za-z0-9+/=]+/g, '[media]').slice(0, 1500);
}
module.exports = { ROOT, loadEnv, redact };
