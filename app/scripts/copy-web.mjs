// Copies the phone web app (../phone) into www/ for Capacitor. The web app needs no
// build step, so this is just a clean copy.
import { cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const here = join(import.meta.dirname, '..');
rmSync(join(here, 'www'), { recursive: true, force: true });
cpSync(join(here, '..', 'phone'), join(here, 'www'), { recursive: true });
console.log('Copied ../phone → www');
