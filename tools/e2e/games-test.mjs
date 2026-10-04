// Built-in games end to end: Play menu, Treat Catch (drag to move, catching, round end,
// best score), Cup Shuffle (peeking pet, right pick → next round, wrong pick → results).
//   node games-test.mjs [baseUrl]
import { chromium, devices } from 'playwright';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:8787/';
const OUT = join(import.meta.dirname, 'out', 'games');
mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const page = await (await browser.newContext({ ...devices['iPhone 15'], viewport: { width: 393, height: 852 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => {
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  localStorage.clear();
  localStorage.setItem('peekpets.seenPair', 'true');
  localStorage.setItem('peekpets.settings', JSON.stringify({ look: 'classic', backdrop: 'candy' }));
});
await page.goto(base);
await page.waitForFunction(() => window.peek?.pose);
const app = (fn, arg) => page.evaluate(fn, arg);
const waitFor = (fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);

// ---- menu
await page.click('[data-action="play"]');
check('Play opens the games menu (ball + 3 games)', (await page.locator('#playbar .snack').count()) === 4);
await page.screenshot({ path: join(OUT, 'menu.png') });

// ---- Treat Catch
await page.click('[data-choice="catch"]');
check('Treat Catch starts: HUD up, dock hidden', await app(() => window.peek.games.active && !document.querySelector('#gamehud').hidden && document.documentElement.classList.contains('in-game')));
const box = await app(() => ({ w: innerWidth, h: innerHeight }));
await page.mouse.move(box.w / 2, box.h * 0.6);
await page.mouse.down();
await page.mouse.move(box.w * 0.85, box.h * 0.6, { steps: 5 });
await waitFor(() => window.peek.games.game.state.petX > 0.3);
check('dragging slides the pet', await app(() => window.peek.games.game.state.petX > 0.3));
await page.mouse.up();
await waitFor(() => window.peek.games.game.state.items.length >= 2);
await page.screenshot({ path: join(OUT, 'catch.png') });
check('treats rain down and the eyes follow them', await app(() => window.peek.games.game.state.items.length > 0 && window.peek.games.lookPoint() !== null));
// Drop a treat right onto the pet to prove catching works in the real loop.
await app(() => { const g = window.peek.games.game; g.state = { ...g.state, items: [...g.state.items, { id: 999, kind: 'star', x: g.state.petX, y: -0.7, vy: 1.2 }] }; });
await waitFor(() => window.peek.games.game.state.score >= 3);
check('catching a star scores 3', await app(() => window.peek.games.game.state.score >= 3));
await app(() => { const g = window.peek.games.game; g.state = { ...g.state, time: 29.9 }; });
await waitFor(() => !document.querySelector('#gameover').hidden);
const over = await app(() => ({ text: document.querySelector('#gameover').textContent, best: JSON.parse(localStorage.getItem('peekpets.gameBest')).catch, active: window.peek.games.active }));
check('round ends with results, coins + XP, and a saved best', !over.active && /points/.test(over.text) && /🪙/.test(over.text) && /XP/.test(over.text) && over.best >= 3, JSON.stringify(over));
await page.screenshot({ path: join(OUT, 'catch-over.png') });

// ---- Cup Shuffle
await page.click('[data-game-again="catch"]');
check('Play again restarts', await app(() => window.peek.games.active && window.peek.games.gameId === 'catch'));
await page.click('#gameQuit');
check('quit leaves the game', await app(() => !window.peek.games.active && !document.documentElement.classList.contains('in-game')));
await app(() => window.peek.games.start('cups'));
const shown = await waitFor(() => window.peek.games.inset > 0 && window.peek.games.game.cups()[0].lift > 0.3);
await page.screenshot({ path: join(OUT, 'cups-show.png') });
check('cups: the pet makes room (lifted) and shows the treat', shown);
await waitFor(() => window.peek.games.game.t > window.peek.games.game.round.showFor + 0.4);
const peek = await app(() => { const g = window.peek.games.game; const lp = g.lookPoint(); const c = g.cups()[g.round.treatCup]; return { lp, cx: c.x * g.xScale }; });
check('round 1: the pet peeks at the right cup', peek.lp && Math.abs(peek.lp.x - peek.cx) < 1e-6, JSON.stringify(peek));
await page.screenshot({ path: join(OUT, 'cups-shuffle.png') });
await waitFor(() => { const g = window.peek.games.game; return g.t > g.round.showFor + g.round.swaps.length * g.round.swapTime; }, null, 15000);
// Tap the right cup on screen.
const right = await app(() => {
  const g = window.peek.games.game, r = window.peek.renderer;
  const slot = g.cups()[g.round.treatCup].slot;
  return r.toScreen(g.cups().find((c) => c.slot === slot).x * g.xScale, 0.0);
});
await page.mouse.click(right.x, right.y);
check('tapping the right cup wins the round', await app(() => window.peek.games.game.correct === true));
await page.screenshot({ path: join(OUT, 'cups-found.png') });
await waitFor(() => window.peek.games.game?.level === 2);
check('next round is level 2', await app(() => window.peek.games.game?.level === 2));
// Wrong pick ends it.
await waitFor(() => { const g = window.peek.games.game; return g.t > g.round.showFor + g.round.swaps.length * g.round.swapTime; }, null, 15000);
await app(() => { const g = window.peek.games.game; const slot = g.cups()[g.round.treatCup].slot; g.pick((slot + 1) % 3); });
await waitFor(() => !document.querySelector('#gameover').hidden);
const cupsOver = await app(() => document.querySelector('#gameover').textContent);
check('a wrong pick ends the game: 1 round', /1 round/.test(cupsOver), cupsOver);
await page.screenshot({ path: join(OUT, 'cups-over.png') });

// ---- Bubble Pop
await page.click('#gameover .btn--ghost');
await app(() => window.peek.games.start('pop'));
await waitFor(() => window.peek.games.game.state.bubbles.some((b) => b.y < -0.6));
const target = await app(() => {
  const g = window.peek.games.game, s = g.state;
  const b = s.bubbles.filter((x) => x.kind !== 'rain').sort((a, c) => a.y - c.y)[0];
  return b ? window.peek.renderer.toScreen(b.x + Math.sin(s.time * 2.2 + b.phase) * 0.05, b.y) : null;
});
if (target) await page.mouse.click(target.x, target.y);
await page.screenshot({ path: join(OUT, 'pop.png') });
check('Bubble Pop: tapping a bubble pops it', await app(() => window.peek.games.game?.state.pops >= 1));
await app(() => { const g = window.peek.games.game; g.state = { ...g.state, score: Math.max(1, g.state.score) }; });
await page.click('#gameQuit');
check('Quit keeps what you earned: Bubble Pop pays out', await waitFor(() => !document.querySelector('#gameover').hidden && /🪙/.test(document.querySelector('#gameover').textContent)));

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
