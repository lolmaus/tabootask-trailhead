import { appendFileSync, cpSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export function run(cwd: string, command: string, args: string[] = []) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      TURBO_TELEMETRY_DISABLED: '1',
      LEFTHOOK: '1',
      npm_config_verify_deps_before_run: 'false',
    },
  });
}
export function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'tabootask-tooling-'));
  cpSync(root, dir, {
    recursive: true,
    filter: (path) =>
      !['.git', 'node_modules', '.turbo', '.trailhead'].includes(
        path.slice(root.length).split('/').at(-1) ?? ''
      ),
  });
  appendFileSync(join(dir, 'pnpm-workspace.yaml'), '\nverifyDepsBeforeRun: false\n');
  symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
  symlinkSync(
    join(root, 'packages/oxlint-config/node_modules'),
    join(dir, 'packages/oxlint-config/node_modules'),
    'dir'
  );
  symlinkSync(
    join(root, 'packages/task-markdown/node_modules'),
    join(dir, 'packages/task-markdown/node_modules'),
    'dir'
  );
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
