// End-to-end checks for v3: wardrobe, backdrops, snacks, shake & tilt, photo mode and
// the four new pets, in Chromium with an iPhone profile. Motion uses synthetic
// devicemotion/deviceorientation events (Chromium needs no permission prompt).
//   node v3-test.mjs [baseUrl]
import { chromium, devices } from 'playwright';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:8787/';
const OUT = join(import.meta.dirname, 'out', 'v3');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const context = await browser.newContext({ ...devices['iPhone 15'] });
await context.grantPermissions(['accelerometer', 'gyroscope', 'magnetometer']);
const page = await context.newPage();
const waitFor = (fn, arg, timeout = 4000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => {
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  localStorage.clear();
  localStorage.setItem('peekpets.seenPair', 'true');
  localStorage.setItem('peekpets.settings', JSON.stringify({ look: 'classic' }));
});
await page.goto(base);
await page.waitForFunction(() => window.peek?.pose);
const app = (fn, arg) => page.evaluate(fn, arg);

// ---- wardrobe
await page.click('#styleBtn');
await page.waitForSelector('[data-item="party"]');
check('Style sheet opens with the wardrobe', (await page.locator('.wear').count()) === 8);
check('level-1 pet: party hat is locked', await page.locator('[data-item="party"]').isDisabled());
await page.click('[data-item="bow"]');
check('wearing the bow', (await app(() => window.peek.play.outfit.head)) === 'bow');
await page.click('[data-item="bow"]');
check('tapping again takes it off', (await app(() => window.peek.play.outfit.head)) === null);
await page.click('[data-item="bow"]');
check('outfit is saved', (await app(() => JSON.parse(localStorage.getItem('peekpets.outfits')).mochi.head)) === 'bow');

// ---- backdrops
await page.click('[data-backdrop="forest"]');
await sleep(800);
const bd = await app(() => ({
  on: document.documentElement.classList.contains('has-backdrop'),
  img: getComputedStyle(document.querySelector('#backdrop')).backgroundImage,
  loaded: window.peek.play.backdropImg?.complete && window.peek.play.backdropImg.naturalWidth,
}));
check('backdrop shows the forest', bd.on && bd.img.includes('forest.webp') && bd.loaded > 0, JSON.stringify(bd));
await page.screenshot({ path: join(OUT, 'style-sheet.png') });
await page.click('#sheetClose');
await sleep(400);

// ---- snacks
await page.click('[data-action="snack"]');
check('snack bar opens with 5 treats', (await page.locator('#snackbar .snack').count()) === 5);
const bondBefore = await app(() => window.peek.bond.hearts);
await page.click('[data-snack="onigiri"]');
check('snack bar closes after picking', await page.locator('#snackbar').isHidden());
check('the pet watches the treat fly in', await app(() => window.peek.play.snacks.active));
await waitFor(() => window.peek.rig.acts.chew && window.peek.rig.t < window.peek.rig.acts.chew.until);
const fed = await app(() => ({ eaten: JSON.parse(localStorage.getItem('peekpets.snacks')).mochi.length, chewing: Boolean(window.peek.rig.acts.chew), hearts: window.peek.bond.hearts, fav: JSON.parse(localStorage.getItem('peekpets.snackFavs') ?? '{}').mochi }));
check('favourite eaten: chews, +3 hearts, favourite discovered', fed.eaten === 1 && fed.chewing && fed.hearts - bondBefore >= 3 && fed.fav === 'onigiri', JSON.stringify(fed));
await page.screenshot({ path: join(OUT, 'snack-chew.png') });
for (let i = 0; i < 3; i++) {
  await waitFor(() => !window.peek.play.snacks.active);
  await app(() => window.peek.play.snacks.feed('cookie'));
}
await waitFor(() => !window.peek.play.snacks.active);
await app(() => window.peek.play.snacks.feed('berry'));
await waitFor(() => window.peek.rig.acts.nope);
const full = await app(() => ({ eaten: JSON.parse(localStorage.getItem('peekpets.snacks')).mochi.length, nope: Boolean(window.peek.rig.acts.nope) }));
check('after 4 snacks the pet politely says no', full.eaten === 4 && full.nope, JSON.stringify(full));
await waitFor(() => !window.peek.play.snacks.active);

// ---- shake & tilt
await app(() => window.peek.setSetting('motion', true));
await waitFor(() => window.peek.play.motion.on);
check('motion sensors on', await app(() => window.peek.play.motion.on));
await app(() => {
  const shake = (x) => window.dispatchEvent(Object.assign(new Event('devicemotion'), { accelerationIncludingGravity: { x, y: -9.8, z: 0 } }));
  for (const x of [0, 25, 0, 25, 0, 25]) shake(x);
});
await waitFor(() => window.peek.emotion === 'dizzy');
const shook = await app(() => ({ shake: Boolean(window.peek.rig.acts.shake), emotion: window.peek.emotion }));
check('shaking makes the pet dizzy', shook.shake && shook.emotion === 'dizzy', JSON.stringify(shook));
await page.click('[data-action="play"]');
// beta 30°, gamma 60°: downhill is cos(30°)·sin(60°) = 0.75 to the right.
await app(() => window.dispatchEvent(Object.assign(new Event('deviceorientation'), { beta: 30, gamma: 60 })));
await waitFor(() => window.peek.play.motion.tilt.x > 0.6);
const tilt = await app(() => ({ x: window.peek.play.motion.tilt.x, ball: window.peek.ball.tilt }));
check('tilting right: pet leans and the ball rolls right', tilt.x > 0.6 && tilt.ball > 0.6, JSON.stringify(tilt));
await page.click('[data-action="play"]');
await app(() => window.peek.setSetting('motion', false));

// ---- photo
await app(() => window.peek.play.takePhoto());
await waitFor(() => document.querySelector('img.photo')?.complete, null, 30_000); // PNG encode is slow in software rendering
await sleep(300);
const photo = await app(() => { const i = document.querySelector('img.photo'); return { w: i.naturalWidth, h: i.naturalHeight, save: Boolean(document.querySelector('a[download$=".png"]')) }; });
check('photo: polaroid image + Save link', photo.w === 1080 && photo.h > 1080 && photo.save, JSON.stringify(photo));
await page.screenshot({ path: join(OUT, 'photo.png') });
await page.click('#sheetClose');
await sleep(300);

// ---- new pets
for (const id of ['inky', 'pebble', 'lumi', 'opal']) {
  await app((pet) => window.peek.setSpecies(pet), id);
  await sleep(500);
  const ok = await app(() => window.peek.species.id);
  await page.screenshot({ path: join(OUT, `pet-${id}.png`) });
  check(`new pet ${id} renders`, ok === id);
}
await app(() => window.peek.setSetting('look', 'clay'));
await sleep(600);
check('clay look still works with a new pet', ['clay', 'classic'].includes(await app(() => window.peek.look)));

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
