/** Disposable local probe. Tokens are fixture capabilities, not production authentication. */
export type ChangeJSON = ReturnType<import('@codemirror/state').ChangeSet['toJSON']>;
export type WireUpdate = { clientID: string; changes: ChangeJSON };
export type Snapshot = { source: string; version: number; epoch: number; floor: number };
export type Recovery = { kind: 'recovery'; snapshot: Snapshot; reason: string };
export type PullResult =
  | { kind: 'updates'; version: number; epoch: number; updates: WireUpdate[] }
  | Recovery;
export type PushResult = { kind: 'ok' } | Recovery;
export type SaveResult = { kind: 'saved' | 'conflict'; snapshot: Snapshot };
export type HistoryEntry = { source: string; version: number; epoch: number; reason: string };
export type Stats = {
  snapshotBytes: number;
  logBytes: number;
  logCount: number;
  historyBytes: number;
  historyCount: number;
  version: number;
  floor: number;
  epoch: number;
};
