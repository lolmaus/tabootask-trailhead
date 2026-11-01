import { getClientID, getSyncedVersion } from '@codemirror/collab';
import type { Snapshot, PullResult } from '../../../backend/protocol.ts';
import type { EditorController } from '../editor.ts';
import { pendingUpdates, receivePacket } from './state.ts';
import { Transport } from './transport.ts';

export type Mode = 'ot' | 'manual';
export type Draft = { reason: string; source: string };

/** Disposable transport coordinator. Drafts are bounded, in-memory recovery copies. */
export class Session {
  online = true;
  status = 'Connecting';
  drafts: Draft[] = [];
  recovery: { reason: string; snapshot: Snapshot | null } | null = null;
  private unsubscribe: (() => void) | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private busy = false;
  private stopped = false;
  private watchGeneration = 0;
  constructor(
    readonly editor: EditorController,
    readonly transport: Transport,
    readonly access: { key: string; token: string },
    readonly mode: Mode,
    public base: Snapshot,
    private notify: () => void
  ) {
    this.watch();
  }
  version(): number {
    return this.mode === 'ot' ? getSyncedVersion(this.editor.view.state) : this.base.version;
  }
  pending(): number {
    return this.mode === 'ot'
      ? pendingUpdates(this.editor.view.state).length
      : Number(this.editor.source() !== this.base.source);
  }
  changed(): void {
    this.notify();
    if (this.timer) clearTimeout(this.timer);
    if (this.online && !this.recovery && this.pending())
      this.timer = setTimeout(() => {
        void this.flush();
      }, 120);
  }
  preserve(reason: string): void {
    const source = this.editor.source();
    if (this.drafts.at(-1)?.source !== source)
      this.drafts = [...this.drafts, { reason, source }].slice(-4);
  }
  private block(reason: string, snapshot: Snapshot | null): void {
    this.preserve(reason);
    this.recovery = { reason, snapshot };
    this.status = reason;
    this.unwatch();
    this.watchGeneration++;
    this.notify();
  }
  private unwatch(): void {
    const remove = this.unsubscribe;
    this.unsubscribe = undefined;
    remove?.();
  }
  private watch(): void {
    this.unwatch();
    const generation = ++this.watchGeneration;
    const active = (): boolean =>
      !this.stopped && this.online && generation === this.watchGeneration;
    const error = (failure: Error): void => {
      if (active()) this.block(failure.message, null);
    };
    if (this.mode === 'manual') {
      this.unsubscribe = this.transport.watchSnapshot(
        this.access,
        (snapshot) => {
          if (!active() || snapshot.version <= this.base.version) return;
          this.block('A newer server version is available. Your text is preserved.', snapshot);
        },
        error
      );
    } else {
      const from = this.version();
      this.unsubscribe = this.transport.watch(
        { ...this.access, version: from, epoch: this.base.epoch },
        (result: PullResult) => {
          if (!active()) return;
          if (result.kind === 'recovery') {
            this.block(result.reason, result.snapshot);
            return;
          }
          if (result.epoch !== this.base.epoch) {
            this.block('Document generation changed', null);
            return;
          }
          if (
            this.pending() &&
            result.updates.some((u) => u.clientID !== getClientID(this.editor.view.state))
          )
            this.preserve('Before concurrent remote changes');
          try {
            const transaction = receivePacket(this.editor.view.state, from, result.updates);
            if (transaction.docChanged || transaction.state !== transaction.startState)
              this.editor.view.dispatch(transaction);
            this.status = this.pending() ? 'Sending local edits' : 'Synced';
            this.changed();
            if (this.version() > from)
              queueMicrotask(() => {
                if (active()) this.watch();
              });
          } catch (failure) {
            this.block(String(failure), null);
          }
        },
        error
      );
    }
    this.status = 'Connected';
    this.notify();
  }
  async flush(): Promise<void> {
    if (this.stopped || !this.online || this.recovery || this.busy || !this.pending()) return;
    this.busy = true;
    try {
      const position = { ...this.access, version: this.version(), epoch: this.base.epoch };
      if (this.mode === 'ot') {
        const result = await this.transport.push({
          ...position,
          updates: pendingUpdates(this.editor.view.state).slice(0, 64),
        });
        if (!this.stopped && result.kind === 'recovery') this.block(result.reason, result.snapshot);
      } else {
        const result = await this.transport.save({ ...position, source: this.editor.source() });
        if (this.stopped) return;
        if (result.kind === 'conflict')
          this.block('Save conflict. Your draft has not overwritten the server.', result.snapshot);
        else {
          this.base = result.snapshot;
          this.recovery = null;
          this.status = 'Saved';
          this.watch();
        }
      }
    } catch (failure) {
      if (!this.stopped) this.block(String(failure), null);
    } finally {
      this.busy = false;
      if (!this.stopped) this.changed();
    }
  }
  pause(): void {
    this.online = false;
    this.unwatch();
    this.watchGeneration++;
    this.status = 'Paused; edits stay in this tab';
    this.notify();
  }
  resume(): void {
    this.online = true;
    if (!this.recovery) {
      this.watch();
      this.changed();
    }
    this.notify();
  }
  stop(): void {
    this.stopped = true;
    this.watchGeneration++;
    this.unwatch();
    if (this.timer) clearTimeout(this.timer);
  }
}
