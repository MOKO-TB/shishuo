import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const WORKSPACE = path.resolve('d:/100h/jiaoshi ai');
const ROOT = path.join(WORKSPACE, 'promo/showcase');
const FRAMES_DIR = path.join(ROOT, 'frames_v2');
const TL_PATH = path.join(ROOT, 'timeline_v2.json');
const AUDIO_PATH = path.join(ROOT, 'audio_v2/final_audio.wav');
const OUT_1080 = path.join(WORKSPACE, 'promo/师说最新功能展示_1080p.mp4');
const OUT_720 = path.join(WORKSPACE, 'promo/师说最新功能展示_720p.mp4');
const OUT_COVER = path.join(WORKSPACE, 'promo/师说最新功能展示_封面.png');
const FPS = 30;
const WORKERS = 8;

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

async function runWorker(workerId, port, tl, startFrame, endFrame, totalFrames) {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: 'zh-CN' });
  await page.addInitScript(js => { window.__TIMELINE__ = js; }, tl);
  page.on('pageerror', e => console.error(`[W${workerId}] PAGE ERROR:`, e.message));

  await page.goto(`http://127.0.0.1:${port}/promo/showcase/film_v2.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });

  // Capture crisp PNG cover on last worker
  if (workerId === WORKERS - 1) {
    await page.evaluate(sec => window.__render(sec), tl.totalSec - 2.0);
    await page.screenshot({ path: OUT_COVER, type: 'png' });
    console.log(`[W${workerId}] Saved cover -> ${OUT_COVER}`);
  }

  for (let i = startFrame; i < endFrame; i++) {
    await page.evaluate(t => window.__render(t), i / FPS);
    await page.screenshot({
      path: path.join(FRAMES_DIR, `f_${String(i).padStart(5, '0')}.jpg`),
      type: 'jpeg',
      quality: 95,
    });
    if ((i - startFrame) % 150 === 0 || i === endFrame - 1) {
      const pct = (((i - startFrame + 1) / (endFrame - startFrame)) * 100).toFixed(0);
      console.log(`[W${workerId}] frame ${i}/${totalFrames} (${pct}%)`);
    }
  }
  await browser.close();
}

function runFfmpeg(args, label) {
  return new Promise((resolve, reject) => {
    console.log(`\n[ffmpeg] ${label}...`);
    const p = spawn('ffmpeg', args, { stdio: 'inherit' });
    p.on('close', code => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });
}

async function main() {
  const t0 = Date.now();
  fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
  fs.mkdirSync(FRAMES_DIR, { recursive: true });

  const tl = JSON.parse(fs.readFileSync(TL_PATH, 'utf-8'));
  const totalFrames = Math.ceil(tl.totalSec * FPS);
  console.log(`Rendering ${totalFrames} frames (${tl.totalSec.toFixed(2)}s @ ${FPS}fps) with ${WORKERS} workers...`);

  const { server, port } = await startServer();
  const perWorker = Math.ceil(totalFrames / WORKERS);
  const jobs = [];
  for (let w = 0; w < WORKERS; w++) {
    const s = w * perWorker;
    const e = Math.min(totalFrames, s + perWorker);
    if (s < e) jobs.push(runWorker(w, port, tl, s, e, totalFrames));
  }
  await Promise.all(jobs);
  server.close();

  await runFfmpeg([
    '-y',
    '-framerate', String(FPS),
    '-i', path.join(FRAMES_DIR, 'f_%05d.jpg'),
    '-i', AUDIO_PATH,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '16',
    '-pix_fmt', 'yuv420p',
    '-profile:v', 'high',
    '-level', '4.2',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-t', tl.totalSec.toFixed(3),
    '-movflags', '+faststart',
    '-shortest',
    OUT_1080,
  ], 'Encoding 1080p master MP4');

  await runFfmpeg([
    '-y',
    '-i', OUT_1080,
    '-vf', 'scale=1280:720:flags=lanczos',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '48000',
    '-movflags', '+faststart',
    OUT_720,
  ], 'Encoding 720p share MP4');

  // Clean up temporary frames to save disk space
  fs.rmSync(FRAMES_DIR, { recursive: true, force: true });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nAll done in ${elapsed}s!`);
  console.log(`  1080p: ${OUT_1080}`);
  console.log(`  720p : ${OUT_720}`);
  console.log(`  Cover: ${OUT_COVER}`);
}

main().catch(err => { console.error(err); process.exit(1); });
