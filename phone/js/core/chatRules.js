// Friends & chat rules, shared by the phone app and the chat server (server/chat
// bundles this file), so both sides validate the same way. The server is the
// authority; the phone uses these to give instant feedback.

export const MAX_TEXT = 280;
export const MAX_NAME = 20;
export const CODE_LENGTH = 6;
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I

/** Pet emotes: your friend's pet performs them. */
export const EMOTES = Object.freeze([
  { id: 'wave', emoji: '👋', label: 'Wave' },
  { id: 'hug', emoji: '🤗', label: 'Hug' },
  { id: 'dance', emoji: '💃', label: 'Dance' },
  { id: 'cheer', emoji: '🎉', label: 'Cheer' },
  { id: 'snack', emoji: '🍪', label: 'Snack' },
  { id: 'love', emoji: '💖', label: 'Love' },
].map((e) => Object.freeze(e)));

// Control, zero-width, and bidi-override characters (they can hide or flip text).
const INVISIBLE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F​-‏‪-‮⁠-⁩﻿]/g;

export function cleanText(s, max = MAX_TEXT) {
  if (typeof s !== 'string') return '';
  return Array.from(s.replace(INVISIBLE, '').replace(/\s+/g, ' ').trim()).slice(0, max).join('');
}

/** A display name, or null if it's too short or rude. */
export function cleanName(s) {
  const name = cleanText(s, MAX_NAME);
  if (Array.from(name).length < 2) return null;
  return maskProfanity(name) === name ? name : null;
}

// A short list of words that get masked. Matched on whole words after undoing common
// letter swaps (sh1t, f@ck), and across single-letter spacing ("f u c k").
const ROOTS = ['fuck', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'bastard', 'asshole', 'slut', 'whore', 'fag', 'faggot', 'nigger', 'nigga', 'retard', 'wanker', 'twat', 'prick', 'cock', 'motherfucker', 'shithead', 'dickhead', 'bollocks', 'kys'];
const LEET = { '@': 'a', '4': 'a', '3': 'e', '1': 'i', '!': 'i', '0': 'o', '$': 's', '5': 's', '7': 't', '+': 't' };
const norm = (w) => w.toLowerCase().replace(/[@4310!$57+]/g, (c) => LEET[c]);
const BAD = new RegExp(`^(${ROOTS.join('|')})(s|es|ed|ing|er|ers|y)?$`);

export function maskProfanity(s) {
  if (typeof s !== 'string' || !s) return '';
  let out = s.replace(/[\p{L}\p{N}@$!+]+/gu, (w) => (BAD.test(norm(w)) ? '★'.repeat(Array.from(w).length) : w));
  // Spaced-out letters: "f u c k" → mask the letters, keep the spaces.
  out = out.replace(/\b(?:[\p{L}@$0-9!] ){2,}[\p{L}@$0-9!]\b/gu, (run) => (BAD.test(norm(run.replace(/ /g, ''))) ? run.replace(/[^ ]/g, '★') : run));
  return out;
}

export function normalizeCode(s) {
  return String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}

export function isFriendCode(s) {
  return typeof s === 'string' && s.length === CODE_LENGTH && [...s].every((c) => CODE_ALPHABET.includes(c));
}

/** @param {(n: number) => Uint8Array} randomBytes */
export function makeCode(randomBytes) {
  const bytes = randomBytes(CODE_LENGTH);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

/** { text, emote } cleaned, or null if there's nothing valid to send. */
export function validMessage(m) {
  if (!m || typeof m !== 'object') return null;
  const text = maskProfanity(cleanText(m.text ?? ''));
  const emote = m.emote == null ? null : EMOTES.some((e) => e.id === m.emote) ? m.emote : undefined;
  if (emote === undefined) return null;
  if (!text && !emote) return null;
  return { text, emote };
}
