import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve('D:/100h/jiaoshi ai');
const OUT = path.join(ROOT, 'deck/preview');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf' };

function startServer() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const fullPath = path.join(ROOT, urlPath);
      if (!fullPath.startsWith(ROOT) || !fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fullPath).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(fullPath).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const { server, port } = await startServer();
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: 'zh-CN' });
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
await page.goto(`http://127.0.0.1:${port}/deck/index.html`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30000 });
await page.waitForTimeout(1600);

const shots = [
  [7, 0, 's07_beat0'],
  [7, 1, 's07_beat1'],
  [7, 2, 's07_beat2'],
  [7, 3, 's07_beat3'],
  [5, 1, 's05_beat1'],
  [5, 3, 's05_beat3'],
  [12, 1, 's12_beat1'],
];
for (const [slide, beat, name] of shots) {
  await page.evaluate(([s, b]) => { window.__deck.go(s); window.__deck.beat(b); }, [slide, beat]);
  await page.waitForTimeout(1800);
  await page.locator('#stage').screenshot({ path: path.join(OUT, name + '.png') });
  console.log('shot', name);
}
await browser.close();
server.close();
