// Installable-app (HTTPS) mode test: secure link works over wss, the service worker
// caches the whole pet, and the app still opens + plays when the companion is OFF.
// Chromium is told to accept the test CA (we never touch the Windows cert store).
import { chromium, devices } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { networkInterfaces } from 'node:os';

const ROOT = resolve(import.meta.dirname, '..', '..');
const EXE = join(ROOT, 'companion', 'bin', 'Debug', 'net8.0-windows', 'PeekPets.Companion.exe');
const OUT = join(import.meta.dirname, 'out', 'app-mode');
mkdirSync(OUT, { recursive: true });
const HOST = Object.values(networkInterfaces()).flat().find((a) => a.family === 'IPv4' && /^(10\.|192\.168\.)/.test(a.address))?.address ?? '127.0.0.1';
const PORT = 8792;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };

const proc = spawn(EXE, ['--port', String(PORT), '--settings', join(OUT, 'c.json'), '--cert-dir', join(OUT, 'certs'), '--pair-code', 'TEST42', '--minimized'], { stdio: 'ignore', env: { ...process.env, PEEKPETS_TEST: '1' } });
for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://${HOST}:${PORT}/api/info`)).ok) break; } catch { /* starting */ } await sleep(200); }
const info = await (await fetch(`http://${HOST}:${PORT}/api/info`)).json();
check('companion advertises the secure port', info.securePort === PORT + 1, JSON.stringify(info));
const ca = await fetch(`http://${HOST}:${PORT}/ca.crt`);
check('CA certificate downloadable', ca.ok && ca.headers.get('content-type') === 'application/x-x509-ca-cert');

const browser = await chromium.launch({ args: ['--ignore-certificate-errors'] });
const ctx = await browser.newContext({ ...devices['iPhone 15'], ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const secure = `https://${HOST}:${PORT + 1}/`;
await page.goto(`${secure}#pair=TEST42`);
await page.waitForFunction(() => window.peek?.link?.state === 'connected', null, { timeout: 15000 });
check('pairs and streams over wss://', (await page.evaluate(() => window.peek.link.url)).startsWith('wss://'));
check('page is a secure context', await page.evaluate(() => window.isSecureContext));

await page.waitForFunction(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg?.active) return false;
  const cache = await caches.open('peekpets-app');
  return Boolean(await cache.match('/__peekpets_version'));
}, null, { timeout: 20000, polling: 500 });
const cached = await page.evaluate(async () => (await (await caches.open('peekpets-app')).keys()).length);
check('service worker cached the app', cached > 30, `${cached} files`);
await page.screenshot({ path: join(OUT, '1-secure-connected.png') });

execFileSync('taskkill', ['/PID', String(proc.pid), '/F'], { stdio: 'ignore' });
await sleep(800);
await page.reload();
await page.waitForFunction(() => window.peek?.pose, null, { timeout: 10000 });
await sleep(2500);
const offline = await page.evaluate(() => ({ state: window.peek.link.state, status: document.querySelector('#statusText').textContent, fps: window.peek.fps }));
check('app opens with the PC off (from cache)', Boolean(offline.state), JSON.stringify(offline));
const spot = await page.evaluate(() => { const c = window.peek.faceScreen(); return { x: c.x, y: c.y + 60 }; });
await page.touchscreen.tap(spot.x, spot.y);
await sleep(300);
check('pet still reacts offline', ['happy', 'surprised', 'joy', 'curious', 'wince'].includes(await page.evaluate(() => window.peek.emotion)));
await page.screenshot({ path: join(OUT, '2-offline-from-cache.png') });

const guide = await browser.newPage({ ...devices['iPhone 15'] });
await guide.goto(`http://${HOST}:${PORT}/install.html#pair=TEST42`).catch(() => {});
await guide.screenshot({ path: join(OUT, '3-install-guide-pc-off.png'), fullPage: true }).catch(() => {});
await browser.close();
console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
