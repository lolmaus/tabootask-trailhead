import type { EstimateToken, TaskDocument } from './types.ts';

// Inspect original source, including context outside an eligible AST text node.
export function standalone(source: string, start: number, end: number): boolean {
  let before = start;
  while (source[before - 1] === '\\') before--;
  if ((start - before) % 2 === 1) return false;
  if (/[\p{L}\p{N}\p{M}_@#~./+-]/u.test(source[before - 1] ?? '')) return false;
  const after = source[end] ?? '';
  if (/[\p{L}\p{N}\p{M}_@#~/+:-]/u.test(after)) return false;
  if ((after === '.' || after === ',') && /[\p{L}\p{N}_]/u.test(source[end + 1] ?? ''))
    return false;
  return true;
}

export function recognize(document: TaskDocument): void {
  for (const task of document.tasks) {
    for (const range of task.proseRanges) {
      const prose = document.source.slice(range.start, range.end);
      for (const match of prose.matchAll(/[@#][\p{L}\p{N}][\p{L}\p{N}\p{M}_-]*|~[0-9]+/gu)) {
        const start = range.start + match.index;
        if (!standalone(document.source, start, start + match[0].length)) continue;
        if (match[0][0] === '~') {
          if (task.ownEstimate) continue;
          const token: EstimateToken = {
            kind: 'estimate',
            source: match[0],
            range: { start, end: start + match[0].length },
            value: BigInt(match[0].slice(1)),
          };
          task.ownEstimate = token;
          task.tokens.push(token);
          continue;
        }
        task.tokens.push({
          kind: match[0][0] === '@' ? 'reference' : 'tag',
          source: match[0],
          range: { start, end: start + match[0].length },
        });
      }
    }
  }
}

export function calculate(document: TaskDocument): void {
  // Tasks are in preorder, so reverse order computes children before parents.
  for (const task of document.tasks.toReversed()) {
    task.total = task.ownEstimate?.value ?? 0n;
    task.hasEstimate = task.ownEstimate !== null;
    for (const child of task.children) {
      task.total += child.total;
      task.hasEstimate ||= child.hasEstimate;
    }
  }
}
