// End-to-end live test: real companion exe + real Windows cursor + WebKit iPhone page.
//   node live-test.mjs [webkit|chromium]   (writes out/live-<engine>/report.json, screenshots, video)
// WebKit = Safari's engine (compatibility). On Windows it renders in software at
// ~10 fps, so motion timing is only meaningful in the GPU-backed Chromium run.
// Moves YOUR mouse cursor while it runs (~1 minute). Don't touch the mouse.
import { webkit, chromium, devices } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, readdirSync, renameSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { networkInterfaces } from 'node:os';
import http from 'node:http';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const EXE = join(ROOT, 'companion', 'bin', 'Debug', 'net8.0-windows', 'PeekPets.Companion.exe');
const ENGINE = process.argv[2] === 'chromium' ? 'chromium' : 'webkit';
const OUT = join(import.meta.dirname, 'out', `live-${ENGINE}`);
const PORT = 8790;
const CODE = 'TEST42';
const SETTINGS = join(OUT, 'companion-test.json');
const HOST = lanIp();
const BASE = `http://${HOST}:${PORT}/`;
const report = { engine: ENGINE, host: HOST, port: PORT, startedAt: new Date().toISOString(), checks: [], metrics: {} };

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, detail = '') => {
  report.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const stats = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, min: round(s[0]), median: round(q(0.5)), p90: round(q(0.9)), max: round(s[s.length - 1]) };
};
const round = (v) => (v == null ? null : Math.round(v * 10) / 10);

// ---------------------------------------------------------------- companion
let companion = null;
async function startCompanion() {
  companion = spawn(EXE, ['--port', String(PORT), '--settings', SETTINGS, '--pair-code', CODE, '--minimized'], { stdio: 'ignore', env: { ...process.env, PEEKPETS_TEST: '1' } });
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    try { if ((await fetch(`${BASE}api/info`)).ok) return Date.now() - t0; } catch { /* not up yet */ }
    await sleep(150);
  }
  throw new Error('companion did not start');
}
function stopCompanion(force) {
  const pid = companion.pid;
  try { execFileSync('taskkill', force ? ['/PID', String(pid), '/F'] : ['/PID', String(pid)], { stdio: 'ignore' }); } catch { /* gone */ }
  companion = null;
}

// ---------------------------------------------------------------- cursor driver
const driver = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(ROOT, 'tools', 'cursor-driver.ps1')]);
const lines = createInterface({ input: driver.stdout });
const waiting = [];
let driverReady;
const ready = new Promise((r) => { driverReady = r; });
lines.on('line', (l) => {
  if (l.trim() === 'ready') return driverReady();
  waiting.shift()?.(l.trim());
});
const cmd = (c) => new Promise((res) => { waiting.push(res); driver.stdin.write(c + '\n'); });

// ---------------------------------------------------------------- page helpers
const INSTRUMENT = () => {
  window.__recv = [];
  window.__frames = [];
  const app = window.peek;
  const origCursor = app.link.onCursor;
  app.link.onCursor = (m, now) => {
    window.__recv.push({ s: m.s, x: m.x, y: m.y, wall: performance.timeOrigin + now });
    if (window.__recv.length > 4000) window.__recv.splice(0, 1000);
    origCursor(m, now);
  };
  const origUpdate = app.rig.update.bind(app.rig);
  app.rig.update = (dt, input) => {
    const p = origUpdate(dt, input);
    window.__frames.push({ wall: performance.timeOrigin + performance.now(), gx: p.gaze.x, gy: p.gaze.y, src: input.source });
    if (window.__frames.length > 6000) window.__frames.splice(0, 2000);
    return p;
  };
};

async function waitState(page, state, timeout = 15000) {
  const t0 = Date.now();
  await page.waitForFunction((s) => window.peek?.link?.state === s, state, { timeout });
  return Date.now() - t0;
}

// ---------------------------------------------------------------- run
try {
  report.metrics.companionStartMs = await startCompanion();
  await ready;
  const rect = (await cmd('corners')).split(' ').slice(1).map(Number);
  const [vx, vy, vw, vh] = rect;
  report.metrics.virtualDesktop = { x: vx, y: vy, w: vw, h: vh };

  const browser = await (ENGINE === 'chromium' ? chromium : webkit).launch();
  const context = await browser.newContext({ ...devices['iPhone 15'], recordVideo: { dir: OUT, size: devices['iPhone 15'].viewport } });
  await context.addInitScript(() => localStorage.setItem('peekpets.seenPair', 'true'));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // 1. Pair via QR-style link
  let t0 = Date.now();
  await page.goto(`${BASE}#pair=${CODE}`);
  await waitState(page, 'connected');
  report.metrics.pairToConnectedMs = Date.now() - t0;
  check('pairs via #pair= link and connects', true, `${report.metrics.pairToConnectedMs} ms`);
  await page.evaluate(INSTRUMENT);
  await sleep(2200);
  await page.screenshot({ path: join(OUT, '01-connected.png') });

  // 2. Corners: eyes must point the right way
  const m = 24;
  const spots = [
    ['center', vx + vw / 2, vy + vh / 2, (g) => Math.abs(g.gx) < 0.25 && Math.abs(g.gy) < 0.25],
    ['top-left', vx + m, vy + m, (g) => g.gx < -0.4 && g.gy < -0.3],
    ['top-right', vx + vw - m, vy + m, (g) => g.gx > 0.4 && g.gy < -0.3],
    ['bottom-right', vx + vw - m, vy + vh - m, (g) => g.gx > 0.4 && g.gy > 0.3],
    ['bottom-left', vx + m, vy + vh - m, (g) => g.gx < -0.4 && g.gy > 0.3],
  ];
  for (const [name, x, y, ok] of spots) {
    await cmd(`move ${Math.round(x)} ${Math.round(y)}`);
    await sleep(450);
    const g = await page.evaluate(() => window.__frames.at(-1));
    check(`eyes look ${name}`, ok(g), `gaze ${g.gx.toFixed(2)}, ${g.gy.toFixed(2)}`);
    await page.screenshot({ path: join(OUT, `02-look-${name}.png`) });
  }

  // 3. Latency: real cursor move â†’ sample arrives on phone â†’ eyes settle
  const moves = [];
  for (let i = 0; i < 40; i++) {
    const fx = i % 2 ? 0.1 + Math.random() * 0.25 : 0.65 + Math.random() * 0.25;
    const fy = 0.15 + Math.random() * 0.7;
    const px = Math.round(vx + fx * (vw - 1)), py = Math.round(vy + fy * (vh - 1));
    const moved = Number((await cmd(`move ${px} ${py}`)).split(' ')[1]);
    moves.push({ moved, nx: (px - vx) / (vw - 1), ny: (py - vy) / (vh - 1) });
    await sleep(260);
  }
  await sleep(400);
  const { recv, frames } = await page.evaluate(() => ({ recv: window.__recv, frames: window.__frames }));
  const arrive = [], settle = [];
  for (const [i, mv] of moves.entries()) {
    const hit = recv.find((r) => r.wall >= mv.moved - 2 && Math.abs(r.x - mv.nx) < 0.003 && Math.abs(r.y - mv.ny) < 0.003);
    if (!hit) continue;
    arrive.push(hit.wall - mv.moved);
    // Measure only until the next move starts retargeting the eyes.
    const windowEnd = moves[i + 1]?.moved ?? hit.wall + 600;
    const after = frames.filter((f) => f.wall >= hit.wall && f.wall < windowEnd);
    const final = after.at(-1);
    if (!final) continue;
    const settled = after.find((f) => Math.hypot(f.gx - final.gx, f.gy - final.gy) < 0.06);
    // Time from the real cursor move to eyes within 6% of their resting gaze.
    if (settled) settle.push(settled.wall - mv.moved);
  }
  report.metrics.cursorArrivalMs = stats(arrive);
  report.metrics.eyesSettledMs = stats(settle);
  check('cursor samples reach the phone', arrive.length >= 36, `${arrive.length}/40 matched, median ${report.metrics.cursorArrivalMs.median} ms`);
  check('arrival latency median < 50 ms (same-PC loopback)', report.metrics.cursorArrivalMs.median < 50);
  report.metrics.pageFps = await page.evaluate(() => window.peek.fps);
  if (ENGINE === 'chromium') check('eyes settle on new target median < 200 ms', report.metrics.eyesSettledMs.median < 200, `median ${report.metrics.eyesSettledMs.median} ms`);
  else check('eyes settle (informational, software-rendered WebKit)', true, `median ${report.metrics.eyesSettledMs.median} ms at ~${Math.round(report.metrics.pageFps)} fps`);
  report.metrics.phoneReported = await page.evaluate(() => ({ rtt: window.peek.link.rtt, latency: window.peek.link.latency, rate: window.peek.link.cursorRate, fps: window.peek.fps }));

  // 4. Taps
  const pet = await page.evaluate(() => { const c = window.peek.faceScreen(); return { x: c.x, y: c.y + 120 }; });
  await page.touchscreen.tap(pet.x, pet.y);
  await sleep(250);
  const tapEmotion = await page.evaluate(() => window.peek.emotion);
  check('tapping the pet makes it react', ['happy', 'joy', 'surprised', 'curious'].includes(tapEmotion), tapEmotion);
  await page.screenshot({ path: join(OUT, '03-tap.png') });
  const eye = await page.evaluate(() => { const c = window.peek.faceScreen(); const f = window.peek.species.face; return { x: c.x + f.lx * window.peek.renderer.S, y: c.y }; });
  await sleep(1300);
  await page.touchscreen.tap(eye.x, eye.y);
  await sleep(200);
  check('poking an eye makes it wince', (await page.evaluate(() => window.peek.emotion)) === 'wince');

  // 5. Facts: this desktop has no battery and should say so
  const facts = await page.evaluate(() => window.peek.facts);
  report.metrics.facts = facts;
  check('battery fact reported honestly', facts.battery && (facts.battery.available || facts.battery.reason === 'no_battery'), JSON.stringify(facts.battery));

  // 6. Graceful close â†’ phone notices immediately â†’ restart â†’ auto-reconnect via token
  t0 = Date.now();
  stopCompanion(false);
  await waitState(page, 'reconnecting', 8000);
  report.metrics.gracefulCloseDetectedMs = Date.now() - t0;
  check('phone notices companion closing', report.metrics.gracefulCloseDetectedMs < 3000, `${report.metrics.gracefulCloseDetectedMs} ms`);
  await sleep(2500);
  await page.screenshot({ path: join(OUT, '04-pc-closed.png') });
  const statusClosed = await page.evaluate(() => document.querySelector('#statusText').textContent);
  check('status says the PC app closed', /closed|away/i.test(statusClosed), statusClosed);
  t0 = Date.now();
  await startCompanion();
  await waitState(page, 'connected', 20000);
  report.metrics.reconnectAfterRestartMs = Date.now() - t0;
  check('reconnects automatically after restart (no re-pair)', true, `${report.metrics.reconnectAfterRestartMs} ms from launch`);
  await sleep(1500);
  await page.screenshot({ path: join(OUT, '05-reconnected.png') });

  // 7. Crash (no goodbye) â†’ heartbeat detects it
  t0 = Date.now();
  stopCompanion(true);
  await waitState(page, 'reconnecting', 15000);
  report.metrics.crashDetectedMs = Date.now() - t0;
  check('phone detects a crashed companion', report.metrics.crashDetectedMs < 8000, `${report.metrics.crashDetectedMs} ms`);
  await startCompanion();
  t0 = Date.now();
  await waitState(page, 'connected', 20000);
  report.metrics.reconnectAfterCrashMs = Date.now() - t0;
  check('reconnects after crash', true, `${report.metrics.reconnectAfterCrashMs} ms`);

  // 8. Security: a fresh phone without the code can't connect; wrong codes are rate-limited
  const stranger = await browser.newContext({ ...devices['iPhone 15'] });
  const sp = await stranger.newPage();
  await sp.goto(BASE);
  await sp.waitForFunction(() => window.peek?.link);
  check('unpaired phone stays unpaired', (await sp.evaluate(() => window.peek.link.state)) === 'unpaired');
  const reasons = [];
  for (let i = 0; i < 6; i++) {
    await sp.evaluate(() => window.peek.link.pairWithCode('ZZZZZZ'));
    await sp.waitForFunction(() => window.peek.link.state === 'unpaired' && window.peek.link.info.authError, null, { timeout: 5000 });
    reasons.push(await sp.evaluate(() => window.peek.link.info.authError));
    await sleep(150);
  }
  check('wrong code is refused', /match/i.test(reasons[0]), reasons[0]);
  check('repeated wrong codes get rate-limited', reasons.some((r) => /too many/i.test(r)), reasons.at(-1));
  await sp.screenshot({ path: join(OUT, '06-bad-code.png') });
  await stranger.close();

  // 8b. Cross-site pages can't open the socket (Origin check / DNS-rebinding guard)
  const foreign = await new Promise((resolve) => {
    const req = http.request({ host: HOST, port: PORT, path: '/ws', headers: {
      Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13',
      'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==', Origin: 'http://evil.example' } });
    req.on('response', (r) => resolve(r.statusCode));
    req.on('upgrade', () => resolve(101));
    req.on('error', () => resolve(-1));
    req.end();
  });
  check('socket from a foreign website is refused', foreign === 403, `HTTP ${foreign}`);

  // 9. Demo mode works with no PC
  const solo = await browser.newContext({ ...devices['iPhone 15'] });
  const so = await solo.newPage();
  await so.addInitScript(() => localStorage.setItem('peekpets.settings', JSON.stringify({ demo: true })));
  await so.goto(BASE);
  await sleep(2500);
  const demo = await so.evaluate(() => ({ status: document.querySelector('#statusText').textContent, gaze: window.peek.rig.gaze }));
  check('solo demo cursor drives the eyes', /demo/i.test(demo.status) && Math.hypot(demo.gaze.x, demo.gaze.y) > 0.05, demo.status);
  await so.screenshot({ path: join(OUT, '07-demo.png') });
  await solo.close();

  check('no page errors', errors.length === 0, errors.join(' | '));
  await page.close();
  await context.close();
  await browser.close();
} catch (err) {
  check('test run completed', false, String(err?.stack ?? err));
} finally {
  if (companion) stopCompanion(false);
  driver.stdin.write('quit\n');
  report.finishedAt = new Date().toISOString();
  report.passed = report.checks.every((c) => c.ok);
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  const video = readdirSync(OUT).find((f) => f.endsWith('.webm'));
  if (video) renameSync(join(OUT, video), join(OUT, 'session.webm'));
  console.log(`\n${report.checks.filter((c) => c.ok).length}/${report.checks.length} checks passed`);
  console.log(JSON.stringify(report.metrics, null, 2));
}

function lanIp() {
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    if (/radmin|vpn|virtual|vethernet|loopback/i.test(name)) continue;
    const a = addrs.find((x) => x.family === 'IPv4' && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(x.address));
    if (a) return a.address;
  }
  return '127.0.0.1';
}

