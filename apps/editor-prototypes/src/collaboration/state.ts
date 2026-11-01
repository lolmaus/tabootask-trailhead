import { getSyncedVersion, receiveUpdates, sendableUpdates } from '@codemirror/collab';
import { ChangeSet } from '@codemirror/state';
import type { EditorState, Transaction } from '@codemirror/state';
import type { WireUpdate } from '../../../backend/protocol.ts';

export function pendingUpdates(state: EditorState): WireUpdate[] {
  return sendableUpdates(state).map(({ clientID, changes }) => ({
    clientID,
    changes: changes.toJSON(),
  }));
}

export function receivePacket(
  state: EditorState,
  from: number,
  updates: WireUpdate[]
): Transaction {
  const version = getSyncedVersion(state);
  if (from > version) throw new Error('Missing authority updates; reopen with draft recovery');
  const remaining = updates.slice(Math.max(0, version - from));
  return remaining.length
    ? receiveUpdates(
        state,
        remaining.map(({ clientID, changes }) => ({
          clientID,
          changes: ChangeSet.fromJSON(changes),
        }))
      )
    : state.update({});
}
