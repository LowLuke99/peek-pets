// The one Directory: friend code → user id, a per-IP sign-up limit, and the report
// inbox (what moderators review). Only reachable from the Worker / User objects.

import { DurableObject } from 'cloudflare:workers';
import { makeCode, isFriendCode } from '../../../phone/js/core/chatRules.js';
import { randomBytes } from './crypto.js';

const SIGNUPS_PER_IP_PER_DAY = 10;
const MAX_REPORTS = 2000;
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
      case '/forget': await this.ctx.storage.delete(`code:${body.code}`); return ok();
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
    if (fresh.n >= SIGNUPS_PER_IP_PER_DAY) return no(429, 'too_many_signups');
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
