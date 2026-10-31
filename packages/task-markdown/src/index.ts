import { recognize, calculate } from './tokens.ts';
import { structure } from './structure.ts';
import type { TaskDocument, ClassifiedDate, DateOptions } from './types.ts';
export type * from './types.ts';
export function parseTaskMarkdown(source: string): TaskDocument {
  const document = structure(source);
  recognize(document);
  calculate(document);
  return document;
}
export function classifyTaskDates(
  _document: TaskDocument,
  _options: DateOptions
): ClassifiedDate[] {
  return [];
}
