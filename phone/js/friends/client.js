// Talks to the friends & chat server (server/chat): REST calls with the account token,
// plus a live WebSocket for new messages and requests (reconnects with backoff while
// Friends is on). The account lives in storage as { id, token, code, name }.

import { store } from '../store.js';
import { reconnectDelay } from '../core/backoff.js';
import { CHAT_URL } from './config.js';

const PING_MS = 25_000;

export class FriendsClient {
  /** @param {{onEvent: (e: object) => void, onState?: (s: string) => void, baseUrl?: () => string}} o */
  constructor({ onEvent, onState, baseUrl }) {
    this.onEvent = onEvent;
    this.onState = onState ?? (() => {});
    this.baseUrl = baseUrl ?? (() => CHAT_URL);
    this.account = store.get('chat');
    this.ws = null;
    this.attempt = 0;
    this.downSince = null;
    this.wanted = false;
  }

  get configured() {
    return Boolean(this.url);
  }

  get url() {
    return String(this.baseUrl() || '').replace(/\/+$/, '');
  }

  get signedUp() {
    return Boolean(this.account?.token);
  }

  // ---------------------------------------------------------------- REST
  async call(method, path, body) {
    if (!this.configured) throw Object.assign(new Error('not_configured'), { code: 'not_configured' });
    let res;
    try {
      res = await fetch(`${this.url}${path}`, {
        method,
        headers: { ...(this.account?.token ? { Authorization: `Bearer ${this.account.token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw Object.assign(new Error('offline'), { code: 'offline' });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && this.account) this.signOut(); // deleted elsewhere or bad token
      throw Object.assign(new Error(data.error ?? `http_${res.status}`), { code: data.error ?? `http_${res.status}` });
    }
    return data;
  }

  async register(name, pet) {
    const data = await this.call('POST', '/v1/register', { name, pet, agree: true });
    this.account = { id: data.id, token: data.token, code: data.code, name: data.name };
    store.set('chat', this.account);
    this.connect();
    return data;
  }

  me() { return this.call('GET', '/v1/me'); }
  request(code) { return this.call('POST', '/v1/friends/request', { code }); }
  accept(id) { return this.call('POST', '/v1/friends/accept', { id }); }
  decline(id) { return this.call('POST', '/v1/friends/decline', { id }); }
  remove(id) { return this.call('POST', '/v1/friends/remove', { id }); }
  block(id) { return this.call('POST', '/v1/block', { id }); }
  report(id, reason) { return this.call('POST', '/v1/report', { id, reason }); }
  messages(friend) { return this.call('GET', `/v1/messages?friend=${encodeURIComponent(friend)}`); }
  send(to, { text, emote }) { return this.call('POST', '/v1/messages', { to, text, emote }); }
  read(friend) { return this.call('POST', '/v1/read', { friend }); }

  async deleteAccount() {
    await this.call('DELETE', '/v1/me');
    this.signOut();
  }

  signOut() {
    this.disconnect();
    this.account = null;
    store.remove('chat');
    this.onEvent({ t: 'signed-out' });
  }

  // ---------------------------------------------------------------- live
  connect() {
    this.wanted = true;
    if (!this.signedUp || !this.configured || this.ws) return;
    const url = `${this.url.replace(/^http/, 'ws')}/v1/live?token=${encodeURIComponent(this.account.token)}`;
    let ws;
    try { ws = new WebSocket(url); } catch { return this.retry(); }
    this.ws = ws;
    ws.addEventListener('open', () => {
      this.attempt = 0;
      this.downSince = null;
      this.onState('live');
      clearInterval(this.pinger);
      this.pinger = setInterval(() => { try { ws.send('ping'); } catch { /* closing */ } }, PING_MS);
    });
    ws.addEventListener('message', (e) => {
      if (e.data === 'pong') return;
      try { this.onEvent(JSON.parse(e.data)); } catch { /* ignore junk */ }
    });
    ws.addEventListener('close', (e) => {
      clearInterval(this.pinger);
      if (this.ws === ws) this.ws = null;
      this.onState('offline');
      if (e.code === 4001) return; // account deleted
      this.retry();
    });
    ws.addEventListener('error', () => { try { ws.close(); } catch { /* already */ } });
  }

  retry() {
    if (!this.wanted || !this.signedUp) return;
    this.downSince ??= Date.now();
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), reconnectDelay(this.attempt++, Date.now() - this.downSince));
  }

  disconnect() {
    this.wanted = false;
    clearTimeout(this.retryTimer);
    clearInterval(this.pinger);
    const ws = this.ws;
    this.ws = null;
    try { ws?.close(1000, 'bye'); } catch { /* already */ }
  }
}
