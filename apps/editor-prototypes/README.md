# Editor experiments

Throwaway local comparison for ticket #10. All three views use CodeMirror 6
and `@repo/task-markdown`; no note persistence, backend, or collaboration.

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
