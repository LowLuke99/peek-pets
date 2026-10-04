// Renders the app icons from the real pet drawing code (so the icon always matches
// the pet): node icons.mjs  → phone/icons/icon-{180,192,512}.png
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';

const PHONE = resolve(import.meta.dirname, '..', '..', 'phone');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  try {
    const path = join(PHONE, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!path.startsWith(PHONE)) throw new Error('outside');
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>icons</title>');
  }
}).listen(8799);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://127.0.0.1:8799/blank'); // same-origin blank page for module imports
await mkdir(join(PHONE, 'icons'), { recursive: true });
for (const size of [180, 192, 512]) {
  const dataUrl = await page.evaluate(async (size) => {
    const { mochi } = await import('/js/pet/species/mochi.js');
    const { PetRig } = await import('/js/pet/rig.js');
    const rig = new PetRig(() => 0.5);
    rig.nextBlink = 99;
    let pose;
    for (let i = 0; i < 90; i++) pose = rig.update(1 / 60, { emotion: 'happy', gazeTarget: { x: 0.18, y: -0.12 }, source: 'cursor', reducedMotion: true });
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, '#FFF6F0');
    g.addColorStop(1, '#FFD3C2');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const glow = ctx.createRadialGradient(size * 0.5, size * 0.42, 0, size * 0.5, size * 0.42, size * 0.55);
    glow.addColorStop(0, 'rgba(255,255,255,0.8)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);
    const S = size * 0.78;
    ctx.setTransform(S, 0, 0, S, size / 2, size * 0.86);
    ctx.fillStyle = 'rgba(120,50,40,0.18)';
    ctx.beginPath(); ctx.ellipse(0, 0, 0.42, 0.06, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(0, -mochi.groundY);
    mochi.draw(ctx, { ...pose, x: 0, y: 0, rot: 0, sx: 1, sy: 1, hop: 0 });
    return c.toDataURL('image/png');
  }, size);
  await writeFile(join(PHONE, 'icons', `icon-${size}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('wrote icon', size);
}
await browser.close();
server.close();
