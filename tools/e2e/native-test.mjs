// Exercises the native-app code path of the phone app (what runs inside the iPhone
// app) in Chromium with a fake Capacitor bridge: Bonjour discovery → "pick your PC" →
// code → connected to the chosen host; haptics and keep-awake go to the plugins.
// The Swift side (PeekDiscovery / NWBrowser) is built by CI, not run here.
//   node native-test.mjs
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

const ROOT = join(import.meta.dirname, '..', '..');
const EXE = join(ROOT, 'companion', 'bin', 'Debug', 'net8.0-windows', 'PeekPets.Companion.exe');
const TMP = join(import.meta.dirname, 'out', 'native-sandbox');
rmSync(TMP, { recursive: true, force: true });
const BASE = 'http://127.0.0.1:8797';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };

const companion = spawn(EXE, ['--loopback', '--port', '8797', '--no-https', '--settings', join(TMP, 'c.json'), '--pair-code', 'NAT234', '--dry-run-actions', '--minimized'], { stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(`${BASE}/api/info`)).ok) break; } catch { /* starting */ } await sleep(250); }
  browser = await chromium.launch();
  const page = await (await browser.newContext({ ...devices['iPhone 15'] })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const calls = [];
    window.__nativeCalls = calls;
    const rec = (name) => async (arg) => { calls.push([name, arg]); return {}; };
    window.Capacitor = {
      isNativePlatform: () => true,
      Plugins: {
        PeekDiscovery: { browse: async (o) => { calls.push(['browse', o]); return { services: [{ name: 'LUKE-PC', pc: 'LUKE-PC', ip: '127.0.0.1', port: '8797', ver: '0.2.0' }] }; } },
        Haptics: { impact: rec('impact'), notification: rec('notification'), vibrate: rec('vibrate') },
        KeepAwake: { keepAwake: rec('keepAwake'), allowSleep: rec('allowSleep') },
        LocalNotifications: { requestPermissions: async () => ({ display: 'granted' }), schedule: rec('notify') },
      },
    };
    if (!sessionStorage.getItem('cleared')) { localStorage.clear(); sessionStorage.setItem('cleared', '1'); }
  });
  await page.goto(`${BASE}/`);
  await page.waitForSelector('.pc', { timeout: 8000 });
  const title = await page.textContent('#sheetTitle');
  check('native first run opens "Find your PC" with the Bonjour result', title === 'Find your PC' && (await page.textContent('.pc')).includes('LUKE-PC'));
  await page.click('.pc');
  await page.fill('.code-input', 'nat234');
  await page.click('#sheet button.btn >> text=Pair');
  await page.waitForFunction(() => window.peek.link.state === 'connected', null, { timeout: 8000 });
  const link = await page.evaluate(() => ({ url: window.peek.link.url, host: JSON.parse(localStorage.getItem('peekpets.pcHost')) }));
  check('pairs with the picked PC and remembers its address', link.url === 'ws://127.0.0.1:8797/ws' && link.host === '127.0.0.1:8797', JSON.stringify(link));

  const face = await page.evaluate(() => { // a point the renderer itself says is body (not an eye)
    const a = window.peek, c = a.faceScreen();
    for (let dy = 40; dy < 200; dy += 10) if (a.renderer.hitTest(a.species, a.pose, c.x, c.y + dy)?.part === 'body') return { x: c.x, y: c.y + dy };
    return { x: c.x, y: c.y + 60 };
  });
  await sleep(1500); // let the 'paired' hop and toast settle
  await page.touchscreen.tap(face.x, face.y);
  await sleep(300);
  await page.evaluate(() => window.peek.setSetting('awake', true));
  await sleep(300);
  const calls = await page.evaluate(() => window.__nativeCalls.map((c) => c[0]));
  check('taps buzz the native haptics', calls.includes('impact'), calls.join(','));
  check('keep screen on uses the native plugin', calls.includes('keepAwake'));

  await page.reload();
  await page.waitForFunction(() => window.peek?.link.state === 'connected', null, { timeout: 8000 });
  check('reconnects on relaunch without asking again', true);
  check('no page errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  check('test run completed', false, err.message);
} finally {
  await browser?.close();
  companion.kill();
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
