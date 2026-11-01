import { useEffect, useRef, useState } from 'react';
import { collab } from '@codemirror/collab';
import { createEditor } from '../editor.ts';
import { scenarios } from '../scenarios.ts';
import { Session } from './session.ts';
import type { Mode } from './session.ts';
import { probeApi, Transport } from './transport.ts';
import type { Snapshot } from '../../../backend/protocol.ts';

const backendUrl = (): string =>
  import.meta.env['VITE_CONVEX_URL'] ?? `${window.location.origin}/convex`;
const seed = '- [ ] Plan ~3\n  - Child ~2\n\n- Second task ~5\n';
import type {} from './driver.ts';

export default function CollaborationLab() {
  const host = useRef<HTMLDivElement>(null);
  const session = useRef<Session | null>(null);
  const [revision, redraw] = useState(0);
  const [error, setError] = useState('');
  const [paired, setPaired] = useState('');
  const [ready, setReady] = useState(false);
  const [workload, setWorkload] = useState(false);
  const [savedHistory, setSavedHistory] = useState<
    Array<{ source: string; version: number; epoch: number; reason: string }>
  >([]);
  const [restoreIndex, setRestoreIndex] = useState(0);
  const params = new URLSearchParams(window.location.search);
  const note = params.get('note');
  const token = params.get('token') ?? '';
  const owner = params.get('owner');
  const mode: Mode = params.get('mode') === 'manual' ? 'manual' : 'ot';
  const stableClientID = useRef(params.get('client') ?? crypto.randomUUID());
  const clientID = stableClientID.current;
  const repaint = (): void => redraw((value) => value + 1);

  useEffect(() => {
    if (!note || !host.current) return;
    let disposed = false;
    let transport: Transport | undefined;
    let current: Session | undefined;
    let preserved: Session['drafts'] = [];
    const boot = async (snapshot?: Snapshot): Promise<void> => {
      const nextTransport = transport ?? new Transport(backendUrl());
      transport = nextTransport;
      const opened = snapshot ?? (await nextTransport.open({ key: note, token }));
      if (disposed || !host.current) return;
      if (current) {
        current.preserve('Before reopening latest');
        preserved = current.drafts.slice(-4);
        current.stop();
        current.editor.destroy();
      }
      const editor = createEditor(
        host.current,
        opened.source,
        () => current?.changed(),
        mode === 'ot'
          ? [
              collab({
                startVersion: opened.version,
                clientID: `${clientID}:${crypto.randomUUID()}`,
              }),
            ]
          : []
      );
      current = new Session(editor, nextTransport, { key: note, token }, mode, opened, repaint);
      current.drafts = preserved.slice(-4);
      session.current = current;
      window.collabLab = {
        source: () => editor.source(),
        edit: (from, to, insert) =>
          editor.view.dispatch({ changes: { from, to, insert }, userEvent: 'input' }),
        pause: () => current?.pause(),
        resume: () => current?.resume(),
        flush: async () => {
          await current?.flush();
        },
        undo: () => editor.undo(),
        info: () => ({
          pending: current!.pending(),
          version: current!.version(),
          status: current!.status,
          recovery: current!.recovery,
          drafts: current!.drafts,
          traffic: nextTransport.traffic,
          metrics: editor.metrics(),
        }),
        reopen: async () => {
          await boot();
        },
      };
      setReady(true);
      repaint();
    };
    void boot().catch((failure: unknown) => setError(String(failure)));
    return () => {
      disposed = true;
      current?.stop();
      current?.editor.destroy();
      void transport?.close();
      delete window.collabLab;
    };
  }, [note, token, mode, clientID]);

  async function create(nextMode: Mode): Promise<void> {
    const transport = new Transport(backendUrl());
    try {
      const key = crypto.randomUUID();
      const ownerToken = crypto.randomUUID();
      const alice = crypto.randomUUID();
      const bob = crypto.randomUUID();
      await transport.client.mutation(probeApi.create, {
        key,
        source: workload ? scenarios.workload.source : seed,
        ownerToken,
        editorTokens: [alice, bob],
        mode: nextMode,
      });
      const first = new URLSearchParams({
        lab: 'collaboration',
        note: key,
        token: alice,
        owner: ownerToken,
        peer: bob,
        mode: nextMode,
        client: 'alice',
      });
      window.location.assign(`/?${first}`);
    } catch (failure) {
      setError(String(failure));
    } finally {
      await transport.close();
    }
  }
  useEffect(() => {
    if (!note) return;
    const peer = params.get('peer');
    if (!peer) return;
    const search = new URLSearchParams({
      lab: 'collaboration',
      note,
      token: peer,
      mode,
      client: 'bob',
    });
    setPaired(`/?${search}`);
  }, [note, mode]);

  const active = session.current;
  const info = ready ? window.collabLab?.info() : undefined;
  async function ownerAction(action: 'compact' | 'restore' | 'revoke'): Promise<void> {
    if (!active || !owner || !note) return;
    try {
      const access = { key: note, token: owner };
      if (action === 'compact') await active.transport.client.mutation(probeApi.compact, access);
      if (action === 'revoke')
        await active.transport.client.mutation(probeApi.revoke, {
          ...access,
          editorToken: params.get('peer') ?? '',
        });
      if (action === 'restore') {
        const latest = await active.transport.open(access);
        await active.transport.client.mutation(probeApi.restore, {
          ...access,
          version: latest.version,
          source: savedHistory[restoreIndex]?.source ?? seed,
        });
      }
      repaint();
    } catch (failure) {
      setError(String(failure));
    }
  }
  return (
    <main data-revision={revision}>
      <header>
        <a className="wordmark" href="/">
          TABOO<span>TASK</span>
        </a>
        <span className="prototype-badge">Disposable local prototype · 11</span>
      </header>
      <section className="intro">
        <div>
          <p className="eyebrow">TWO CLIENTS, EXACT MARKDOWN</p>
          <h1>Collaboration probe</h1>
          <p className="lede">
            Compare automatic text convergence with recoverable whole-note save conflicts.
          </p>
        </div>
      </section>
      <p>
        This local experiment uses fixture edit capabilities. Draft recovery survives only while
        this tab stays open. Export important text before reloading or closing.
      </p>
      {!note && (
        <section className="workspace">
          <div className="toolbar">
            <label>
              <input
                type="checkbox"
                checked={workload}
                onChange={(event) => setWorkload(event.target.checked)}
              />{' '}
              Start with 1,000 tasks
            </label>
            <button
              type="button"
              onClick={() => {
                void create('ot');
              }}
            >
              Start OT pair
            </button>
            <button
              type="button"
              onClick={() => {
                void create('manual');
              }}
            >
              Start manual-save pair
            </button>
          </div>
        </section>
      )}
      {note && (
        <>
          <section className="workspace">
            <div className="workspace-top">
              <div>
                <h2>
                  {mode === 'ot' ? 'CodeMirror OT + Convex' : 'Revision-checked saves'} · {clientID}
                </h2>
                <p role="status">
                  {info?.status ?? 'Opening…'} · version {info?.version ?? '…'} · pending{' '}
                  {info?.pending ?? '…'}
                </p>
              </div>
              {paired && (
                <a href={paired} target="_blank" rel="noreferrer">
                  Open second editor
                </a>
              )}
            </div>
            <div className="toolbar">
              <button type="button" onClick={() => active?.pause()}>
                Pause sync
              </button>
              <button type="button" onClick={() => active?.resume()}>
                Resume sync
              </button>
              <button
                type="button"
                onClick={() => {
                  void active?.flush();
                }}
              >
                Save now
              </button>
              <button type="button" onClick={() => active?.editor.undo()}>
                Undo my edit
              </button>
            </div>
            <div className="editor-host variant-highlight" ref={host} />
            <footer className="editor-status">
              <span>
                {info?.metrics.tasks ?? 0} tasks · parse {info?.metrics.parseMs.toFixed(1)} ms
              </span>
              <span>
                Logical payload: sent {info?.traffic.sentBytes ?? 0} B · received{' '}
                {info?.traffic.receivedBytes ?? 0} B
              </span>
            </footer>
          </section>
          {info?.recovery && (
            <section className="inspector">
              <h2>Recover your draft</h2>
              <p>{info.recovery.reason}</p>
              <p>
                Your editor still contains your text. Copy or export it before reopening, then paste
                the changes you want into the current note.
              </p>
              <button
                type="button"
                onClick={() => {
                  void window.collabLab
                    ?.reopen()
                    .catch((failure: unknown) => setError(String(failure)));
                }}
              >
                Reopen latest, keeping a recovery copy
              </button>
              {info.recovery.snapshot && (
                <>
                  <h3>Current server text</h3>
                  <pre>{info.recovery.snapshot.source}</pre>
                </>
              )}
            </section>
          )}
          <section className="inspector">
            <h2>Exact source and recovery copies</h2>
            <details>
              <summary>Current source (JSON shows exact newlines)</summary>
              <pre data-testid="collab-source">{JSON.stringify(active?.editor.source())}</pre>
            </details>
            {info?.drafts.map((draft, index) => (
              <details key={index}>
                <summary>
                  Recovery {index + 1}: {draft.reason}
                </summary>
                <pre>{JSON.stringify(draft.source)}</pre>
                <textarea
                  aria-label={`Recovery draft ${index + 1}`}
                  readOnly
                  value={draft.source}
                />
              </details>
            ))}
            <p>
              At most four recovery copies are retained in this tab. They are not durable backups.
            </p>
          </section>
          {owner && (
            <section className="inspector">
              <h2>Probe controls</h2>
              <div className="toolbar">
                <button
                  type="button"
                  onClick={() => {
                    void ownerAction('compact');
                  }}
                >
                  Compact operational log
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void ownerAction('revoke');
                  }}
                >
                  Revoke second editor
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void active?.transport.client
                      .query(probeApi.history, { key: note, token: owner })
                      .then(setSavedHistory)
                      .catch((failure: unknown) => setError(String(failure)));
                  }}
                >
                  Read retained history
                </button>
                <select
                  aria-label="History version"
                  value={restoreIndex}
                  onChange={(event) => setRestoreIndex(Number(event.target.value))}
                >
                  {savedHistory.map((entry, index) => (
                    <option key={index} value={index}>
                      v{entry.version} · {entry.reason}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    void ownerAction('restore');
                  }}
                >
                  Restore selected whole note
                </button>
              </div>
              <p>
                Restore starts a new generation. Pending older edits require recovery. History and
                sync-log bounds here are experimental limits.
              </p>
            </section>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
