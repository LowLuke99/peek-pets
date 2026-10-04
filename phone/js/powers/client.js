// Phone side of the helpful powers: keeps the PC's power list, switches powers on/off,
// runs commands (with ids, so each reply finds its promise) and answers nudges.

import { msg } from '../core/protocol.js';
import { initialPowers, powersReduce } from '../core/powers.js';

const COMMAND_TIMEOUT_MS = 70_000; // the PC may wait up to 60 s for you to approve

export class PowersClient {
  /**
   * @param {{link: import('../net/link.js').Link, onChange?: Function, onEvent?: Function, onPending?: Function}} opts
   */
  constructor({ link, onChange, onEvent, onPending }) {
    this.link = link;
    this.onChange = onChange;
    this.onEvent = onEvent;
    this.onPending = onPending;
    this.state = initialPowers();
    this.nextId = 1;
    this.waiting = new Map();
  }

  get connected() {
    return this.link.state === 'connected';
  }

  entry(key) {
    return this.state.byKey[key] ?? null;
  }

  /** Feeds a server message; returns true if it was a power message. */
  handle(m, now = Date.now()) {
    switch (m.t) {
      case 'powers':
      case 'power_state':
        this.state = powersReduce(this.state, m, now);
        this.onChange?.(m.t === 'powers' ? null : m.key);
        return true;
      case 'power':
        this.onEvent?.(m.key, m.ev, m.data ?? {});
        return true;
      case 'cmd_pending':
        if (this.waiting.has(m.id)) this.onPending?.(this.waiting.get(m.id).label);
        return true;
      case 'cmd_result': {
        const w = this.waiting.get(m.id);
        if (!w) return true;
        this.waiting.delete(m.id);
        clearTimeout(w.timer);
        w.resolve({ ok: m.ok, reason: m.reason, data: m.data });
        return true;
      }
      default:
        return false;
    }
  }

  setOn(key, on) {
    if (!this.connected) return false;
    const e = this.entry(key);
    if (e) {
      // Optimistic: the PC confirms with a fresh list.
      this.state = { ...this.state, byKey: { ...this.state.byKey, [key]: { ...e, on } } };
      this.onChange?.(key);
    }
    this.link.send(msg.powerSet(key, on));
    return true;
  }

  /** @returns {Promise<{ok: boolean, reason?: string, data?: object}>} */
  run(power, name, args = {}, label = name) {
    if (!this.connected) return Promise.resolve({ ok: false, reason: 'offline' });
    const id = this.nextId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        resolve({ ok: false, reason: 'timeout' });
      }, COMMAND_TIMEOUT_MS);
      this.waiting.set(id, { resolve, timer, label });
      this.link.send(msg.cmd(id, power, name, args));
    });
  }

  ack(key, action, kind) {
    if (this.connected) this.link.send(msg.powerAck(key, action, kind));
  }

  /** The link dropped: pending commands fail, powers show as inactive until the PC is back. */
  disconnected() {
    for (const [id, w] of this.waiting) {
      clearTimeout(w.timer);
      w.resolve({ ok: false, reason: 'offline' });
      this.waiting.delete(id);
    }
    const byKey = Object.fromEntries(Object.entries(this.state.byKey).map(([k, p]) => [k, { ...p, active: false }]));
    this.state = { ...this.state, byKey };
    this.onChange?.(null);
  }

  /** Uploads a photo to the PC's inbox (POST /api/inbox with the device token). */
  async sendPhoto(file) {
    const token = this.link.token;
    if (!this.connected || !token) return { ok: false, reason: 'offline' };
    try {
      const res = await fetch(this.link.httpBase + '/api/inbox', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      const body = await res.json().catch(() => ({}));
      return { ok: res.ok && body.ok !== false, reason: body.reason ?? (res.ok ? null : `http_${res.status}`), data: body.data };
    } catch {
      return { ok: false, reason: 'network' };
    }
  }
}

/** Friendly text for a command failure. */
export function reasonText(reason) {
  const text = {
    offline: 'Connect to your PC first.',
    timeout: 'The PC didn\'t answer in time.',
    denied: 'Not allowed on the PC.',
    not_allowed: 'This power is switched off on the PC.',
    power_off: 'Switch this power on first.',
    rate_limited: 'Slow down a little, then try again.',
    unknown_command: 'Your PC app needs an update for that.',
    bad_args: 'That didn\'t look right.',
    too_many: 'That\'s the limit for now.',
    not_found: 'Couldn\'t find that on the PC.',
    nothing_busy: 'Nothing is busy on the PC right now.',
    already_watching: 'Already watching that.',
    empty: 'The PC clipboard has no text.',
    no_mic: 'No microphone found on the PC.',
    not_an_image: 'That file isn\'t a photo.',
    busy: 'The PC is busy, try again.',
    network: 'Couldn\'t reach the PC.',
    not_paired: 'This phone isn\'t paired any more.',
    inbox_full: 'The PC inbox is full: tidy it up first.',
    disk_full: 'The PC is too low on disk space for that.',
  };
  return Object.hasOwn(text, reason ?? '') ? text[reason] : 'That didn\'t work.';
}
