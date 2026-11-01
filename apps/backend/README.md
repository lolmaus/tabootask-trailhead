# Local collaboration authority probe

Disposable Convex authority for ticket #11. Run `pnpm --filter @repo/backend dev`
and use its local URL in the editor prototype. Fixture owner/editor tokens are
opaque capabilities for experiments; they do not verify OAuth, establish a
production authorization system, or imply adoption of Convex.

`probe:create` provisions a keyed note once. `open`, `pull`, `history`, and `stats`
check current capabilities on every evaluation, including live subscription
reevaluations. `push` checks the same capability and mode, then transactionally
uses CodeMirror's official `rebaseUpdates`, applies accepted changes, and stores
versioned updates. Clients acknowledge their updates only through `pull`.
Normal pull responses contain changes, never the current full source. Retries
are deduplicated within the retained log by the official CodeMirror algorithm;
old retries receive explicit recovery after compaction. A client ID identifies
one live editor instance and must not be reused by another instance.

`save` is the manual expected-version/epoch alternative. `restore` requires the
owner and expected current version, increments both version and generation,
records the preceding and restored sources, and drops the operation log.
`compact` also requires the owner and drops only the log. `revoke` invalidates an
editor fixture capability for subsequent reads and writes.

Prototype retention policy: at most 128 operations and 512,000 logical JSON bytes of operations, plus 32 independent source
history snapshots per note, with a 300,000-byte JSON UTF-8 history budget
that evicts oldest snapshots first. Source strings are limited to 100,000 UTF-16
code units and 140,000 JSON UTF-8 bytes (so both sides of a restore fit in history); pushes to 64 updates and 200,000 serialized characters. Source snapshots
preserve CR characters, blank lines, and trailing newlines using
`Text.of(source.split('\n'))`. History records the source preceding each accepted
save/push batch plus both sides of a restore. There is no separate deduplication
metadata. Recovery never silently reapplies pending changes from an old epoch.

Stats count UTF-8 bytes of JSON for the logical snapshot, retained operations
(version/client ID/serialized changes), and history. They exclude database IDs,
capabilities, index overhead and transport metadata, and are not Convex billing
measurements. Note creation is a local fixture endpoint and is deliberately not
a production onboarding flow.

`pnpm test`, `pnpm typecheck`, and `pnpm lint` check this package. Tests invoke
registered public functions with convex-test; the browser probe separately
exercises a real local Convex deployment.

The backend commits its generated API reference and declaration so convex-test
can discover function roots from a clean checkout without starting a backend.
Machine deployment settings and the other generated helpers remain ignored.
