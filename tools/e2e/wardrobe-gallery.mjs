// Contact sheet: every pet wearing every wardrobe item (rows = pets, columns = items).
//   node wardrobe-gallery.mjs <baseUrl> <out.png> [look=clay|classic]
// Used to tune each species' hat anchor (propFit.hat) by eye.
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [base = 'http://localhost:8787/', out = 'tools/e2e/out/wardrobe.png', look = 'clay'] = process.argv.slice(2);
mkdirSync(dirname(out), { recursive: true });

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const page = await (await browser.newContext({ ...devices['iPhone 15'] })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript((lk) => {
  localStorage.setItem('peekpets.seenPair', 'true');
  localStorage.setItem('peekpets.settings', JSON.stringify({ look: lk, reducedMotion: true }));
  localStorage.setItem('peekpets.bonds', JSON.stringify({ mochi: { hearts: 999, level: 9 } }));
}, look);
await page.goto(base);
await page.waitForFunction(() => window.peek?.pose);

const { species, items } = await page.evaluate(async () => ({
  species: (await import('./js/pet/species/index.js')).SPECIES.map((s) => s.id),
  items: (await import('./js/core/wardrobe.js')).WARDROBE.map((i) => i.id),
}));
const shots = [];
for (const id of species) {
  const row = [];
  for (const item of items) {
    const clip = await page.evaluate(({ id, item }) => {
      const app = window.peek;
      if (app.species.id !== id) app.setSpecies(id, { quiet: true });
      const slot = item === 'specs' || item === 'shades' ? 'face' : 'head';
      app.play.outfits = { [id]: { head: slot === 'head' ? item : null, face: slot === 'face' ? item : null } };
      app.mood = { ...app.mood, reaction: { emotion: 'happy', until: Date.now() + 60_000, then: null } };
      app.ui.bubble.hidden = true;
      const r = app.renderer;
      const c = r.toScreen(0, -0.5);
      const w = r.S * 1.5;
      return { x: Math.max(0, c.x - w / 2), y: Math.max(0, c.y - w * 0.62), width: w, height: w };
    }, { id, item });
    await page.waitForTimeout(450);
    row.push((await page.screenshot({ clip })).toString('base64'));
  }
  shots.push(row);
}

const html = `<body style="margin:0;background:#fff;display:grid;grid-template-columns:repeat(${items.length},150px);gap:2px">${
  shots.flat().map((b) => `<img src="data:image/png;base64,${b}" style="width:150px;height:150px">`).join('')}</body>`;
const sheet = await browser.newPage({ viewport: { width: items.length * 152, height: species.length * 152 } });
await sheet.setContent(html);
await sheet.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(JSON.stringify({ out, species, items, errors }));
