# Editor experiments

Throwaway local comparison for ticket #10. All three views use CodeMirror 6
and `@repo/task-markdown`. The original rendering comparison remains local-only;
ticket #11 adds a separate disposable local-Convex collaboration probe.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @repo/editor-prototypes dev
```

- Highlighted source: <http://localhost:3100/?variant=highlight>
- Source with indicators: <http://localhost:3100/?variant=indicators>
- Rich inactive lines: <http://localhost:3100/?variant=rich>

The scenario picker loads the same source in every rendering. Switching
rendering keeps document, selection, scroll position, and undo history.
Scenario loading replaces the current document. No edits survive a reload.
The appearance picker supports system, light, and dark. Radix Select is the
small accessible component-library sample.

Computed totals occupy CodeMirror's left gutter, aligned with each task's
first line independently of indentation. They stay outside editable source,
including when lines wrap. The gutter reserves space for the widest total
in the document so scrolling between tasks does not change its width.

```sh
pnpm --filter @repo/editor-prototypes test
pnpm --filter @repo/editor-prototypes test:browser --project=chromium
pnpm --filter @repo/editor-prototypes test:browser --project=webkit
pnpm --filter @repo/editor-prototypes test:browser --project=mobile-chromium
pnpm --filter @repo/editor-prototypes build
```

Install the matching Playwright browsers with `pnpm --filter
@repo/editor-prototypes exec playwright install chromium webkit` if absent.
Mobile Chromium is viewport/touch emulation, not native mobile keyboard or
touch-selection evidence. Composition-event smoke checks likewise do not
establish real IME compatibility. Comparison findings live on GitHub #10.

Use the exact-source inspector to examine JSON-escaped line endings and
trailing spaces. Explicit LF splitting preserves CRLF, bare CR, and mixed
endings in the document. Bare CR is a preserved character within a CodeMirror
line, not a visual line break. Clipboard newline handling is OS/browser
dependent and should be tested separately on target devices.

The shared task parser and date classification rerun only on document/zone
changes. Decoration construction reruns on document, selection, variant,
composition, or zone changes. Timings are synchronous observations rather
than input-latency/paint measurements or performance promises. The fixed
comparison clock is `2026-11-06T00:00:00Z`; the viewer zone can be changed.
In development, `window.editorLab` exposes the CodeMirror view, current
source, selection, renderer switching, load/undo/redo, and timing metrics for
repeatable browser observations. This inspection API is absent in builds.

The current TanStack dependencies expose browser/server declaration types
and optional build-tool types across environment boundaries. The local
configs use `skipLibCheck` for those dependency declarations; application
and test source remains strict with separate browser/Node/test configs.

## Collaboration and recoverable saves

From two terminals at the repository root:

```sh
pnpm --filter @repo/backend dev
pnpm --filter @repo/editor-prototypes dev
```

Open <http://localhost:3100/?lab=collaboration>. Choose **Start OT pair** or
**Start manual-save pair**, then **Open second editor**. The backend script
uses anonymous local development, pins cloud/API port 3212 and HTTP-actions
port 3213, and persists its disposable data in ignored `.convex/` files.
The CLI may download its backend binary on the first run; no hosted account
or hosted deployment is required. If another local setup uses different ports,
set `VITE_CONVEX_URL` before starting Vite and adjust the integration-test URL.
This is not a production endpoint or an authentication integration.

Use **Pause sync** on both clients to prepare simultaneous changes, then
**Resume sync** in either order. OT sends CodeMirror ChangeSets and confirms
pending changes exclusively through the authority's ordered update stream.
Each editor instance has a unique OT identity, independent of its display name.
Saves debounce for 120 ms. Longer queues flush in batches of 64 updates.

Manual mode uses expected revision and generation checks. A stale save returns
the current server text and preserves the draft rather than overwriting the
winner. A newer remote save pauses this conservative baseline until the user
reopens it. Expand the recovery copy, copy its text, **Reopen latest**, and
paste the desired changes into the current source. A subsequent competing
save is checked again; reopening is never permission to overwrite blindly.

The first tab has controls for operational-log compaction, revoking the second
editor, reading retained history and whole-note restore. Restore increments a
generation and preserves intervening history. Old pending changes are recovered
explicitly, not silently rebased across a restore. Log compaction keeps current
source and user history; clients behind its retained floor also require recovery.
Revoked capabilities cannot read subsequent source/history or submit changes.
These capabilities are local test fixtures, not OAuth identities.

Recovery copies are bounded to four in-memory sources, including pending text
before concurrent changes. They are NOT durable offline storage: export text
before reload or tab closure. Copy/paste subtree movement is ordinary text
editing, not an atomic semantic move. In particular, concurrent replacements
of one estimate can concatenate digits; convergence does not certify intent.
The prototype exposes these outcomes for the conflict-strategy decision.

```sh
pnpm --filter @repo/editor-prototypes test:collaboration
```

The integration suite requires the local backend running at 127.0.0.1:3212.
It uses isolated notes and two independent Chromium contexts. Per-scenario JSON
is attached to Playwright results and appended to
`/tmp/tabootask-probe-evidence.jsonl`; the keyboard/scroll/checkbox observation
also writes `/tmp/tabootask-probe-interactions.json`. These are generated
observations, not repository specifications. The suite covers both arrival
orders, restore, compaction, revocation, real browser offline/reconnect, lost
acknowledgment retry, long queues, source fidelity, local undo and 1,000 tasks.
It does not certify physical-phone input, native IME or durable offline edits.

Logical traffic counters count application JSON submissions and callback
values, including cached callback deliveries. They exclude protocol overhead
and must not be treated as billed bandwidth. Browser samples additionally
count Convex WebSocket frame payload bytes; those exclude HTTP, TLS and frame
headers. Measurements use development builds, five scripted edits per mode,
and bounded full-source history snapshots. History lives inside the authority
note in this probe, so its database reads/writes include that growing record;
small OT network deltas do not imply equally small database bandwidth. A
production history layout, retention period, auth and cost model remain open.
Findings and the recommendation live on GitHub ticket #11.
