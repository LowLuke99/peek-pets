// Measures real rAF rate of the pet page in WebKit and Chromium (headless).
import { webkit, chromium, devices } from 'playwright';
const url = process.argv[2];
for (const [name, engine] of [['webkit', webkit], ['chromium', chromium]]) {
  const b = await engine.launch();
  const c = await b.newContext({ ...devices['iPhone 15'], ...(name === 'chromium' ? { defaultBrowserType: undefined } : {}) });
  const p = await c.newPage();
  await p.goto(url);
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now(); let worst = 0, last = t0;
    const f = (t) => { n++; worst = Math.max(worst, t - last); last = t; if (t - t0 < 2000) requestAnimationFrame(f); else res({ fps: n / ((t - t0) / 1000), worst, dpr: window.peek.renderer.dpr }); };
    requestAnimationFrame(f);
  }));
  const blank = await p.evaluate(() => new Promise((res) => {
    document.querySelector('#stage').style.display = 'none';
    window.peek.renderer.draw = () => {};
    let n = 0; const t0 = performance.now();
    const f = (t) => { n++; if (t - t0 < 2000) requestAnimationFrame(f); else res(n / ((t - t0) / 1000)); };
    requestAnimationFrame(f);
  }));
  console.log(name, JSON.stringify(r), 'without canvas drawing:', blank.toFixed(1));
  await b.close();
}
