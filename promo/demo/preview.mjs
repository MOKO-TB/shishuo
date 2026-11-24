import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const WORKSPACE = path.resolve('d:/100h/jiaoshi ai');
const ROOT = path.join(WORKSPACE, 'promo/demo');
const OUT = path.join(ROOT, 'preview');
const TIMES = process.argv.slice(2).map(Number).filter(n => Number.isFinite(n));
const targets = TIMES.length ? TIMES : [0.6, 3.2, 12.6, 22.2, 29.0, 35.0, 41.0, 49.2, 56.0, 62.5, 70.0, 77.0, 84.0, 91.2, 99.0, 105.0, 113.0, 119.0, 127.0, 138.0, 149.0, 155.0, 162.0, 167.0, 172.0, 181.0, 187.0, 192.0, 200.5, 207.0, 214.5, 219.0, 224.0, 232.0, 240.0, 247.0, 254.0, 260.0, 265.0, 270.0, 278.0, 288.0, 293.0, 303.0, 309.0, 315.0, 321.0, 334.0, 341.0, 349.0, 353.0, 356.0, 362.0, 367.0, 370.5];

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.png': 'image/png',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.json': 'application/json; charset=utf-8' };
function server() {
  return new Promise(resolve => {
    const s = http.createServer((req, res) => {
      const u = decodeURIComponent((req.url || '/').split('?')[0]);
      const f = path.join(WORKSPACE, u);
      if (!f.startsWith(WORKSPACE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('404'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    s.listen(0, '127.0.0.1', () => resolve({ s, port: s.address().port }));
  });
}

const { s, port } = await server();
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: 'zh-CN' });
const tl = JSON.parse(fs.readFileSync(path.join(ROOT, 'timeline.json'), 'utf-8'));
await page.addInitScript(js => { window.__TIMELINE__ = js; }, tl);
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE:', m.text()); });
await page.goto(`http://127.0.0.1:${port}/promo/demo/film.html`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
for (const t of targets) {
  await page.evaluate(t => window.__render(t), t);
  await page.waitForTimeout(30);
  const name = `t_${String(t).replace('.', '_')}.png`;
  await page.screenshot({ path: path.join(OUT, name) });
  console.log('saved', name);
}
await browser.close();
s.close();
