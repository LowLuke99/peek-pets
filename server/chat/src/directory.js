// The one Directory: friend code → user id, a per-IP sign-up limit (10/day unless
// SIGNUPS_PER_IP_PER_DAY says otherwise), the world leaderboards (top 50 per game) and
// the report inbox moderators review. Only reachable from the Worker / User objects.

import { DurableObject } from 'cloudflare:workers';
import { makeCode, isFriendCode, GAME_IDS, validScore } from '../../../phone/js/core/chatRules.js';
import { randomBytes } from './crypto.js';

const MAX_REPORTS = 2000;
const BOARD_MAX = 50;
const DAY = 86_400_000;
const ok = (data = {}) => Response.json({ ok: true, ...data });
const no = (status, error) => Response.json({ error }, { status });

export class Directory extends DurableObject {
  async fetch(request) {
    const { pathname, searchParams } = new URL(request.url);
    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
    switch (pathname) {
      case '/signup': return this.signup(body.ip);
      case '/claim': return this.claim(body.id);
      case '/lookup': return this.lookup(searchParams.get('code'));
      case '/forget': return this.forget(body);
      case '/score': return this.score(body);
      case '/top': return ok({ board: GAME_IDS.includes(searchParams.get('game')) ? ((await this.ctx.storage.get(`board:${searchParams.get('game')}`)) ?? []) : [] });
      case '/report': return this.report(body);
      case '/reports': return this.reports(request);
      default: return no(404, 'not_found');
    }
  }

  async signup(ip) {
    const key = `ip:${ip}`;
    const now = Date.now();
    const rec = (await this.ctx.storage.get(key)) ?? { day: now, n: 0 };
    const fresh = now - rec.day > DAY ? { day: now, n: 0 } : rec;
    const limit = Number(this.env.SIGNUPS_PER_IP_PER_DAY) || 10;
    if (fresh.n >= limit) return no(429, 'too_many_signups');
    await this.ctx.storage.put(key, { ...fresh, n: fresh.n + 1 });
    return ok();
  }

  async claim(id) {
    for (let i = 0; i < 20; i++) {
      const code = makeCode(randomBytes);
      if (!(await this.ctx.storage.get(`code:${code}`))) {
        await this.ctx.storage.put(`code:${code}`, id);
        return ok({ code });
      }
    }
    return no(503, 'no_code');
  }

  async lookup(code) {
    if (!isFriendCode(code ?? '')) return no(400, 'bad_code');
    const id = await this.ctx.storage.get(`code:${code}`);
    return id ? ok({ id }) : no(404, 'unknown_code');
  }

  /** Keeps the top 50 bests per game (one row per person). */
  async score({ id, name, pet, game, score }) {
    if (!validScore(game, score)) return no(400, 'bad_score');
    const key = `board:${game}`;
    const board = ((await this.ctx.storage.get(key)) ?? []).filter((e) => e.id !== id);
    const next = [...board, { id, name, pet, score }].sort((a, b) => b.score - a.score).slice(0, BOARD_MAX);
    await this.ctx.storage.put(key, next);
    return ok();
  }

  /** A deleted account: free its code and take it off every leaderboard. */
  async forget({ code, id }) {
    if (code) await this.ctx.storage.delete(`code:${code}`);
    for (const game of GAME_IDS) {
      const key = `board:${game}`;
      const board = (await this.ctx.storage.get(key)) ?? [];
      if (board.some((e) => e.id === id)) await this.ctx.storage.put(key, board.filter((e) => e.id !== id));
    }
    return ok();
  }

  async report(r) {
    const list = (await this.ctx.storage.get('reports')) ?? [];
    const next = [...list, { ...r, at: Date.now() }].slice(-MAX_REPORTS);
    await this.ctx.storage.put('reports', next);
    return ok();
  }

  /** Moderator view: GET /v1/admin/reports with "Authorization: Bearer $ADMIN_TOKEN" (set as a secret). */
  async reports(request) {
    const token = this.env.ADMIN_TOKEN;
    if (!token || request.headers.get('X-Admin') !== token) return no(403, 'forbidden');
    return ok({ reports: (await this.ctx.storage.get('reports')) ?? [] });
  }
}
