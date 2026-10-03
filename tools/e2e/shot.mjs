// Quick visual check: node shot.mjs <url> <out.png> [jsToRunBeforeShot] [waitMs]
// Renders the phone page in WebKit with an iPhone profile.
import { webkit, devices } from 'playwright';

const [url, out, script, wait = '1500'] = process.argv.slice(2);
const browser = await webkit.launch();
const context = await browser.newContext({ ...devices['iPhone 15'] });
const page = await context.newPage();
page.on('console', (m) => console.log('[page]', m.type(), m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url);
await page.waitForTimeout(Number(wait));
if (script) console.log('result:', JSON.stringify(await page.evaluate(script)));
await page.waitForTimeout(400);
await page.screenshot({ path: out });
await browser.close();
