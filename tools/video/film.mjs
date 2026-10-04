// Films the real phone app, frame by frame at 30 fps on a virtual clock (vtime.js), into
// tools/video/clips/<clip>/0000.jpg. Each clip is a fresh page with its own setup and a
// script of things that happen on given frames.
//   node tools/video/film.mjs [clip …]     (companion must be running on :8787)
import { chromium, devices } from 'playwright';
import { mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const HERE = import.meta.dirname;
const OUT = join(HERE, 'clips');
const BASE = 'http://localhost:8787/';
const FPS = 30;
const VTIME = readFileSync(join(HERE, 'vtime.js'), 'utf8');
const ROOT = join(HERE, '..', '..');

const seed = (extra = {}) => ({
  settings: { look: 'clay', demo: true, sound: false, ...extra.settings },
  bonds: { mochi: { hearts: 999, level: 9 } },
  outfits: extra.outfits ?? {},
  pet: extra.pet,
});

/** Clip = setup + frame count + events keyed by frame. `app` is window.peek in the page. */
const CLIPS = {
  hero: {
    seed: seed({ settings: { backdrop: 'bedroom', pet: 'mochi' }, outfits: { mochi: { head: 'crown', face: 'specs' } } }),
    frames: 96,
  },
  wardrobe: {
    seed: seed({ settings: { backdrop: 'candy', pet: 'mochi' } }),
    frames: 66,
    at: {
      6: (a) => a.play.wear('party'),
      26: (a) => a.play.wear('crown'),
      44: (a) => { a.play.wear('wizard'); a.play.wear('shades'); },
    },
  },
  snack: {
    seed: seed({ settings: { backdrop: 'bedroom', pet: 'mochi' }, outfits: { mochi: { head: 'bow', face: null } } }),
    frames: 60,
    at: { 4: (a) => a.play.snacks.feed('onigiri', { x: a.renderer.W / 2, y: a.renderer.H - 60 }) },
  },
  backdrops: {
    seed: seed({ settings: { backdrop: 'forest', pet: 'mochi' }, outfits: { mochi: { head: 'crown', face: null } } }),
    frames: 56,
    at: { 14: (a) => a.play.setBackdrop('space'), 28: (a) => a.play.setBackdrop('candy'), 42: (a) => a.play.setBackdrop('beach') },
  },
  pets: {
    seed: seed({ settings: { backdrop: 'beach', pet: 'inky' } }),
    frames: 64,
    at: {
      2: (a) => a.setSpecies('inky'),
      16: (a) => { a.play.setBackdrop('forest'); a.setSpecies('pebble'); },
      32: (a) => { a.play.setBackdrop('candy'); a.setSpecies('lumi'); },
      48: (a) => { a.play.setBackdrop('space'); a.setSpecies('opal'); },
    },
  },
  shake: {
    seed: seed({ settings: { backdrop: 'cabin', pet: 'bun' } }),
    frames: 40,
    at: { 4: (a) => a.play.onShake() },
  },
  photo: {
    seed: seed({ settings: { backdrop: 'space', pet: 'opal' }, outfits: { opal: { head: 'party', face: null } } }),
    frames: 54,
    at: { 2: (a) => a.play.takePhoto() },
  },
};

const only = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const ctxOpts = { ...devices['iPhone 15'], viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 };
// Safe areas like a real iPhone 15 (Playwright has none), so the top bar clears the island.
const SAFE = `document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = ':root{--safe-top:54px!important;--safe-bottom:30px!important}'; document.head.append(st); });`;

for (const [name, clip] of Object.entries(CLIPS)) {
  if (only.length && !only.includes(name)) continue;
  const dir = join(OUT, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const page = await (await browser.newContext(ctxOpts)).newPage();
  page.on('pageerror', (e) => console.log(`[${name}] page error: ${e.message}`));
  await page.addInitScript(VTIME);
  await page.addInitScript(SAFE);
  await page.addInitScript((s) => {
    localStorage.clear();
    localStorage.setItem('peekpets.seenPair', 'true');
    localStorage.setItem('peekpets.settings', JSON.stringify(s.settings));
    localStorage.setItem('peekpets.bonds', JSON.stringify(s.bonds));
    localStorage.setItem('peekpets.outfits', JSON.stringify(s.outfits));
  }, clip.seed);
  await page.goto(BASE);
  await page.waitForFunction(() => window.peek && window.__vt);
  // Warm up 1.5 s of virtual time so the pet has settled (springs, fades, first hop).
  await page.evaluate(() => { for (let i = 0; i < 45; i++) window.__vt.advance(1000 / 30); });
  await page.waitForTimeout(400); // backdrop image decode
  for (let f = 0; f < clip.frames; f++) {
    const ev = clip.at?.[f];
    if (ev) await page.evaluate(`(${ev.toString()})(window.peek)`);
    await page.evaluate((ms) => window.__vt.advance(ms), 1000 / FPS);
    await page.screenshot({ path: join(dir, `${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 90 });
  }
  console.log(`${name}: ${clip.frames} frames`);
  await page.context().close();
}

// ---- "Find your PC" pairing in the iPhone app (fake Capacitor bridge, test companion)
if (!only.length || only.includes('pair')) await filmPairing();
await browser.close();

async function filmPairing() {
  const dir = join(OUT, 'pair');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const exe = join(ROOT, 'companion', 'bin', 'Debug', 'net8.0-windows', 'PeekPets.Companion.exe');
  const tmp = join(HERE, 'out-pair');
  rmSync(tmp, { recursive: true, force: true });
  const companion = spawn(exe, ['--loopback', '--port', '8798', '--no-https', '--settings', join(tmp, 'c.json'), '--pair-code', 'PET123', '--dry-run-actions', '--minimized'], { stdio: 'ignore' });
  try {
    for (let i = 0; i < 40; i++) { try { if ((await fetch('http://127.0.0.1:8798/api/info')).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 250)); }
    const page = await (await browser.newContext(ctxOpts)).newPage();
    await page.addInitScript(VTIME);
    await page.addInitScript(SAFE);
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('peekpets.settings', JSON.stringify({ look: 'clay', sound: false, backdrop: 'bedroom' }));
      window.Capacitor = {
        isNativePlatform: () => true,
        Plugins: {
          PeekDiscovery: { browse: async () => ({ services: [{ name: 'LUKE-PC', pc: 'LUKE-PC', ip: '127.0.0.1', port: '8798', ver: '0.3.0' }] }) },
          Haptics: { impact: async () => ({}), notification: async () => ({}), vibrate: async () => ({}) },
          KeepAwake: { keepAwake: async () => ({}), allowSleep: async () => ({}) },
          LocalNotifications: { requestPermissions: async () => ({ display: 'granted' }), schedule: async () => ({}) },
        },
      };
    });
    await page.goto('http://127.0.0.1:8798/');
    let f = 0;
    const shoot = async (n) => {
      for (let i = 0; i < n; i++, f++) {
        await page.evaluate(() => window.__vt.advance(1000 / 30));
        await page.screenshot({ path: join(dir, `${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 90 });
      }
    };
    // first run opens "Find your PC" after a moment
    for (let i = 0; i < 90 && !(await page.$('.pc')); i++) { await page.evaluate(() => window.__vt.advance(50)); await page.waitForTimeout(30); }
    await shoot(24);
    await page.click('.pc');
    await shoot(6);
    for (const ch of 'PET123') { await page.type('.code-input', ch); await shoot(3); }
    await shoot(6);
    await page.click('#sheet button.btn >> text=Pair');
    for (let i = 0; i < 80 && (await page.evaluate(() => window.peek.link.state)) !== 'connected'; i++) { await page.evaluate(() => window.__vt.advance(30)); await page.waitForTimeout(40); }
    await shoot(48);
    console.log(`pair: ${f} frames`);
  } finally {
    companion.kill();
  }
}
