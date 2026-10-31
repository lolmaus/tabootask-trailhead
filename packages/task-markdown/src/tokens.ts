import type { TaskDocument } from './types.ts';

export function recognize(document: TaskDocument): void {
  for (const task of document.tasks) {
    for (const range of task.proseRanges) {
      const prose = document.source.slice(range.start, range.end);
      for (const match of prose.matchAll(/[@#][\p{L}\p{N}][\p{L}\p{N}\p{M}_-]*/gu)) {
        const start = range.start + match.index;
        task.tokens.push({
          kind: match[0][0] === '@' ? 'reference' : 'tag',
          source: match[0],
          range: { start, end: start + match[0].length },
        });
      }
    }
  }
}
