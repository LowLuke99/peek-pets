// Renders every pet in a few emotions (WebKit, iPhone 15) and tiles them into one
// contact sheet: node gallery.mjs <baseUrl> <outDir> [emotions=neutral,joy]
import { webkit, devices } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [base, outDir, emotionArg = 'neutral,joy'] = process.argv.slice(2);
const emotions = emotionArg.split(',');
mkdirSync(outDir, { recursive: true });

const browser = await webkit.launch();
const context = await browser.newContext({ ...devices['iPhone 15'] });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => localStorage.setItem('peekpets.seenPair', 'true'));
await page.goto(base);
await page.waitForFunction(() => window.peek?.pose);

const ids = await page.evaluate(() => [...document.querySelectorAll('.pet-card')].length || null) ?? null;
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
console.log(JSON.stringify({ species, emotions, errors }));

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
