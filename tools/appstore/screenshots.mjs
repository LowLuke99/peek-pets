// App Store screenshots (6.9" iPhone, 1320×2868): six real app scenes, each with a
// caption on a soft background. Needs the companion on :8787 (it serves the app).
//   node tools/appstore/screenshots.mjs   → docs/appstore/screenshot-N.png
// The chat and leaderboard scenes use made-up sample friends (the views are rendered
// with sample data so no chat server is needed).
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const APP = 'http://localhost:8787/';
const OUT = join(import.meta.dirname, '..', '..', 'docs', 'appstore');
const VIEW = { width: 440, height: 956 }; // × 3 = 1320 × 2868
mkdirSync(OUT, { recursive: true });

const SCENES = [
  {
    caption: 'A little pet that watches your PC cursor',
    seed: { settings: { backdrop: 'bedroom', pet: 'mochi', demo: true }, outfits: { mochi: { head: 'crown', face: 'specs' } } },
  },
  {
    caption: 'Quick games. Earn coins & XP',
    seed: { settings: { backdrop: 'candy', pet: 'mochi' }, outfits: { mochi: { head: 'party', face: null } } },
    run: async (page) => {
      await page.evaluate(() => window.peek.games.start('catch'));
      await page.mouse.move(VIEW.width * 0.65, VIEW.height * 0.6);
      await page.mouse.down();
      await page.mouse.up();
      // Software rendering is slow here, so place a few falling treats for the still.
      await page.evaluate(() => {
        const g = window.peek.games.game;
        const items = [['berry', -0.35, -1.45], ['star', 0.3, -1.15], ['cookie', -0.1, -0.95], ['chili', 0.45, -1.6], ['onigiri', 0.12, -0.72]]
          .map(([kind, x, y], i) => ({ id: 100 + i, kind, x, y, vy: 0.0001 }));
        g.state = { ...g.state, score: 17, time: 12, items, spawnIn: 99 };
      });
      await page.waitForTimeout(800);
    },
  },
  {
    caption: 'Dress up & decorate',
    seed: { settings: { backdrop: 'forest', pet: 'bun' }, outfits: { bun: { head: 'flowercrown', face: 'heartglasses' } }, coins: 320, owned: ['flowercrown', 'heartglasses', 'forest', 'beach'] },
    run: async (page) => { await page.click('[data-action="shop"]'); await page.waitForTimeout(700); },
  },
  {
    caption: 'Chat & send pet emotes to friends',
    seed: { settings: { backdrop: 'space', pet: 'opal' }, outfits: { opal: { head: 'wizard', face: null } } },
    run: async (page) => {
      await page.evaluate(async () => {
        const { chatView } = await import('./js/ui/friendsSheet.js');
        const now = Date.now();
        const msgs = [
          { id: '1', from: 'sam', text: 'look at my new hat!! 🎩', at: now - 60000 },
          { id: '2', from: 'me', emote: 'hug', text: '', at: now - 50000 },
          { id: '3', from: 'sam', emote: 'dance', text: '', at: now - 40000 },
          { id: '4', from: 'sam', text: 'Beat my score!', challenge: { game: 'catch', score: 27 }, at: now - 30000 },
          { id: '5', from: 'me', text: 'oh it is ON', at: now - 20000 },
        ];
        const noop = () => {};
        window.peek.ui.openSheet('friends', 'Friends', chatView({ friend: { id: 'sam', name: 'Sam', pet: 'inky' }, meId: 'me', messages: msgs, best: { catch: 24, pop: 31 }, draft: '', onDraft: noop, onBack: noop, onSend: noop, onEmote: noop, onChallenge: noop, onPlay: noop, onReport: noop, onBlock: noop }));
      });
      await page.waitForTimeout(700);
    },
  },
  {
    caption: 'Climb the leaderboards',
    seed: { settings: { backdrop: 'beach', pet: 'inky' } },
    run: async (page) => {
      await page.evaluate(async () => {
        const { boardsView } = await import('./js/ui/friendsSheet.js');
        const board = [
          { rank: 1, name: 'Sam', pet: 'inky', score: 41 }, { rank: 2, name: 'Rin', pet: 'mochi', score: 38, me: true },
          { rank: 3, name: 'Maya', pet: 'lumi', score: 33 }, { rank: 4, name: 'Leo', pet: 'pebble', score: 29 },
          { rank: 5, name: 'Ari', pet: 'bun', score: 22 },
        ];
        const noop = () => {};
        window.peek.ui.openSheet('friends', 'Friends', boardsView({ game: 'catch', scope: 'friends', board, onGame: noop, onScope: noop, onBack: noop }));
      });
      await page.waitForTimeout(700);
    },
  },
  {
    caption: '12 pets to love',
    seed: { settings: { backdrop: 'candy', pet: 'lumi' } },
    run: async (page) => { await page.click('#petBtn'); await page.waitForTimeout(1500); },
  },
];

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const shots = [];
for (const [i, scene] of SCENES.entries()) {
  const page = await (await browser.newContext({ ...devices['iPhone 15'], viewport: VIEW, deviceScaleFactor: 3 })).newPage();
  await page.addInitScript((s) => {
    localStorage.clear();
    localStorage.setItem('peekpets.seenPair', 'true');
    localStorage.setItem('peekpets.settings', JSON.stringify({ look: 'clay', sound: false, ...s.settings }));
    localStorage.setItem('peekpets.outfits', JSON.stringify(s.outfits ?? {}));
    localStorage.setItem('peekpets.owned', JSON.stringify(s.owned ?? []));
    localStorage.setItem('peekpets.wallet', JSON.stringify({ coins: s.coins ?? 240, xp: 620, lastDaily: null, lastInteract: 0 }));
    // Safe areas like a real iPhone so the top bar clears the Dynamic Island.
    document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = ':root{--safe-top:59px!important;--safe-bottom:34px!important}'; document.head.append(st); });
  }, scene.seed);
  await page.goto(APP);
  await page.waitForFunction(() => window.peek?.pose);
  await page.waitForTimeout(1800);
  if (scene.run) await scene.run(page);
  await page.waitForTimeout(500);
  const file = join(OUT, `raw-${i + 1}.png`);
  await page.screenshot({ path: file });
  shots.push({ file, caption: scene.caption });
  await page.context().close();
  console.log(`scene ${i + 1}: ${scene.caption}`);
}

// Frame: caption on top, the screen below with rounded corners, on the app's peach.
const frame = await browser.newPage({ viewport: { width: 1320, height: 2868 } });
for (const [i, s] of shots.entries()) {
  const img = `data:image/png;base64,${(await import('node:fs')).readFileSync(s.file).toString('base64')}`;
  await frame.setContent(`<!doctype html><html><head><style>
    @font-face { font-family: N; font-weight: 900; src: url(${pathUrl('phone/fonts/nunito-900.woff2')}); }
    html,body{margin:0;width:1320px;height:2868px;overflow:hidden}
    body{background:linear-gradient(170deg,#FFF4EC,#FFD9CB);font-family:N,sans-serif;color:#3A221C;display:flex;flex-direction:column;align-items:center}
    h1{font-size:104px;line-height:1.08;text-align:center;margin:150px 90px 80px;letter-spacing:-1px;font-weight:900}
    .ph{width:1100px;height:2390px;border-radius:110px;overflow:hidden;box-shadow:0 60px 140px rgba(120,50,40,.35),0 0 0 18px #1d1416}
    .ph img{width:100%;height:100%;object-fit:cover;object-position:top}
  </style></head><body><h1>${s.caption}</h1><div class="ph"><img src="${img}"></div></body></html>`);
  await frame.evaluate(() => document.fonts.ready);
  await frame.screenshot({ path: join(OUT, `screenshot-${i + 1}.png`) });
}
await browser.close();
console.log(`wrote ${shots.length} screenshots to docs/appstore/`);

function pathUrl(rel) {
  return new URL(`../../${rel}`, import.meta.url).href;
}
