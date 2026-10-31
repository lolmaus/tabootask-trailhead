/** Zero-based, end-exclusive UTF-16 offsets into the unchanged source. */
export interface SourceRange {
  start: number;
  end: number;
}
export interface Token {
  kind: 'reference' | 'tag' | 'estimate' | 'date';
  source: string;
  range: SourceRange;
}
export interface EstimateToken extends Token {
  kind: 'estimate';
  value: bigint;
}
export interface DateToken extends Token {
  kind: 'date';
}
export interface Task {
  id: number;
  parentId: number | null;
  children: Task[];
  range: SourceRange;
  ownRanges: SourceRange[];
  proseRanges: SourceRange[];
  checked: boolean | null;
  tokens: Token[];
  ownEstimate: EstimateToken | null;
  date: DateToken | null;
  total: bigint;
  hasEstimate: boolean;
}
export interface TaskDocument {
  source: string;
  tasks: Task[];
  roots: Task[];
}
export interface DateOptions {
  nowEpochMilliseconds: number;
  viewerZone: string;
}
export interface ClassifiedDate {
  taskId: number;
  token: DateToken;
  epochMilliseconds: number;
  classification: 'overdue' | 'future';
}
