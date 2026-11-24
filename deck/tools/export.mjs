import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve('D:/100h/jiaoshi ai');
const OUT = path.join(ROOT, 'deck');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf',
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
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: 'zh-CN' });
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));

await page.goto(`http://127.0.0.1:${port}/deck/index.html?print`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 30000 });
await page.waitForFunction(() => Array.from(document.images).every(i => i.complete), null, { timeout: 30000 });
await page.waitForTimeout(900);

await page.pdf({
  path: path.join(OUT, '师说路演.pdf'),
  width: '1920px',
  height: '1080px',
  printBackground: true,
  preferCSSPageSize: true,
  margin: { top: '0', right: '0', bottom: '0', left: '0' },
});
console.log('pdf exported');

await browser.close();
server.close();
