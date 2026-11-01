import type { EditorState } from '@codemirror/state';
import type { WireUpdate } from '../../../backend/protocol.ts';

export function pendingUpdates(_state: EditorState): WireUpdate[] {
  return [];
}
