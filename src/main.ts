import '@fontsource/source-sans-pro/400.css';
import '@fontsource/source-sans-pro/700.css';
import './style.css';
import mermaid from 'mermaid';
import { convertSvg } from './convert';
import { highlight } from './highlight';
import { EXAMPLES } from './examples';
import { FONT_FAMILY, type DiagramSettings, type MermaidTheme, type PluginMessage, type UIMessage } from './model';

const BACKGROUNDS: Record<MermaidTheme, string> = {
  default: '#ffffff',
  neutral: '#ffffff',
  forest: '#ffffff',
  base: '#ffffff',
  dark: '#333333',
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const exampleEl = $<HTMLSelectElement>('example');
const sourceEl = $<HTMLTextAreaElement>('source');
const highlightEl = $<HTMLPreElement>('highlight');
const themeEl = $<HTMLSelectElement>('theme');
const backgroundEl = $<HTMLInputElement>('background');
const shadowsEl = $<HTMLInputElement>('shadows');
const previewEl = $<HTMLDivElement>('preview');
const errorEl = $<HTMLParagraphElement>('error');
const insertEl = $<HTMLButtonElement>('insert');
const updateEl = $<HTMLButtonElement>('update');
const measureEl = $<HTMLDivElement>('measure');

let renderCount = 0;
let lastSvg: string | null = null;

function send(message: UIMessage) {
  parent.postMessage(message, '*');
}

function settings(): DiagramSettings {
  return {
    source: sourceEl.value,
    theme: themeEl.value as MermaidTheme,
    background: backgroundEl.checked,
    shadows: shadowsEl.checked,
  };
}

function setSource(source: string) {
  sourceEl.value = source;
  syncHighlight();
  syncExample();
}

function fillExamples() {
  exampleEl.add(new Option('Custom', ''));
  for (const { id, label } of EXAMPLES) exampleEl.add(new Option(label, id));
}

function syncExample() {
  exampleEl.value = EXAMPLES.find((it) => it.source === sourceEl.value)?.id ?? '';
}

function syncHighlight() {
  highlightEl.innerHTML = highlight(sourceEl.value);
  syncScroll();
}

function syncScroll() {
  highlightEl.scrollTop = sourceEl.scrollTop;
  highlightEl.scrollLeft = sourceEl.scrollLeft;
}

function syncPreviewBackground() {
  const color = backgroundEl.checked ? BACKGROUNDS[themeEl.value as MermaidTheme] : null;
  previewEl.style.setProperty('--diagram-background', color);
}

function setError(message: string | null) {
  errorEl.hidden = !message;
  errorEl.textContent = message ?? '';
  insertEl.disabled = !!message;
  updateEl.disabled = !!message;
}

async function render() {
  const { source, theme, shadows } = settings();
  const id = ++renderCount;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme,
    htmlLabels: false,
    fontFamily: FONT_FAMILY,
    themeVariables: { fontFamily: FONT_FAMILY, ...(!shadows && { dropShadow: 'none' }) },
  });
  try {
    const svg = inheritLabelFonts((await mermaid.render(`mermaid-${id}`, source)).svg);
    if (id !== renderCount) return;
    lastSvg = svg;
    previewEl.innerHTML = svg;
    setError(null);
  } catch (e) {
    if (id !== renderCount) return;
    lastSvg = null;
    setError(e instanceof Error ? e.message : String(e));
  }
}

// Mermaid writes `font-weight="normal"` / `font-style="normal"` on every label
// tspan, which hides the bold/italic set by `style` or `classDef`.
function inheritLabelFonts(svg: string) {
  return svg.replace(/<tspan\b[^>]*>/g, (tag) => tag.replace(/ font-(?:weight|style)="normal"/g, ''));
}

let timer: number | undefined;
function scheduleRender() {
  clearTimeout(timer);
  timer = window.setTimeout(render, 250);
}

function submit(replace: boolean) {
  if (!lastSvg) return;
  try {
    const diagram = convertSvg(lastSvg, measureEl, BACKGROUNDS[themeEl.value as MermaidTheme]);
    insertEl.disabled = updateEl.disabled = true;
    send({ type: 'insert', diagram, settings: settings(), replace });
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));
  }
}

function applyTheme(theme: string) {
  document.body.dataset.theme = theme;
}

window.addEventListener('message', (event: MessageEvent<PluginMessage>) => {
  if (event.source !== window.parent) return;
  const msg = event.data;
  switch (msg.type) {
    case 'theme':
      applyTheme(msg.theme);
      break;
    case 'canvas':
      previewEl.style.setProperty('--canvas-background', msg.background);
      break;
    case 'selection':
      updateEl.hidden = !msg.settings;
      if (msg.settings) {
        setSource(msg.settings.source);
        themeEl.value = msg.settings.theme;
        backgroundEl.checked = msg.settings.background;
        shadowsEl.checked = msg.settings.shadows ?? false;
        syncPreviewBackground();
        render();
      }
      break;
    case 'inserted':
      insertEl.disabled = updateEl.disabled = false;
      break;
    case 'error':
      setError(msg.message);
      break;
  }
});

exampleEl.addEventListener('change', () => {
  const example = EXAMPLES.find((it) => it.id === exampleEl.value);
  if (!example) return;
  setSource(example.source);
  render();
});
sourceEl.addEventListener('input', () => {
  syncHighlight();
  syncExample();
  scheduleRender();
});
sourceEl.addEventListener('scroll', syncScroll);
themeEl.addEventListener('change', () => {
  syncPreviewBackground();
  render();
});
backgroundEl.addEventListener('change', syncPreviewBackground);
shadowsEl.addEventListener('change', render);
insertEl.addEventListener('click', () => submit(false));
updateEl.addEventListener('click', () => submit(true));

// Manifest v2 UIs get their query in the hash (`#/?theme=dark`).
const params = new URLSearchParams(location.hash.split('?')[1] ?? location.search);
applyTheme(params.get('theme') ?? 'dark');
fillExamples();
setSource(EXAMPLES[0].source);
syncPreviewBackground();

Promise.all([
  document.fonts.load(`400 16px ${FONT_FAMILY}`),
  document.fonts.load(`700 16px ${FONT_FAMILY}`),
]).finally(() => {
  render();
  send({ type: 'ready' });
});
