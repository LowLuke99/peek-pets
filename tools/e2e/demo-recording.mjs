// Records a short v2 demo (headed Chromium so WebGL runs on the GPU) and saves
// screenshots into docs/. Uses a sandboxed companion (loopback, dry-run actions).
//   node demo-recording.mjs
import { chromium, devices } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { rmSync, mkdirSync, readdirSync, renameSync } from 'node:fs';

const ROOT = join(import.meta.dirname, '..', '..');
const EXE = join(ROOT, 'companion', 'bin', 'Debug', 'net8.0-windows', 'PeekPets.Companion.exe');
const TMP = join(import.meta.dirname, 'out', 'demo-sandbox');
const IMG = join(ROOT, 'docs', 'img');
const MEDIA = join(ROOT, 'docs', 'media');
rmSync(TMP, { recursive: true, force: true });
mkdirSync(join(TMP, 'video'), { recursive: true });
const BASE = 'http://localhost:8797';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const emitRaw = (key, ev, data = {}) => fetch(`${BASE}/api/test/emit?key=${key}&ev=${ev}`, { method: 'POST', body: JSON.stringify(data) });

const companion = spawn(EXE, ['--loopback', '--port', '8797', '--no-https', '--settings', join(TMP, 'c.json'), '--pair-code', 'DEMO23',
  '--dry-run-actions', '--auto-approve', '--test-hooks', '--inbox', join(TMP, 'inbox'), '--minimized'], { stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { if ((await fetch(`${BASE}/api/info`)).ok) break; } catch { /* starting */ } await sleep(250); }

const browser = await chromium.launch({ headless: false, args: ['--window-size=430,960'] });
const context = await browser.newContext({ ...devices['iPhone 15'], recordVideo: { dir: join(TMP, 'video'), size: { width: 393, height: 852 } } });
const page = await context.newPage();
await page.addInitScript(() => {
  localStorage.setItem('peekpets.seenPair', 'true');
  localStorage.setItem('peekpets.settings', JSON.stringify({ look: 'clay', sound: false }));
});
const emit = async (key, ev, data) => { await clear(); await sleep(150); return emitRaw(key, ev, data); };
const clear = () => page.evaluate(() => { window.peek.glue.card.clear(); window.peek.ui.bubble.hidden = true; });
const shot = (name) => page.screenshot({ path: join(IMG, name) });

await page.goto(`${BASE}/#pair=DEMO23`);
await page.waitForFunction(() => window.peek?.link.state === 'connected');
console.log('look:', await page.evaluate(() => window.peek.look));
// Let the eyes follow a finger around for a moment.
for (let i = 0; i <= 40; i++) {
  const a = (i / 40) * Math.PI * 2;
  await page.mouse.move(196 + Math.cos(a) * 150, 300 + Math.sin(a) * 120);
  if (i === 0) await page.mouse.down();
  await sleep(45);
}
await page.mouse.up();
await sleep(600);
await shot('v2-clay-mochi.png');

await page.click('#powersBtn');
await page.waitForSelector('#power-media');
await sleep(500);
await page.click('text=Turn all on');
await page.waitForFunction(() => Object.values(window.peek.glue.client.state.byKey).every((p) => p.active && p.state));
await sleep(800);
await clear();
await shot('powers-screen.png');
await page.locator('#power-health').scrollIntoViewIfNeeded();
await sleep(600);
await shot('powers-health-panel.png');
await page.click('#power-focus >> text=25 min');
await sleep(600);
await page.click('#sheetClose');
await sleep(2500);
await clear();
await sleep(400);
await shot('power-focus-music.png'); // desk + book, headphones (dry-run music is "playing")

await clear();
await emit('breaks', 'nudge', { kind: 'eyes', seconds: 20 });
await sleep(2500);
await shot('power-eye-break.png');
await sleep(1500);
await page.click('.nudge__btn >> text=Skip');
await sleep(800);

await emit('timers', 'done', { id: 1, label: 'Pizza' });
await sleep(900);
await shot('power-timer.png');
await sleep(1200);
await page.click('.nudge__btn >> text=Got it');
await sleep(600);

await clear();
await emit('health', 'alert', { kind: 'disk', level: 'warn', title: 'C: is getting full', detail: '12.9 GB free of 475 GB · losing ~1 GB a day', actions: ['open_storage', 'space_hints', 'open_cleanup'] });
await sleep(1800);
await shot('power-health.png');
await page.click('.nudge__btn >> text=Later');
await sleep(800);

await emit('away', 'summary', { awayMin: 23, items: ['Blender finished', 'Timer "Pizza" went off', '2 breaks skipped', 'C: still low (12.9 GB free)'] });
await sleep(1500);
await shot('power-away.png');
await page.click('.nudge__btn >> text=Thanks!');
await sleep(600);

// The whole clay family.
await page.evaluate(() => window.peek.glue.client.run('focus', 'stop'));
for (const id of ['pip', 'nimbus', 'plum', 'sprig', 'ember', 'puff', 'bun', 'mochi']) {
  await page.evaluate((id) => window.peek.setSpecies(id), id);
  await sleep(1300);
}
await context.close();
await browser.close();
companion.kill();

const webm = readdirSync(join(TMP, 'video')).find((f) => f.endsWith('.webm'));
mkdirSync(MEDIA, { recursive: true });
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', join(TMP, 'video', webm), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', '-movflags', '+faststart', join(MEDIA, 'v2-demo.mp4')]);
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '0', '-t', '9', '-i', join(MEDIA, 'v2-demo.mp4'),
  '-vf', 'fps=15,scale=280:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer', join(MEDIA, 'v2-clay-and-powers.gif')]);
console.log('saved docs/media/v2-demo.mp4 and screenshots in docs/img');
