import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialMood, moodReduce, moodTick, currentEmotion, drowsiness, SLEEPY_AFTER_S, ASLEEP_AFTER_S } from '../../phone/js/core/mood.js';

const T0 = 1_000_000;
const day = { hour: 14 };

test('a fresh pet is calm', () => {
  assert.equal(currentEmotion(initialMood(T0), day, T0), 'neutral');
});

test('tap makes the pet happy for a moment, then it returns to calm', () => {
  const m = moodReduce(initialMood(T0), { type: 'tap' }, T0);
  assert.equal(currentEmotion(m, day, T0 + 100), 'happy');
  const later = moodTick(m, day, T0 + 5000);
  assert.equal(currentEmotion(later, day, T0 + 5000), 'neutral');
});

test('five quick taps make it dizzy, then happy', () => {
  let m = initialMood(T0);
  for (let i = 0; i < 5; i++) m = moodReduce(m, { type: 'tap' }, T0 + i * 200);
  assert.equal(currentEmotion(m, day, T0 + 1000), 'dizzy');
  m = moodTick(m, day, T0 + 4000);
  assert.equal(currentEmotion(m, day, T0 + 4000), 'happy');
});

test('reactions chain (poke-eye → wince → happy)', () => {
  let m = moodReduce(initialMood(T0), { type: 'poke-eye' }, T0);
  assert.equal(currentEmotion(m, day, T0 + 10), 'wince');
  m = moodTick(m, day, T0 + 1000);
  assert.equal(currentEmotion(m, day, T0 + 1000), 'happy');
  assert.equal(m.bubble.key, 'poke');
});

test('inactivity → sleepy → asleep, faster at night', () => {
  const m = initialMood(T0);
  assert.equal(currentEmotion(m, day, T0 + (SLEEPY_AFTER_S + 30) * 1000), 'sleepy');
  assert.equal(currentEmotion(m, day, T0 + (ASLEEP_AFTER_S + 1) * 1000), 'asleep');
  const night = { hour: 23 };
  assert.ok(drowsiness(m, night, T0 + 60_000) > drowsiness(m, day, T0 + 60_000));
});

test('a sleeping pet wakes with a startle then a smile when tapped', () => {
  let m = initialMood(T0);
  const late = T0 + (ASLEEP_AFTER_S + 10) * 1000;
  m = moodTick(m, day, late);
  assert.notEqual(m.asleepSince, null);
  m = moodReduce(m, { type: 'tap' }, late);
  assert.equal(currentEmotion(m, day, late + 10), 'surprised');
  assert.equal(m.bubble.key, 'wake');
  m = moodTick(m, day, late + 700);
  assert.equal(currentEmotion(m, day, late + 700), 'happy');
});

test('cursor movement wakes the pet gently', () => {
  const late = T0 + (ASLEEP_AFTER_S + 10) * 1000;
  const m = moodReduce(moodTick(initialMood(T0), day, late), { type: 'cursor' }, late);
  assert.equal(currentEmotion(m, day, late + 10), 'sleepy');
});

test('nap keeps it asleep until woken', () => {
  let m = moodReduce(initialMood(T0), { type: 'nap', on: true }, T0);
  assert.equal(currentEmotion(m, day, T0 + 10), 'asleep');
  m = moodReduce(m, { type: 'nap', on: false }, T0 + 5000);
  assert.equal(m.napping, false);
});

test('losing the PC shows a gentle waiting face for a while, never forever', () => {
  let m = moodReduce(initialMood(T0), { type: 'disconnect' }, T0);
  const ctx = { ...day, link: 'reconnecting', disconnectedAt: T0 };
  m = moodTick(m, ctx, T0 + 2000);
  assert.equal(currentEmotion(m, ctx, T0 + 2000), 'waiting');
  m = moodReduce(m, { type: 'touch' }, T0 + 70_000);
  assert.equal(currentEmotion(m, ctx, T0 + 70_000), 'neutral');
});

test('context moods: low battery worries it, cursor makes it curious', () => {
  const m = initialMood(T0);
  assert.equal(currentEmotion(m, { ...day, batteryLow: true }, T0), 'worried');
  assert.equal(currentEmotion(m, { ...day, cursorActive: true }, T0), 'curious');
  assert.equal(currentEmotion(m, { ...day, cursorActive: true, cursorFast: true }, T0), 'focused');
});

test('connect greets with joy and a bubble', () => {
  const m = moodReduce(initialMood(T0), { type: 'connect' }, T0);
  assert.equal(currentEmotion(m, day, T0 + 10), 'joy');
  assert.equal(m.bubble.key, 'connect');
});

test('reducer is pure', () => {
  const m = Object.freeze(initialMood(T0));
  const n = moodReduce(m, { type: 'tap' }, T0);
  assert.notEqual(n, m);
  assert.equal(m.reaction, null);
  assert.equal(moodReduce(m, { type: 'unknown' }, T0), m);
});
