// Friends end to end with two phones (Ada and Bo) through the local chat server:
// sign up, add by code, accept, chat, pet emote → the other pet performs, challenge →
// "Beat it!" → reply, leaderboards, block, delete account.
//   (cd server/chat && npm run dev)  then  node friends-test.mjs [appUrl] [chatUrl]
import { chromium, devices } from 'playwright';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const APP = process.argv[2] ?? 'http://localhost:8787/';
const CHAT = process.argv[3] ?? 'http://127.0.0.1:8790';
const OUT = join(import.meta.dirname, 'out', 'friends');
mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const errors = [];
async function phone(name, pet) {
  const page = await (await browser.newContext({ ...devices['iPhone 15'], viewport: { width: 393, height: 852 } })).newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('dialog', (d) => d.accept()); // confirm() for report / block / delete
  await page.addInitScript(({ chat, pet }) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    localStorage.setItem('peekpets.seenPair', 'true');
    localStorage.setItem('peekpets.settings', JSON.stringify({ look: 'classic', pet, backdrop: 'bedroom' }));
    localStorage.setItem('peekpets.chatUrl', JSON.stringify(chat));
  }, { chat: CHAT, pet });
  await page.goto(APP);
  await page.waitForFunction(() => window.peek?.pose);
  const waitFor = (fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
  return { page, waitFor, app: (fn, arg) => page.evaluate(fn, arg) };
}

const ada = await phone('Ada', 'inky');
const bo = await phone('Bo', 'opal');

async function signUp(p, nick) {
  await p.page.click('[data-action="friends"]');
  await p.page.waitForSelector('[data-fr="join"]');
  await p.page.fill('input[aria-label="Nickname"]', nick);
  await p.page.check('.agree input');
  await p.page.click('[data-fr="join"]');
  await p.waitFor(() => document.querySelector('[data-fr="mycode"]')?.textContent.length === 7);
  return (await p.page.textContent('[data-fr="mycode"]')).replace('-', '');
}
const adaCode = await signUp(ada, 'Ada');
await ada.page.screenshot({ path: join(OUT, 'ada-list.png') });
const boCode = await signUp(bo, 'Bo');
check('both sign up with just a nickname and get a friend code', /^[A-Z2-9]{6}$/.test(adaCode) && /^[A-Z2-9]{6}$/.test(boCode), `${adaCode} ${boCode}`);

await ada.page.fill('.fr__add .code-input', boCode.toLowerCase());
await ada.page.click('[data-fr="add"]');
check('Ada adds Bo by code', await ada.waitFor(() => /Request sent to Bo/.test(document.querySelector('#sheetBody').textContent)));
await bo.page.click('#sheetClose');
check('Bo sees a badge on Friends', await bo.waitFor(() => !document.querySelector('#friendsBadge').hidden));
await bo.page.click('[data-action="friends"]');
await bo.page.waitForSelector('[data-fr="accept"]');
await bo.page.click('[data-fr="accept"]');
check('Bo accepts: friends on both sides', await bo.waitFor(() => document.querySelector('[data-fr-friend]') !== null)
  && await ada.waitFor(() => window.peek.friends.data.friends.length === 1));

// ---- chat + emote
await ada.app(() => window.peek.friends.refresh());
await ada.page.click('[data-fr-friend]');
await ada.page.waitForSelector('.chat__input');
await ada.page.fill('.chat__input', 'hi Bo! wanna play?');
await ada.page.click('[data-fr="send"]');
await bo.page.click('#sheetClose');
check('Bo\'s pet says Ada\'s message', await bo.waitFor(() => /Ada: hi Bo!/.test(document.querySelector('#bubble').textContent)));
await ada.page.click('[data-emote="wave"]');
check('Ada sends a wave: Bo\'s pet waves', await bo.waitFor(() => Boolean(window.peek.rig.acts.wave)));
await bo.page.screenshot({ path: join(OUT, 'bo-wave.png') });

// ---- scores, challenge, leaderboards
await ada.app(() => { localStorage.setItem('peekpets.gameBest', JSON.stringify({ catch: 12 })); });
await ada.app(() => window.peek.friends.gameFinished('catch', 12));
await ada.app(() => window.peek.friends.render());
await ada.page.waitForSelector('[data-challenge="catch"]');
await ada.page.click('[data-challenge="catch"]');
await ada.page.screenshot({ path: join(OUT, 'ada-chat.png') });
await bo.page.click('[data-action="friends"]');
await bo.page.waitForSelector('[data-fr-friend]');
await bo.page.click('[data-fr-friend]');
check('Bo gets the challenge with a "Beat it!" button', await bo.waitFor(() => document.querySelector('[data-beat]') !== null));
await bo.page.screenshot({ path: join(OUT, 'bo-chat.png') });
await bo.page.click('[data-beat]');
check('"Beat it!" starts Treat Catch', await bo.waitFor(() => window.peek.games.gameId === 'catch' && window.peek.games.active));
await bo.app(() => { const g = window.peek.games.game; g.state = { ...g.state, score: 20, time: 29.95 }; });
check('Bo beats it: Ada gets the reply challenge', await ada.waitFor(() => (window.peek.friends.threads[window.peek.friends.data.friends[0].id] ?? []).some((m) => m.challenge?.score === 20 && /Beat you! 20 vs 12/.test(m.text))));
await ada.page.click('.chat__top .btn--ghost');
await ada.page.waitForSelector('[data-fr="boards"]');
await ada.page.click('[data-fr="boards"]');
check('friends leaderboard: Bo 20 above Ada 12', await ada.waitFor(() => {
  const rows = [...document.querySelectorAll('.board__row')].map((r) => r.textContent);
  return rows.length === 2 && /Bo/.test(rows[0]) && /20/.test(rows[0]) && /Ada \(you\)/.test(rows[1]);
}));
await ada.page.screenshot({ path: join(OUT, 'ada-boards.png') });
await ada.page.click('.seg button[data-v="world"]');
check('world leaderboard loads', await ada.waitFor(() => document.querySelectorAll('.board__row').length >= 2));

// ---- block + delete
await bo.page.click('[data-action="friends"]');
await bo.page.waitForSelector('[data-fr-friend]');
await bo.page.click('[data-fr-friend]');
await bo.page.waitForSelector('[data-fr="block"]');
await bo.page.click('[data-fr="block"]');
check('Bo blocks Ada: she\'s gone from his list', await bo.waitFor(() => window.peek.friends.data.friends.length === 0 && /blocked/.test(document.querySelector('#sheetBody').textContent)));
check('…and from Ada\'s', await ada.waitFor(async () => { await window.peek.friends.refresh(); return window.peek.friends.data.friends.length === 0; }));
await ada.app(() => window.peek.friends.go({ name: 'settings' }));
await ada.page.click('[data-fr="delete"]');
check('Ada deletes her chat account', await ada.waitFor(() => !localStorage.getItem('peekpets.chat') && document.querySelector('[data-fr="join"]') !== null));

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
