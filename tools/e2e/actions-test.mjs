// Exercises the dock actions + toys + every pet switch, checking for page errors.
//   node actions-test.mjs <baseUrl>
import { chromium, devices } from 'playwright';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:8787/';
const OUT = join(import.meta.dirname, 'out', 'actions');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };

const browser = await chromium.launch();
const page = await (await browser.newContext({ ...devices['iPhone 15'] })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => localStorage.setItem('peekpets.seenPair', 'true'));
await page.goto(base);
await page.waitForFunction(() => window.peek?.pose);

await page.click('[data-action="play"]');
if (await page.$('#playbar:not([hidden])')) await page.click('[data-choice="ball"]');
await sleep(300);
const ballFace = await page.evaluate(() => { const b = window.peek.ball; const s = window.peek.renderer.toScreen(b.x, b.y); return { active: b.active, ...s }; });
check('Play spawns a ball', ballFace.active);
// Flick it toward the pet.
await page.mouse.move(ballFace.x, ballFace.y);
await page.mouse.down();
await page.mouse.move(ballFace.x + 40, ballFace.y + 30, { steps: 3 });
await page.mouse.up();
await sleep(1600);
const gazeSrc = await page.evaluate(() => ({ moving: window.peek.ball.moving, y: window.peek.ball.y }));
await page.screenshot({ path: join(OUT, 'play.png') });
check('ball has physics (falls / bounces)', gazeSrc.y > -3, JSON.stringify(gazeSrc));
await page.click('[data-action="play"]');
check('Play toggles the ball off', !(await page.evaluate(() => window.peek.ball.active)));

check('the dock is Play, Snack, Shop, Friends, Nap', (await page.$$eval('.dock__btn', (b) => b.map((x) => x.dataset.action))).join() === 'play,snack,shop,friends,nap');

await page.click('[data-action="nap"]');
await sleep(1500);
check('Nap → asleep + dim', (await page.evaluate(() => [window.peek.emotion, document.querySelector('#dim').classList.contains('is-on')])).join() === 'asleep,true');
await page.screenshot({ path: join(OUT, 'nap.png') });
const face = await page.evaluate(() => { const c = window.peek.faceScreen(); return { x: c.x, y: c.y + 50 }; });
await page.touchscreen.tap(face.x, face.y);
await sleep(200);
check('tap wakes it with a startle', (await page.evaluate(() => window.peek.emotion)) === 'surprised');
check('waking lifts the dim', !(await page.evaluate(() => document.querySelector('#dim').classList.contains('is-on'))));

// Stroke = petting
await sleep(1500);
await page.mouse.move(face.x - 60, face.y);
await page.mouse.down();
for (let i = 0; i < 12; i++) await page.mouse.move(face.x + (i % 2 ? 60 : -60), face.y + 10, { steps: 4 });
await page.mouse.up();
check('stroking → love', (await page.evaluate(() => window.peek.emotion)) === 'love');

// Every pet renders and switches without errors
const ids = await page.evaluate(async () => (await import('./js/pet/species/index.js')).SPECIES.map((s) => s.id));
for (const id of ids) {
  await page.evaluate((id) => window.peek.setSpecies(id), id);
  await sleep(250);
}
check('all pets switch cleanly', errors.length === 0, `${ids.length} pets`);
const xp = await page.evaluate(() => window.peek.wallet.xp);
check('petting earned a little XP (cooldown, not spam)', xp >= 1 && xp <= 3, String(xp));
check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
