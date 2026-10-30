import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const json = (path: string) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));

test('shared presets are strict and leave source selection to consumers', () => {
  const base = json('packages/typescript-config/tsconfig.base.json').compilerOptions;
  for (const flag of [
    'strict',
    'noUncheckedIndexedAccess',
    'exactOptionalPropertyTypes',
    'noUnusedLocals',
    'noUnusedParameters',
    'noImplicitReturns',
    'noImplicitOverride',
    'noFallthroughCasesInSwitch',
    'noEmit',
  ])
    assert.equal(base[flag], true, flag);
  for (const name of ['base', 'node', 'browser', 'react', 'vitest', 'playwright']) {
    const config = json(`packages/typescript-config/tsconfig.${name}.json`);
    for (const key of ['files', 'include', 'exclude', 'references'])
      assert.equal(key in config, false);
    for (const key of ['composite', 'rootDir', 'outDir', 'tsBuildInfoFile'])
      assert.equal(key in config.compilerOptions, false);
  }
});

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, run } from './fixtures.mts';

test('root and workspace aggregates reject real lint and type errors', () => {
  const { dir, cleanup } = fixture();
  try {
    for (const location of ['lib/probe.mts', 'packages/oxlint-config/probe.mts']) {
      const file = join(dir, location);
      writeFileSync(file, 'export const value: string = 42;\n');
      const result = run(dir, 'pnpm', ['run', 'typecheck', '--force', '--cache-dir=.turbo/probe']);
      assert.notEqual(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout + result.stderr, /TS2322/);
      writeFileSync(file, 'export function value() { debugger; }\n');
      const lint = run(dir, 'pnpm', ['run', 'lint', '--force', '--cache-dir=.turbo/probe']);
      assert.notEqual(lint.status, 0, lint.stdout + lint.stderr);
      assert.match(lint.stdout + lint.stderr, /debugger/);
      writeFileSync(file, 'export const value = 42;\n');
    }
  } finally {
    cleanup();
  }
});

test('format check does not mutate; fixing repairs a real config', () => {
  const { dir, cleanup } = fixture();
  try {
    const path = join(dir, 'commitlint.config.mts');
    const broken = 'export default {extends:["@commitlint/config-conventional"]}';
    writeFileSync(path, broken);
    assert.notEqual(run(dir, 'pnpm', ['run', 'format']).status, 0);
    assert.equal(readFileSync(path, 'utf8'), broken);
    assert.equal(run(dir, 'pnpm', ['run', 'format:fix']).status, 0);
    assert.equal(run(dir, 'pnpm', ['run', 'format']).status, 0);
  } finally {
    cleanup();
  }
});

test('Turbo graph contains direct leaves and shared config changes invalidate consumers', () => {
  const { dir, cleanup } = fixture();
  try {
    const graph = () => {
      const result = run(dir, 'pnpm', [
        'exec',
        'turbo',
        'run',
        'lint',
        'lint:root',
        'typecheck',
        'typecheck:root',
        '--dry=json',
      ]);
      assert.equal(result.status, 0, result.stderr);
      return JSON.parse(result.stdout);
    };
    const before = graph();
    const ids = before.tasks.map((task: { taskId: string }) => task.taskId);
    for (const id of [
      '//#lint:root',
      '//#typecheck:root',
      '@repo/oxlint-config#lint',
      '@repo/oxlint-config#typecheck',
    ])
      assert.ok(ids.includes(id), id);
    const path = join(dir, 'packages/typescript-config/tsconfig.base.json');
    writeFileSync(path, readFileSync(path, 'utf8') + '\n');
    const after = graph();
    for (const task of before.tasks) {
      const changed = after.tasks.find((next: { taskId: string }) => next.taskId === task.taskId);
      assert.notEqual(changed.hash, task.hash, task.taskId);
    }
  } finally {
    cleanup();
  }
});
