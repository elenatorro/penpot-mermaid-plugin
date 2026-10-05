import '@fontsource/source-sans-pro/400.css';
import '@fontsource/source-sans-pro/700.css';
import './style.css';
import mermaid from 'mermaid';
import { convertSvg } from './convert';
import { FONT_FAMILY, type DiagramSettings, type MermaidTheme, type PluginMessage, type UIMessage } from './model';

const EXAMPLE = `flowchart TD
    A[Start] --> B{Is it working?}
    B -- Yes --> C[Ship it]
    B -- No --> D[Debug]
    D --> B`;

const BACKGROUNDS: Record<MermaidTheme, string> = {
  default: '#ffffff',
  neutral: '#ffffff',
  forest: '#ffffff',
  base: '#ffffff',
  dark: '#333333',
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const sourceEl = $<HTMLTextAreaElement>('source');
const themeEl = $<HTMLSelectElement>('theme');
const backgroundEl = $<HTMLInputElement>('background');
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
  };
}

function setError(message: string | null) {
  errorEl.hidden = !message;
  errorEl.textContent = message ?? '';
  insertEl.disabled = !!message;
  updateEl.disabled = !!message;
}

async function render() {
  const { source, theme } = settings();
  const id = ++renderCount;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme,
    htmlLabels: false,
    fontFamily: FONT_FAMILY,
    themeVariables: { fontFamily: FONT_FAMILY },
  });
  try {
    const { svg } = await mermaid.render(`mermaid-${id}`, source);
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
  const msg = event.data;
  switch (msg.type) {
    case 'theme':
      applyTheme(msg.theme);
      break;
    case 'selection':
      updateEl.hidden = !msg.settings;
      if (msg.settings) {
        sourceEl.value = msg.settings.source;
        themeEl.value = msg.settings.theme;
        backgroundEl.checked = msg.settings.background;
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

sourceEl.addEventListener('input', scheduleRender);
themeEl.addEventListener('change', render);
insertEl.addEventListener('click', () => submit(false));
updateEl.addEventListener('click', () => submit(true));

applyTheme(new URLSearchParams(location.search).get('theme') ?? 'light');
sourceEl.value = EXAMPLE;

Promise.all([
  document.fonts.load(`400 16px ${FONT_FAMILY}`),
  document.fonts.load(`700 16px ${FONT_FAMILY}`),
]).finally(() => {
  render();
  send({ type: 'ready' });
});
