import { EditorSelection, RangeSet, StateEffect, StateField } from '@codemirror/state';
import type { EditorState, Range } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  GutterMarker,
  WidgetType,
  gutter,
  keymap,
  drawSelection,
  highlightActiveLine,
} from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, undo, redo } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import {
  defaultHighlightStyle,
  HighlightStyle,
  syntaxHighlighting,
  ensureSyntaxTree,
} from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { parseTaskMarkdown, classifyTaskDates } from '@repo/task-markdown';
import type { TaskDocument } from '@repo/task-markdown';
import { sourceState } from './document.ts';

export type Variant = 'highlight' | 'indicators' | 'rich';
export interface Metrics {
  parseMs: number;
  classifyMs: number;
  decorateMs: number;
  tasks: number;
  chars: number;
}
export const setVariant = StateEffect.define<Variant>();
const setComposition = StateEffect.define<boolean>();
export const setZone = StateEffect.define<string>();
const variantField = StateField.define<Variant>({
  create: () => 'highlight',
  update: (v, tr) => tr.effects.reduce((last, e) => (e.is(setVariant) ? e.value : last), v),
});
const compositionField = StateField.define<boolean>({
  create: () => false,
  update: (v, tr) => tr.effects.reduce((last, e) => (e.is(setComposition) ? e.value : last), v),
});
const zoneField = StateField.define<string>({
  create: () => 'UTC',
  update: (v, tr) => tr.effects.reduce((last, e) => (e.is(setZone) ? e.value : last), v),
});
const modelField = StateField.define<{
  document: TaskDocument;
  parseMs: number;
  classifyMs: number;
  overdue: Set<number>;
}>({
  create: (state) => parse(state),
  update: (v, tr) =>
    tr.docChanged
      ? parse(tr.state)
      : tr.effects.some((e) => e.is(setZone))
        ? { ...v, ...classify(v.document, tr.state.field(zoneField)) }
        : v,
});
function classify(
  document: TaskDocument,
  zone: string
): { overdue: Set<number>; classifyMs: number } {
  const start = performance.now();
  const overdue = new Set(
    classifyTaskDates(document, {
      nowEpochMilliseconds: Date.parse('2026-11-06T00:00:00Z'),
      viewerZone: zone,
    })
      .filter((d) => d.classification === 'overdue')
      .map((d) => d.taskId)
  );
  return { overdue, classifyMs: performance.now() - start };
}
function parse(state: EditorState): {
  document: TaskDocument;
  parseMs: number;
  classifyMs: number;
  overdue: Set<number>;
} {
  const start = performance.now();
  const document = parseTaskMarkdown(state.doc.toString());
  return {
    document,
    parseMs: performance.now() - start,
    ...classify(document, state.field(zoneField)),
  };
}

export function selectedLines(state: EditorState): Set<number> {
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let line = first; line <= last; line++) lines.add(line);
  }
  return lines;
}

class TotalMarker extends GutterMarker {
  constructor(
    readonly value: string,
    readonly spacer = false
  ) {
    super();
  }
  override eq(other: TotalMarker): boolean {
    return this.value === other.value && this.spacer === other.spacer;
  }
  override toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = `task-indicator ${this.spacer ? 'total-spacer' : 'total'}`;
    span.textContent = `Σ ${this.value}`;
    span.title = 'Computed total';
    return span;
  }
}
function totalMarkers(state: EditorState): {
  markers: RangeSet<TotalMarker>;
  spacer: TotalMarker;
} {
  let widest = '0';
  const markers: Range<TotalMarker>[] = [];
  for (const task of state.field(modelField).document.tasks) {
    if (!task.hasEstimate) continue;
    const value = task.total.toString();
    if (value.length > widest.length) widest = value;
    markers.push(new TotalMarker(value).range(state.doc.lineAt(task.range.start).from));
  }
  return { markers: RangeSet.of(markers, true), spacer: new TotalMarker(widest, true) };
}
const totalGutterField = StateField.define<ReturnType<typeof totalMarkers>>({
  create: totalMarkers,
  update: (value, tr) => (tr.docChanged ? totalMarkers(tr.state) : value),
  provide: (field) =>
    gutter({
      class: 'cm-task-totals',
      markers: (view) => view.state.field(field).markers,
      initialSpacer: (view) => view.state.field(field).spacer,
      updateSpacer: (_spacer, update) => update.state.field(field).spacer,
    }),
});

class Label extends WidgetType {
  constructor(
    readonly text: string,
    readonly kind: 'detail' | 'bullet'
  ) {
    super();
  }
  override eq(other: Label): boolean {
    return this.text === other.text && this.kind === other.kind;
  }
  override toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = `task-indicator ${this.kind}`;
    span.textContent = this.text;
    span.setAttribute('aria-label', this.text);
    return span;
  }
}
class Checkbox extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly from: number
  ) {
    super();
  }
  override eq(other: Checkbox): boolean {
    return this.checked === other.checked && this.from === other.from;
  }
  override toDOM(): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'inline-check';
    button.textContent = this.checked ? '✓' : '';
    button.dataset['checkboxFrom'] = String(this.from);
    button.setAttribute('aria-label', this.checked ? 'Uncheck task' : 'Check task');
    button.setAttribute('aria-pressed', String(this.checked));
    return button;
  }
  override ignoreEvent(): boolean {
    return false;
  }
}

let lastDecorateMs = 0;
function decorations(state: EditorState): DecorationSet {
  const start = performance.now();
  const variant = state.field(variantField);
  const model = state.field(modelField).document;
  const selected = selectedLines(state);
  const composing = state.field(compositionField);
  const ranges: Range<Decoration>[] = [];
  const rich = variant === 'rich';
  const hidden: Array<{ from: number; to: number }> = [];
  const isInactive = (from: number, to = from): boolean => {
    if (!rich || composing) return false;
    for (let line = state.doc.lineAt(from).number; line <= state.doc.lineAt(to).number; line++)
      if (selected.has(line)) return false;
    return true;
  };
  const overdue = state.field(modelField).overdue;
  for (const task of model.tasks) {
    for (const token of task.tokens) {
      ranges.push(
        Decoration.mark({
          class: `token-${token.kind}${token.kind === 'date' && overdue.has(task.id) ? ' overdue' : ''}`,
        }).range(token.range.start, token.range.end)
      );
    }
    const line = state.doc.lineAt(task.range.start);
    if (variant === 'indicators') {
      const detail = [
        task.ownEstimate ? `own ${task.ownEstimate.value.toString()}` : '',
        task.date ? task.date.source : '',
        task.checked === null ? '' : task.checked ? 'done' : 'open',
      ]
        .filter(Boolean)
        .join(' · ');
      if (detail)
        ranges.push(
          Decoration.widget({ widget: new Label(detail, 'detail'), side: 1 }).range(line.to)
        );
    }
    if (task.checked !== null) {
      const match = /\[[ xX]\]/u.exec(
        state.doc.sliceString(task.range.start, Math.min(line.to, task.range.start + 20))
      );
      if (match) {
        const from = task.range.start + match.index;
        if (isInactive(from, from + 3)) {
          hidden.push({ from, to: from + 3 });
          ranges.push(
            Decoration.replace({ widget: new Checkbox(task.checked, from) }).range(from, from + 3)
          );
        } else
          ranges.push(
            Decoration.mark({
              class: 'source-checkbox',
              attributes: {
                'data-checkbox-from': String(from),
                title: 'Click to toggle this source checkbox',
              },
            }).range(from, from + 3)
          );
      }
    }
  }
  if (rich) {
    const tree = ensureSyntaxTree(state, state.doc.length, 100);
    tree?.iterate({
      enter(node) {
        if (!isInactive(node.from, node.to)) return;
        const name = node.name;
        if (/^ATXHeading[1-6]$/u.test(name))
          ranges.push(
            Decoration.line({ class: `rich-heading heading-${name.at(-1)}` }).range(
              state.doc.lineAt(node.from).from
            )
          );
        if (name === 'StrongEmphasis')
          ranges.push(Decoration.mark({ class: 'rich-strong' }).range(node.from, node.to));
        if (name === 'Emphasis')
          ranges.push(Decoration.mark({ class: 'rich-emphasis' }).range(node.from, node.to));
        if (
          ['HeaderMark', 'EmphasisMark', 'ListMark'].includes(name) &&
          !hidden.some((r) => node.from < r.to && node.to > r.from)
        ) {
          const marker = state.doc.sliceString(node.from, node.to);
          const text = name === 'ListMark' ? (/^\d/u.test(marker) ? marker : '•') : '';
          ranges.push(
            Decoration.replace(text ? { widget: new Label(text, 'bullet') } : {}).range(
              node.from,
              node.to
            )
          );
        }
      },
    });
  }
  const result = Decoration.set(ranges, true);
  lastDecorateMs = performance.now() - start;
  return result;
}
const decorationField = StateField.define<DecorationSet>({
  create: decorations,
  update: (v, tr) =>
    tr.docChanged ||
    tr.selection ||
    tr.effects.some((e) => e.is(setVariant) || e.is(setComposition) || e.is(setZone))
      ? decorations(tr.state)
      : v,
  provide: (field) => EditorView.decorations.from(field),
});

export interface EditorController {
  view: EditorView;
  source(): string;
  variant(): Variant;
  metrics(): Metrics;
  load(source: string): void;
  select(from: number, to?: number): void;
  switchVariant(variant: Variant): void;
  zone(zone: string): void;
  undo(): boolean;
  redo(): boolean;
  destroy(): void;
}
declare global {
  interface Window {
    editorLab?: EditorController;
  }
}
export function createEditor(
  parent: HTMLElement,
  source: string,
  onUpdate: (controller: EditorController) => void
): EditorController {
  let controller: EditorController;
  let alive = true;
  const view = new EditorView({
    parent,
    state: sourceState(source, [
      variantField,
      compositionField,
      zoneField,
      markdown(),
      modelField,
      totalGutterField,
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      drawSelection(),
      highlightActiveLine(),
      syntaxHighlighting(
        HighlightStyle.define([
          ...defaultHighlightStyle.specs,
          { tag: [tags.url, tags.link], color: 'var(--link)', textDecoration: 'underline' },
          { tag: tags.string, color: 'var(--code-text)' },
          {
            tag: tags.monospace,
            color: 'var(--code-text)',
            backgroundColor: 'var(--code)',
            borderRadius: '3px',
          },
          { tag: tags.heading, class: 'markdown-heading' },
          ...[
            tags.heading1,
            tags.heading2,
            tags.heading3,
            tags.heading4,
            tags.heading5,
            tags.heading6,
          ].map((tag, index) => ({
            tag,
            class: `markdown-heading markdown-heading-${index + 1}`,
          })),
          { tag: tags.quote, color: 'var(--muted)' },
          { tag: [tags.escape, tags.invalid], color: 'inherit' },
        ])
      ),
      EditorView.lineWrapping,
      decorationField,
      EditorView.contentAttributes.of({ 'aria-label': 'Markdown editor', spellcheck: 'false' }),
      EditorView.updateListener.of((update) => {
        if (
          controller &&
          (update.docChanged ||
            update.selectionSet ||
            update.transactions.some((tr) => tr.effects.length))
        )
          onUpdate(controller);
      }),
      EditorView.domEventHandlers({
        mousedown(event) {
          const target =
            event.target instanceof Element
              ? event.target.closest<HTMLElement>('[data-checkbox-from]')
              : null;
          if (!target) return false;
          event.preventDefault();
          return true;
        },
        click(event, editor) {
          const target =
            event.target instanceof Element
              ? event.target.closest<HTMLElement>('[data-checkbox-from]')
              : null;
          if (!target) return false;
          const from = Number(target.dataset['checkboxFrom']);
          const current = editor.state.doc.sliceString(from + 1, from + 2);
          editor.dispatch({
            changes: { from: from + 1, to: from + 2, insert: current === ' ' ? 'x' : ' ' },
            userEvent: 'input',
          });
          event.preventDefault();
          editor.focus();
          return true;
        },
        compositionstart(_event, editor) {
          queueMicrotask(() => {
            if (alive) editor.dispatch({ effects: setComposition.of(true) });
          });
          return false;
        },
        compositionend(_event, editor) {
          queueMicrotask(() => {
            if (alive) editor.dispatch({ effects: setComposition.of(false) });
          });
          return false;
        },
      }),
    ]),
  });
  controller = {
    view,
    source: () => view.state.doc.toString(),
    variant: () => view.state.field(variantField),
    metrics: () => ({
      parseMs: view.state.field(modelField).parseMs,
      classifyMs: view.state.field(modelField).classifyMs,
      decorateMs: lastDecorateMs,
      tasks: view.state.field(modelField).document.tasks.length,
      chars: view.state.doc.length,
    }),
    load: (text) =>
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        selection: { anchor: 0 },
        userEvent: 'input',
      }),
    select: (from, to = from) => view.dispatch({ selection: EditorSelection.range(from, to) }),
    switchVariant: (variant) => view.dispatch({ effects: setVariant.of(variant) }),
    zone: (zone) => view.dispatch({ effects: setZone.of(zone) }),
    undo: () => undo(view),
    redo: () => redo(view),
    destroy: () => {
      alive = false;
      view.destroy();
    },
  };
  return controller;
}
