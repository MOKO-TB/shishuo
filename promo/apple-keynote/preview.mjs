import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const WORKSPACE = path.resolve('d:/100h/jiaoshi ai');
const OUT_DIR = path.join(WORKSPACE, 'promo/apple-keynote/preview');
const TL_PATH = path.join(WORKSPACE, 'promo/apple-keynote/timeline.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
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
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(fullPath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(fullPath).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, port: addr.port });
    });
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const tl = JSON.parse(fs.readFileSync(TL_PATH, 'utf-8'));
  const lineMap = Object.fromEntries(tl.lines.map(l => [l.id, l]));

  const shots = [
    ['01_opening', lineMap.a1_1.start + 1.2],
    ['02_impact_fixed', lineMap.a1_3.start + (lineMap.a1_3.end - lineMap.a1_3.start) * 0.50],
    ['03_manifesto', lineMap.a2_3.start + 2.2],
    ['04_stage3d', lineMap.a2_4.start + 1.5],
    ['05_engine', lineMap.a3_4.start + 2.0],
    ['05b_student_home', lineMap.a4_1.start + 1.0],
    ['06_student_privacy', lineMap.a4_3.start + 1.5],
    ['07_avatar_stage', lineMap.a5_1.start + 1.8],
    ['07b_avatar_answering', lineMap.a5_1.start + 3.4],
    ['08_humanities_panel', lineMap.a5_2.start + 2.2],
    ['09_lab_kmap', lineMap.a5_5.start + 1.0],
    ['10_teacher_light', lineMap.a6_4.start + 1.8],
    ['11_campus_804', lineMap.a7_3.start + 1.6],
    ['12_campus_food', lineMap.a7_4.start + (lineMap.a7_4.end - lineMap.a7_4.start) * 0.72],
    ['12b_campus_food_end', lineMap.a7_4.end - 0.8],
    ['13_android_mobile', lineMap.a8_2.start + (lineMap.a8_2.end - lineMap.a8_2.start) * 0.78],
    ['14_bento_wall', lineMap.a9_4.start + 1.4],
    ['15_outro_cover', lineMap.a10_3.start + 2.0],
  ];

  const { server, port } = await startServer();
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: 'zh-CN' });
  await page.addInitScript(js => { window.__TIMELINE__ = js; }, tl);
  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));

  await page.goto(`http://127.0.0.1:${port}/promo/apple-keynote/film.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });

  for (const [name, t] of shots) {
    await page.evaluate(sec => window.__render(sec), t);
    const out = path.join(OUT_DIR, `${name}.png`);
    await page.screenshot({ path: out, type: 'png' });
    console.log(`Preview saved: ${name}.png @ t=${t.toFixed(2)}s`);
  }

  // Also export clean cover frame (without subtitle pill)
  await page.evaluate(sec => {
    window.__render(sec);
    document.getElementById('subtitle-pill').style.opacity = '0';
    document.getElementById('progress-bar').style.opacity = '0';
  }, lineMap.a10_3.start + 2.2);
  await page.screenshot({ path: path.join(WORKSPACE, 'promo/师说宣传片_苹果旗舰版_封面.png'), type: 'png' });
  console.log('Exported clean cover image: promo/师说宣传片_苹果旗舰版_封面.png');

  await browser.close();
  server.close();
}

main().catch(err => { console.error(err); process.exit(1); });
