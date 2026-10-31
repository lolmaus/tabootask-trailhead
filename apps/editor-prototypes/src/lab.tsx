import { useEffect, useRef, useState } from 'react';
import * as Select from '@radix-ui/react-select';
import { createEditor } from './editor.ts';
import type { EditorController, Metrics, Variant } from './editor.ts';
import { scenarios } from './scenarios.ts';
import type { Scenario } from './scenarios.ts';

const variants: Array<{ id: Variant; title: string; description: string }> = [
  {
    id: 'highlight',
    title: '01  Highlighted source',
    description:
      'All Markdown stays visible. Token colour and computed totals add context without moving the text.',
  },
  {
    id: 'indicators',
    title: '02  Source + indicators',
    description:
      'The same source, with adjacent status, own estimate and written deadline. Compare the extra visual density.',
  },
  {
    id: 'rich',
    title: '03  Rich inactive lines',
    description:
      'Headings, emphasis, list marks and checkboxes render on inactive lines. Caret and selected lines reveal their source.',
  },
];
function Choice({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: string;
  choices: Array<{ value: string; label: string }>;
  onChange(value: string): void;
}) {
  return (
    <label className="choice">
      <span>{label}</span>
      <Select.Root value={value} onValueChange={onChange}>
        <Select.Trigger aria-label={label}>
          <Select.Value />
          <Select.Icon>⌄</Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className="select-menu" position="popper" sideOffset={6}>
            <Select.Viewport>
              {choices.map((c) => (
                <Select.Item key={c.value} value={c.value} className="select-option">
                  <Select.ItemText>{c.label}</Select.ItemText>
                  <Select.ItemIndicator>✓</Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </label>
  );
}
export function Lab() {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<EditorController | null>(null);
  const [variant, setVariant] = useState<Variant>('highlight');
  const [scenario, setScenario] = useState<Scenario>('introduction');
  const [theme, setTheme] = useState('system');
  const [zone, changeZone] = useState('UTC');
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [source, setSource] = useState('');
  const [baseline, setBaseline] = useState<string>(scenarios.introduction.source);
  const [copyResult, setCopyResult] = useState('');
  const [showSource, setShowSource] = useState(false);
  const [selection, setSelection] = useState('0 → 0');
  const selectVariant = (id: Variant) => {
    setVariant(id);
    controller.current?.switchVariant(id);
    const url = new URL(window.location.href);
    url.searchParams.set('variant', id);
    window.history.replaceState(null, '', url);
  };
  useEffect(() => {
    if (!host.current) return;
    const editor = createEditor(host.current, scenarios.introduction.source, (c) => {
      setSource(c.source());
      setMetrics(c.metrics());
      const range = c.view.state.selection.main;
      setSelection(`${range.anchor} → ${range.head}`);
    });
    controller.current = editor;
    if (import.meta.env.DEV) window.editorLab = editor;
    const requested = new URLSearchParams(window.location.search).get('variant');
    const initial = variants.find((v) => v.id === requested)?.id ?? 'highlight';
    setVariant(initial);
    editor.switchVariant(initial);
    setSource(editor.source());
    setMetrics(editor.metrics());
    return () => {
      delete window.editorLab;
      editor.destroy();
      controller.current = null;
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset['theme'] = theme;
  }, [theme]);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (
        !(event.key === 'ArrowRight' || event.key === 'ArrowLeft') ||
        (event.target instanceof Element &&
          event.target.closest(
            'input,textarea,select,button,[contenteditable="true"],[role="combobox"]'
          ))
      )
        return;
      event.preventDefault();
      const index = variants.findIndex((v) => v.id === variant);
      const next = variants[(index + (event.key === 'ArrowRight' ? 1 : 2)) % 3];
      if (next) selectVariant(next.id);
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [variant]);
  const active = variants.find((v) => v.id === variant)!;
  const selectScenario = (value: string) => {
    const next = value as Scenario;
    if (!(next in scenarios)) return;
    setScenario(next);
    const text = scenarios[next].source;
    setBaseline(text);
    controller.current?.load(text);
  };
  return (
    <main>
      <header>
        <div>
          <a className="wordmark" href="/?variant=highlight">
            TABOO<span>TASK</span>
          </a>
          <span className="eyebrow">EDITOR EXPERIMENTS / 10</span>
        </div>
        <span className="prototype-badge">Throwaway prototype · local only</span>
      </header>
      <section className="intro">
        <div>
          <p className="eyebrow">THE SAME WORDS, THREE WAYS</p>
          <h1>Find the editing feel.</h1>
          <p className="lede">
            Compare how task context lives inside an ordinary Markdown document. Switch views
            without losing your text or undo history.
          </p>
        </div>
        <Choice
          label="Appearance"
          value={theme}
          choices={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          onChange={setTheme}
        />
      </section>
      <nav aria-label="Rendering variants" className="variants">
        {variants.map((v) => (
          <button
            type="button"
            key={v.id}
            aria-pressed={variant === v.id}
            onClick={() => selectVariant(v.id)}
          >
            {v.title}
          </button>
        ))}
      </nav>
      <section className="workspace">
        <div className="workspace-top">
          <div>
            <span className="eyebrow">{active.title}</span>
            <p>{active.description}</p>
          </div>
          <span className="source-status">
            {source === baseline ? '● Source unchanged' : '● Source edited'}
          </span>
        </div>
        <div className="toolbar">
          <Choice
            label="Shared scenario"
            value={scenario}
            choices={Object.entries(scenarios).map(([value, s]) => ({ value, label: s.label }))}
            onChange={selectScenario}
          />
          <Choice
            label="Viewer zone"
            value={zone}
            choices={['UTC', 'Europe/Berlin', 'Etc/GMT-3', 'Etc/GMT+5'].map((z) => ({
              value: z,
              label: z,
            }))}
            onChange={(z) => {
              changeZone(z);
              controller.current?.zone(z);
            }}
          />
          <div className="actions">
            <button type="button" onClick={() => controller.current?.undo()}>
              Undo
            </button>
            <button type="button" onClick={() => controller.current?.redo()}>
              Redo
            </button>
            <button type="button" onClick={() => selectScenario(scenario)}>
              Reset scenario
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => {
                const text = controller.current?.source() ?? '';
                if (!navigator.clipboard?.writeText) {
                  setCopyResult('Clipboard unavailable; select and copy in the editor');
                  return;
                }
                void navigator.clipboard.writeText(text).then(
                  () => setCopyResult('Copied Markdown'),
                  () => setCopyResult('Clipboard unavailable; select and copy in the editor')
                );
              }}
            >
              Copy as Markdown
            </button>
          </div>
        </div>
        <div className={`editor-host variant-${variant}`} ref={host} />
        <footer className="editor-status">
          <span>
            {metrics?.tasks ?? '…'} tasks · {metrics?.chars.toLocaleString() ?? '…'} UTF-16
            characters
          </span>
          <span>
            Parse {metrics?.parseMs.toFixed(1) ?? '…'} ms · classify{' '}
            {metrics?.classifyMs.toFixed(1) ?? '…'} ms · decorate{' '}
            {metrics?.decorateMs.toFixed(1) ?? '…'} ms
          </span>
          <span>Selection {selection}</span>
        </footer>
      </section>
      <div className="below">
        <section>
          <h2>Try the transitions</h2>
          <ol>
            <li>Move the caret into a heading or task. Select across several lines.</li>
            <li>Cut, paste and undo. Toggle an explicit checkbox, then undo again.</li>
            <li>Switch between all three renderings. Untouched source should remain exact.</li>
            <li>Load 1,000 tasks. Scroll to the end, type, and watch the timings.</li>
          </ol>
        </section>
        <section>
          <h2>Know what this proves</h2>
          <p>
            The fixed comparison clock is 6 Nov 2026, 00:00 UTC. Only overdue active dates receive
            urgency styling. Own estimates stay in source; <strong>Σ</strong> identifies exact
            computed totals in the left margin, aligned independently of task indentation.
          </p>
          <p>
            Timings measure synchronous parsing and decoration work, not paint or input latency.
            Native touch selection, mobile keyboards and IME still require real-device checks. Bare
            CR is preserved as a character, rather than a visual line break.
          </p>
          <p>
            Radix Select is the accessible, unstyled component-library sample. No persistence or
            collaboration is included.
          </p>
        </section>
      </div>
      <section className="inspector">
        <button type="button" onClick={() => setShowSource(!showSource)} aria-expanded={showSource}>
          {showSource ? 'Hide' : 'Inspect'} exact source
        </button>
        <span role="status">{copyResult}</span>
        {showSource && (
          <>
            <p>
              JSON escapes show the exact line endings and trailing spaces. The textarea is a
              preview: browsers normalize its line endings. Use Copy as Markdown or copy from the
              editor for source text.
            </p>
            <pre data-testid="source-json">{JSON.stringify(source)}</pre>
            <textarea
              aria-label="Markdown preview with browser-normalized line endings"
              readOnly
              value={source}
            />
          </>
        )}
      </section>
    </main>
  );
}
