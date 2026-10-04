import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  initialPowers, powersReduce, remaining, fmtClock, fmtDuration, parseTimer, petCues, trayItems, nudgeCard,
  availability, powerLine,
} from '../../phone/js/core/powers.js';

const list = (entries) => ({ t: 'powers', list: entries.map((e) => ({ allowed: true, on: true, active: true, commands: [], description: '', label: e.key, state: null, ...e })) });

test('reducer keeps the power list and stamps when state arrived', () => {
  let s = initialPowers();
  s = powersReduce(s, list([{ key: 'focus', state: { running: true, leftSec: 100 } }]), 1000);
  assert.equal(s.byKey.focus.state.leftSec, 100);
  assert.equal(s.at.focus, 1000);
  const before = s;
  s = powersReduce(s, { t: 'power_state', key: 'focus', state: { running: true, leftSec: 50 } }, 5000);
  assert.equal(s.byKey.focus.state.leftSec, 50);
  assert.equal(before.byKey.focus.state.leftSec, 100, 'pure: old state untouched');
  assert.equal(powersReduce(s, { t: 'power_state', key: 'nope', state: {} }, 1), s);
  assert.equal(powersReduce(s, { t: 'other' }, 1), s);
});

test('countdowns tick down locally between PC updates', () => {
  assert.equal(remaining(100, 1000, 1000), 100);
  assert.equal(remaining(100, 1000, 31_000), 70);
  assert.equal(remaining(10, 0, 60_000), 0);
  assert.equal(fmtClock(65), '1:05');
  assert.equal(fmtClock(3725), '1:02:05');
  assert.equal(fmtDuration(45), '45 s');
  assert.equal(fmtDuration(25 * 60), '25 min');
  assert.equal(fmtDuration(65 * 60), '1 h 5 min');
});

test('natural timer phrases', () => {
  assert.deepEqual(parseTimer('pizza in 12 min'), { label: 'Pizza', seconds: 720 });
  assert.deepEqual(parseTimer('tea 3'), { label: 'Tea', seconds: 180 });
  assert.deepEqual(parseTimer('1h30 laundry'), { label: 'Laundry', seconds: 5400 });
  assert.deepEqual(parseTimer('90s eggs'), { label: 'Eggs', seconds: 90 });
  assert.deepEqual(parseTimer('2 hours'), { label: 'Timer', seconds: 7200 });
  assert.deepEqual(parseTimer('call mum in 1 hr 15 minutes'), { label: 'Call mum', seconds: 4500 });
  assert.equal(parseTimer('pizza'), null);
  assert.equal(parseTimer(''), null);
  assert.equal(parseTimer('soup 0'), null);
  assert.equal(parseTimer('forever 999 hours'), null);
});

test('pet cues: props come from what the powers are doing', () => {
  let s = powersReduce(initialPowers(), list([
    { key: 'focus', state: { running: true, leftSec: 600 } },
    { key: 'media', state: { playing: true, title: 'Song' } },
    { key: 'timers', state: { timers: [{ id: 1, label: 'Pizza', leftSec: 60 }] } },
    { key: 'breaks', state: { tired: 2 } },
    { key: 'health', state: { drives: [{ name: 'C:', level: 'warn', freeGb: 12.9 }] } },
  ]), 0);
  const c = petCues(s, 0);
  assert.equal(c.hand, 'book');       // focus wins the hand slot
  assert.equal(c.head, 'headphones'); // music wins the head slot
  assert.equal(c.bop, true);
  assert.equal(c.tired, 2);
  assert.equal(c.focusing, true);
  assert.equal(c.diskLow, true);

  s = powersReduce(s, { t: 'power_state', key: 'focus', state: { running: false } }, 0);
  s = powersReduce(s, { t: 'power_state', key: 'media', state: { playing: false } }, 0);
  const d = petCues(s, 0);
  assert.equal(d.hand, 'timer');
  assert.equal(d.head, 'bandage');
  assert.equal(d.bop, false);
  assert.deepEqual(petCues(initialPowers(), 0), { hand: null, head: null, bop: false, tired: 0, focusing: false, diskLow: false, watching: false });
});

test('inactive powers never produce cues or tray items', () => {
  const s = powersReduce(initialPowers(), list([{ key: 'media', active: false, state: { playing: true } }]), 0);
  assert.equal(petCues(s, 0).head, null);
  assert.equal(trayItems(s, 0).length, 0);
});

test('tray shows countdowns, the soonest timer, watches and music', () => {
  const s = powersReduce(initialPowers(), list([
    { key: 'focus', state: { running: true, leftSec: 125, totalSec: 1500 } },
    { key: 'timers', state: { timers: [{ id: 2, label: 'Tea', leftSec: 30, totalSec: 180 }, { id: 1, label: 'Pizza', leftSec: 700, totalSec: 720 }] } },
    { key: 'watch', state: { watches: [{ id: 1, label: 'Blender', kind: 'process' }] } },
    { key: 'media', state: { playing: true, title: 'Song', artist: 'Band' } },
  ]), 0);
  const items = trayItems(s, 5000);
  const by = Object.fromEntries(items.map((i) => [i.key, i]));
  assert.equal(by.focus.text, '2:00');
  assert.ok(by.focus.progress > 0.9);
  assert.equal(by.timers.text, 'Tea 0:25');
  assert.equal(by.timers.sub, '+1 more');
  assert.match(by.watch.text, /Blender/);
  assert.match(by.media.text, /Song/);
});

test('nudge cards: break nudges can be done, snoozed or skipped', () => {
  const eyes = nudgeCard('breaks', 'nudge', { kind: 'eyes' });
  assert.match(eyes.title, /Eye break/);
  assert.deepEqual(eyes.actions.map((a) => a.ack ?? a.cmd?.name ?? a.label), ['done', 'snooze', 'skip']);
  assert.equal(eyes.seconds, 20);
  assert.ok(nudgeCard('breaks', 'nudge', { kind: 'stretch' }).body.length > 10);
  assert.equal(nudgeCard('breaks', 'tired', { level: 1 }), null);
});

test('nudge cards for health offer the PC fix buttons', () => {
  const card = nudgeCard('health', 'alert', { kind: 'disk', title: 'C: is getting full', detail: '12.9 GB free', actions: ['open_storage', 'space_hints', 'rm_rf'] });
  assert.equal(card.title, 'C: is getting full');
  const cmds = card.actions.filter((a) => a.cmd).map((a) => a.cmd.name);
  assert.deepEqual(cmds, ['open_storage', 'space_hints']); // unknown actions are dropped
});

test('nudge cards for done things and the away summary', () => {
  assert.match(nudgeCard('watch', 'done', { label: 'Blender', text: 'Blender finished.' }).title, /Blender/);
  assert.match(nudgeCard('timers', 'done', { label: 'Pizza' }).title, /Pizza/);
  const away = nudgeCard('away', 'summary', { awayMin: 23, items: ['Render finished', '2 breaks skipped'] });
  assert.match(away.body, /23 min/);
  assert.deepEqual(away.items, ['Render finished', '2 breaks skipped']);
  assert.equal(nudgeCard('away', 'summary', { awayMin: 7, items: [] }).items.length, 0);
  const focus = nudgeCard('focus', 'done', { minutes: 25 });
  assert.ok(focus.actions.some((a) => a.cmd?.power === 'timers'));
});

test('availability explains why a power is not running', () => {
  assert.equal(availability(null, false), 'needs-pc');
  assert.equal(availability({ allowed: false, on: true }, true), 'blocked');
  assert.equal(availability({ allowed: true, on: false }, true), 'off');
  assert.equal(availability({ allowed: true, on: true, active: true }, true), 'on');
  assert.equal(availability({ allowed: true, on: true, active: true }, false), 'needs-pc');
});

test('pet lines for power events are short', () => {
  for (const [k, e, d] of [['breaks', 'break_done', { minutes: 6 }], ['media', 'playing', { title: 'x' }], ['quick', 'locking', null], ['handoff', 'received', { kind: 'text' }]]) {
    const line = powerLine(k, e, d);
    assert.ok(line && line.length <= 80, `${k}.${e}: ${line}`);
  }
  assert.equal(powerLine('breaks', 'nope', null), null);
});
