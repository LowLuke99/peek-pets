// One Durable Object per person: profile, friends, requests, blocks, one message thread
// per friend (≤ 200 messages, ≤ 30 days, swept daily by an alarm), game bests, and live
// WebSockets (hibernating, ≤ 5). Routes under /x/ are object-to-object calls and /init is
// sign-up; the Worker only ever forwards its fixed public routes here.
// Rate limits are stored (not in memory), so they survive the object going idle.

import { DurableObject } from 'cloudflare:workers';
import { validMessage, normalizeCode, validScore, GAME_IDS } from '../../../phone/js/core/chatRules.js';
import { randomId, randomSecret, sha256, sameHash } from './crypto.js';
import { BOT, BOT_ID, botReply, botMessage } from './bot.js';

const THREAD_MAX = 200;
const KEEP_MS = 30 * 86_400_000;
const DAY = 86_400_000;
const LIMITS = { send: [30, 60_000], request: [20, DAY], report: [20, DAY], score: [60, 3_600_000], rotate: [3, DAY], ticket: [30, 60_000] };
const CAPS = { friends: 100, incoming: 50, outgoing: 50, blocked: 500 };
const BOARD_MAX = 50;
const MAX_SOCKETS = 5;
const TICKET_MS = 60_000;
const ID = /^[a-f0-9]{32}$/;
const ok = (data = {}) => Response.json({ ok: true, ...data });
const no = (status, error) => Response.json({ error }, { status });
const has = (obj, key) => typeof key === 'string' && ID.test(key) && Object.hasOwn(obj ?? {}, key);

export class User extends DurableObject {
  // ---------------------------------------------------------------- entry
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
    if (path === '/init') return this.init(body);
    if (path.startsWith('/x/')) return this.peer(path, body);

    const me = await this.ctx.storage.get('profile');
    if (path === '/live') return this.live(me, request);
    if (!me || !sameHash(me.secretHash, request.headers.get('X-Secret-Hash')) || request.headers.get('X-User') !== me.id) {
      return no(401, 'unauthorized');
    }
    switch (path) {
      case '/me': return ok(await this.summary(me));
      case '/request': return this.request(me, body);
      case '/accept': return this.accept(me, body.id);
      case '/decline': return this.decline(body.id);
      case '/remove': return this.unfriend(me, body.id);
      case '/block': return this.block(me, body);
      case '/report': return this.report(me, body);
      case '/messages': return this.messages(url.searchParams.get('friend'));
      case '/send': return this.send(me, body);
      case '/read': return this.read(body.friend);
      case '/delete': return this.deleteAccount(me);
      case '/scores': return this.score(me, body);
      case '/leaderboard': return this.leaderboard(me, url.searchParams.get('game'), url.searchParams.get('scope'));
      case '/settings': return this.settings(me, body);
      case '/rotate': return this.rotate(me);
      case '/ticket': return this.ticket(me);
      default: return no(404, 'not_found');
    }
  }

  async init({ id, name, pet, code, secretHash }) {
    if (await this.ctx.storage.get('profile')) return no(409, 'exists');
    await this.ctx.storage.put({ profile: { id, name, pet, code, secretHash, world: false, created: Date.now() }, friends: {}, incoming: {}, outgoing: {}, blocked: {}, unread: {} });
    return ok();
  }

  get dir() {
    return this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName('main'));
  }

  // ---------------------------------------------------------------- reads
  async summary(me) {
    const [friends, incoming, outgoing, unread] = await Promise.all(['friends', 'incoming', 'outgoing', 'unread'].map((k) => this.get(k)));
    const list = await Promise.all(Object.entries(friends).map(async ([id, f]) => {
      const thread = await this.thread(id);
      return { id, name: f.name, pet: f.pet, since: f.since, unread: unread[id] ?? 0, last: thread.at(-1) ?? null };
    }));
    list.sort((a, b) => (b.last?.at ?? b.since) - (a.last?.at ?? a.since));
    return {
      me: { id: me.id, name: me.name, pet: me.pet, code: me.code, world: Boolean(me.world) },
      friends: list,
      incoming: Object.entries(incoming).map(([id, r]) => ({ id, name: r.name, pet: r.pet, code: r.code ?? null, at: r.at })),
      outgoing: Object.entries(outgoing).map(([id, r]) => ({ id, name: r.name, at: r.at })),
    };
  }

  async messages(friendId) {
    if (!has(await this.get('friends'), friendId)) return no(403, 'not_friends');
    return ok({ messages: await this.thread(friendId) });
  }

  // ---------------------------------------------------------------- friends
  async request(me, { code }) {
    if (!(await this.allow('request'))) return no(429, 'slow_down');
    const found = await this.dir.fetch(new Request(`https://dir/lookup?code=${normalizeCode(code)}`));
    if (!found.ok) return no(404, 'unknown_code');
    const { id } = await found.json();
    if (id === me.id) return no(400, 'thats_you');
    const [friends, blocked, incoming, outgoing] = await Promise.all(['friends', 'blocked', 'incoming', 'outgoing'].map((k) => this.get(k)));
    if (has(friends, id)) return ok({ status: 'already_friends' });
    if (has(blocked, id)) return no(403, 'blocked');
    if (has(incoming, id)) return this.accept(me, id); // they already asked you: that's a yes
    if (Object.keys(friends).length >= CAPS.friends) return no(409, 'too_many_friends');
    if (Object.keys(outgoing).length >= CAPS.outgoing) return no(409, 'too_many_requests');
    const res = await this.callPeer(id, '/x/request', { from: me.id, name: me.name, pet: me.pet, code: me.code });
    const reply = res.ok ? await res.json() : {};
    if (reply.status === 'friends') { // we had both asked: friends on both sides
      await this.befriend(id, reply.name, reply.pet);
      return ok({ status: 'friends', name: reply.name });
    }
    await this.update('outgoing', (o) => ({ ...o, [id]: { name: reply.name ?? 'Friend', at: Date.now() } }));
    this.broadcast({ t: 'changed' });
    return ok({ status: 'requested', name: reply.name ?? null });
  }

  async accept(me, id) {
    const req = (await this.get('incoming'))[id];
    if (!has(await this.get('incoming'), id) || !req) return no(404, 'no_request');
    await this.befriend(id, req.name, req.pet);
    await this.callPeer(id, '/x/accepted', { from: me.id, name: me.name, pet: me.pet });
    return ok({ status: 'friends' });
  }

  async decline(id) {
    if (!ID.test(String(id))) return no(400, 'bad_id');
    await this.update('incoming', (r) => without(r, id));
    this.broadcast({ t: 'changed' });
    return ok();
  }

  async unfriend(me, id) {
    if (!has(await this.get('friends'), id)) return no(404, 'not_friends');
    await this.forget(id);
    await this.callPeer(id, '/x/removed', { from: me.id });
    return ok();
  }

  /** Block (optionally reporting first, so the evidence is kept before the thread goes). */
  async block(me, { id, report, reason }) {
    if (!ID.test(String(id))) return no(400, 'bad_id');
    if (report) await this.fileReport(me, id, reason ?? 'blocked and reported');
    await this.forget(id);
    await this.update('blocked', (b) => capped({ ...b, [id]: Date.now() }, CAPS.blocked));
    await this.callPeer(id, '/x/removed', { from: me.id });
    return ok();
  }

  async report(me, { id, reason }) {
    const [friends, incoming] = await Promise.all([this.get('friends'), this.get('incoming')]);
    if (!has(friends, id) && !has(incoming, id)) return no(404, 'unknown_user');
    if (!(await this.fileReport(me, id, reason))) return no(429, 'slow_down');
    return ok();
  }

  async fileReport(me, id, reason) {
    if (!(await this.allow('report'))) return false;
    const [friends, incoming] = await Promise.all([this.get('friends'), this.get('incoming')]);
    const who = friends[id] ?? incoming[id] ?? {};
    const recent = (await this.thread(id)).slice(-20);
    await this.dir.fetch(new Request('https://dir/report', {
      method: 'POST',
      body: JSON.stringify({ by: me.id, byName: me.name, about: id, name: who.name ?? '?', reason: String(reason ?? '').slice(0, 200), recent }),
    }));
    return true;
  }

  // ---------------------------------------------------------------- messages
  async send(me, { to, text, emote, challenge }) {
    if (!(await this.allow('send'))) return no(429, 'slow_down');
    if (!has(await this.get('friends'), to)) return no(403, 'not_friends');
    const clean = validMessage({ text, emote, challenge });
    if (!clean) return no(400, 'empty_or_invalid');
    const msg = { id: randomId().slice(0, 16), from: me.id, to, text: clean.text, emote: clean.emote, challenge: clean.challenge, at: Date.now() };
    const res = await this.callPeer(to, '/x/deliver', { msg, name: me.name, pet: me.pet });
    if (!res.ok) return no(403, 'not_delivered');
    await this.append(to, msg);
    this.broadcast({ t: 'message', friend: to, msg });
    return ok({ msg });
  }

  async read(friend) {
    if (!ID.test(String(friend))) return no(400, 'bad_id');
    await this.update('unread', (u) => without(u, friend));
    return ok();
  }

  // ---------------------------------------------------------------- scores + leaderboards
  async score(me, { game, score }) {
    if (!validScore(game, score)) return no(400, 'bad_score');
    if (!(await this.allow('score'))) return no(429, 'slow_down');
    // A round takes time: refuse scores posted faster than a round could be played.
    const gap = Number(this.env.SCORE_MIN_INTERVAL_S ?? (game === 'cups' ? 8 : 25)) * 1000;
    const lastKey = `lastScore:${game}`;
    const last = (await this.ctx.storage.get(lastKey)) ?? 0;
    if (Date.now() - last < gap) return no(429, 'too_fast');
    await this.ctx.storage.put(lastKey, Date.now());
    const best = await this.get('best');
    if ((best[game] ?? -1) >= score) return ok({ best: best[game], improved: false });
    await this.ctx.storage.put('best', { ...best, [game]: score });
    if (me.world) await this.dir.fetch(new Request('https://dir/score', { method: 'POST', body: JSON.stringify({ id: me.id, name: me.name, pet: me.pet, game, score }) }));
    return ok({ best: score, improved: true });
  }

  /** scope=friends: you + your friends' bests; scope=world: the top 50 who opted in. */
  async leaderboard(me, game, scope) {
    if (!GAME_IDS.includes(game)) return no(400, 'bad_game');
    if (scope === 'world') {
      const res = await this.dir.fetch(new Request(`https://dir/top?game=${game}`));
      const { board } = await res.json();
      const blocked = await this.get('blocked');
      return ok({ world: Boolean(me.world), board: board.filter((e) => !Object.hasOwn(blocked, e.id)).map((e, i) => ({ rank: i + 1, name: e.name, pet: e.pet, score: e.score, me: e.id === me.id })) });
    }
    const friends = await this.get('friends');
    const mine = (await this.get('best'))[game];
    const rows = await Promise.all(Object.entries(friends).map(async ([id, f]) => {
      const res = await this.callPeer(id, '/x/best', { from: me.id, game });
      const { score } = res.ok ? await res.json() : { score: null };
      return score == null ? null : { name: f.name, pet: f.pet, score, me: false };
    }));
    const board = [...rows.filter(Boolean), ...(mine == null ? [] : [{ name: me.name, pet: me.pet, score: mine, me: true }])]
      .sort((a, b) => b.score - a.score).slice(0, BOARD_MAX).map((e, i) => ({ rank: i + 1, ...e }));
    return ok({ board });
  }

  /** Opt in/out of the world leaderboard (off by default: nicknames would be public). */
  async settings(me, { world }) {
    if (typeof world !== 'boolean') return no(400, 'bad_settings');
    await this.ctx.storage.put('profile', { ...me, world });
    if (world) {
      const best = await this.get('best');
      for (const game of GAME_IDS) {
        if (best[game] != null) await this.dir.fetch(new Request('https://dir/score', { method: 'POST', body: JSON.stringify({ id: me.id, name: me.name, pet: me.pet, game, score: best[game] }) }));
      }
    } else {
      await this.dir.fetch(new Request('https://dir/unlist', { method: 'POST', body: JSON.stringify({ id: me.id }) }));
    }
    return ok({ world });
  }

  /** A new friend code (the old one stops working), e.g. after a stranger got hold of it. */
  async rotate(me) {
    if (!(await this.allow('rotate'))) return no(429, 'slow_down');
    const res = await this.dir.fetch(new Request('https://dir/claim', { method: 'POST', body: JSON.stringify({ id: me.id }) }));
    if (!res.ok) return no(503, 'try_again');
    const { code } = await res.json();
    await this.dir.fetch(new Request('https://dir/forget', { method: 'POST', body: JSON.stringify({ code: me.code }) }));
    await this.ctx.storage.put('profile', { ...me, code });
    return ok({ code });
  }

  // ---------------------------------------------------------------- object-to-object
  async peer(path, body) {
    const from = body.from ?? body.msg?.from;
    if (!ID.test(String(from))) return no(400, 'bad_from');
    if (path === '/x/ban') return this.ban();
    if (body.to === BOT_ID) return this.bot(path, from, body);
    const me = await this.ctx.storage.get('profile');
    if (!me) return no(404, 'gone');
    const blocked = await this.get('blocked');
    switch (path) {
      case '/x/request': {
        if (Object.hasOwn(blocked, from)) return ok({ name: me.name }); // a blocked sender can't tell
        const [outgoing, incoming] = await Promise.all([this.get('outgoing'), this.get('incoming')]);
        if (Object.hasOwn(outgoing, from)) { // both asked: friends
          await this.befriend(from, body.name, body.pet);
          return ok({ name: me.name, pet: me.pet, status: 'friends' });
        }
        if (Object.keys(incoming).length < CAPS.incoming) {
          await this.update('incoming', (r) => ({ ...r, [from]: { name: String(body.name ?? 'Friend').slice(0, 20), pet: String(body.pet ?? 'mochi').slice(0, 12), code: String(body.code ?? '').slice(0, 6), at: Date.now() } }));
          this.broadcast({ t: 'request', from: { id: from, name: body.name, pet: body.pet } });
        }
        return ok({ name: me.name });
      }
      case '/x/accepted': {
        if (Object.hasOwn(await this.get('outgoing'), from) && !Object.hasOwn(blocked, from)) await this.befriend(from, body.name, body.pet);
        return ok();
      }
      case '/x/removed':
        await this.forget(from);
        return ok();
      case '/x/deliver': {
        if (!Object.hasOwn(await this.get('friends'), from) || Object.hasOwn(blocked, from)) return no(403, 'not_friends');
        await this.append(from, body.msg);
        await this.update('unread', (u) => ({ ...u, [from]: (u[from] ?? 0) + 1 }));
        this.broadcast({ t: 'message', friend: from, msg: body.msg, name: body.name, pet: body.pet });
        return ok();
      }
      case '/x/best': {
        if (!Object.hasOwn(await this.get('friends'), from) || !GAME_IDS.includes(body.game)) return no(403, 'not_friends');
        return ok({ score: (await this.get('best'))[body.game] ?? null });
      }
      default:
        return no(404, 'not_found');
    }
  }

  // ---------------------------------------------------------------- account
  /** Erases everything. Peer clean-up is best effort; the erase always happens. */
  async deleteAccount(me) {
    await this.wipe(me);
    return ok({ deleted: true });
  }

  /** Moderator ban (from the Worker's admin route): wipe the account and leave a tombstone. */
  async ban() {
    const me = await this.ctx.storage.get('profile');
    if (me) await this.wipe(me);
    await this.ctx.storage.put('banned', Date.now());
    return ok({ banned: true });
  }

  async wipe(me) {
    const [friends, outgoing] = await Promise.all([this.get('friends'), this.get('outgoing')]);
    const peers = [...new Set([...Object.keys(friends), ...Object.keys(outgoing)])];
    await Promise.allSettled(peers.map((id) => this.callPeer(id, '/x/removed', { from: me.id })));
    await Promise.allSettled([this.dir.fetch(new Request('https://dir/forget', { method: 'POST', body: JSON.stringify({ code: me.code, id: me.id }) }))]);
    for (const ws of this.ctx.getWebSockets()) { try { ws.close(4001, 'deleted'); } catch { /* closed */ } }
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  // ---------------------------------------------------------------- live updates
  /** A single-use, 60-second ticket for opening the live socket (keeps the token out of URLs). */
  async ticket(me) {
    if (!(await this.allow('ticket'))) return no(429, 'slow_down');
    const ticket = randomSecret();
    await this.ctx.storage.put('ticket', { hash: await sha256(ticket), exp: Date.now() + TICKET_MS });
    return ok({ ticket: `${me.id}.${ticket}` });
  }

  async live(me, request) {
    const t = await this.ctx.storage.get('ticket');
    if (!me || !t || Date.now() > t.exp || !sameHash(t.hash, request.headers.get('X-Ticket-Hash'))) return no(401, 'unauthorized');
    await this.ctx.storage.delete('ticket'); // single use
    const open = this.ctx.getWebSockets();
    if (open.length >= MAX_SOCKETS) { try { open[0].close(4002, 'too many'); } catch { /* closed */ } }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].send(JSON.stringify({ t: 'hello' }));
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  webSocketMessage(ws, data) {
    if (data === 'ping') ws.send('pong');
  }

  webSocketClose(ws, code) {
    try { ws.close(code, 'bye'); } catch { /* already closed */ }
  }

  broadcast(event) {
    const s = JSON.stringify(event);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(s); } catch { /* closing */ }
    }
  }

  /** Daily sweep: drop messages older than 30 days even in threads nobody opens. (Peek Bot: send queued replies.) */
  async alarm() {
    if (await this.ctx.storage.get('isBot')) {
      const pending = (await this.ctx.storage.get('botPending')) ?? [];
      await this.ctx.storage.put('botPending', []);
      await Promise.allSettled(pending.map((p) => this.callPeer(p.to, '/x/deliver', { from: BOT_ID, msg: botMessage(p.to, botReply(p.msg)), name: BOT.name, pet: BOT.pet })));
      return;
    }
    const friends = await this.get('friends');
    let left = 0;
    for (const id of Object.keys(friends)) {
      const kept = await this.thread(id);
      left += kept.length;
      await this.ctx.storage.put(`thread:${id}`, kept);
    }
    if (left > 0) await this.ctx.storage.setAlarm(Date.now() + DAY);
  }

  // ---------------------------------------------------------------- helpers
  async befriend(id, name, pet) {
    await this.update('friends', (f) => ({ ...f, [id]: { name: String(name ?? 'Friend').slice(0, 20), pet: String(pet ?? 'mochi').slice(0, 12), since: Date.now() } }));
    await this.update('incoming', (r) => without(r, id));
    await this.update('outgoing', (r) => without(r, id));
    this.broadcast({ t: 'friend', id, name });
  }

  /** Drops a friend, their requests and your thread with them. */
  async forget(id) {
    await this.update('friends', (f) => without(f, id));
    await this.update('incoming', (r) => without(r, id));
    await this.update('outgoing', (r) => without(r, id));
    await this.update('unread', (u) => without(u, id));
    await this.ctx.storage.delete(`thread:${id}`);
    this.broadcast({ t: 'changed' });
  }

  async thread(id) {
    const list = (await this.ctx.storage.get(`thread:${id}`)) ?? [];
    const cutoff = Date.now() - KEEP_MS;
    return list.filter((m) => m.at >= cutoff);
  }

  async append(id, msg) {
    const list = await this.thread(id);
    await this.ctx.storage.put(`thread:${id}`, [...list, msg].slice(-THREAD_MAX));
    if ((await this.ctx.storage.getAlarm()) == null) await this.ctx.storage.setAlarm(Date.now() + DAY);
  }

  callPeer(id, path, body) {
    const stub = this.env.USERS.get(this.env.USERS.idFromName(id));
    return stub.fetch(new Request(`https://user${path}`, { method: 'POST', body: JSON.stringify({ ...body, to: id }) }));
  }

  /** Peek Bot's side (this object is the bot): accept everyone, answer every message. */
  async bot(path, from, body) {
    switch (path) {
      case '/x/request':
        await this.update('friends', (f) => ({ ...f, [from]: { name: String(body.name ?? 'Friend').slice(0, 20), since: Date.now() } }));
        return ok({ name: BOT.name, pet: BOT.pet, status: 'friends' });
      case '/x/removed':
        await this.update('friends', (f) => without(f, from));
        return ok();
      case '/x/deliver': {
        if (!Object.hasOwn(await this.get('friends'), from)) return no(403, 'not_friends');
        // Answer a moment later (via the alarm), after the sender's own message has landed.
        const pending = (await this.ctx.storage.get('botPending')) ?? [];
        await this.ctx.storage.put({ isBot: true, botPending: [...pending, { to: from, msg: body.msg ?? {} }].slice(-200) });
        await this.ctx.storage.setAlarm(Date.now() + 700);
        return ok();
      }
      case '/x/best':
        return ok({ score: null });
      default:
        return ok();
    }
  }

  async get(key) {
    return (await this.ctx.storage.get(key)) ?? {};
  }

  async update(key, fn) {
    await this.ctx.storage.put(key, fn(await this.get(key)));
  }

  /** Sliding-window limit kept in storage (survives the object being evicted). */
  async allow(kind) {
    const [max, windowMs] = LIMITS[kind];
    const now = Date.now();
    const key = `rl:${kind}`;
    const recent = ((await this.ctx.storage.get(key)) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) return false;
    await this.ctx.storage.put(key, [...recent, now]);
    return true;
  }
}

function without(obj, key) {
  const { [key]: _drop, ...rest } = obj ?? {};
  return rest;
}

/** Keeps at most `max` entries (oldest dropped first by insertion order). */
function capped(obj, max) {
  const entries = Object.entries(obj);
  return entries.length <= max ? obj : Object.fromEntries(entries.slice(-max));
}
