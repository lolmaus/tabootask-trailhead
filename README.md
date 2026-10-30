# Tabootask Trailhead

Tooling foundation for a pnpm workspace. Use the Node version in `.nvmrc`;
pnpm 11 or newer automatically selects the version pinned in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm run lint
pnpm run format
pnpm run typecheck
pnpm run test:tooling
```

Use `lint:fix` and `format:fix` to repair files. `lint:root` and
`typecheck:root` check root tooling directly. Git hooks run lint, format and
typecheck before commits, then commitlint and the repository-owned Trailhead
checker. Subjects use Conventional Commits, at most 72 characters, with no
Co-Authored-By trailer. When `.trailhead/session-ticket` names an active ticket,
include its `Refs: #<number>` trailer. `pnpm run prepare` reinstalls hooks
idempotently; an existing hook is preserved in `.git/hooks/commit-msg.old`.
Git's ordinary `--no-verify` bypass is available.

Add `apps/web` and `apps/backend` incrementally as their real features arrive.
Each consumer declares its tools and types directly, uses `workspace:*` for
shared configs, and owns source paths in local environment configs. Create only
active environments; check every local leaf with `tsc --noEmit --project` and
run workspace lint scripts directly. Shared presets do not use composite mode
or select consumer files. Add regression tests one behavior at a time.

Turbo includes root and workspace checks and invalidates them when shared
configs change. Future builds must declare real outputs and cache-affecting
environment variables. No applications, deployment or backups exist yet: the
first deployable feature slice must supply hosted development, daily backups
and a verified restore.
