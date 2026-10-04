// Checks the companion announces itself over Bonjour/mDNS the way the iPhone app
// browses for it (PTR _peekpets._tcp.local → SRV/TXT with ip + port).
//   node mdns-test.mjs
import makeMdns from 'multicast-dns';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

const ROOT = join(import.meta.dirname, '..', '..');
const EXE = join(ROOT, 'companion', 'bin', 'Debug', 'net8.0-windows', 'PeekPets.Companion.exe');
const TMP = join(import.meta.dirname, 'out', 'mdns-sandbox');
rmSync(TMP, { recursive: true, force: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const companion = spawn(EXE, ['--port', '8787', '--no-https', '--settings', join(TMP, 'companion.json'), '--minimized'], { stdio: 'ignore' });
await sleep(4000);
const mdns = makeMdns({ loopback: true });
const found = {};
mdns.on('response', (res) => {
  for (const r of [...res.answers, ...res.additionals]) {
    if (!/peekpets/i.test(r.name)) continue;
    if (r.type === 'TXT') {
      const kv = Object.fromEntries((Array.isArray(r.data) ? r.data : [r.data]).map((b) => String(b)).map((s) => s.split('=')));
      found.txt = kv;
    }
    if (r.type === 'SRV') found.srv = r.data;
    if (r.type === 'PTR') found.ptr = r.data;
  }
});
for (let i = 0; i < 6 && !(found.txt && found.srv); i++) {
  mdns.query({ questions: [{ name: '_peekpets._tcp.local', type: 'PTR' }] });
  await sleep(700);
}
mdns.destroy();
companion.kill();
const ok = Boolean(found.ptr && found.txt?.port === '8787' && found.txt?.ip);
console.log(JSON.stringify(found, null, 1));
console.log(ok ? 'PASS  companion is discoverable as _peekpets._tcp with ip + port in TXT' : 'FAIL  not discovered');
process.exit(ok ? 0 : 1);
