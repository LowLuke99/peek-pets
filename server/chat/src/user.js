// One Durable Object per person. Holds their profile, friends, friend requests, blocks
// and one message thread per friend (≤ 200 messages, ≤ 30 days), and their live
// WebSockets (hibernating). Routes starting with /x/ are object-to-object calls; the
// Worker never forwards outside requests to them.

import { DurableObject } from 'cloudflare:workers';
import { validMessage, normalizeCode } from '../../../phone/js/core/chatRules.js';
import { randomId, sameHash } from './crypto.js';

const THREAD_MAX = 200;
const KEEP_MS = 30 * 86_400_000;
const LIMITS = { send: [30, 60_000], request: [20, 86_400_000], report: [20, 86_400_000] };
const ok = (data = {}) => Response.json({ ok: true, ...data });
const no = (status, error) => Response.json({ error }, { status });

export class User extends DurableObject {
  // ---------------------------------------------------------------- entry
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
    if (path === '/init') return this.init(body);
    if (path.startsWith('/x/')) return this.peer(path, body);

    const me = await this.ctx.storage.get('profile');
    if (!me || !sameHash(me.secretHash, request.headers.get('X-Secret-Hash')) || request.headers.get('X-User') !== me.id) {
      return no(401, 'unauthorized');
    }
    switch (path) {
      case '/me': return ok(await this.summary(me));
      case '/request': return this.request(me, body);
      case '/accept': return this.accept(me, body.id);
      case '/decline': return this.decline(body.id);
      case '/remove': return this.unfriend(me, body.id);
      case '/block': return this.block(me, body.id);
      case '/report': return this.report(me, body);
      case '/messages': return this.messages(url.searchParams.get('friend'));
      case '/send': return this.send(me, body);
      case '/read': return this.read(body.friend);
      case '/delete': return this.deleteAccount(me);
      case '/live': return this.live();
      default: return no(404, 'not_found');
    }
  }

  async init({ id, name, pet, code, secretHash }) {
    if (await this.ctx.storage.get('profile')) return no(409, 'exists');
    await this.ctx.storage.put({ profile: { id, name, pet, code, secretHash, created: Date.now() }, friends: {}, incoming: {}, outgoing: {}, blocked: {}, unread: {} });
    return ok();
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
      me: { id: me.id, name: me.name, pet: me.pet, code: me.code },
      friends: list,
      incoming: Object.entries(incoming).map(([id, r]) => ({ id, name: r.name, pet: r.pet, at: r.at })),
      outgoing: Object.entries(outgoing).map(([id, r]) => ({ id, name: r.name, at: r.at })),
    };
  }

  async messages(friendId) {
    const friends = await this.get('friends');
    if (!friends[friendId]) return no(403, 'not_friends');
    return ok({ messages: await this.thread(friendId) });
  }

  // ---------------------------------------------------------------- friends
  async request(me, { code }) {
    if (!this.allow('request')) return no(429, 'slow_down');
    const dir = this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName('main'));
    const found = await dir.fetch(new Request(`https://dir/lookup?code=${normalizeCode(code)}`));
    if (!found.ok) return no(404, 'unknown_code');
    const { id } = await found.json();
    if (id === me.id) return no(400, 'thats_you');
    const [friends, blocked, incoming] = await Promise.all([this.get('friends'), this.get('blocked'), this.get('incoming')]);
    if (friends[id]) return ok({ status: 'already_friends' });
    if (blocked[id]) return no(403, 'blocked');
    if (incoming[id]) return this.accept(me, id); // they already asked you: that's a yes
    const res = await this.callPeer(id, '/x/request', { from: me.id, name: me.name, pet: me.pet });
    const { name } = res.ok ? await res.json() : { name: null };
    await this.update('outgoing', (o) => ({ ...o, [id]: { name: name ?? 'Friend', at: Date.now() } }));
    this.broadcast({ t: 'changed' });
    return ok({ status: 'requested', name });
  }

  async accept(me, id) {
    const incoming = await this.get('incoming');
    const req = incoming[id];
    if (!req) return no(404, 'no_request');
    await this.befriend(id, req.name, req.pet);
    await this.callPeer(id, '/x/accepted', { from: me.id, name: me.name, pet: me.pet });
    return ok({ status: 'friends' });
  }

  async decline(id) {
    await this.update('incoming', (r) => without(r, id));
    this.broadcast({ t: 'changed' });
    return ok();
  }

  async unfriend(me, id) {
    await this.forget(id);
    await this.callPeer(id, '/x/removed', { from: me.id });
    return ok();
  }

  async block(me, id) {
    if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id)) return no(400, 'bad_id');
    await this.forget(id);
    await this.update('blocked', (b) => ({ ...b, [id]: Date.now() }));
    await this.callPeer(id, '/x/removed', { from: me.id });
    return ok();
  }

  async report(me, { id, reason }) {
    if (!this.allow('report')) return no(429, 'slow_down');
    const friends = await this.get('friends');
    const incoming = await this.get('incoming');
    if (!friends[id] && !incoming[id]) return no(404, 'unknown_user');
    const recent = (await this.thread(id)).slice(-20);
    const dir = this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName('main'));
    await dir.fetch(new Request('https://dir/report', {
      method: 'POST',
      body: JSON.stringify({ by: me.id, about: id, name: (friends[id] ?? incoming[id]).name, reason: String(reason ?? '').slice(0, 200), recent }),
    }));
    return ok();
  }

  // ---------------------------------------------------------------- messages
  async send(me, { to, text, emote }) {
    if (!this.allow('send')) return no(429, 'slow_down');
    const friends = await this.get('friends');
    if (!friends[to]) return no(403, 'not_friends');
    const clean = validMessage({ text, emote });
    if (!clean) return no(400, 'empty_or_invalid');
    const msg = { id: randomId().slice(0, 16), from: me.id, to, text: clean.text, emote: clean.emote, at: Date.now() };
    const res = await this.callPeer(to, '/x/deliver', { msg, name: me.name, pet: me.pet });
    if (!res.ok) return no(403, 'not_delivered');
    await this.append(to, msg);
    this.broadcast({ t: 'message', friend: to, msg });
    return ok({ msg });
  }

  async read(friend) {
    await this.update('unread', (u) => without(u, friend));
    return ok();
  }

  // ---------------------------------------------------------------- object-to-object
  async peer(path, body) {
    const from = body.from ?? body.msg?.from;
    if (typeof from !== 'string' || !/^[a-f0-9]{32}$/.test(from)) return no(400, 'bad_from');
    const me = await this.ctx.storage.get('profile');
    if (!me) return no(404, 'gone');
    const blocked = await this.get('blocked');
    switch (path) {
      case '/x/request': {
        if (!blocked[from]) {
          const outgoing = await this.get('outgoing');
          if (outgoing[from]) { // both asked: friends
            await this.befriend(from, body.name, body.pet);
          } else {
            await this.update('incoming', (r) => ({ ...r, [from]: { name: body.name, pet: body.pet, at: Date.now() } }));
            this.broadcast({ t: 'request', from: { id: from, name: body.name, pet: body.pet } });
          }
        }
        return ok({ name: me.name }); // a blocked sender can't tell they're blocked
      }
      case '/x/accepted': {
        const outgoing = await this.get('outgoing');
        if (outgoing[from] && !blocked[from]) await this.befriend(from, body.name, body.pet);
        return ok();
      }
      case '/x/removed':
        await this.forget(from, true);
        return ok();
      case '/x/deliver': {
        const friends = await this.get('friends');
        if (!friends[from] || blocked[from]) return no(403, 'not_friends');
        const msg = body.msg;
        await this.append(from, msg);
        await this.update('unread', (u) => ({ ...u, [from]: (u[from] ?? 0) + 1 }));
        this.broadcast({ t: 'message', friend: from, msg, name: body.name, pet: body.pet });
        return ok();
      }
      default:
        return no(404, 'not_found');
    }
  }

  // ---------------------------------------------------------------- account
  async deleteAccount(me) {
    const friends = await this.get('friends');
    const outgoing = await this.get('outgoing');
    await Promise.all([...new Set([...Object.keys(friends), ...Object.keys(outgoing)])].map((id) => this.callPeer(id, '/x/removed', { from: me.id })));
    const dir = this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName('main'));
    await dir.fetch(new Request('https://dir/forget', { method: 'POST', body: JSON.stringify({ code: me.code }) }));
    for (const ws of this.ctx.getWebSockets()) ws.close(4001, 'deleted');
    await this.ctx.storage.deleteAll();
    return ok({ deleted: true });
  }

  // ---------------------------------------------------------------- live updates
  live() {
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

  // ---------------------------------------------------------------- helpers
  async befriend(id, name, pet) {
    await this.update('friends', (f) => ({ ...f, [id]: { name: String(name ?? 'Friend').slice(0, 20), pet: String(pet ?? 'mochi').slice(0, 12), since: Date.now() } }));
    await this.update('incoming', (r) => without(r, id));
    await this.update('outgoing', (r) => without(r, id));
    this.broadcast({ t: 'friend', id, name });
  }

  /** Drops a friend, their requests and your thread with them. */
  async forget(id, notify = true) {
    await this.update('friends', (f) => without(f, id));
    await this.update('incoming', (r) => without(r, id));
    await this.update('outgoing', (r) => without(r, id));
    await this.update('unread', (u) => without(u, id));
    await this.ctx.storage.delete(`thread:${id}`);
    if (notify) this.broadcast({ t: 'changed' });
  }

  async thread(id) {
    const list = (await this.ctx.storage.get(`thread:${id}`)) ?? [];
    const cutoff = Date.now() - KEEP_MS;
    return list.filter((m) => m.at >= cutoff);
  }

  async append(id, msg) {
    const list = await this.thread(id);
    await this.ctx.storage.put(`thread:${id}`, [...list, msg].slice(-THREAD_MAX));
  }

  callPeer(id, path, body) {
    const stub = this.env.USERS.get(this.env.USERS.idFromName(id));
    return stub.fetch(new Request(`https://user${path}`, { method: 'POST', body: JSON.stringify(body) }));
  }

  async get(key) {
    return (await this.ctx.storage.get(key)) ?? {};
  }

  async update(key, fn) {
    await this.ctx.storage.put(key, fn(await this.get(key)));
  }

  /** In-memory sliding-window limits (reset if the object restarts; good enough here). */
  allow(kind) {
    const [max, windowMs] = LIMITS[kind];
    const now = Date.now();
    this.hits ??= {};
    const recent = (this.hits[kind] ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) { this.hits[kind] = recent; return false; }
    this.hits[kind] = [...recent, now];
    return true;
  }
}

function without(obj, key) {
  const { [key]: _drop, ...rest } = obj ?? {};
  return rest;
}
