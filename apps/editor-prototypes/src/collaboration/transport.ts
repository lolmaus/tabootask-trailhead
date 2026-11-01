import { ConvexClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import type {
  Snapshot,
  PullResult,
  PushResult,
  SaveResult,
  WireUpdate,
  Stats,
  HistoryEntry,
} from '../../../backend/protocol.ts';

type Access = { key: string; token: string };
type Position = Access & { version: number; epoch: number };
export const probeApi = {
  create: makeFunctionReference<
    'mutation',
    {
      key: string;
      source: string;
      ownerToken: string;
      editorTokens: string[];
      mode: 'ot' | 'manual';
    },
    null
  >('probe:create'),
  open: makeFunctionReference<'query', Access, Snapshot>('probe:open'),
  pull: makeFunctionReference<'query', Position, PullResult>('probe:pull'),
  push: makeFunctionReference<'mutation', Position & { updates: WireUpdate[] }, PushResult>(
    'probe:push'
  ),
  save: makeFunctionReference<'mutation', Position & { source: string }, SaveResult>('probe:save'),
  restore: makeFunctionReference<
    'mutation',
    Access & { version: number; source: string },
    Snapshot
  >('probe:restore'),
  compact: makeFunctionReference<'mutation', Access, Snapshot>('probe:compact'),
  revoke: makeFunctionReference<'mutation', Access & { editorToken: string }, null>('probe:revoke'),
  stats: makeFunctionReference<'query', Access, Stats>('probe:stats'),
  history: makeFunctionReference<'query', Access, HistoryEntry[]>('probe:history'),
};
export type Traffic = {
  queries: number;
  mutations: number;
  subscriptions: number;
  deliveries: number;
  sentBytes: number;
  receivedBytes: number;
};
const size = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length;

/** Counts logical application payloads, not wire framing or Convex billing bytes. */
export class Transport {
  readonly traffic: Traffic = {
    queries: 0,
    mutations: 0,
    subscriptions: 0,
    deliveries: 0,
    sentBytes: 0,
    receivedBytes: 0,
  };
  readonly client: ConvexClient;
  constructor(url: string) {
    this.client = new ConvexClient(url, { unsavedChangesWarning: false });
  }
  async open(args: Access): Promise<Snapshot> {
    this.traffic.queries++;
    this.traffic.sentBytes += size(args);
    const result = await this.client.query(probeApi.open, args);
    this.received(result);
    return result;
  }
  watch(
    args: Position,
    callback: (result: PullResult) => void,
    error: (error: Error) => void
  ): () => void {
    this.traffic.subscriptions++;
    this.traffic.sentBytes += size(args);
    return this.client.onUpdate(
      probeApi.pull,
      args,
      (result) => {
        this.received(result);
        callback(result);
      },
      error
    );
  }
  watchSnapshot(
    args: Access,
    callback: (result: Snapshot) => void,
    error: (error: Error) => void
  ): () => void {
    this.traffic.subscriptions++;
    this.traffic.sentBytes += size(args);
    return this.client.onUpdate(
      probeApi.open,
      args,
      (result) => {
        this.received(result);
        callback(result);
      },
      error
    );
  }
  async push(args: Position & { updates: WireUpdate[] }): Promise<PushResult> {
    this.traffic.mutations++;
    this.traffic.sentBytes += size(args);
    const result = await this.client.mutation(probeApi.push, args);
    this.received(result);
    return result;
  }
  async save(args: Position & { source: string }): Promise<SaveResult> {
    this.traffic.mutations++;
    this.traffic.sentBytes += size(args);
    const result = await this.client.mutation(probeApi.save, args);
    this.received(result);
    return result;
  }
  private received(value: unknown): void {
    this.traffic.deliveries++;
    this.traffic.receivedBytes += size(value);
  }
  async close(): Promise<void> {
    await this.client.close();
  }
}
