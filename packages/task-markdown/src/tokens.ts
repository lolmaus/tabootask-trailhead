import type { TaskDocument } from './types.ts';

// Inspect original source, including context outside an eligible AST text node.
export function standalone(source: string, start: number, end: number): boolean {
  let before = start;
  while (source[before - 1] === '\\') before--;
  if ((start - before) % 2 === 1) return false;
  if (/[\p{L}\p{N}\p{M}_@#~./+-]/u.test(source[before - 1] ?? '')) return false;
  const after = source[end] ?? '';
  if (/[\p{L}\p{N}\p{M}_@#~/+:-]/u.test(after)) return false;
  if (after === '.' && /[\p{L}\p{N}_]/u.test(source[end + 1] ?? '')) return false;
  return true;
}

export function recognize(document: TaskDocument): void {
  for (const task of document.tasks) {
    for (const range of task.proseRanges) {
      const prose = document.source.slice(range.start, range.end);
      for (const match of prose.matchAll(/[@#][\p{L}\p{N}][\p{L}\p{N}\p{M}_-]*/gu)) {
        const start = range.start + match.index;
        if (!standalone(document.source, start, start + match[0].length)) continue;
        task.tokens.push({
          kind: match[0][0] === '@' ? 'reference' : 'tag',
          source: match[0],
          range: { start, end: start + match[0].length },
        });
      }
    }
  }
}
