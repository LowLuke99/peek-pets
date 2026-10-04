// End-to-end test for the helpful powers. Starts its own sandboxed companion
// (loopback only, dry-run actions, auto-approve, temp settings + inbox), drives the
// phone UI in Chromium (iPhone 15), and checks both directions:
//   phone → PC: a tap on the phone produces the right (recorded, not real) PC action
//   PC → phone: a PC event makes the pet react (pose, prop, card, mood)
//   node powers-test.mjs [--headed]
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const EXE = join(ROOT, 'companion', 'bin', 'Debug', 'net8.0-windows', 'PeekPets.Companion.exe');
const PORT = 8797;
const BASE = `http://localhost:${PORT}`;
const OUT = join(import.meta.dirname, 'out', 'powers');
const TMP = join(import.meta.dirname, 'out', 'powers-sandbox');
const SHOTS = process.env.SHOTS ? join(ROOT, 'docs', 'img') : OUT;
rmSync(TMP, { recursive: true, force: true });
mkdirSync(join(TMP, 'inbox'), { recursive: true });
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
const actions = async () => (await fetch(`${BASE}/api/test/actions`)).json();
const emitRaw = (key, ev, data = {}) => fetch(`${BASE}/api/test/emit?key=${key}&ev=${ev}`, { method: 'POST', body: JSON.stringify(data) });
let page;
// The sandbox's real health watchdog may have queued its own card (this PC's C: is low): clear first.
const emit = async (key, ev, data) => { await page.evaluate(() => window.peek.glue.card.clear()); await sleep(100); return emitRaw(key, ev, data); };

const companion = spawn(EXE, ['--loopback', '--port', String(PORT), '--no-https', '--settings', join(TMP, 'companion.json'),
  '--pair-code', 'TEST23', '--dry-run-actions', '--auto-approve', '--test-hooks', '--inbox', join(TMP, 'inbox'), '--minimized'], { stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/api/info`)).ok) break; } catch { /* starting */ } await sleep(250); }

  browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
  page = await (await browser.newContext({ ...devices['iPhone 15'] })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(() => localStorage.setItem('peekpets.seenPair', 'true'));
  await page.goto(`${BASE}/#pair=TEST23`);
  await page.waitForFunction(() => window.peek?.link.state === 'connected' && window.peek.glue.client.state.list.length > 0, null, { timeout: 15000 });
  const keys = await page.evaluate(() => window.peek.glue.client.state.list);
  check('phone pairs and receives the power list', keys.length === 9, keys.join(','));

  // ---- switching powers on from the phone
  await page.click('#powersBtn');
  await page.waitForSelector('#power-media');
  check('powers start switched off (nothing runs until you opt in)', await page.evaluate(() => Object.values(window.peek.glue.client.state.byKey).every((p) => !p.active)));
  await page.click('text=Turn all on');
  await page.waitForFunction(() => Object.values(window.peek.glue.client.state.byKey).every((p) => p.active && p.state));
  check('Turn all on → every power running with live state', true);
  await page.screenshot({ path: join(SHOTS, 'powers-screen.png') });

  // ---- phone → PC commands (dry-run backend records them)
  await page.click('#power-media [aria-label="Play or pause"]');
  await page.click('#power-media [aria-label="Volume up"]');
  await sleep(400);
  let calls = await actions();
  check('media remote: play/pause + volume reach the PC', calls.includes('media:PlayPause') && calls.includes('media:VolumeUp'), calls.join(' '));

  await page.click('#power-focus >> text=25 min');
  await page.waitForFunction(() => window.peek.glue.cues.focusing);
  check('focus session: pet gets desk + book and looks focused', await page.evaluate(() => window.peek.glue.cues.hand === 'book' && window.peek.emotion === 'focused'));

  await page.fill('#power-timers input.ptext', 'tea in 3 min');
  await page.press('#power-timers input.ptext', 'Enter');
  await page.waitForFunction(() => (window.peek.glue.client.state.byKey.timers.state?.timers ?? []).length === 1);
  const timer = await page.evaluate(() => window.peek.glue.client.state.byKey.timers.state.timers[0]);
  check('timer from a natural phrase', timer.label === 'Tea' && timer.totalSec === 180, JSON.stringify(timer));

  await page.fill('#power-handoff textarea.ptext', 'hello from the phone');
  await page.click('#power-handoff >> text=To PC clipboard');
  await sleep(400);
  calls = await actions();
  check('handoff: text lands on the PC clipboard', calls.includes('clipboard:hello from the phone'));
  await page.click('#power-handoff >> text=Grab PC clipboard');
  await page.waitForSelector('#power-handoff .grabbed textarea');
  check('handoff: grab PC clipboard shows its text', (await page.inputValue('#power-handoff .grabbed textarea')) === 'hello from the phone');

  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
  await page.setInputFiles('#power-handoff input[type=file]', { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('Inbox'), null, { timeout: 8000 });
  const saved = readdirSync(join(TMP, 'inbox'));
  check('handoff: photo upload saved to the inbox', saved.some((f) => f.startsWith('Photo') && f.endsWith('.jpg')), saved.join(','));

  await page.click('#power-quick >> text=Where\'s my cursor?');
  await page.click('#power-quick >> text=Lock PC'); // confirm() auto-accepted
  await page.click('#power-quick button >> text=/mute mic/i');
  await page.click('#power-health >> text=Storage Settings');
  await sleep(600);
  calls = await actions();
  check('quick actions: find cursor, lock (dry run!), mic', ['find_cursor', 'lock', 'mic:muted'].every((c) => calls.includes(c)), calls.join(' '));
  check('health: Storage Settings opens on the PC', calls.includes('open:StorageSettings'));

  await page.click('#power-watch >> text=Downloads');
  await page.waitForFunction(() => (window.peek.glue.client.state.byKey.watch.state?.watches ?? []).length === 1);
  check('watch: Downloads folder is being watched (pet holds the hourglass)', await page.evaluate(() => window.peek.glue.cues.watching));

  // ---- security of the command surface
  const sec = await page.evaluate(async () => {
    const c = window.peek.glue.client;
    const unknown = await c.run('quick', 'shell', { cmd: 'calc.exe' });
    const noPower = await c.run('nope', 'x');
    const token = window.peek.link.token;
    const noAuth = await fetch('/api/inbox', { method: 'POST', body: new Uint8Array([0xff, 0xd8, 0xff]) }).then((r) => r.status);
    const notImage = await fetch('/api/inbox', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: new TextEncoder().encode('MZ pretend exe') }).then((r) => r.status);
    const strangers = await new Promise((resolve) => {
      const ws = new WebSocket(`ws://${location.host}/ws`);
      ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.t === 'hello') ws.send(JSON.stringify({ t: 'cmd', id: 1, power: 'quick', name: 'lock' })); if (m.t === 'auth_err') { resolve(m.reason); ws.close(); } };
      setTimeout(() => resolve('timeout'), 3000);
    });
    const spam = [];
    for (let i = 0; i < 4; i++) spam.push((await c.run('quick', 'lock')).reason ?? 'ok');
    return { unknown: unknown.reason, noPower: noPower.reason, noAuth, notImage, strangers, spam };
  });
  check('unknown commands are refused (allowlist only)', sec.unknown === 'unknown_command' && sec.noPower === 'unknown_command', JSON.stringify(sec));
  check('uploads need a device token and must be real images', sec.noAuth === 401 && sec.notImage === 415);
  check('an unpaired socket cannot send commands', sec.strangers === 'not_authed');
  check('commands are rate limited (lock: 3/min)', sec.spam.includes('rate_limited'), sec.spam.join(','));

  // ---- PC events → pet reactions
  await page.click('#sheetClose');
  await sleep(500);
  await emit('breaks', 'nudge', { kind: 'eyes', streakMin: 20, seconds: 20 });
  await page.waitForSelector('#nudge:not([hidden])');
  await sleep(1500);
  const eyes = await page.evaluate(() => ({ title: document.querySelector('.nudge__title')?.textContent, far: window.peek.rig.isActing('lookFar'), gaze: window.peek.rig.gaze }));
  check('eye-break nudge: card + pet looks far away (up and off to the side)', /Eye break/.test(eyes.title) && eyes.far && eyes.gaze.x < -0.3 && eyes.gaze.y < -0.2, JSON.stringify(eyes));
  await page.screenshot({ path: join(SHOTS, 'power-eye-break.png') });
  await page.click('.nudge__btn >> text=Skip');
  await sleep(300);
  check('skipping hides the card and stops looking away', await page.evaluate(() => document.querySelector('#nudge').hidden));

  await emit('timers', 'done', { id: 9, label: 'Pizza' });
  await sleep(250);
  const alarm = await page.evaluate(() => ({ emotion: window.peek.emotion, shake: window.peek.rig.isActing('shake'), hand: window.peek.glue.cues.hand, title: document.querySelector('.nudge__title')?.textContent }));
  check('timer done: startle, shake, timer in hand, card', alarm.emotion === 'surprised' && alarm.shake && alarm.hand === 'timer' && /Pizza/.test(alarm.title), JSON.stringify(alarm));
  await page.click('.nudge__btn >> text=Got it');

  await emit('watch', 'done', { id: 3, label: 'Blender', reason: 'quiet', text: 'Blender looks done (went quiet).' });
  await sleep(250);
  check('watched app done: pet celebrates', (await page.evaluate(() => window.peek.emotion)) === 'joy');
  await page.click('.nudge__btn >> text=Yay!');

  await emit('health', 'alert', { kind: 'disk', level: 'warn', title: 'C: is getting full', detail: '12.9 GB free of 475 GB (3%)', actions: ['open_storage', 'space_hints'] });
  await sleep(1600);
  check('health alert: worried pet + fix-it card', (await page.evaluate(() => [window.peek.emotion, document.querySelector('.nudge__title')?.textContent].join('|'))) === 'worried|C: is getting full');
  await page.screenshot({ path: join(SHOTS, 'power-health.png') });
  await page.click('.nudge__btn >> text=Storage Settings');
  await sleep(400);
  check('card button runs the PC fix', (await actions()).filter((c) => c === 'open:StorageSettings').length >= 2);

  await emit('away', 'summary', { awayMin: 23, items: ['Blender finished', '2 breaks skipped', 'C: still low (12.9 GB free)'] });
  await sleep(900);
  const away = await page.evaluate(() => [...document.querySelectorAll('.nudge__items li')].map((li) => li.textContent));
  check('away summary greets you with what happened', away.length === 3, away.join(' / '));
  await page.screenshot({ path: join(SHOTS, 'power-away.png') });
  await page.click('.nudge__btn >> text=Thanks!');

  const scoreOk = await fetch(`${BASE}/api/test/audit`).then((r) => r.json());
  check('every command attempt is audited', scoreOk.length >= 15 && scoreOk.some((e) => e.outcome === 'unknown_command'), `${scoreOk.length} entries`);

  // ---- off means off
  await page.click('#powersBtn');
  await page.waitForSelector('#power-media');
  for (const key of keys) {
    const sw = page.locator(`#power-${key} .switch`);
    if (await sw.isChecked()) await sw.click();
  }
  await page.waitForFunction(() => Object.values(window.peek.glue.client.state.byKey).every((p) => !p.active && !p.state), null, { timeout: 5000 });
  const off = await page.evaluate(async () => (await window.peek.glue.client.run('media', 'play_pause')).reason);
  check('switched off → stopped, no state, commands refused', off === 'power_off', off);
  check('no page errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  check('test run completed', false, err.message);
} finally {
  await browser?.close();
  companion.kill();
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
