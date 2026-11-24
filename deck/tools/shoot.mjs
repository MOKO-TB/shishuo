import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve('D:/100h/jiaoshi ai');
const OUT = path.join(ROOT, 'deck/preview');
fs.mkdirSync(OUT, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};

function startServer() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const fullPath = path.join(ROOT, urlPath);
      if (!fullPath.startsWith(ROOT) || !fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fullPath).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(fullPath).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const { server, port } = await startServer();
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, locale: 'zh-CN' });
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE:', m.text()); });

await page.goto(`http://127.0.0.1:${port}/deck/index.html`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30000 });
await page.waitForTimeout(2400);

const count = await page.evaluate(() => window.__deck.slides);
for (let i = 1; i <= count; i++) {
  await page.evaluate(n => { window.__deck.go(n); }, i);
  await page.evaluate(() => window.__deck.revealAll());
  await page.waitForTimeout(1900);
  const name = `s${String(i).padStart(2, '0')}.png`;
  await page.locator('#stage').screenshot({ path: path.join(OUT, name) });
  console.log('shot', name);
}

await browser.close();
server.close();
