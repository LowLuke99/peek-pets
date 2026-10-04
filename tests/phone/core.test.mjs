import { test } from 'node:test';
import assert from 'node:assert/strict';

import { spring, stepSpring, approach, clamp } from '../../phone/js/core/spring.js';
import { cursorToGaze, pointToGaze, softDisc, predict } from '../../phone/js/core/gaze.js';
import { parseServerMessage, msg, normalizeCode, pairCodeFromHash } from '../../phone/js/core/protocol.js';
import { reconnectDelay, STEADY_MS, SLEEPY_MS, SLEEPY_AFTER_MS } from '../../phone/js/core/backoff.js';
import { addHearts, levelFor } from '../../phone/js/core/bond.js';
import { CursorTracker, DemoCursor } from '../../phone/js/core/cursor.js';
import { NEUTRAL, EXPRESSIONS, blendExpression, expressionFor } from '../../phone/js/core/expressions.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

// ---- springs -----------------------------------------------------------------
test('critically damped spring converges without overshoot', () => {
  let s = spring(0, 0);
  let max = 0;
  for (let i = 0; i < 120; i++) {
    s = stepSpring(s, 1, 42, 1, 1 / 60);
    max = Math.max(max, s.x);
  }
  near(s.x, 1, 1e-4);
  assert.ok(max <= 1 + 1e-9, 'no overshoot');
});

test('gaze spring reaches 90% of a jump within ~100 ms', () => {
  let s = spring(0, 0);
  for (let i = 0; i < 6; i++) s = stepSpring(s, 1, 44, 1, 1 / 60);
  assert.ok(s.x > 0.9, `x=${s.x}`);
});

test('underdamped spring overshoots (follow-through)', () => {
  let s = spring(0, 0);
  let max = 0;
  for (let i = 0; i < 120; i++) { s = stepSpring(s, 1, 8.5, 0.58, 1 / 60); max = Math.max(max, s.x); }
  assert.ok(max > 1.05);
  near(s.x, 1, 0.01);
});

test('spring is stable for huge dt (frame hitch)', () => {
  const s = stepSpring(spring(0, 0), 1, 44, 1, 0.5);
  assert.ok(Number.isFinite(s.x) && Math.abs(s.x - 1) < 0.01);
  const u = stepSpring(spring(0, 0), 1, 21, 0.24, 0.5);
  assert.ok(Number.isFinite(u.x) && Math.abs(u.x) < 2);
});

test('spring step is pure', () => {
  const s = Object.freeze({ x: 0, v: 0 });
  const n = stepSpring(s, 1, 10, 1, 0.016);
  assert.notEqual(n, s);
  assert.equal(s.x, 0);
});

test('approach and clamp', () => {
  near(approach(0, 10, 1000, 1), 10, 1e-6);
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(clamp(-5, 0, 1), 0);
});

// ---- gaze mapping --------------------------------------------------------------
test('mirror mode: screen center looks straight ahead', () => {
  const g = cursorToGaze({ x: 0.5, y: 0.5 });
  near(g.x, 0); near(g.y, 0);
});

test('mirror mode: corners map to matching directions inside the unit disc', () => {
  const tl = cursorToGaze({ x: 0, y: 0 });
  const br = cursorToGaze({ x: 1, y: 1 });
  assert.ok(tl.x < -0.5 && tl.y < -0.4);
  assert.ok(br.x > 0.5 && br.y > 0.4);
  for (const g of [tl, br]) assert.ok(Math.hypot(g.x, g.y) <= 1 + 1e-9);
});

test('current-screen mode uses per-monitor coordinates', () => {
  const g = cursorToGaze({ x: 0.9, y: 0.5, mx: 0.5, my: 0.5 }, { screens: 'current' });
  near(g.x, 0);
  const all = cursorToGaze({ x: 0.9, y: 0.5, mx: 0.5, my: 0.5 }, { screens: 'all' });
  assert.ok(all.x > 0.5);
});

test('physical mode: phone on the right always looks left toward the monitor', () => {
  for (const x of [0, 0.5, 1]) {
    const g = cursorToGaze({ x, y: 0.5 }, { mode: 'right' });
    assert.ok(g.x < 0, `x=${x} → ${g.x}`);
  }
  const below = cursorToGaze({ x: 0.5, y: 0.5 }, { mode: 'below' });
  assert.ok(below.y < -0.5);
});

test('softDisc keeps small vectors, compresses large ones under 1', () => {
  assert.deepEqual(softDisc(0.3, 0.2), { x: 0.3, y: 0.2 });
  const big = softDisc(3, 0);
  assert.ok(big.x < 1 && big.x > 0.9);
});

test('pointToGaze points from face to finger', () => {
  const g = pointToGaze(300, 100, 100, 100, 100);
  assert.ok(g.x > 0.9 && Math.abs(g.y) < 1e-9);
  assert.deepEqual(pointToGaze(5, 5, 5, 5, 100), { x: 0, y: 0 });
});

test('prediction extrapolates, is capped and clamped', () => {
  const p = predict({ x: 0.5, y: 0.5, mx: 0.5, my: 0.5 }, { x: 1, y: 0, mx: 1, my: 0 }, 1000);
  near(p.x, 0.54); // capped to 40 ms
  const edge = predict({ x: 0.99, y: 0.5 }, { x: 10, y: 0 }, 40);
  assert.equal(edge.x, 1);
});

// ---- protocol -----------------------------------------------------------------------
test('valid cursor message parses', () => {
  const m = parseServerMessage('{"t":"c","x":0.25,"y":0.75,"m":1,"mx":0.5,"my":0.5,"s":10,"ts":123.4}');
  assert.deepEqual(m, { t: 'c', x: 0.25, y: 0.75, m: 1, mx: 0.5, my: 0.5, s: 10, ts: 123.4 });
});

test('malformed or out-of-range messages are rejected', () => {
  for (const bad of ['nope', '{}', '{"t":"c","x":2,"y":0,"s":1,"ts":1}', '{"t":"c","x":"a","y":0,"s":1,"ts":1}', 'null', '[]']) {
    assert.equal(parseServerMessage(bad), null, bad);
  }
});

test('unknown message types are ignored for forward compatibility', () => {
  assert.equal(parseServerMessage('{"t":"future_feature","x":1}'), null);
});

test('say messages are trimmed and length-capped', () => {
  const m = parseServerMessage(JSON.stringify({ t: 'say', text: `  ${'a'.repeat(150)}  ` }));
  assert.equal(m.text.length, 80);
  assert.equal(parseServerMessage('{"t":"say","text":"   "}'), null);
});

test('auth_ok keeps only safe fields', () => {
  const m = parseServerMessage(JSON.stringify({ t: 'auth_ok', token: 'abc', pc: 'LUKE-PC', shared: { cursor: true }, facts: {}, evil: 1 }));
  assert.equal(m.pc, 'LUKE-PC');
  assert.equal(m.token, 'abc');
  assert.equal('evil' in m, false);
});

test('auth message carries token or code, never both', () => {
  assert.deepEqual(msg.auth({ token: 't', code: 'C', deviceName: 'iPhone' }), { t: 'auth', v: 1, token: 't', device: { name: 'iPhone' } });
  assert.equal(msg.auth({ code: 'ABC234', deviceName: 'x' }).code, 'ABC234');
});

test('pairing codes normalize and come from the URL fragment', () => {
  assert.equal(normalizeCode(' abc-234 '), 'ABC234');
  assert.equal(pairCodeFromHash('#pair=k7p-4qx'), 'K7P4QX');
  assert.equal(pairCodeFromHash('#other=1&pair=TEST42'), 'TEST42');
  assert.equal(pairCodeFromHash('#nothing'), null);
});

// ---- backoff ------------------------------------------------------------------------------
test('reconnect delay ramps up, then settles, then goes sleepy', () => {
  const mid = () => 0.5;
  assert.ok(reconnectDelay(0, 0, mid) < 1000);
  assert.ok(reconnectDelay(1, 0, mid) > reconnectDelay(0, 0, mid));
  assert.equal(reconnectDelay(20, 1000, mid), STEADY_MS);
  assert.equal(reconnectDelay(20, SLEEPY_AFTER_MS + 1, mid), SLEEPY_MS);
});

test('reconnect jitter stays within ±15%', () => {
  assert.ok(reconnectDelay(9, 0, () => 0) >= STEADY_MS * 0.85);
  assert.ok(reconnectDelay(9, 0, () => 1) <= STEADY_MS * 1.15);
});

// ---- bond ------------------------------------------------------------------------------------
test('bond levels up and never goes negative', () => {
  assert.equal(levelFor(0).level, 1);
  const r = addHearts({ hearts: 19 }, 2);
  assert.equal(r.level, 2);
  assert.equal(r.leveledUp, true);
  assert.equal(addHearts({ hearts: 0 }, -5).hearts, 0);
  const p = levelFor(10).progress;
  assert.ok(p > 0 && p < 1);
});

// ---- cursor tracker ------------------------------------------------------------------------------
test('fast flick triggers a burst, circling triggers a spin', () => {
  const t = new CursorTracker();
  t.push({ x: 0.1, y: 0.5, mx: 0.1, my: 0.5 }, 0);
  const ev = t.push({ x: 0.3, y: 0.5, mx: 0.3, my: 0.5 }, 16);
  assert.ok(ev.includes('burst'));

  const s = new CursorTracker();
  let found = false;
  for (let i = 0; i < 400 && !found; i++) {
    const a = i * 0.12;
    found = s.push({ x: 0.5 + Math.cos(a) * 0.1, y: 0.5 + Math.sin(a) * 0.1, mx: 0, my: 0 }, i * 16, 1).includes('spin');
  }
  assert.ok(found, 'spin detected');
});

test('cursor attention lapses after the hold time', () => {
  const t = new CursorTracker();
  t.push({ x: 0.5, y: 0.5, mx: 0.5, my: 0.5 }, 1000);
  assert.ok(t.current(2000));
  assert.equal(t.current(10_000), null);
  assert.equal(t.isActive(10_000), false);
});

test('demo cursor stays on screen', () => {
  const d = new DemoCursor(() => 0.42);
  for (let i = 0; i < 600; i++) {
    const c = d.step(1 / 60);
    assert.ok(c.x >= 0 && c.x <= 1 && c.y >= 0 && c.y <= 1);
  }
});

// ---- expressions ----------------------------------------------------------------------------------
test('every expression defines every channel', () => {
  for (const [name, e] of Object.entries(EXPRESSIONS)) {
    for (const key of Object.keys(NEUTRAL)) assert.ok(Number.isFinite(e[key]), `${name}.${key}`);
  }
  assert.equal(expressionFor('nope'), NEUTRAL);
});

test('expression blending moves toward target and is pure', () => {
  const from = { ...NEUTRAL };
  const to = EXPRESSIONS.joy;
  const next = blendExpression(from, to, 0.1);
  assert.ok(next.happy > 0 && next.happy < 1);
  assert.equal(from.happy, 0);
  const done = blendExpression(from, to, 10);
  near(done.happy, 1, 1e-6);
});

test('native app understands pasted links, addresses and codes (LAN only)', async () => {
  const { parsePairTarget } = await import('../../phone/js/core/protocol.js');
  assert.deepEqual(parsePairTarget('http://10.0.0.206:8787/#pair=ABC234'), { host: '10.0.0.206:8787', code: 'ABC234' });
  assert.deepEqual(parsePairTarget('192.168.1.20'), { host: '192.168.1.20:8787', code: null });
  assert.deepEqual(parsePairTarget('luke-pc.local:9000'), { host: 'luke-pc.local:9000', code: null });
  assert.deepEqual(parsePairTarget('abc-234'), { host: null, code: 'ABC234' });
  assert.equal(parsePairTarget('https://evil.example/#pair=ABC234').host, null);
  assert.equal(parsePairTarget('8.8.8.8').host, null);
  assert.equal(parsePairTarget('10.0.0.999').host, null);
  assert.equal(parsePairTarget('').host, null);
});
