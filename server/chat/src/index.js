// Peek Pets friends & chat: a Cloudflare Worker in front of two kinds of Durable Object:
//   User      one per person: profile, friends, requests, blocks, message threads, live sockets
//   Directory one in total: friend codes, sign-up limits, world leaderboards, reports
// No email, no phone number, no password: the app gets a random token at sign-up.
// Friends only (swap 6-letter codes); filtered text + pet emotes; report & block;
// messages expire after 30 days; DELETE /v1/me erases the account; moderators can ban.
// Every request passes a rate limiter (per network, and per account when signed in).

import { cleanName } from '../../../phone/js/core/chatRules.js';
import { privacyPage, termsPage, supportPage } from './pages.js';
import { randomId, randomSecret, sha256, sameHash } from './crypto.js';
export { User } from './user.js';
export { Directory } from './directory.js';

const CORS = {
  'Access-Control-Allow-Origin': '*', // bearer tokens only, no cookies: any origin is fine
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};
const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=3600',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
};
const MAX_BODY = 4096;
const ID = /^[a-f0-9]{32}$/;
const SECRET = /^[A-Za-z0-9_-]{43}$/;

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
const fail = (status, error) => json({ error }, status);

const ROUTES = {
  'GET /v1/me': '/me',
  'DELETE /v1/me': '/delete',
  'POST /v1/friends/request': '/request',
  'POST /v1/friends/accept': '/accept',
  'POST /v1/friends/decline': '/decline',
  'POST /v1/friends/remove': '/remove',
  'POST /v1/block': '/block',
  'POST /v1/report': '/report',
  'GET /v1/messages': '/messages',
  'POST /v1/messages': '/send',
  'POST /v1/read': '/read',
  'POST /v1/scores': '/scores',
  'GET /v1/leaderboard': '/leaderboard',
  'POST /v1/settings': '/settings',
  'POST /v1/code/rotate': '/rotate',
  'POST /v1/live-ticket': '/ticket',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      return await route(request, env, url);
    } catch (err) {
      console.error('unhandled', err?.stack ?? err);
      return fail(500, 'server_error');
    }
  },
};

/** Cloudflare's rate-limiting binding (wrangler.toml [[ratelimits]]); allows all if absent. */
async function limited(env, key) {
  if (!env.LIMITER || env.RATE_LIMIT_OFF === '1') return false; // off only for local test runs
  const { success } = await env.LIMITER.limit({ key });
  return !success;
}

async function readBody(request) {
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY) return { tooLarge: true };
  const text = await request.text();
  if (text.length > MAX_BODY) return { tooLarge: true };
  return { text: text || '{}' };
}

async function route(request, env, url) {
  const { pathname } = url;
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  if (request.method === 'GET') {
    if (pathname === '/' || pathname === '/health') return json({ ok: true, service: 'peekpets-chat', version: 2 });
    if (pathname === '/privacy') return html(privacyPage(env));
    if (pathname === '/terms') return html(termsPage(env));
    if (pathname === '/support') return html(supportPage(env));
  }
  if (await limited(env, `ip:${ip}`)) return fail(429, 'slow_down');
  if (pathname === '/v1/register' && request.method === 'POST') return register(request, env, ip);
  if (pathname.startsWith('/v1/admin/')) return admin(request, env, pathname);

  // The live socket: a single-use ticket from POST /v1/live-ticket (never the account token).
  if (pathname === '/v1/live' && request.method === 'GET') {
    if (request.headers.get('Upgrade') !== 'websocket') return fail(426, 'websocket_expected');
    const [id, ticket] = String(url.searchParams.get('ticket') ?? '').split('.');
    if (!ID.test(id ?? '') || !SECRET.test(ticket ?? '')) return fail(401, 'unauthorized');
    const user = env.USERS.get(env.USERS.idFromName(id));
    return user.fetch(new Request('https://user/live', { headers: { Upgrade: 'websocket', 'X-User': id, 'X-Ticket-Hash': await sha256(ticket) } }));
  }

  // Everything else: "Authorization: Bearer <id>.<secret>".
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const [id, secret] = token.split('.');
  if (!ID.test(id ?? '') || !SECRET.test(secret ?? '')) return fail(401, 'unauthorized');
  const target = ROUTES[`${request.method} ${pathname}`];
  if (!target) return fail(404, 'not_found');
  if (await limited(env, `user:${id}`)) return fail(429, 'slow_down');
  const headers = new Headers({ 'X-User': id, 'X-Secret-Hash': await sha256(secret) });
  let body;
  if (request.method === 'POST') {
    const b = await readBody(request);
    if (b.tooLarge) return fail(413, 'too_large');
    body = b.text;
    headers.set('Content-Type', 'application/json');
  }
  const user = env.USERS.get(env.USERS.idFromName(id));
  const res = await user.fetch(new Request(`https://user${target}${url.search}`, { method: request.method, headers, body }));
  return withCors(res);
}

async function register(request, env, ip) {
  const b = await readBody(request);
  if (b.tooLarge) return fail(413, 'too_large');
  let body;
  try { body = JSON.parse(b.text); } catch { return fail(400, 'bad_json'); }
  const name = cleanName(body.name);
  if (!name) return fail(400, 'bad_name');
  if (body.agree !== true) return fail(400, 'must_agree');
  const pet = typeof body.pet === 'string' && /^[a-z]{2,12}$/.test(body.pet) ? body.pet : 'mochi';
  const dir = env.DIRECTORY.get(env.DIRECTORY.idFromName('main'));
  const gate = await dir.fetch(new Request('https://dir/signup', { method: 'POST', body: JSON.stringify({ ip }) }));
  if (!gate.ok) return fail(429, 'too_many_signups');
  const id = randomId();
  const secret = randomSecret();
  const claim = await dir.fetch(new Request('https://dir/claim', { method: 'POST', body: JSON.stringify({ id }) }));
  if (!claim.ok) return fail(503, 'try_again');
  const { code } = await claim.json();
  const user = env.USERS.get(env.USERS.idFromName(id));
  await user.fetch(new Request('https://user/init', { method: 'POST', body: JSON.stringify({ id, name, pet, code, secretHash: await sha256(secret) }) }));
  return json({ id, token: `${id}.${secret}`, code, name, pet });
}

/**
 * Moderation (ADMIN_TOKEN secret: `npx wrangler secret put ADMIN_TOKEN`), all with
 * "Authorization: Bearer <ADMIN_TOKEN>":
 *   GET  /v1/admin/reports            open reports (with the recent messages)
 *   POST /v1/admin/resolve {key}      close a report
 *   POST /v1/admin/ban {id}           wipe an account, free its code, leave a tombstone
 */
async function admin(request, env, pathname) {
  const given = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!env.ADMIN_TOKEN || !given || !sameHash(await sha256(given), await sha256(env.ADMIN_TOKEN))) return fail(403, 'forbidden');
  const dir = env.DIRECTORY.get(env.DIRECTORY.idFromName('main'));
  if (pathname === '/v1/admin/reports' && request.method === 'GET') return withCors(await dir.fetch(new Request('https://dir/reports')));
  const b = await readBody(request);
  if (b.tooLarge) return fail(413, 'too_large');
  let body;
  try { body = JSON.parse(b.text); } catch { return fail(400, 'bad_json'); }
  if (pathname === '/v1/admin/resolve' && request.method === 'POST') {
    return withCors(await dir.fetch(new Request('https://dir/resolve', { method: 'POST', body: JSON.stringify({ key: body.key }) })));
  }
  if (pathname === '/v1/admin/ban' && request.method === 'POST') {
    if (!ID.test(String(body.id))) return fail(400, 'bad_id');
    const user = env.USERS.get(env.USERS.idFromName(body.id));
    return withCors(await user.fetch(new Request('https://user/x/ban', { method: 'POST', body: JSON.stringify({ from: body.id }) })));
  }
  return fail(404, 'not_found');
}

function withCors(res) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
  return out;
}

function html(body) {
  return new Response(body, { headers: { ...PAGE_HEADERS, ...CORS } });
}
