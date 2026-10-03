// Live link to the PC companion over WebSocket.
// States: unpaired → connecting → connected ⇄ reconnecting (→ pc_closed / offline)
// Handles pairing, token auth, heartbeat-based dead-link detection, reconnect
// backoff, pausing while the phone screen is off, and latency/clock estimation.

import { parseServerMessage, msg } from '../core/protocol.js';
import { reconnectDelay } from '../core/backoff.js';

const PING_EVERY_MS = 2000;
const DEAD_AFTER_MS = 6000;
const STATS_EVERY_MS = 2000;

export class Link {
  /**
   * @param {{store: object, url?: string, deviceName?: string, onState: Function, onCursor: Function, onMessage: Function}} opts
   */
  constructor(opts) {
    this.store = opts.store;
    this.url = opts.url ?? defaultUrl();
    this.deviceName = opts.deviceName ?? guessDeviceName();
    this.onState = opts.onState;
    this.onCursor = opts.onCursor;
    this.onMessage = opts.onMessage;
    this.ws = null;
    this.state = 'idle';
    this.info = {};
    this.pendingCode = null;
    this.attempt = 0;
    this.failingSince = null;
    this.retryTimer = null;
    this.pingTimer = null;
    this.statsTimer = null;
    this.lastMessageAt = 0;
    this.pingId = 0;
    this.lastPingAt = 0;
    this.offsets = [];            // recent {rtt, offset} samples, best (lowest rtt) wins
    this.rtt = null;
    this.latency = null;          // smoothed cursor one-way delay estimate (ms)
    this.cursorRate = 0;
    this.cursorCount = 0;
    this.rateWindowStart = performance.now();
    this.lastSeq = 0;
    this.fps = null;
    this.paused = false;
    this.wantStop = false;
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('online', () => this.retryNow());
    window.addEventListener('pageshow', () => this.retryNow());
  }

  get token() { return this.store.get('token'); }
  get canConnect() { return Boolean(this.token || this.pendingCode); }

  start() {
    this.wantStop = false;
    if (!this.canConnect) return this.setState('unpaired');
    this.connect();
  }

  pairWithCode(code) {
    this.wantStop = false;
    this.info = { ...this.info, authError: null };
    this.pendingCode = code;
    this.store.remove('token');
    this.close();
    this.attempt = 0;
    this.connect();
  }

  forget() {
    this.store.remove('token');
    this.store.remove('pc');
    this.pendingCode = null;
    this.wantStop = true;
    this.close();
    this.setState('unpaired');
  }

  retryNow() {
    if (this.wantStop || !this.canConnect) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    clearTimeout(this.retryTimer);
    this.attempt = 0;
    this.connect();
  }

  send(obj) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  sendEvent(name) {
    if (this.state === 'connected') this.send(msg.event(name));
  }

  connect() {
    clearTimeout(this.retryTimer);
    this.close();
    this.setState(this.state === 'connected' || this.state === 'reconnecting' ? 'reconnecting' : 'connecting');
    let ws;
    try {
      ws = new WebSocket(this.url);
    } catch (err) {
      this.info = { ...this.info, error: String(err?.message ?? err) };
      return this.scheduleRetry();
    }
    this.ws = ws;
    this.authed = false;
    ws.onmessage = (ev) => this.handle(ev.data);
    ws.onclose = () => { if (this.ws === ws) this.onClosed(); };
    ws.onerror = () => { /* onclose follows */ };
    this.lastMessageAt = performance.now();
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => this.heartbeat(), PING_EVERY_MS / 2);
  }

  close() {
    clearInterval(this.pingTimer);
    clearInterval(this.statsTimer);
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      ws.onclose = ws.onmessage = ws.onerror = null;
      try { ws.close(); } catch { /* ignore */ }
    }
  }

  handle(data) {
    const now = performance.now();
    this.lastMessageAt = now;
    const m = parseServerMessage(data);
    if (!m) return;
    switch (m.t) {
      case 'c': return this.handleCursor(m, now);
      case 'hello':
        this.ping();
        this.send(msg.auth({ token: this.token, code: this.pendingCode, deviceName: this.deviceName }));
        return;
      case 'auth_ok':
        if (m.token) this.store.set('token', m.token);
        this.store.set('pc', m.pc);
        this.pendingCode = null;
        this.authed = true;
        this.attempt = 0;
        this.failingSince = null;
        this.info = { pc: m.pc, version: m.version, shared: m.shared, facts: m.facts, catalog: m.catalog, newlyPaired: Boolean(m.token) };
        this.send(msg.sub({ cursorHz: 60, paused: document.hidden }));
        clearInterval(this.statsTimer);
        this.statsTimer = setInterval(() => this.sendStats(), STATS_EVERY_MS);
        this.setState('connected');
        break;
      case 'auth_err':
        return this.handleAuthError(m.reason);
      case 'pong':
        return this.handlePong(m, now);
      case 'bye':
        this.byeReceived = true;
        break;
      case 'sharing':
        this.info = { ...this.info, shared: m.shared, facts: { ...this.info.facts, ...m.facts } };
        break;
      case 'fact':
        this.info = { ...this.info, facts: { ...this.info.facts, [m.key]: m.value } };
        break;
      default:
        break;
    }
    this.onMessage?.(m);
  }

  handleCursor(m, now) {
    this.cursorCount++;
    if (now - this.rateWindowStart >= 1000) {
      this.cursorRate = (this.cursorCount * 1000) / (now - this.rateWindowStart);
      this.cursorCount = 0;
      this.rateWindowStart = now;
    }
    if (m.s <= this.lastSeq && this.lastSeq - m.s < 1e6) return; // stale or duplicate
    this.lastSeq = m.s;
    const best = this.bestOffset();
    if (best) {
      const oneWay = Math.max(0, now - (m.ts - best.offset));
      this.latency = this.latency == null ? oneWay : this.latency * 0.9 + oneWay * 0.1;
    }
    this.onCursor?.(m, now);
  }

  handlePong(m, now) {
    const rtt = now - m.t0;
    if (rtt < 0 || rtt > 10_000) return;
    this.rtt = this.rtt == null ? rtt : this.rtt * 0.7 + rtt * 0.3;
    // Server clock → phone clock offset, NTP-style: trust the lowest-RTT sample.
    this.offsets = [...this.offsets.slice(-7), { rtt, offset: m.ts - (m.t0 + rtt / 2) }];
  }

  bestOffset() {
    return this.offsets.reduce((best, s) => (!best || s.rtt < best.rtt ? s : best), null);
  }

  handleAuthError(reason) {
    if (reason === 'bad_token') {
      this.store.remove('token');
      this.info = { ...this.info, authError: 'This PC no longer knows this phone. Pair again with the code on the PC.' };
    } else if (reason === 'bad_code' || reason === 'code_expired') {
      this.info = { ...this.info, authError: reason === 'bad_code' ? "That code didn't match. Check the PC window." : 'That code expired. The PC shows a fresh one.' };
    } else if (reason === 'rate_limited') {
      this.info = { ...this.info, authError: 'Too many tries. Wait a minute, then try again.' };
    } else {
      this.info = { ...this.info, authError: 'Pairing failed.' };
    }
    this.pendingCode = null;
    this.wantStop = true;
    this.close();
    this.setState('unpaired');
  }

  heartbeat() {
    const now = performance.now();
    if (this.ws?.readyState === WebSocket.OPEN && now - this.lastPingAt >= PING_EVERY_MS) this.ping();
    // iOS can keep a socket "open" after Wi-Fi drops; treat silence as death.
    if (now - this.lastMessageAt > DEAD_AFTER_MS && this.ws) {
      this.ws.onclose = null;
      this.close();
      this.onClosed();
    }
  }

  ping() {
    this.lastPingAt = performance.now();
    this.send(msg.ping(++this.pingId, this.lastPingAt));
  }

  sendStats() {
    this.send(msg.stats({ rtt: round(this.rtt), fps: round(this.fps), lat: round(this.latency) }));
  }

  onClosed() {
    clearInterval(this.pingTimer);
    clearInterval(this.statsTimer);
    this.ws = null;
    if (this.wantStop) return;
    const wasConnected = this.state === 'connected';
    if (wasConnected) this.disconnectedAt = Date.now();
    if (!this.canConnect) return this.setState('unpaired');
    this.scheduleRetry(wasConnected);
  }

  scheduleRetry(wasConnected = false) {
    if (this.failingSince == null) this.failingSince = performance.now();
    const failingFor = performance.now() - this.failingSince;
    const delay = reconnectDelay(this.attempt++, failingFor);
    const closed = this.byeReceived;
    this.byeReceived = false;
    this.info = { ...this.info, retryAt: Date.now() + delay, closedByPc: closed || (!wasConnected && Boolean(this.info.closedByPc)) };
    this.setState(this.token ? 'reconnecting' : 'unpaired', { wasConnected, closed });
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  onVisibility() {
    if (document.hidden) {
      this.send(msg.sub({ paused: true }));
    } else {
      this.send(msg.sub({ paused: false }));
      this.retryNow();
    }
  }

  setState(state, extra = {}) {
    const prev = this.state;
    this.state = state;
    this.onState?.(state, prev, { ...this.info, ...extra });
  }
}

function defaultUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

function guessDeviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android phone';
  return 'Browser';
}

const round = (v) => (v == null ? null : Math.round(v));
