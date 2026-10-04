// Renders every pet in a few emotions (iPhone 15 viewport) and tiles them into one
// contact sheet:
//   node gallery.mjs <baseUrl> <outDir> [emotions=neutral,joy] [look=clay|classic] [engine=chromium|webkit]
// Chromium headless renders WebGL in software (slow but exact), which is fine for stills.
import { chromium, webkit, devices } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [base, outDir, emotionArg = 'neutral,joy', look = 'clay', engine = look === 'clay' ? 'chromium' : 'webkit'] = process.argv.slice(2);
const emotions = emotionArg.split(',');
mkdirSync(outDir, { recursive: true });

const browser = await (engine === 'webkit' ? webkit : chromium).launch({ args: engine === 'chromium' ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : [] });
const context = await browser.newContext({ ...devices['iPhone 15'] });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/WebSocket/.test(m.text())) errors.push(m.text()); });
await page.addInitScript((lk) => {
  localStorage.setItem('peekpets.seenPair', 'true');
  localStorage.setItem('peekpets.settings', JSON.stringify({ look: lk }));
}, look);
await page.goto(base);
await page.waitForFunction(() => window.peek?.pose);
const actualLook = await page.evaluate(() => window.peek.look);

const species = await page.evaluate(async () => (await import('./js/pet/species/index.js')).SPECIES.map((s) => s.id));
const files = [];
for (const id of species) {
  for (const emotion of emotions) {
    await page.evaluate(({ id, emotion }) => {
      const app = window.peek;
      if (app.species.id !== id) app.setSpecies(id, { quiet: true });
      app.mood = { ...app.mood, reaction: { emotion, until: Date.now() + 60_000, then: null } };
      app.ui.bubble.hidden = true;
    }, { id, emotion });
    await page.waitForTimeout(900);
    const file = join(outDir, `${id}-${emotion}.png`);
    await page.screenshot({ path: file });
    files.push(file);
  }
}
await browser.close();
console.log(JSON.stringify({ look: actualLook, species, emotions, errors }));

// Tile: one row per pet, one column per emotion, scaled down.
const cols = emotions.length * 4;
const inputs = files.flatMap((f) => ['-i', f]);
const filter = files.map((_, i) => `[${i}:v]scale=295:-1[v${i}]`).join(';') +
  `;${files.map((_, i) => `[v${i}]`).join('')}xstack=inputs=${files.length}:layout=${layout(files.length, cols)}:fill=white[out]`;
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', filter, '-map', '[out]', join(outDir, 'gallery.png')]);

function layout(n, c) {
  const w = 295, h = Math.round((852 / 393) * 295);
  return Array.from({ length: n }, (_, i) => `${(i % c) * w}_${Math.floor(i / c) * h}`).join('|');
}
