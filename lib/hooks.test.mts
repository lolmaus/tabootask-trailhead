import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture, run } from './fixtures.mts';

for (const migrate of [false, true]) {
  test(`real commits enforce hooks (${migrate ? 'migrated' : 'fresh'})`, () => {
    const { dir, cleanup } = fixture();
    try {
      const git = (...args: string[]) => run(dir, 'git', args);
      assert.equal(git('init', '-q').status, 0);
      git('config', 'user.email', 'test@example.com');
      git('config', 'user.name', 'Tooling Test');
      mkdirSync(join(dir, '.trailhead'));
      writeFileSync(join(dir, '.trailhead/session-ticket'), '#8 tooling\n');
      const checker = join(dir, 'lib/trailhead-commit-msg.cjs');
      writeFileSync(
        checker,
        readFileSync(checker, 'utf8').replace(
          "const path = require('path');",
          "const path = require('path');\nfs.appendFileSync('invocations.log', 'called\\n');"
        )
      );
      if (migrate) {
        const hook = join(dir, '.git/hooks/commit-msg');
        writeFileSync(
          hook,
          '#!/bin/sh\nnode "$(dirname "$0")/trailhead-commit-msg.cjs" "$@"\ncode=$?\n[ "$code" != 3 ]\nexit $?\n'
        );
        chmodSync(hook, 0o755);
        copyFileSync(
          join(dir, 'lib/trailhead-commit-msg.cjs'),
          join(dir, '.git/hooks/trailhead-commit-msg.cjs')
        );
      }
      // Replace expensive checks with an observable pre-commit command in this isolated repo.
      const config = readFileSync(join(dir, 'lefthook.yml'), 'utf8').replace(
        /pnpm run (lint|format|typecheck)/g,
        'node -e "process.exit(0)"'
      );
      writeFileSync(join(dir, 'lefthook.yml'), config);
      for (let i = 0; i < 2; i++) assert.equal(run(dir, 'pnpm', ['run', 'prepare']).status, 0);
      git('add', 'package.json');
      const commit = (message: string, ...args: string[]) =>
        git('commit', '--allow-empty', '-m', message, ...args);
      for (const message of [
        'bad subject\n\nRefs: #8',
        `chore: ${'a'.repeat(70)}\n\nRefs: #8`,
        'chore: valid\n\nRefs: #8\nCo-Authored-By: A <a@b.com>',
        'chore: missing refs',
        'chore: wrong refs\n\nRefs: #9',
      ]) {
        const result = commit(message);
        assert.notEqual(result.status, 0, message + result.stdout + result.stderr);
      }
      const calls = () => {
        try {
          return readFileSync(join(dir, 'invocations.log'), 'utf8').split('\n').length;
        } catch {
          return 0;
        }
      };
      const before = calls();
      const valid = commit('chore: valid\n\nRefs: #8');
      assert.equal(valid.status, 0, valid.stdout + valid.stderr);
      assert.equal(calls() - before, 1, 'exactly one Trailhead validation after repeated installs');
      writeFileSync(
        join(dir, 'lefthook.yml'),
        config.replaceAll('process.exit(0)', 'process.exit(1)')
      );
      writeFileSync(join(dir, 'probe.txt'), 'staged change');
      git('add', 'probe.txt');
      const blocked = commit('chore: blocked by precommit\n\nRefs: #8');
      assert.notEqual(blocked.status, 0, blocked.stdout + blocked.stderr);
      assert.equal(commit('bypassed', '--no-verify').status, 0);
      if (migrate)
        assert.ok(
          readFileSync(join(dir, '.git/hooks/commit-msg.old'), 'utf8').includes(
            'trailhead-commit-msg.cjs'
          )
        );
    } finally {
      cleanup();
    }
  });
}
