// Peek Pets friends & chat: a Cloudflare Worker in front of two kinds of Durable Object:
//   User      one per person: profile, friends, requests, blocks, message threads, live sockets
//   Directory one in total: friend code → user id, sign-up rate limits, reports
// No email, no phone number, no password: the app gets a random token at sign-up.
// Friends only (swap 6-letter codes); filtered text + pet emotes; report & block;
// messages expire after 30 days; DELETE /v1/me erases the account.

import { cleanName } from '../../../phone/js/core/chatRules.js';
import { privacyPage, termsPage, supportPage } from './pages.js';
import { randomId, randomSecret, sha256 } from './crypto.js';
export { User } from './user.js';
export { Directory } from './directory.js';

const CORS = {
  'Access-Control-Allow-Origin': '*', // bearer tokens only, no cookies: any origin is fine
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};
const MAX_BODY = 4096;

export const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
const fail = (status, error) => json({ error }, status);

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

async function route(request, env, url) {
  const { pathname } = url;
  if (request.method === 'GET') {
    if (pathname === '/' || pathname === '/health') return json({ ok: true, service: 'peekpets-chat', version: 1 });
    if (pathname === '/privacy') return html(privacyPage(env));
    if (pathname === '/terms') return html(termsPage(env));
    if (pathname === '/support') return html(supportPage(env));
  }
  if (pathname === '/v1/register' && request.method === 'POST') return register(request, env);
  if (pathname === '/v1/admin/reports' && request.method === 'GET') {
    // Moderators only: set the secret once with `npx wrangler secret put ADMIN_TOKEN`.
    const dir = env.DIRECTORY.get(env.DIRECTORY.idFromName('main'));
    const res = await dir.fetch(new Request('https://dir/reports', { headers: { 'X-Admin': (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '') } }));
    return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
  }

  // Everything else needs a token: "Authorization: Bearer <id>.<secret>" (or ?token= for WebSockets).
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '') || url.searchParams.get('token') || '';
  const [id, secret] = token.split('.');
  if (!/^[a-f0-9]{32}$/.test(id ?? '') || !/^[A-Za-z0-9_-]{43}$/.test(secret ?? '')) return fail(401, 'unauthorized');
  const user = env.USERS.get(env.USERS.idFromName(id));
  const headers = new Headers({ 'X-User': id, 'X-Secret-Hash': await sha256(secret) });

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
    'GET /v1/live': '/live',
    'POST /v1/scores': '/scores',
    'GET /v1/leaderboard': '/leaderboard',
  };
  const target = ROUTES[`${request.method} ${pathname}`];
  if (!target) return fail(404, 'not_found');
  if (target === '/live') {
    if (request.headers.get('Upgrade') !== 'websocket') return fail(426, 'websocket_expected');
    headers.set('Upgrade', 'websocket');
    return user.fetch(new Request(`https://user${target}`, { headers }));
  }
  let body;
  if (request.method === 'POST') {
    const text = await request.text();
    if (text.length > MAX_BODY) return fail(413, 'too_large');
    body = text || '{}';
    headers.set('Content-Type', 'application/json');
  }
  const res = await user.fetch(new Request(`https://user${target}${url.search}`, { method: request.method, headers, body }));
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
  return out;
}

async function register(request, env) {
  const text = await request.text();
  if (text.length > MAX_BODY) return fail(413, 'too_large');
  let body;
  try { body = JSON.parse(text || '{}'); } catch { return fail(400, 'bad_json'); }
  const name = cleanName(body.name);
  if (!name) return fail(400, 'bad_name');
  if (body.agree !== true) return fail(400, 'must_agree');
  const pet = typeof body.pet === 'string' && /^[a-z]{2,12}$/.test(body.pet) ? body.pet : 'mochi';
  const dir = env.DIRECTORY.get(env.DIRECTORY.idFromName('main'));
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  const gate = await dir.fetch(new Request('https://dir/signup', { method: 'POST', body: JSON.stringify({ ip }) }));
  if (!gate.ok) return fail(429, 'too_many_signups');
  const id = randomId();
  const secret = randomSecret();
  const claim = await dir.fetch(new Request('https://dir/claim', { method: 'POST', body: JSON.stringify({ id }) }));
  const { code } = await claim.json();
  const user = env.USERS.get(env.USERS.idFromName(id));
  await user.fetch(new Request('https://user/init', { method: 'POST', body: JSON.stringify({ id, name, pet, code, secretHash: await sha256(secret) }) }));
  return json({ id, token: `${id}.${secret}`, code, name, pet });
}

function html(body) {
  return new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600', ...CORS } });
}
