import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EMOTES, MAX_TEXT, cleanText, cleanName, maskProfanity, normalizeCode, isFriendCode, makeCode, validMessage, CODE_ALPHABET,
} from '../../phone/js/core/chatRules.js';

test('text is cleaned: control/bidi characters gone, whitespace tidied, length capped', () => {
  assert.equal(cleanText('  hi\u0007 there‮!  \n\n\n you '), 'hi there! you');
  assert.equal(cleanText('a'.repeat(400)).length, MAX_TEXT);
  assert.equal(cleanText(42), '');
  assert.equal(cleanText('🐙 blub'), '🐙 blub', 'emoji survive');
});

test('names: 2-20 visible characters, no rude words', () => {
  assert.equal(cleanName('  Luke  '), 'Luke');
  assert.equal(cleanName('L'), null);
  assert.equal(cleanName('x'.repeat(30)).length, 20);
  assert.equal(cleanName('shithead'), null);
  assert.equal(cleanName('​​'), null);
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
  assert.deepEqual(validMessage({ text: ' hi ' }), { text: 'hi', emote: null });
  assert.deepEqual(validMessage({ emote: 'hug' }), { text: '', emote: 'hug' });
  assert.equal(validMessage({ emote: 'explode' }), null);
  assert.equal(validMessage({ text: '   ' }), null);
  assert.equal(validMessage(null), null);
  assert.ok(EMOTES.every((e) => e.id && e.emoji && e.label));
});
