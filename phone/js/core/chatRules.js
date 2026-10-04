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

/** Games with leaderboards, and the highest score that's plausible in one round (anti-cheat). */
export const GAME_IDS = Object.freeze(['catch', 'cups', 'pop']);
export const MAX_SCORE = Object.freeze({ catch: 400, cups: 60, pop: 500 });

export function validScore(game, score) {
  return GAME_IDS.includes(game) && Number.isInteger(score) && score >= 0 && score <= MAX_SCORE[game];
}

// Control, zero-width, and bidi-override characters (they can hide or flip text).
const INVISIBLE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;

export function cleanText(s, max = MAX_TEXT) {
  if (typeof s !== 'string') return '';
  // NFKC folds full-width/fancy letters to plain ones; \p{Cf} catches soft hyphens and
  // other invisible "format" characters used to split words.
  const t = s.normalize('NFKC').replace(INVISIBLE, '').replace(/\p{Cf}/gu, '');
  return Array.from(t.replace(/\s+/g, ' ').trim()).slice(0, max).join('');
}

/** A display name, or null if it's too short, rude, or carries contact details. */
export function cleanName(s) {
  const name = cleanText(s, MAX_NAME);
  if (Array.from(name).length < 2) return null;
  return maskProfanity(name) === name && maskContact(name) === name ? name : null;
}

// Words that get masked. Each word is checked after folding look-alike letters (Cyrillic
// and Greek letters that look Latin, l33t: sh1t, a$$), dropping punctuation inside it
// (f.u.c.k), and squashing repeats (fuuuck). ROOTS match whole words (+ endings); CONTAINS
// match anywhere in a word (fuckyou) and are chosen so innocent words (Scunthorpe,
// cocktail) don't trip them.
const ROOTS = ['fuck', 'fck', 'fuk', 'fuq', 'shit', 'sht', 'bitch', 'btch', 'biatch', 'cunt', 'dick', 'pussy', 'bastard', 'ass', 'arse',
  'asshole', 'slut', 'whore', 'fag', 'faggot', 'nigger', 'nigga', 'retard', 'wanker', 'twat', 'prick', 'cock', 'motherfucker', 'shithead',
  'dickhead', 'bollocks', 'kys', 'stfu', 'wtf', 'cum', 'penis', 'vagina', 'nazi', 'porn', 'rape', 'sex', 'nude', 'nudes'];
const CONTAINS = ['fuck', 'fuk', 'nigg', 'fagg', 'whore', 'porn', 'bitch', 'motherf', 'asshole', 'dickhead', 'shithead', 'wank', 'pussy', 'penis', 'vagina'];
const LEET = { '@': 'a', '4': 'a', '3': 'e', '1': 'i', '!': 'i', '|': 'i', '0': 'o', '$': 's', '5': 's', '7': 't', '+': 't' };
// Cyrillic/Greek look-alikes by code point (written as numbers so the source stays plain ASCII).
const HOMOGLYPHS = new Map([[0x430, 'a'], [0x435, 'e'], [0x43E, 'o'], [0x440, 'p'], [0x441, 'c'], [0x443, 'y'], [0x445, 'x'],
  [0x456, 'i'], [0x455, 's'], [0x458, 'j'], [0x3B1, 'a'], [0x3BF, 'o'], [0x3C1, 'p']]);
const fold = (w) => Array.from(w.toLowerCase(), (ch) => HOMOGLYPHS.get(ch.codePointAt(0)) ?? LEET[ch] ?? ch).join('');
const BAD = new RegExp(`^(${ROOTS.join('|')})(s|es|ed|ing|er|ers|y|z)?$`);

function isBad(token) {
  const letters = fold(token).replace(/[^a-z0-9*]/g, '');
  const plain = letters.replace(/\*/g, '');
  if (!plain) return false;
  for (const v of new Set([plain, plain.replace(/(.)\1+/g, '$1')])) {
    if (BAD.test(v) || CONTAINS.some((c) => v.includes(c))) return true;
  }
  if (letters.includes('*')) { // starred words: f*ck, motherf***er
    const re = new RegExp(`^${letters.replace(/\*+/g, '[a-z]{1,4}')}(s|ed|ing|er)?$`);
    return ROOTS.some((r) => r.length >= 4 && re.test(r));
  }
  return false;
}

export function maskProfanity(s) {
  if (typeof s !== 'string' || !s) return '';
  let out = s.replace(/\S+/gu, (w) => (isBad(w) ? '★'.repeat(Array.from(w).length) : w));
  // Spaced-out letters: "f u c k" → mask the letters, keep the spaces.
  out = out.replace(/(?:^|(?<=\s))(?:\S ){2,}\S(?=\s|$)/gu, (run) => (isBad(run.replace(/ /g, '')) ? run.replace(/[^ ]/g, '★') : run));
  return out;
}

// Contact details stay out of chat: links, email addresses, phone numbers (7+ digits).
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+|\b[\w-]+\.(?:com|net|org|io|co|gg|me|tv|ly|app|xyz|info|ca|uk|us|link|site)(?:\/\S*)?\b/gi;
const PHONE_RE = /\+?\d(?:[\s().-]*\d){6,}/g;

export function maskContact(s) {
  if (typeof s !== 'string' || !s) return '';
  const stars = (m) => m.replace(/\S/g, '★');
  return s.replace(EMAIL_RE, stars).replace(URL_RE, stars).replace(PHONE_RE, stars);
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

/**
 * { text, emote, challenge } cleaned, or null if there's nothing valid to send.
 * A challenge is "beat my score": { game, score }.
 */
export function validMessage(m) {
  if (!m || typeof m !== 'object') return null;
  const text = maskContact(maskProfanity(cleanText(m.text ?? '')));
  const emote = m.emote == null ? null : EMOTES.some((e) => e.id === m.emote) ? m.emote : undefined;
  if (emote === undefined) return null;
  let challenge = null;
  if (m.challenge != null) {
    const c = m.challenge;
    if (!c || !validScore(c.game, c.score)) return null;
    challenge = { game: c.game, score: c.score };
  }
  if (!text && !emote && !challenge) return null;
  return { text, emote, challenge };
}
