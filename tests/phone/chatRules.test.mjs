import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EMOTES, MAX_TEXT, cleanText, cleanName, maskProfanity, normalizeCode, isFriendCode, makeCode, validMessage, CODE_ALPHABET, validScore, MAX_SCORE,
} from '../../phone/js/core/chatRules.js';

test('text is cleaned: control/bidi characters gone, whitespace tidied, length capped', () => {
  assert.equal(cleanText('  hi\u0007 there\u202E!  \n\n\n you '), 'hi there! you');
  assert.equal(cleanText('a'.repeat(400)).length, MAX_TEXT);
  assert.equal(cleanText(42), '');
  assert.equal(cleanText('🐙 blub'), '🐙 blub', 'emoji survive');
});

test('names: 2-20 visible characters, no rude words', () => {
  assert.equal(cleanName('  Luke  '), 'Luke');
  assert.equal(cleanName('L'), null);
  assert.equal(cleanName('x'.repeat(30)).length, 20);
  assert.equal(cleanName('shithead'), null);
  assert.equal(cleanName('\u200B\u200B'), null);
});

test('profanity is masked (also with l33t spellings), innocent words are left alone', () => {
  assert.equal(maskProfanity('what the fuck'), 'what the ★★★★');
  assert.equal(maskProfanity('sh1t happens'), '★★★★ happens');
  assert.equal(maskProfanity('F U C K'), 'F U C K'.replace(/[A-Z]/g, '★'));
  assert.equal(maskProfanity('class assignment in Scunthorpe'), 'class assignment in Scunthorpe');
  assert.equal(maskProfanity('hello friend'), 'hello friend');
});

test('friend codes: 6 unambiguous characters, typed loosely', () => {
  assert.equal(normalizeCode(' ab-c 2x9 '), 'ABC2X9');
  assert.ok(isFriendCode('ABC2X9'));
  assert.ok(!isFriendCode('ABC0X9'), 'no 0/O/1/I confusion');
  assert.ok(!isFriendCode('ABC2X'));
  const code = makeCode((n) => Uint8Array.from({ length: n }, (_, i) => i * 37));
  assert.ok(isFriendCode(code), code);
  assert.ok([...code].every((c) => CODE_ALPHABET.includes(c)));
});

test('a message is text or a known pet emote (or both), never empty', () => {
  assert.deepEqual(validMessage({ text: ' hi ' }), { text: 'hi', emote: null, challenge: null });
  assert.deepEqual(validMessage({ emote: 'hug' }), { text: '', emote: 'hug', challenge: null });
  assert.equal(validMessage({ emote: 'explode' }), null);
  assert.equal(validMessage({ text: '   ' }), null);
  assert.equal(validMessage(null), null);
  assert.ok(EMOTES.every((e) => e.id && e.emoji && e.label));
});

test('challenges and scores: known games, whole numbers, plausible maximums', () => {
  assert.deepEqual(validMessage({ challenge: { game: 'catch', score: 23 } }).challenge, { game: 'catch', score: 23 });
  assert.equal(validMessage({ challenge: { game: 'catch', score: 99999 } }), null);
  assert.equal(validMessage({ challenge: { game: 'chess', score: 3 } }), null);
  assert.equal(validMessage({ text: 'hi', challenge: { game: 'pop', score: 2.5 } }), null);
  assert.ok(validScore('cups', MAX_SCORE.cups) && !validScore('cups', MAX_SCORE.cups + 1) && !validScore('pop', -1));
});
