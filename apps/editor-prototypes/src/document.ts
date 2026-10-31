import { EditorState } from '@codemirror/state';
import type { Extension } from '@codemirror/state';

export function sourceState(source: string, extensions: Extension[] = []): EditorState {
  // An explicit LF separator makes CR characters ordinary source characters.
  // This preserves CRLF, bare CR, and mixtures rather than normalizing them.
  return EditorState.create({
    doc: source,
    extensions: [EditorState.lineSeparator.of('\n'), ...extensions],
  });
}
