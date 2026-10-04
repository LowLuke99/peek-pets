// Renders compose.html to an MP4: calls render(t) for every frame at 30 fps, screenshots
// 1920×1080, then encodes with ffmpeg.
//   node tools/video/render.mjs                    → docs/media/v3-whats-new.mp4
//   node tools/video/render.mjs --stills 1,4,11,15,18   → preview PNGs in tools/video/frames/
import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = import.meta.dirname;
const FRAMES = join(HERE, 'frames');
const OUT = join(HERE, '..', '..', 'docs', 'media', 'v3-whats-new.mp4');
const FPS = 30, SECONDS = 20;
const stillsArg = process.argv.indexOf('--stills');
const stills = stillsArg > 0 ? process.argv[stillsArg + 1].split(',').map(Number) : null;

rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.log('page error:', e.message));
await page.goto(pathToFileURL(join(HERE, 'compose.html')).href);
await page.evaluate(() => document.fonts.ready);

const times = stills ?? Array.from({ length: FPS * SECONDS }, (_, i) => i / FPS);
for (const [i, t] of times.entries()) {
  await page.evaluate((tt) => window.render(tt), t);
  await page.screenshot({ path: join(FRAMES, stills ? `still-${t}.png` : `${String(i).padStart(4, '0')}.png`) });
  if (!stills && i % 60 === 0) console.log(`frame ${i}/${times.length}`);
}
await browser.close();

if (!stills) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', join(FRAMES, '%04d.png'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT]);
  console.log(`wrote ${OUT}`);
}
