import { copyFile, access, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Only this directory is uploaded. dist/server is a build-time prerender artifact.
const client = resolve(import.meta.dirname, '../dist/client');
await copyFile(resolve(client, '_shell.html'), resolve(client, 'index.html'));
await access(resolve(client, 'index.html'));
if ((await readdir(client)).some((name) => /^(?:server|_worker\.js)$/u.test(name))) {
  throw new Error('Unexpected server runtime in static asset directory');
}
console.log('Static shell ready: dist/client/index.html (assets only)');
