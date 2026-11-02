import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, open, rm, mkdir, cp, symlink, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { isolatedEnvironment } from './local-environment.mjs';

const root = resolve(import.meta.dirname, '../../..');
const local = 'http://127.0.0.1:3212';
const site = 'http://127.0.0.1:3213';
const directory = await mkdtemp(join(tmpdir(), 'tabootask-t22-'));
const log = await open(join(directory, 'convex.log'), 'w', 0o600);
const backend = join(directory, 'backend');
const cli = join(root, 'apps/backend/node_modules/convex/bin/main.js');
const children = [];
const childEnv = isolatedEnvironment(process.env);
let completed = false;
function command(args) {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd: backend,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).toString();
}
function env(name, value) {
  command(['env', 'set', name, value]);
}
async function ready(check, name) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (children.some((child) => child.exitCode !== null))
      throw new Error(`${name}: local process exited; private log at ${directory}`);
    try {
      if (await check()) return;
    } catch {
      /* Backend may be downloading or deploying. */
    }
    await setTimeout(1000);
  }
  throw new Error(`${name}: readiness timed out; private log at ${directory}`);
}
try {
  // Never reconfigure a developer's running backend or identity substitute.
  for (const url of [local, 'http://127.0.0.1:3201', 'http://localhost:3200']) {
    let occupied = false;
    try {
      await fetch(`${url}/version`, { signal: AbortSignal.timeout(1000) });
      occupied = true;
    } catch {
      /* free */
    }
    if (occupied)
      throw new Error(`Stop the existing local service at ${url} before running integration tests`);
  }
  // Fresh local database and auth configuration; never copy deployment settings.
  await mkdir(backend);
  for (const path of ['convex', 'convex.json', 'protocol.ts'])
    await cp(join(root, 'apps/backend', path), join(backend, path), { recursive: true });
  await mkdir(join(backend, 'test'));
  await cp(join(root, 'apps/backend/test/local-oauth.ts'), join(backend, 'test/local-oauth.ts'));
  await symlink(join(root, 'apps/backend/node_modules'), join(backend, 'node_modules'), 'dir');
  const manifest = JSON.parse(await readFile(join(root, 'apps/backend/package.json'), 'utf8'));
  await writeFile(
    join(backend, 'package.json'),
    JSON.stringify({ ...manifest, name: 't22-local-test' })
  );
  children.push(
    spawn(
      process.execPath,
      [cli, 'dev', '--local-cloud-port', '3212', '--local-site-port', '3213'],
      {
        cwd: backend,
        env: childEnv,
        detached: true,
        stdio: ['ignore', log.fd, log.fd],
      }
    )
  );
  await ready(async () => (await fetch(`${local}/version`)).ok, 'Local Convex');
  env('SITE_URL', 'http://localhost:3200');
  env('BETTER_AUTH_SECRET', randomBytes(48).toString('base64url'));
  for (const name of [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GITHUB_CLIENT_ID',
    'GITHUB_CLIENT_SECRET',
  ])
    env(name, 'local-test');
  env('PROBE_LOCAL_OAUTH', '1');
  children.push(
    spawn(process.execPath, ['apps/web/test/fake-oauth.mjs'], {
      cwd: root,
      env: childEnv,
      detached: true,
      stdio: ['ignore', log.fd, log.fd],
    })
  );
  await ready(async () => (await fetch('http://127.0.0.1:3201')).ok, 'Local provider substitute');
  await ready(async () => {
    const response = await fetch(`${site}/api/auth/sign-in/social`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3200' },
      body: JSON.stringify({
        provider: 'google',
        callbackURL: 'http://localhost:3200/',
        disableRedirect: true,
      }),
    });
    const data = await response.json();
    return typeof data.url === 'string' && new URL(data.url).origin === 'http://localhost:3201';
  }, 'Deployed local auth configuration');
  for (const args of [
    ['--filter', '@repo/web', 'build:local'],
    ['--filter', '@repo/web', 'test:browser'],
  ]) {
    await new Promise((accept, reject) => {
      const child = spawn('pnpm', args, { cwd: root, env: childEnv, stdio: 'inherit' });
      child.once('error', reject);
      child.once('exit', (code) =>
        code === 0 ? accept() : reject(new Error(`Local proof failed (${code})`))
      );
    });
  }
  completed = true;
} finally {
  for (const child of children.reverse()) {
    try {
      process.kill(-child.pid, 'SIGINT');
    } catch {
      /* Already stopped. */
    }
  }
  await Promise.all(
    children.map((child) =>
      child.exitCode === null ? new Promise((accept) => child.once('exit', accept)) : undefined
    )
  );
  await log.close();
  if (completed) await rm(directory, { recursive: true, force: true });
  else console.error(`Local test diagnostics retained privately at ${directory}`);
}
