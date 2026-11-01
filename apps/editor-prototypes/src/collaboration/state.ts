import { sendableUpdates } from '@codemirror/collab';
import type { EditorState } from '@codemirror/state';
import type { WireUpdate } from '../../../backend/protocol.ts';

export function pendingUpdates(state: EditorState): WireUpdate[] {
  return sendableUpdates(state).map(({ clientID, changes }) => ({
    clientID,
    changes: changes.toJSON(),
  }));
}
