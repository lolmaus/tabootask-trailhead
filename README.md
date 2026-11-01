# Tabootask Trailhead

Tooling foundation for a pnpm workspace. Use the Node version in `.nvmrc`;
pnpm 11 or newer automatically selects the version pinned in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm run lint
pnpm run format
pnpm run typecheck
pnpm run test
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

The local [editor experiments](apps/editor-prototypes/README.md) compare three
source-preserving renderings with the shared parser. Run them with
`pnpm --filter @repo/editor-prototypes dev` and open <http://localhost:3100/>.
They are throwaway prototypes. The separate collaboration probe at
<http://localhost:3100/?lab=collaboration> uses the disposable local Convex
authority in `apps/backend`; run `pnpm --filter @repo/backend dev` alongside
the editor. Its run instructions and evidence limits are in the prototype README.

Add the production `apps/web` and production backend features incrementally.
The current `apps/backend` contains only the local collaboration authority probe.
Each consumer declares its tools and types directly, uses `workspace:*` for
shared configs, and owns source paths in local environment configs. Create only
active environments; check every local leaf with `tsc --noEmit --project` and
run workspace lint scripts directly. Shared presets do not use composite mode
or select consumer files. Add regression tests one behavior at a time.

Turbo includes root and workspace checks and invalidates them when shared
configs change. Future builds must declare real outputs and cache-affecting
environment variables. No deployed application or backups exist yet: the
first deployable feature slice must supply hosted development, daily backups
and a verified restore.

`@repo/task-markdown` exports `parseTaskMarkdown(source)` and
`classifyTaskDates(document, { nowEpochMilliseconds, viewerZone })` for browser
consumers. Ranges are end-exclusive UTF-16 source offsets; totals are bigint.
The returned source is unchanged. Dates retain their written spelling; timing
classification is separate and can rerun as the clock advances. For display,
use the date token’s `source` to retain its written time and offset. Local
browser/test configs select ES2024 libraries because the Temporal polyfill
supplies its own types; this avoids conflicting native ESNext declarations.
