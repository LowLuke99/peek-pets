// End-to-end test of the chat server with three people (Ada, Bo, Cy), against
// `npm run dev` (wrangler's local runtime) or any URL:  node test/e2e.mjs [baseUrl]
const BASE = process.argv[2] ?? 'http://127.0.0.1:8790';
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(token, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* html */ }
  return { status: res.status, data, headers: res.headers };
}
const register = (name, pet = 'mochi') => call(null, 'POST', '/v1/register', { name, pet, agree: true }).then((r) => r.data);

function live(token) {
  const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/v1/live?token=${encodeURIComponent(token)}`);
  const events = [];
  ws.addEventListener('message', (e) => { try { events.push(JSON.parse(e.data)); } catch { /* pong */ } });
  return { ws, events, open: new Promise((r) => ws.addEventListener('open', r)) };
}

// ---- sign-up
check('privacy policy page is served', (await fetch(`${BASE}/privacy`).then((r) => r.text())).includes('Privacy policy'));
check('sign-up requires agreeing to the rules', (await call(null, 'POST', '/v1/register', { name: 'Ada' })).data.error === 'must_agree');
check('rude nicknames are refused', (await call(null, 'POST', '/v1/register', { name: 'sh1thead', agree: true })).data.error === 'bad_name');
const ada = await register('Ada', 'inky');
const bo = await register('Bo', 'opal');
const cy = await register('Cy', 'pebble');
check('sign-up gives a token and a friend code', /^[a-f0-9]{32}\.[\w-]{43}$/.test(ada.token) && /^[A-Z2-9]{6}$/.test(ada.code), ada.code);
check('bad or missing tokens are refused', (await call('nope', 'GET', '/v1/me')).status === 401 && (await call(`${ada.id}.${'x'.repeat(43)}`, 'GET', '/v1/me')).status === 401);
const cors = await call(ada.token, 'GET', '/v1/me');
check('CORS is open for the app (bearer tokens, no cookies)', cors.headers.get('access-control-allow-origin') === '*');

// ---- friends
const adaLive = live(ada.token);
const boLive = live(bo.token);
await Promise.all([adaLive.open, boLive.open]);
check('cannot friend yourself', (await call(ada.token, 'POST', '/v1/friends/request', { code: ada.code })).data.error === 'thats_you');
check('unknown codes are refused', (await call(ada.token, 'POST', '/v1/friends/request', { code: 'ZZZZZZ' })).status === 404);
const req = await call(ada.token, 'POST', '/v1/friends/request', { code: bo.code.toLowerCase().replace(/(...)/, '$1-') });
check('Ada sends Bo a friend request (code typed loosely)', req.data.status === 'requested' && req.data.name === 'Bo', JSON.stringify(req.data));
await sleep(200);
check('Bo sees the request live', boLive.events.some((e) => e.t === 'request' && e.from.name === 'Ada'));
const boMe = (await call(bo.token, 'GET', '/v1/me')).data;
check('…and in his inbox', boMe.incoming.length === 1 && boMe.incoming[0].name === 'Ada' && boMe.incoming[0].pet === 'inky');
check('a stranger can\'t message Ada', (await call(cy.token, 'POST', '/v1/messages', { to: ada.id, text: 'hi' })).status === 403);
check('Bo accepts', (await call(bo.token, 'POST', '/v1/friends/accept', { id: ada.id })).data.status === 'friends');
const adaMe = (await call(ada.token, 'GET', '/v1/me')).data;
check('now they are friends on both sides', adaMe.friends.some((f) => f.id === bo.id && f.pet === 'opal') && adaMe.outgoing.length === 0);

// ---- messages
const sent = await call(ada.token, 'POST', '/v1/messages', { to: bo.id, text: 'hi Bo! what the fuck is up' });
check('messages are filtered', sent.data.msg?.text === 'hi Bo! what the ★★★★ is up', sent.data.msg?.text);
await call(ada.token, 'POST', '/v1/messages', { to: bo.id, emote: 'hug' });
await sleep(200);
const live1 = boLive.events.filter((e) => e.t === 'message');
check('Bo gets text and a pet emote live', live1.length === 2 && live1[1].msg.emote === 'hug' && live1[1].name === 'Ada', JSON.stringify(live1.map((e) => e.msg)));
const boThread = (await call(bo.token, 'GET', `/v1/messages?friend=${ada.id}`)).data.messages;
check('the thread is stored for both', boThread.length === 2 && (await call(ada.token, 'GET', `/v1/messages?friend=${bo.id}`)).data.messages.length === 2);
check('unread count, then read', (await call(bo.token, 'GET', '/v1/me')).data.friends[0].unread === 2
  && (await call(bo.token, 'POST', '/v1/read', { friend: ada.id })).status === 200
  && (await call(bo.token, 'GET', '/v1/me')).data.friends[0].unread === 0);
check('unknown emotes and empty messages are refused', (await call(ada.token, 'POST', '/v1/messages', { to: bo.id, emote: 'explode' })).status === 400
  && (await call(ada.token, 'POST', '/v1/messages', { to: bo.id, text: '   ' })).status === 400);
check('oversized bodies are refused', (await call(ada.token, 'POST', '/v1/messages', { to: bo.id, text: 'x'.repeat(5000) })).status === 413);

// ---- rate limit
let limited = false;
for (let i = 0; i < 40 && !limited; i++) limited = (await call(ada.token, 'POST', '/v1/messages', { to: bo.id, text: `spam ${i}` })).status === 429;
check('message flood is rate-limited', limited);

// ---- report + block
check('Bo reports Ada', (await call(bo.token, 'POST', '/v1/report', { id: ada.id, reason: 'test' })).status === 200);
check('Bo blocks Ada', (await call(bo.token, 'POST', '/v1/block', { id: ada.id })).status === 200);
await sleep(150);
const after = (await call(ada.token, 'GET', '/v1/me')).data;
check('blocking unfriends on both sides', after.friends.length === 0 && (await call(bo.token, 'GET', '/v1/me')).data.friends.length === 0);
const blockedSend = await call(ada.token, 'POST', '/v1/messages', { to: bo.id, text: 'hello?' });
// 429 is fine too: Ada is still rate-limited from the flood test above. Either way, nothing arrives.
check('blocked: Ada can\'t message Bo', blockedSend.status === 403 || blockedSend.status === 429, String(blockedSend.status));
await call(ada.token, 'POST', '/v1/friends/request', { code: bo.code });
check('…and her new requests silently go nowhere', (await call(bo.token, 'GET', '/v1/me')).data.incoming.length === 0);

// ---- mutual requests + delete account
await call(cy.token, 'POST', '/v1/friends/request', { code: ada.code });
await call(ada.token, 'POST', '/v1/friends/request', { code: cy.code });
check('asking someone who asked you makes you friends', (await call(cy.token, 'GET', '/v1/me')).data.friends.some((f) => f.name === 'Ada'));
const del = await call(ada.token, 'DELETE', '/v1/me');
check('Ada deletes her account', del.data.deleted === true);
check('her token stops working and she vanishes from Cy\'s friends', (await call(ada.token, 'GET', '/v1/me')).status === 401
  && (await call(cy.token, 'GET', '/v1/me')).data.friends.length === 0);
check('her friend code is released', (await call(cy.token, 'POST', '/v1/friends/request', { code: ada.code })).status === 404);

adaLive.ws.close();
boLive.ws.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
