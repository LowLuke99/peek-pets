// Friends screens (all inside the bottom sheet): set-up, the friends list (your code,
// add a friend, requests), a chat with emotes and challenges, leaderboards, and
// account settings. Pure view builders: FriendsGlue passes data and callbacks.
// Everything from other people goes through textContent (h()), never HTML.

import { h, segmented } from './dom.js';
import { EMOTES, MAX_TEXT, MAX_NAME, normalizeCode } from '../core/chatRules.js';
import { GAMES } from '../games/host.js';

export const PET_EMOJI = { mochi: '🍡', pip: '🤖', nimbus: '💧', plum: '🪐', sprig: '🌱', ember: '🔥', puff: '☁️', bun: '🐰', inky: '🐙', pebble: '🪨', lumi: '🦋', opal: '🐉' };
const petIcon = (pet) => h('span', { class: 'fr__pet', text: PET_EMOJI[pet] ?? '🐾', 'aria-hidden': 'true' });
const ERRORS = {
  offline: "Can't reach the Friends server. Check your internet and try again.",
  unknown_code: 'No one has that code. Check the letters?',
  thats_you: "That's your own code!",
  bad_name: 'Pick a friendly name (2-20 letters).',
  slow_down: 'Whoa, slow down a little!',
  blocked: "You can't add that person.",
  not_friends: "You're not friends any more.",
  too_many_signups: 'Too many new accounts from this network today. Try tomorrow.',
};
export const errorText = (e) => ERRORS[e?.code] ?? 'Something went wrong. Try again in a moment.';

/** Friends isn't connected to a server yet (developer setup). */
export function notConfiguredView({ serverUrl, onServer }) {
  const input = h('input', { class: 'text-input', type: 'url', placeholder: 'https://peekpets-chat.…workers.dev', value: serverUrl ?? '', 'aria-label': 'Friends server address' });
  return h('div', {},
    h('p', { class: 'lead', text: 'Friends lets you chat, send pet emotes, challenge friends and climb the leaderboards.' }),
    h('p', { class: 'lead lead--small', text: "The Friends server isn't set up yet (see server/chat/README.md). For testing you can enter a server address:" }),
    input,
    h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', text: 'Use this server', onclick: () => onServer(input.value.trim()) })),
  );
}

export function signUpView({ petName, termsUrl, onJoin, error }) {
  const name = h('input', { class: 'text-input', maxlength: String(MAX_NAME), placeholder: 'Your nickname', autocomplete: 'nickname', 'aria-label': 'Nickname' });
  const agree = h('input', { type: 'checkbox', class: 'switch', 'aria-label': 'I agree to be kind' });
  const err = h('p', { class: 'error', role: 'alert', text: error ?? '' });
  return h('div', {},
    h('p', { class: 'lead', text: `Add friends with a 6-letter code, chat, send them ${petName}'s hugs and dances, and beat each other's high scores.` }),
    h('p', { class: 'lead lead--small', text: 'No email or phone number: just a nickname. Only people you add can message you.' }),
    name,
    h('label', { class: 'agree' }, agree, h('span', {}, 'I\'ll be kind. I can block and report anyone. ', h('a', { href: termsUrl, target: '_blank', rel: 'noopener', text: 'Rules' }))),
    err,
    h('div', { class: 'btn-row' }, h('button', {
      class: 'btn', type: 'button', text: 'Start', 'data-fr': 'join',
      onclick: () => {
        if (!agree.checked) { err.textContent = 'Please agree to be kind first.'; return; }
        onJoin(name.value);
      },
    })),
  );
}

/** Your code, add-a-friend, requests and the friends list. */
export function listView({ data, onAdd, onAccept, onDecline, onOpen, onBoards, onSettings, onShare, error, info }) {
  const code = h('input', { class: 'code-input', maxlength: '7', placeholder: 'ABC-234', autocapitalize: 'characters', spellcheck: 'false', 'aria-label': "Friend's code",
    oninput: (e) => { const c = normalizeCode(e.target.value); e.target.value = c.length > 3 ? `${c.slice(0, 3)}-${c.slice(3)}` : c; },
    onkeydown: (e) => { if (e.key === 'Enter') onAdd(code.value); } });
  const mine = data.me.code;
  return h('div', {},
    h('div', { class: 'fr__mycode' },
      h('small', { text: 'Your friend code' }),
      h('b', { text: `${mine.slice(0, 3)}-${mine.slice(3)}`, 'data-fr': 'mycode' }),
      h('button', { class: 'btn btn--small btn--ghost', type: 'button', text: 'Share', onclick: onShare }),
    ),
    h('div', { class: 'fr__add' }, code, h('button', { class: 'btn btn--small', type: 'button', text: 'Add', 'data-fr': 'add', onclick: () => onAdd(code.value) })),
    error ? h('p', { class: 'error', role: 'alert', text: error }) : null,
    info ? h('p', { class: 'lead lead--small', role: 'status', text: info }) : null,
    data.incoming.length ? h('p', { class: 'group__title', text: 'Friend requests' }) : null,
    ...data.incoming.map((r) => h('div', { class: 'fr__row' }, petIcon(r.pet), h('b', { class: 'fr__name', text: r.name }),
      h('button', { class: 'btn btn--small', type: 'button', text: 'Accept', 'data-fr': 'accept', onclick: () => onAccept(r.id) }),
      h('button', { class: 'btn btn--small btn--ghost', type: 'button', text: 'No', onclick: () => onDecline(r.id) }))),
    h('div', { class: 'fr__head' },
      h('p', { class: 'group__title', text: `Friends${data.friends.length ? ` (${data.friends.length})` : ''}` }),
      h('button', { class: 'btn btn--small btn--ghost', type: 'button', text: '🏆 Leaderboards', 'data-fr': 'boards', onclick: onBoards }),
      h('button', { class: 'icon-btn icon-btn--small', type: 'button', 'aria-label': 'Friends settings', text: '⋯', onclick: onSettings }),
    ),
    data.friends.length === 0
      ? h('p', { class: 'lead lead--small', text: data.outgoing.length ? `Waiting for ${data.outgoing.map((o) => o.name).join(', ')} to accept.` : 'No friends yet. Share your code, or add theirs above!' })
      : null,
    ...data.friends.map((f) => h('button', { class: 'fr__row fr__row--btn', type: 'button', 'data-fr-friend': f.id, onclick: () => onOpen(f) },
      petIcon(f.pet),
      h('span', { class: 'fr__who' }, h('b', { class: 'fr__name', text: f.name }), h('small', { text: preview(f.last) })),
      f.unread ? h('i', { class: 'fr__badge', text: String(f.unread) }) : null)),
  );
}

function preview(m) {
  if (!m) return 'Say hi!';
  if (m.challenge) return `🏆 Challenge: ${gameName(m.challenge.game)} ${m.challenge.score}`;
  if (m.emote) return `${EMOTES.find((e) => e.id === m.emote)?.emoji ?? ''} ${m.text || EMOTES.find((e) => e.id === m.emote)?.label}`.trim();
  return m.text;
}

const gameName = (id) => GAMES.find((g) => g.id === id)?.name ?? id;

/** One conversation: messages, emote row, challenge button, text box. */
export function chatView({ friend, meId, messages, best, draft, onDraft, onBack, onSend, onEmote, onChallenge, onPlay, onReport, onBlock }) {
  const list = h('div', { class: 'chat', role: 'log', 'aria-live': 'polite' },
    ...messages.map((m) => bubble(m, m.from === meId, onPlay)));
  // The draft lives outside the view so a re-render (new message arriving) never eats what you're typing.
  const input = h('input', { class: 'text-input chat__input', maxlength: String(MAX_TEXT), placeholder: `Message ${friend.name}`, 'aria-label': 'Message', value: draft ?? '',
    oninput: () => onDraft(input.value),
    onkeydown: (e) => { if (e.key === 'Enter' && input.value.trim()) { onSend(input.value); input.value = ''; onDraft(''); } } });
  const games = GAMES.filter((g) => best[g.id] != null);
  const el = h('div', { class: 'chatview' },
    h('div', { class: 'chat__top' },
      h('button', { class: 'btn btn--small btn--ghost', type: 'button', text: '‹ Friends', onclick: onBack }),
      h('b', { class: 'chat__title' }, petIcon(friend.pet), ` ${friend.name}`),
      h('button', { class: 'btn btn--small btn--ghost', type: 'button', text: 'Report', 'data-fr': 'report', onclick: onReport }),
      h('button', { class: 'btn btn--small btn--ghost', type: 'button', text: 'Block', 'data-fr': 'block', onclick: onBlock }),
    ),
    list,
    h('div', { class: 'chat__emotes', role: 'group', 'aria-label': 'Send a pet emote' },
      ...EMOTES.map((e) => h('button', { class: 'chat__emote', type: 'button', 'data-emote': e.id, 'aria-label': `Send a ${e.label}`, onclick: () => onEmote(e.id) },
        h('span', { text: e.emoji, 'aria-hidden': 'true' })))),
    games.length ? h('div', { class: 'chat__challenge' }, h('small', { text: 'Challenge:' }),
      ...games.map((g) => h('button', { class: 'btn btn--small btn--ghost', type: 'button', 'data-challenge': g.id, text: `${g.emoji} ${best[g.id]}`, onclick: () => onChallenge(g.id, best[g.id]) })))
      : h('p', { class: 'lead lead--small', text: 'Play a game to challenge your friend with your best score!' }),
    h('div', { class: 'chat__send' }, input, h('button', { class: 'btn btn--small', type: 'button', text: 'Send', 'data-fr': 'send',
      onclick: () => { if (input.value.trim()) { onSend(input.value); input.value = ''; onDraft(''); } } })),
  );
  requestAnimationFrame(() => {
    list.scrollTop = list.scrollHeight;
    if (draft) { input.focus(); input.setSelectionRange(draft.length, draft.length); }
  });
  return el;
}

function bubble(m, mine, onPlay) {
  const emote = m.emote ? EMOTES.find((e) => e.id === m.emote) : null;
  const parts = [];
  if (emote) parts.push(h('span', { class: 'chat__big', text: emote.emoji }), h('small', { text: mine ? `You sent a ${emote.label.toLowerCase()}` : `sent a ${emote.label.toLowerCase()}` }));
  if (m.challenge) {
    parts.push(h('span', { class: 'chat__big', text: '🏆' }), h('b', { text: `${gameName(m.challenge.game)}: ${m.challenge.score}` }));
    if (!mine) parts.push(h('button', { class: 'btn btn--small', type: 'button', text: 'Beat it!', 'data-beat': m.id, onclick: () => onPlay(m) }));
  }
  if (m.text) parts.push(h('span', { class: 'chat__text', text: m.text }));
  return h('div', { class: `chat__msg${mine ? ' chat__msg--mine' : ''}` }, ...parts);
}

/** Leaderboards: one game at a time, friends or everyone. */
export function boardsView({ game, scope, board, loading, error, onGame, onScope, onBack }) {
  return h('div', {},
    h('div', { class: 'chat__top' }, h('button', { class: 'btn btn--small btn--ghost', type: 'button', text: '‹ Friends', onclick: onBack })),
    segmented(GAMES.map((g) => [g.id, `${g.emoji} ${g.short}`]), game, onGame, 'Game'),
    h('div', { style: 'height:8px' }),
    segmented([['friends', 'Friends'], ['world', 'Everyone']], scope, onScope, 'Leaderboard'),
    loading ? h('p', { class: 'lead', text: 'Loading…' }) : null,
    error ? h('p', { class: 'error', role: 'alert', text: error }) : null,
    !loading && !error && board.length === 0 ? h('p', { class: 'lead', text: 'No scores yet. Play a round!' }) : null,
    h('ol', { class: 'board' }, ...board.map((r) => h('li', { class: `board__row${r.me ? ' board__row--me' : ''}` },
      h('span', { class: 'board__rank', text: r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : `#${r.rank}` }),
      petIcon(r.pet), h('b', { class: 'fr__name', text: r.me ? `${r.name} (you)` : r.name }), h('span', { class: 'board__score', text: String(r.score) })))),
  );
}

export function settingsView({ me, serverUrl, privacyUrl, onBack, onDelete, onServer }) {
  const server = h('input', { class: 'text-input', type: 'url', value: serverUrl ?? '', 'aria-label': 'Friends server address' });
  return h('div', {},
    h('div', { class: 'chat__top' }, h('button', { class: 'btn btn--small btn--ghost', type: 'button', text: '‹ Friends', onclick: onBack })),
    h('p', { class: 'lead', text: `Signed in as ${me.name}.` }),
    h('p', { class: 'lead lead--small' }, 'Messages are kept for 30 days. ', h('a', { href: privacyUrl, target: '_blank', rel: 'noopener', text: 'Privacy policy' })),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn btn--danger', type: 'button', text: 'Delete my chat account', 'data-fr': 'delete', onclick: onDelete })),
    h('p', { class: 'group__title', text: 'Advanced' }),
    server,
    h('div', { class: 'btn-row' }, h('button', { class: 'btn btn--ghost', type: 'button', text: 'Change server', onclick: () => onServer(server.value.trim()) })),
  );
}
