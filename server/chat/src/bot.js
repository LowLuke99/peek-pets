// Peek Bot: a built-in friend (code PEE-KBT) so anyone can try chat on one device,
// including App Review. It accepts friend requests straight away and answers messages
// with a pet emote and a short canned line. It never stores what you send it.

import { randomId } from './crypto.js';

export const BOT_ID = '0000000000000000000000000000b075';
export const BOT_CODE = 'PEEKBT';
export const BOT = Object.freeze({ id: BOT_ID, name: 'Peek Bot', pet: 'pip', code: BOT_CODE });

const LINES = [
  [/\b(hi|hey|hello|yo|sup)\b/i, 'Hi! I\'m Peek Bot 🤖 Try sending me a hug or a dance!', 'wave'],
  [/\b(how are you|how r u|hru)\b/i, 'Beep boop, I\'m great! Your pet looks happy today.', 'cheer'],
  [/\b(game|play|score)\b/i, 'Games are in the Play menu. Challenge your friends to beat your best!', 'cheer'],
  [/\b(love|ily|cute)\b/i, 'Aww 💖', 'love'],
];
const EMOTE_REPLY = { wave: 'wave', hug: 'hug', dance: 'dance', cheer: 'cheer', snack: 'love', love: 'love' };

/** What Peek Bot says back to a message: { text, emote }. */
export function botReply(msg) {
  if (msg.challenge) return { text: `${msg.challenge.score}? Wow! I can't play games yet, but you're awesome. 🏆`, emote: 'cheer' };
  if (msg.emote) return { text: msg.emote === 'snack' ? 'Nom nom! Thank you!' : 'Right back at you!', emote: EMOTE_REPLY[msg.emote] ?? 'wave' };
  for (const [re, text, emote] of LINES) if (re.test(msg.text ?? '')) return { text, emote };
  return { text: 'I\'m just a little bot, but I like chatting! Add your real friends with their codes too.', emote: 'wave' };
}

export function botMessage(to, reply) {
  return { id: randomId().slice(0, 16), from: BOT_ID, to, text: reply.text, emote: reply.emote, challenge: null, at: Date.now() };
}
