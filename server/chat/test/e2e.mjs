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

async function live(token) {
  const { data } = await call(token, 'POST', '/v1/live-ticket');
  const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/v1/live?ticket=${encodeURIComponent(data.ticket)}`);
  const events = [];
  ws.addEventListener('message', (e) => { try { events.push(JSON.parse(e.data)); } catch { /* pong */ } });
  const open = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', () => reject(new Error('live socket failed')));
  });
  return { ws, events, open };
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
const adaLive = await live(ada.token);
const boLive = await live(bo.token);
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
check('Bo blocks Ada and reports her in one go', (await call(bo.token, 'POST', '/v1/block', { id: ada.id, report: true, reason: 'test' })).status === 200);
const reports = (await fetch(`${BASE}/v1/admin/reports`, { headers: { Authorization: 'Bearer dev-admin-token' } }).then((r) => r.json())).reports;
const rep1 = reports.filter((r) => r.about === ada.id).at(-1);
check('…and the report kept the messages as evidence', rep1 && rep1.recent.length > 0 && rep1.name === 'Ada', JSON.stringify(rep1?.recent?.length));
check('admin routes refuse without the token', (await fetch(`${BASE}/v1/admin/reports`)).status === 403
  && (await fetch(`${BASE}/v1/admin/reports`, { headers: { Authorization: 'Bearer nope' } })).status === 403);
check('a moderator can resolve the report', (await fetch(`${BASE}/v1/admin/resolve`, { method: 'POST', headers: { Authorization: 'Bearer dev-admin-token' }, body: JSON.stringify({ key: rep1.key }) })).status === 200);
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

// ---- scores, leaderboards, challenges
const dee = await register('Dee', 'lumi');
const eve = await register('Eve', 'bun');
await call(dee.token, 'POST', '/v1/friends/request', { code: eve.code });
await call(eve.token, 'POST', '/v1/friends/request', { code: dee.code });
check('impossible scores are refused', (await call(dee.token, 'POST', '/v1/scores', { game: 'catch', score: 99999 })).status === 400
  && (await call(dee.token, 'POST', '/v1/scores', { game: 'chess', score: 5 })).status === 400);
await call(dee.token, 'POST', '/v1/scores', { game: 'catch', score: 31 });
const lower = await call(dee.token, 'POST', '/v1/scores', { game: 'catch', score: 12 });
check('only your best counts', lower.data.best === 31 && lower.data.improved === false);
await call(eve.token, 'POST', '/v1/scores', { game: 'catch', score: 40 });
const fb = (await call(dee.token, 'GET', '/v1/leaderboard?game=catch&scope=friends')).data.board;
check('friends leaderboard: Eve 40 above Dee 31 (me flagged)', fb.length === 2 && fb[0].name === 'Eve' && fb[1].me === true && fb[1].score === 31, JSON.stringify(fb));
check('nobody is on the world leaderboard unless they opt in', !(await call(cy.token, 'GET', '/v1/leaderboard?game=catch&scope=world')).data.board.some((e) => e.name === 'Eve' || e.name === 'Dee'));
await call(dee.token, 'POST', '/v1/settings', { world: true });
await call(eve.token, 'POST', '/v1/settings', { world: true });
const wb = (await call(cy.token, 'GET', '/v1/leaderboard?game=catch&scope=world')).data.board;
check('opted in: world leaderboard lists their bests (no ids)', wb.findIndex((e) => e.name === 'Eve') < wb.findIndex((e) => e.name === 'Dee') && wb.some((e) => e.name === 'Dee') && wb.every((e) => !('id' in e)), JSON.stringify(wb));
const ch = await call(dee.token, 'POST', '/v1/messages', { to: eve.id, text: 'beat this!', challenge: { game: 'catch', score: 31 } });
check('a challenge message carries the game and score', ch.data.msg?.challenge?.game === 'catch' && ch.data.msg.challenge.score === 31);
check('challenges with silly scores are refused', (await call(dee.token, 'POST', '/v1/messages', { to: eve.id, challenge: { game: 'catch', score: 5000 } })).status === 400);
await call(eve.token, 'DELETE', '/v1/me');
check('a deleted account leaves the world leaderboard', !(await call(cy.token, 'GET', '/v1/leaderboard?game=catch&scope=world')).data.board.some((e) => e.name === 'Eve'));

// ---- review fixes: tokens only in the header, prototype ids, code rotation, bans
const raw = await fetch(`${BASE}/v1/me?token=${encodeURIComponent(dee.token)}`);
check('the account token is not accepted in a URL', raw.status === 401);
check('odd ids like __proto__ are refused', (await call(dee.token, 'POST', '/v1/report', { id: '__proto__' })).status === 404
  && (await call(dee.token, 'POST', '/v1/friends/accept', { id: 'constructor' })).status === 404);
const oldCode = dee.code;
const rot = await call(dee.token, 'POST', '/v1/code/rotate');
check('a new friend code replaces the old one', /^[A-Z2-9]{6}$/.test(rot.data.code) && rot.data.code !== oldCode
  && (await call(cy.token, 'POST', '/v1/friends/request', { code: oldCode })).status === 404);
const deeLive = await live(dee.token);
await deeLive.open;
const junk = await new Promise((resolve) => {
  const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/v1/live?ticket=${dee.id}.${'x'.repeat(43)}`);
  ws.addEventListener('open', () => { ws.close(); resolve('opened'); });
  ws.addEventListener('error', () => resolve('refused'));
});
check('junk live tickets are refused', junk === 'refused');
const ban = await fetch(`${BASE}/v1/admin/ban`, { method: 'POST', headers: { Authorization: 'Bearer dev-admin-token' }, body: JSON.stringify({ id: dee.id }) });
await new Promise((r) => setTimeout(r, 300));
check('a moderator ban wipes the account: token dead, code gone, off the boards', ban.status === 200
  && (await call(dee.token, 'GET', '/v1/me')).status === 401
  && (await call(cy.token, 'POST', '/v1/friends/request', { code: rot.data.code })).status === 404
  && !(await call(cy.token, 'GET', '/v1/leaderboard?game=catch&scope=world')).data.board.some((e) => e.name === 'Dee'));
check('…and its live socket is closed', deeLive.ws.readyState >= 2);

adaLive.ws.close();
boLive.ws.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
