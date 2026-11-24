import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const WORKSPACE = path.resolve('d:/100h/jiaoshi ai');
const ROOT = path.join(WORKSPACE, 'promo/showcase');
const PREVIEW_DIR = path.join(ROOT, 'preview_v2');
const TL_PATH = path.join(ROOT, 'timeline_v2.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
};

function startServer() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const fullPath = path.join(WORKSPACE, urlPath);
      if (!fullPath.startsWith(WORKSPACE) || !fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
        res.writeHead(404); res.end('Not found'); return;
      }
      const ext = path.extname(fullPath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(fullPath).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function main() {
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  const tl = JSON.parse(fs.readFileSync(TL_PATH, 'utf-8'));
  const { server, port } = await startServer();
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: 'zh-CN' });
  await page.addInitScript(js => { window.__TIMELINE__ = js; }, tl);
  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));

  await page.goto(`http://127.0.0.1:${port}/promo/showcase/film_v2.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });

  const stamps = [
    ['p1_12s_ask_submit', 12.4],
    ['p2_16s_conf_badge', 16.2],
    ['p3_24s_bottom_actions', 24.0],
    ['p4_30s_review_btns', 30.8],
    ['p5_44s_mentor_map', 43.8],
    ['p6_52s_wall_card', 52.5],
    ['p7_70s_drawer_faq', 71.0],
    ['p8_111s_admin_bar', 111.0],
  ];

  for (const [name, t] of stamps) {
    await page.evaluate(sec => window.__render(sec), t);
    const out = path.join(PREVIEW_DIR, `${name}.png`);
    await page.screenshot({ path: out, type: 'png' });
    console.log(`Captured ${name} @ ${t}s`);
  }

  await browser.close();
  server.close();
}

main().catch(err => { console.error(err); process.exit(1); });
