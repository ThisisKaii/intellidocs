// Lightweight keep-alive pinger for live Render services (Server + ML).
// Pings both live endpoints every 10 minutes to prevent Render free instances from sleeping.
// Usage: node scripts/keep-alive-live.mjs

import https from 'node:https';

const SERVER_URL = 'https://intellidocs-server-1yxr.onrender.com/health';
const ML_URL = 'https://intellidocs-ml.onrender.com/health';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function ping(name, url) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const req = https.get(url, { headers: { 'User-Agent': USER_AGENT }, timeout: 75000 }, (res) => {
      res.resume();
      res.on('end', () => {
        const ms = Date.now() - t0;
        console.log(`[${new Date().toLocaleTimeString()}] \x1b[32m✔ ${name}\x1b[0m -> HTTP ${res.statusCode} (${(ms / 1000).toFixed(2)}s)`);
        resolve({ ok: res.statusCode === 200, ms });
      });
    });

    req.on('error', (err) => {
      const ms = Date.now() - t0;
      console.warn(`[${new Date().toLocaleTimeString()}] \x1b[33m⚠ ${name}\x1b[0m -> ${err.message} (${(ms / 1000).toFixed(2)}s)`);
      resolve({ ok: false, err: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      const ms = Date.now() - t0;
      console.warn(`[${new Date().toLocaleTimeString()}] \x1b[33m⚠ ${name}\x1b[0m -> Request timed out (${(ms / 1000).toFixed(2)}s)`);
      resolve({ ok: false, err: 'TIMEOUT' });
    });
  });
}

async function cycle() {
  console.log(`\n\x1b[90m--- Ping round at ${new Date().toISOString()} ---\x1b[0m`);
  await ping('Server', SERVER_URL);
  await ping('ML    ', ML_URL);
  console.log(`\x1b[90mSleeping 10 minutes until next ping...\x1b[0m`);
}

console.log(`\x1b[36m=== IntelliDocs Live Services Keep-Alive ===\x1b[0m`);
console.log(`Server: ${SERVER_URL}`);
console.log(`ML:     ${ML_URL}`);
console.log(`Interval: 10 minutes (Render sleep threshold: 15 min)`);
console.log(`Press Ctrl+C to stop.\n`);

cycle();
setInterval(cycle, 10 * 60 * 1000);
