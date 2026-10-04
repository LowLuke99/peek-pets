// Deploys the chat server to your Cloudflare account and points the app at it.
//   npx wrangler login      (once: opens the browser)
//   npm run deploy
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = execSync('npx wrangler deploy', { cwd: join(import.meta.dirname, '..'), encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] });
process.stdout.write(out);
const url = out.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/i)?.[0];
if (!url) { console.error('Deployed, but no workers.dev URL found in the output: set it in phone/js/friends/config.js yourself.'); process.exit(1); }
const file = join(import.meta.dirname, '..', '..', '..', 'phone', 'js', 'friends', 'config.js');
writeFileSync(file, `// Written by server/chat/scripts/deploy.mjs. The chat server the app talks to.\nexport const CHAT_URL = '${url}';\n`);
console.log(`\nThe app now uses ${url}\nCommit phone/js/friends/config.js and re-sync the iPhone app (cd app && npm run sync).`);
