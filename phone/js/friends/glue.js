// Friends: wires the chat client to the Friends sheet, the dock badge and the pet.
// Incoming pet emotes make your pet perform them; finished games post your best to the
// leaderboard; "Beat it!" on a challenge starts that game and replies with your score.

import { store } from '../store.js';
import { FriendsClient } from './client.js';
import { CHAT_URL } from './config.js';
import { EMOTES, cleanName } from '../core/chatRules.js';
import { favouriteOf } from '../core/snacks.js';
import { GAMES } from '../games/host.js';
import { haptic } from '../native.js';
import { notConfiguredView, signUpView, listView, chatView, boardsView, settingsView, errorText } from '../ui/friendsSheet.js';

const EMPTY = Object.freeze({ me: null, friends: [], incoming: [], outgoing: [] });

export class FriendsGlue {
  constructor(app) {
    this.app = app;
    this.data = EMPTY;
    this.threads = {};
    this.view = { name: 'list' };
    this.challenge = null; // { friend, game, score } while playing "Beat it!"
    this.drafts = {}; // unsent text per friend
    this.client = new FriendsClient({
      baseUrl: () => this.serverUrl,
      onEvent: (e) => this.onEvent(e),
    });
    app.games.onFinished = (game, score) => this.gameFinished(game, score);
    if (this.client.signedUp && this.client.configured) {
      this.client.connect();
      this.refresh().catch(() => {});
    }
  }

  get serverUrl() {
    return store.get('chatUrl') || CHAT_URL;
  }

  get open() {
    return this.app.ui.sheetKind === 'friends';
  }

  // ---------------------------------------------------------------- data
  async refresh() {
    if (!this.client.signedUp) return;
    this.data = await this.client.me();
    this.updateBadge();
    if (this.open && this.view.name === 'list') this.render();
  }

  updateBadge() {
    const n = this.data.friends.reduce((a, f) => a + (f.unread ?? 0), 0) + this.data.incoming.length;
    const el = document.getElementById('friendsBadge');
    if (!el) return;
    el.hidden = n === 0;
    el.textContent = n > 9 ? '9+' : String(n);
  }

  friend(id) {
    return this.data.friends.find((f) => f.id === id) ?? null;
  }

  // ---------------------------------------------------------------- live events
  onEvent(e) {
    const app = this.app;
    if (e.t === 'signed-out') { this.data = EMPTY; this.updateBadge(); if (this.open) this.go({ name: 'list' }); return; }
    if (e.t === 'message') {
      const fromMe = e.msg.from === this.data.me?.id;
      this.threads[e.friend] = [...(this.threads[e.friend] ?? []), e.msg].filter(uniqueById);
      const f = this.friend(e.friend);
      if (f) f.last = e.msg;
      const reading = this.open && this.view.name === 'chat' && this.view.friend.id === e.friend;
      if (fromMe) { if (reading) this.render(); return; }
      if (reading) { this.client.read(e.friend).catch(() => {}); this.render(); } else if (f) { f.unread = (f.unread ?? 0) + 1; }
      this.updateBadge();
      this.perform(e.msg, e.name ?? f?.name ?? 'A friend');
      if (!reading && this.open && this.view.name === 'list') this.render();
      return;
    }
    if (e.t === 'request') {
      app.ui.toast(`${e.from.name} wants to be friends!`, 2600);
      haptic('success');
    }
    if (e.t === 'request' || e.t === 'friend' || e.t === 'changed') this.refresh().catch(() => {});
  }

  /** Your pet acts out a friend's emote (or reacts to a message / challenge). */
  perform(msg, name) {
    const app = this.app;
    const top = app.headStage();
    const emote = EMOTES.find((x) => x.id === msg.emote);
    if (msg.challenge) {
      app.ui.say(`${name} challenges you: ${msg.challenge.score} in ${GAMES.find((g) => g.id === msg.challenge.game)?.name}!`, 3000);
      app.rig.perform('point');
    } else if (emote) {
      app.ui.say(`${name} sent you a ${emote.label.toLowerCase()} ${emote.emoji}`, 2800);
      switch (emote.id) {
        case 'wave': app.rig.perform('wave'); break;
        case 'hug': app.react({ type: 'hug' }); app.particles.burst('heart', top.x, top.y + 0.05, 5, { speed: 0.7, spread: 1.8 }); break;
        case 'dance': app.rig.startDance(4000, 112); app.react({ type: 'dance', ms: 4000 }); break;
        case 'cheer': app.react({ type: 'cheer' }); app.rig.hopUp(1); app.particles.burst('confetti', top.x, top.y, 20, { speed: 1.5, spread: 2.2 }); break;
        case 'snack': app.play.snacks.feed(favouriteOf(app.species.id) ?? 'cookie'); break;
        case 'love': app.react({ type: 'pet' }); app.particles.burst('heart', top.x, top.y, 9, { speed: 0.9, spread: 2.6 }); break;
        default: break;
      }
    } else {
      app.ui.say(`${name}: ${msg.text}`, 2600);
    }
    app.sfx.play('pop');
    haptic('soft');
  }

  // ---------------------------------------------------------------- games
  async gameFinished(game, score) {
    if (!this.client.signedUp) return;
    this.client.call('POST', '/v1/scores', { game, score }).catch(() => {});
    const c = this.challenge;
    if (!c || c.game !== game) return;
    this.challenge = null;
    const won = score > c.score;
    const tie = score === c.score;
    this.app.ui.say(won ? `You beat ${c.name}! 🎉` : tie ? `A tie with ${c.name}!` : `So close! ${c.name} still wins.`, 3000);
    await this.client.send(c.friend, { text: won ? `Beat you! ${score} vs ${c.score}` : tie ? `Tied you at ${score}!` : `I got ${score}. You win this time!`, challenge: { game, score } }).catch(() => {});
  }

  // ---------------------------------------------------------------- sheet
  show() {
    this.view = { name: 'list' };
    this.app.ui.openSheet('friends', 'Friends', this.build());
    if (this.client.signedUp) this.refresh().catch((e) => { this.view = { name: 'list', error: errorText(e) }; this.render(); });
  }

  go(view) {
    this.view = view;
    this.render();
  }

  render() {
    if (this.open) this.app.ui.replaceSheetBody(this.build());
  }

  build() {
    const app = this.app;
    const c = this.client;
    const developer = Boolean(app.settings.debug); // Settings → Show link stats
    if (!c.configured) return notConfiguredView({ serverUrl: store.get('chatUrl'), developer, onServer: (url) => this.setServer(url) });
    if (!c.signedUp) {
      return signUpView({
        petName: app.species.name, termsUrl: `${c.url}/terms`, error: this.view.error,
        onJoin: (name) => this.join(name),
      });
    }
    if (!this.data.me) {
      const noop = () => {};
      return listView({ data: { ...EMPTY, me: { code: c.account.code } }, onAdd: noop, onAccept: noop, onDecline: noop, onBlockRequest: noop, onOpen: noop, onBoards: noop, onSettings: noop, onShare: () => this.share(), info: 'Loading…' });
    }
    switch (this.view.name) {
      case 'chat': return this.chat();
      case 'boards': return this.boards();
      case 'settings': return settingsView({
        me: this.data.me, serverUrl: store.get('chatUrl') ?? '', privacyUrl: `${c.url}/privacy`, supportUrl: `${c.url}/support`, developer,
        onBack: () => this.go({ name: 'list' }),
        onDelete: () => this.deleteAccount(),
        onServer: (url) => this.setServer(url),
        onWorld: (on) => this.act(() => c.setWorld(on), () => ({ name: 'settings' }), on ? "You're on the Everyone leaderboard." : 'Hidden from the Everyone leaderboard.'),
        onNewCode: () => {
          if (!confirm('Get a new friend code? Your old code stops working (friends you have stay).')) return;
          this.act(() => c.rotateCode(), () => ({ name: 'settings' }), 'New friend code ready.');
        },
      });
      default: return listView({
        data: this.data, error: this.view.error, info: this.view.info,
        onShare: () => this.share(),
        onAdd: (code) => this.act(() => c.request(code), (r) => ({ name: 'list', info: r.status === 'friends' ? 'You\'re friends now!' : r.status === 'already_friends' ? 'Already friends.' : `Request sent to ${r.name ?? 'them'}.` })),
        onAccept: (id) => this.act(() => c.accept(id), () => ({ name: 'list', info: 'New friend!' })),
        onDecline: (id) => this.act(() => c.decline(id), () => ({ name: 'list' })),
        onBlockRequest: (r) => {
          if (!confirm(`Block ${r.name}? They can't send you requests or messages any more.`)) return;
          const report = confirm(`Also report ${r.name} to the Peek Pets team?`);
          this.act(() => c.block(r.id, report), () => ({ name: 'list', info: `${r.name} is blocked.` }), report ? "Thanks, we'll take a look." : undefined);
        },
        onOpen: (f) => this.openChat(f),
        onBoards: () => this.openBoards('catch', 'friends'),
        onSettings: () => this.go({ name: 'settings' }),
      });
    }
  }

  chat() {
    const c = this.client;
    const f = this.view.friend;
    return chatView({
      friend: f, meId: this.data.me.id, messages: this.threads[f.id] ?? [], best: store.get('gameBest') ?? {},
      draft: this.drafts[f.id] ?? '',
      onDraft: (text) => { this.drafts[f.id] = text; },
      onBack: () => { this.go({ name: 'list' }); this.refresh().catch(() => {}); },
      onSend: (text) => c.send(f.id, { text }).then((r) => this.onEvent({ t: 'message', friend: f.id, msg: r.msg })).catch((e) => this.app.ui.toast(errorText(e))),
      onEmote: (emote) => c.send(f.id, { emote }).then((r) => this.onEvent({ t: 'message', friend: f.id, msg: r.msg })).catch((e) => this.app.ui.toast(errorText(e))),
      onChallenge: (game, score) => c.send(f.id, { challenge: { game, score }, text: 'Beat my score!' }).then((r) => this.onEvent({ t: 'message', friend: f.id, msg: r.msg })).catch((e) => this.app.ui.toast(errorText(e))),
      onPlay: (m) => {
        this.challenge = { friend: f.id, name: f.name, game: m.challenge.game, score: m.challenge.score };
        this.app.ui.closeSheet();
        this.app.games.start(m.challenge.game);
        this.app.ui.say(`Beat ${m.challenge.score}!`, 1500);
      },
      onReport: () => {
        if (!confirm(`Report ${f.name}? Your recent messages with them are sent to a person to review.`)) return;
        this.act(() => c.report(f.id, 'reported from chat'), () => ({ name: 'chat', friend: f }), 'Thanks, we\'ll take a look.');
      },
      onBlock: () => {
        if (!confirm(`Block ${f.name}? They'll be removed from your friends and can't message you.`)) return;
        // Reporting here keeps your recent messages as evidence before the chat is removed.
        const report = confirm(`Also report ${f.name} to the Peek Pets team?`);
        this.act(() => c.block(f.id, report), () => ({ name: 'list', info: `${f.name} is blocked.` }), report ? "Thanks, we'll take a look." : undefined);
      },
    });
  }

  async openChat(f) {
    this.go({ name: 'chat', friend: f });
    try {
      const { messages } = await this.client.messages(f.id);
      // Merge: anything that arrived live while this was loading stays.
      this.threads[f.id] = [...messages, ...(this.threads[f.id] ?? [])].filter(uniqueById).sort((a, b) => a.at - b.at);
      if (f.unread) { f.unread = 0; this.client.read(f.id).catch(() => {}); this.updateBadge(); }
      if (this.view.name === 'chat' && this.view.friend.id === f.id) this.render();
    } catch (e) {
      this.app.ui.toast(errorText(e));
    }
  }

  boards() {
    const v = this.view;
    return boardsView({
      game: v.game, scope: v.scope, board: v.board ?? [], loading: v.loading, error: v.error, world: Boolean(this.data.me?.world),
      onWorld: (on) => this.act(() => this.client.setWorld(on), () => ({ name: 'boards', game: v.game, scope: v.scope, loading: true })).then(() => this.openBoards(v.game, v.scope)),
      onGame: (g) => this.openBoards(g, v.scope),
      onScope: (s) => this.openBoards(v.game, s),
      onBack: () => this.go({ name: 'list' }),
    });
  }

  async openBoards(game, scope) {
    this.go({ name: 'boards', game, scope, loading: true });
    try {
      const { board } = await this.client.call('GET', `/v1/leaderboard?game=${game}&scope=${scope}`);
      if (this.view.name === 'boards' && this.view.game === game && this.view.scope === scope) this.go({ name: 'boards', game, scope, board });
    } catch (e) {
      this.go({ name: 'boards', game, scope, error: errorText(e) });
    }
  }

  async act(run, nextView, toast) {
    try {
      const r = await run();
      await this.refresh();
      this.go(nextView(r));
      if (toast) this.app.ui.toast(toast);
    } catch (e) {
      this.go({ ...this.view, error: errorText(e) });
    }
  }

  async join(name) {
    const clean = cleanName(name);
    if (!clean) return this.go({ name: 'list', error: errorText({ code: 'bad_name' }) });
    try {
      await this.client.register(clean, this.app.species.id);
      await this.refresh();
      this.go({ name: 'list', info: 'You\'re in! Share your code with a friend.' });
      haptic('success');
    } catch (e) {
      this.go({ name: 'list', error: errorText(e) });
    }
  }

  async share() {
    const code = this.client.account?.code;
    if (!code) return;
    const text = `Add me on Peek Pets! My friend code is ${code.slice(0, 3)}-${code.slice(3)}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); this.app.ui.toast('Code copied!'); }
    } catch { /* cancelled */ }
  }

  async deleteAccount() {
    if (!confirm('Delete your chat account? Your friends, requests and messages are removed for good.')) return;
    try {
      await this.client.deleteAccount();
      this.app.ui.toast('Chat account deleted.');
    } catch (e) {
      this.app.ui.toast(errorText(e));
    }
  }

  setServer(url) {
    if (url && !/^https?:\/\/[^\s]+$/i.test(url)) { this.app.ui.toast('That doesn\'t look like a web address.'); return; }
    this.client.signOut();
    if (url) store.set('chatUrl', url); else store.remove('chatUrl');
    this.go({ name: 'list' });
  }
}

const uniqueById = (m, i, all) => all.findIndex((x) => x.id === m.id) === i;
