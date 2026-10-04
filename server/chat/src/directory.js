// The one Directory: friend code → user id, the sign-up limit, the world leaderboards
// (top 50 per game, opt-in only) and the report inbox moderators work through.
// Only reachable from the Worker / User objects.
//   Reports: one storage key each (no size ceiling), kept 90 days, optional instant
//   alert to REPORT_WEBHOOK (e.g. a Discord/Slack webhook) so they're seen within 24 h.
//   Sign-ups: at most SIGNUPS_PER_IP_PER_DAY (default 20) per network per day; the
//   address is only kept as a salted hash for that day, then deleted.

import { DurableObject } from 'cloudflare:workers';
import { makeCode, isFriendCode, GAME_IDS, validScore } from '../../../phone/js/core/chatRules.js';
import { randomBytes, randomId, sha256 } from './crypto.js';
import { BOT_ID, BOT_CODE } from './bot.js';

const BOARD_MAX = 50;
const REPORT_KEEP_MS = 90 * 86_400_000;
const ok = (data = {}) => Response.json({ ok: true, ...data });
const no = (status, error) => Response.json({ error }, { status });
const today = () => new Date().toISOString().slice(0, 10);

export class Directory extends DurableObject {
  async fetch(request) {
    const { pathname, searchParams } = new URL(request.url);
    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
    switch (pathname) {
      case '/signup': return this.signup(body.ip);
      case '/claim': return this.claim(body.id);
      case '/lookup': return this.lookup(searchParams.get('code'));
      case '/forget': return this.forget(body);
      case '/unlist': return this.unlist(body.id);
      case '/score': return this.score(body);
      case '/top': return ok({ board: GAME_IDS.includes(searchParams.get('game')) ? ((await this.ctx.storage.get(`board:${searchParams.get('game')}`)) ?? []) : [] });
      case '/report': return this.report(body);
      case '/reports': return this.reports();
      case '/resolve': await this.ctx.storage.delete(`report:${String(body.key ?? '')}`); return ok();
      default: return no(404, 'not_found');
    }
  }

  async signup(ip) {
    // IPv6: count the /64 (a home network), not single addresses that rotate.
    const net = String(ip ?? 'unknown').includes(':') ? String(ip).split(':').slice(0, 4).join(':') : String(ip ?? 'unknown');
    const day = today();
    let salt = await this.ctx.storage.get(`salt:${day}`);
    if (!salt) {
      // New day: fresh salt, and yesterday's counters are deleted.
      for (const key of (await this.ctx.storage.list({ prefix: 'ip:' })).keys()) await this.ctx.storage.delete(key);
      for (const key of (await this.ctx.storage.list({ prefix: 'salt:' })).keys()) await this.ctx.storage.delete(key);
      salt = randomId();
      await this.ctx.storage.put(`salt:${day}`, salt);
    }
    const key = `ip:${await sha256(`${salt}:${net}`)}`;
    const n = (await this.ctx.storage.get(key)) ?? 0;
    if (n >= (Number(this.env.SIGNUPS_PER_IP_PER_DAY) || 20)) return no(429, 'too_many_signups');
    await this.ctx.storage.put(key, n + 1);
    return ok();
  }

  async claim(id) {
    for (let i = 0; i < 20; i++) {
      const code = makeCode(randomBytes);
      if (code !== BOT_CODE && !(await this.ctx.storage.get(`code:${code}`))) {
        await this.ctx.storage.put(`code:${code}`, id);
        return ok({ code });
      }
    }
    return no(503, 'no_code');
  }

  async lookup(code) {
    if (!isFriendCode(code ?? '')) return no(400, 'bad_code');
    if (code === BOT_CODE) return ok({ id: BOT_ID });
    const id = await this.ctx.storage.get(`code:${code}`);
    return id ? ok({ id }) : no(404, 'unknown_code');
  }

  /** Keeps the top 50 bests per game (one row per person). */
  async score({ id, name, pet, game, score }) {
    if (!validScore(game, score) || (await this.ctx.storage.get(`gone:${id}`))) return no(400, 'bad_score');
    const key = `board:${game}`;
    const board = ((await this.ctx.storage.get(key)) ?? []).filter((e) => e.id !== id);
    const next = [...board, { id, name, pet, score }].sort((a, b) => b.score - a.score).slice(0, BOARD_MAX);
    await this.ctx.storage.put(key, next);
    return ok();
  }

  async unlist(id) {
    for (const game of GAME_IDS) {
      const key = `board:${game}`;
      const board = (await this.ctx.storage.get(key)) ?? [];
      if (board.some((e) => e.id === id)) await this.ctx.storage.put(key, board.filter((e) => e.id !== id));
    }
    return ok();
  }

  /** A deleted or banned account: free its code and take it off every leaderboard. */
  async forget({ code, id }) {
    if (code) await this.ctx.storage.delete(`code:${code}`);
    if (id) {
      await this.unlist(id);
      await this.ctx.storage.put(`gone:${id}`, Date.now()); // a score racing the delete can't re-add it
    }
    return ok();
  }

  async report(r) {
    const key = `${Date.now()}-${randomId().slice(0, 8)}`;
    await this.ctx.storage.put(`report:${key}`, { ...r, key, at: Date.now() });
    const hook = this.env.REPORT_WEBHOOK;
    if (hook) {
      const text = `Peek Pets report ${key}: ${String(r.byName ?? '?').slice(0, 20)} reported ${String(r.name ?? '?').slice(0, 20)} (${String(r.reason ?? '').slice(0, 100)}). Review: GET /v1/admin/reports, then ban or resolve.`;
      await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: text, text }) }).catch(() => {});
    }
    return ok({ key });
  }

  /** Open reports, oldest first; anything past 90 days is dropped. */
  async reports() {
    const cutoff = Date.now() - REPORT_KEEP_MS;
    const out = [];
    for (const [key, value] of await this.ctx.storage.list({ prefix: 'report:' })) {
      if (value.at < cutoff) await this.ctx.storage.delete(key);
      else out.push(value);
    }
    return ok({ reports: out });
  }
}
