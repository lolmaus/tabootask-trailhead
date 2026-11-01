import type { Session } from './session.ts';
import type { Transport } from './transport.ts';

export interface ProbeDriver {
  source(): string;
  edit(from: number, to: number, insert: string): void;
  pause(): void;
  resume(): void;
  flush(): Promise<void>;
  undo(): boolean;
  info(): {
    pending: number;
    version: number;
    status: string;
    recovery: Session['recovery'];
    drafts: Session['drafts'];
    traffic: Transport['traffic'];
    metrics: ReturnType<Session['editor']['metrics']>;
  };
  reopen(): Promise<void>;
}
declare global {
  interface Window {
    collabLab?: ProbeDriver;
  }
}
