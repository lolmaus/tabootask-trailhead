import { validDate } from './dates.ts';
import type { DateToken, EstimateToken, SourceRange, TaskDocument } from './types.ts';

// Read complete Unicode characters while all positions remain UTF-16 offsets.
function characterAt(source: string, offset: number): string {
  const point = source.codePointAt(offset);
  return point === undefined ? '' : String.fromCodePoint(point);
}
function characterBefore(source: string, offset: number): string {
  return source.slice(Math.max(0, offset - 2), offset).match(/.$/su)?.[0] ?? '';
}

// Inspect original source, including context outside an eligible AST text node.
export function standalone(
  source: string,
  start: number,
  end: number,
  eligible: SourceRange
): boolean {
  let before = start;
  while (source[before - 1] === '\\') before--;
  if ((start - before) % 2 === 1) return false;
  // Formatting delimiters are absent from this AST text range. Look through
  // those delimiters so decoration cannot turn part of a word into a token.
  while (source[before - 1] === '*' || (start === eligible.start && source[before - 1] === '_'))
    before--;
  const textBoundary = end === eligible.end;
  while (source[end] === '*' || (textBoundary && source[end] === '_')) end++;
  if (/[\p{L}\p{N}\p{M}_@#~./+-]/u.test(characterBefore(source, before))) return false;
  let wordStart = start;
  while (wordStart > 0 && !/\s/u.test(source[wordStart - 1]!)) wordStart--;
  if (/[a-z][a-z0-9+.-]*:\/\//iu.test(source.slice(wordStart, start))) return false;
  const after = characterAt(source, end);
  if (
    after === ':' &&
    (/^[0-9]/u.test(characterAt(source, end + 1)) || source.slice(start, end).includes('T'))
  )
    return false;
  if (/[\p{L}\p{N}\p{M}_@#~/+-]/u.test(after)) return false;
  if ((after === '.' || after === ',') && /[\p{L}\p{N}\p{M}_]/u.test(characterAt(source, end + 1)))
    return false;
  return true;
}

export function recognize(document: TaskDocument): void {
  for (const task of document.tasks) {
    for (const range of task.proseRanges) {
      const prose = document.source.slice(range.start, range.end);
      for (const match of prose.matchAll(
        /[@#][\p{L}\p{N}][\p{L}\p{N}\p{M}_-]*|~[0-9]+|[0-9]{4}-[0-9]{2}-[0-9]{2}(?:T[0-9]{2}:[0-9]{2}(?::[0-9]{2}(?:\.[0-9]{1,3})?)?(?:Z|[+-][0-9]{2}:[0-9]{2})?)?/gu
      )) {
        const start = range.start + match.index;
        if (!standalone(document.source, start, start + match[0].length, range)) continue;
        if (/^[0-9]/u.test(match[0])) {
          if (task.date || !validDate(match[0]) || document.source[start + match[0].length] === '[')
            continue;
          if (
            match[0].length === 10 &&
            /^[ \t]+[0-9]{1,2}:/u.test(document.source.slice(start + 10))
          )
            continue;
          const token: DateToken = {
            kind: 'date',
            source: match[0],
            range: { start, end: start + match[0].length },
          };
          task.date = token;
          task.tokens.push(token);
          continue;
        }
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
