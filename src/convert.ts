import { type Cap, type Diagram, type DiagramText, type PathCaps, type Point } from './model';

const SVG_NS = 'http://www.w3.org/2000/svg';

const GEOMETRY_TAGS = new Set(['rect', 'circle', 'ellipse', 'path', 'line', 'polyline', 'polygon']);

// Penpot does not apply <style> rules on import, so every paint property
// has to end up as a presentation attribute on the element itself.
const PAINT_PROPS = [
  'stroke-width',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
] as const;

const MARKER_PROPS = ['marker-start', 'marker-mid', 'marker-end'] as const;

interface Rgba {
  hex: string;
  alpha: number;
}

function parseColor(value: string): Rgba | null {
  const m = value.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  const [r, g, b] = parts;
  const alpha = parts.length > 3 ? parts[3] : 1;
  const hex = '#' + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
  return { hex, alpha };
}

function setPaint(el: Element, prop: 'fill' | 'stroke', value: string, opacity: string) {
  const color = parseColor(value);
  if (!color || color.alpha === 0) {
    el.setAttribute(prop, 'none');
    return;
  }
  el.setAttribute(prop, color.hex);
  const alpha = color.alpha * parseFloat(opacity || '1');
  if (alpha < 1) el.setAttribute(`${prop}-opacity`, String(alpha));
}

function stripPx(value: string) {
  return value.replace(/px/g, '');
}

function inlineStyles(svg: SVGSVGElement) {
  for (const el of Array.from(svg.querySelectorAll('*'))) {
    const tag = el.tagName.toLowerCase();
    if (!GEOMETRY_TAGS.has(tag)) continue;

    const cs = getComputedStyle(el);
    setPaint(el, 'fill', cs.fill, cs.fillOpacity);
    setPaint(el, 'stroke', cs.stroke, cs.strokeOpacity);
    for (const prop of PAINT_PROPS) {
      const value = cs.getPropertyValue(prop);
      if (value && value !== 'none' && value !== 'normal') el.setAttribute(prop, stripPx(value));
    }
    if (cs.opacity !== '1') el.setAttribute('opacity', cs.opacity);
    for (const prop of MARKER_PROPS) {
      const value = cs.getPropertyValue(prop);
      if (value && value !== 'none') el.setAttribute(prop, value);
    }
  }
}

function toRootMatrix(svg: SVGSVGElement, el: SVGGraphicsElement): DOMMatrix {
  const root = svg.getScreenCTM();
  const own = el.getScreenCTM();
  if (!root || !own) return new DOMMatrix();
  return DOMMatrix.fromMatrix(root).inverse().multiply(DOMMatrix.fromMatrix(own));
}

function rootBounds(svg: SVGSVGElement, el: SVGGraphicsElement) {
  const box = el.getBBox();
  const m = toRootMatrix(svg, el);
  const pts = [
    new DOMPoint(box.x, box.y),
    new DOMPoint(box.x + box.width, box.y),
    new DOMPoint(box.x, box.y + box.height),
    new DOMPoint(box.x + box.width, box.y + box.height),
  ].map((p) => p.matrixTransform(m));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y, scale: Math.hypot(m.a, m.b) };
}

// Mermaid marker ids name their shape (e.g. `mermaid-1_flowchart-v2-pointEnd`).
const CAP_PATTERNS: [RegExp, Cap][] = [
  [/circle|lollipop|sequencenumber/i, 'circle-marker'],
  [/composition|aggregation/i, 'diamond-marker'],
  [/cross/i, 'square-marker'],
  [/dependency|open|async|stick/i, 'line-arrow'],
  [/point|arrow|head|extension/i, 'triangle-arrow'],
];

function markerCap(marker: Element): Cap | undefined {
  return CAP_PATTERNS.find(([re]) => re.test(marker.id))?.[1];
}

// How far the marker reaches past the path end, along the path direction.
function markerReach(marker: Element, strokeWidth: number, atStart: boolean): number {
  const num = (name: string, fallback: number) => parseFloat(marker.getAttribute(name) ?? '') || fallback;
  const refX = num('refX', 0);
  const markerWidth = num('markerWidth', 3);
  const units = marker.getAttribute('markerUnits') === 'userSpaceOnUse' ? 1 : strokeWidth;

  let [minX, maxX, scale] = [0, markerWidth, units];
  const viewBox = marker.getAttribute('viewBox')?.split(/[\s,]+/).map(Number);
  if (viewBox && viewBox[2] > 0 && viewBox[3] > 0) {
    const [vx, , vw, vh] = viewBox;
    [minX, maxX] = [vx, vx + vw];
    scale = units * Math.min(markerWidth / vw, num('markerHeight', 3) / vh);
  }

  const outward = !atStart || marker.getAttribute('orient') === 'auto-start-reverse';
  return (outward ? maxX - refX : refX - minX) * scale;
}

// Mermaid shortens edges so the marker tip touches the node. Penpot centres
// its cap on the path end (tip 2x stroke width past it), so stretch the path
// until both tips meet.
function extendPath(el: Element, marker: Element, atStart: boolean) {
  if (!(el instanceof SVGGeometryElement)) return;
  const width = parseFloat(el.getAttribute('stroke-width') ?? '1') || 1;
  const extra = markerReach(marker, width, atStart) - 2 * width;
  const length = el.getTotalLength();
  if (extra < 0.5 || length === 0) return;

  const step = Math.min(0.5, length / 2);
  const [edge, inner] = atStart
    ? [el.getPointAtLength(0), el.getPointAtLength(step)]
    : [el.getPointAtLength(length), el.getPointAtLength(length - step)];
  const d = Math.hypot(edge.x - inner.x, edge.y - inner.y) || 1;
  const x = edge.x + ((edge.x - inner.x) / d) * extra;
  const y = edge.y + ((edge.y - inner.y) / d) * extra;

  if (el instanceof SVGLineElement) {
    el.setAttribute(atStart ? 'x1' : 'x2', String(x));
    el.setAttribute(atStart ? 'y1' : 'y2', String(y));
  } else if (el instanceof SVGPathElement) {
    const path = el.getAttribute('d') ?? '';
    if (!atStart) el.setAttribute('d', `${path} L ${x} ${y}`);
    else if (/^\s*M/.test(path)) el.setAttribute('d', `M ${x} ${y} L ${path.replace(/^\s*M/, '')}`);
  } else if (el instanceof SVGPolylineElement) {
    const points = el.getAttribute('points') ?? '';
    el.setAttribute('points', atStart ? `${x},${y} ${points}` : `${points} ${x},${y}`);
  }
}

// Penpot draws arrowheads as stroke caps, so markers turn into cap names
// keyed by the path's end points in root coordinates.
function extractCaps(svg: SVGSVGElement): PathCaps[] {
  const markerFor = (value: string | null) => {
    const id = value?.match(/url\(["']?#([^"')]+)["']?\)/)?.[1];
    return id ? svg.querySelector(`marker[id="${CSS.escape(id)}"]`) : null;
  };
  const caps: PathCaps[] = [];

  for (const el of Array.from(svg.querySelectorAll('[marker-start],[marker-end]'))) {
    const startMarker = markerFor(el.getAttribute('marker-start'));
    const endMarker = markerFor(el.getAttribute('marker-end'));
    const start = startMarker ? markerCap(startMarker) : undefined;
    const end = endMarker ? markerCap(endMarker) : undefined;
    if (start) extendPath(el, startMarker!, true);
    if (end) extendPath(el, endMarker!, false);

    if ((start || end) && el instanceof SVGGeometryElement) {
      const m = toRootMatrix(svg, el);
      const length = el.getTotalLength();
      const from = el.getPointAtLength(0).matrixTransform(m);
      const to = el.getPointAtLength(length).matrixTransform(m);
      caps.push({ from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, start, end });
    }
    for (const prop of MARKER_PROPS) el.removeAttribute(prop);
  }
  svg.querySelectorAll('marker').forEach((m) => m.remove());
  return caps;
}

function textLines(text: SVGTextElement): string[] {
  const rows = Array.from(text.children).filter(
    (c) => c.tagName.toLowerCase() === 'tspan' && (c.hasAttribute('x') || c.hasAttribute('dy')),
  );
  const lines = (rows.length > 0 ? rows : [text]).map((r) => (r.textContent ?? '').replace(/\s+/g, ' ').trim());
  return lines.filter((l) => l.length > 0);
}

function readText(svg: SVGSVGElement, el: SVGGraphicsElement, lines: string[], align: DiagramText['align']): DiagramText | null {
  if (lines.length === 0) return null;
  const bounds = rootBounds(svg, el);
  if (bounds.width === 0 || bounds.height === 0) return null;

  // Mermaid often styles the inner tspans rather than the <text> itself.
  const leaf = Array.from(el.querySelectorAll('tspan')).find((t) => !t.querySelector('tspan') && t.textContent?.trim());
  const cs = getComputedStyle(leaf ?? el);
  const color = parseColor(cs.fill) ?? parseColor(cs.color) ?? { hex: '#000000', alpha: 1 };
  const weight = parseInt(cs.fontWeight, 10);

  return {
    lines,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    fontSize: Math.round(parseFloat(cs.fontSize) * bounds.scale * 100) / 100,
    fontWeight: String(Number.isNaN(weight) ? 400 : weight),
    fontStyle: cs.fontStyle === 'italic' ? 'italic' : 'normal',
    color: color.hex,
    opacity: color.alpha * parseFloat(cs.fillOpacity || '1'),
    align,
  };
}

function anchorToAlign(anchor: string): DiagramText['align'] {
  if (anchor === 'middle') return 'center';
  if (anchor === 'end') return 'right';
  return 'left';
}

// Text becomes native Penpot text, so pull it out of the SVG.
function extractTexts(svg: SVGSVGElement): DiagramText[] {
  const texts: DiagramText[] = [];

  for (const el of Array.from(svg.querySelectorAll<SVGTextElement>('text'))) {
    const anchor = getComputedStyle(el).textAnchor;
    const text = readText(svg, el, textLines(el), anchorToAlign(anchor));
    if (text) texts.push(text);
  }

  for (const el of Array.from(svg.querySelectorAll<SVGForeignObjectElement>('foreignObject'))) {
    const inner = el.querySelector<HTMLElement>('div, span, p');
    const lines = (inner?.innerText || el.textContent || '').split('\n').map((l) => l.trim()).filter(Boolean);
    const text = readText(svg, el, lines, 'center');
    if (text) {
      const cs = getComputedStyle(inner ?? el);
      text.color = (parseColor(cs.color) ?? { hex: text.color }).hex;
      text.fontSize = parseFloat(cs.fontSize) || text.fontSize;
      texts.push(text);
    }
  }

  svg.querySelectorAll('text, foreignObject').forEach((n) => n.remove());
  return texts;
}

function removeHidden(svg: SVGSVGElement) {
  for (const el of Array.from(svg.querySelectorAll('*'))) {
    if (el.closest('defs')) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') el.remove();
  }
}

export function convertSvg(svgString: string, host: HTMLElement, background: string): Diagram {
  host.innerHTML = svgString;
  const svg = host.querySelector('svg');
  if (!svg) throw new Error('Mermaid did not return an SVG');

  const vb = svg.viewBox.baseVal;
  const width = Math.ceil(vb.width);
  const height = Math.ceil(vb.height);
  svg.removeAttribute('style');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));

  try {
    removeHidden(svg);
    inlineStyles(svg);
    const offset = (p: Point): Point => ({ x: p.x - vb.x, y: p.y - vb.y });
    const caps = extractCaps(svg).map((c) => ({ ...c, from: offset(c.from), to: offset(c.to) }));
    const texts = extractTexts(svg).map((t) => ({ ...t, x: t.x - vb.x, y: t.y - vb.y }));

    svg.querySelectorAll('style').forEach((s) => s.remove());
    for (const el of [svg, ...Array.from(svg.querySelectorAll('[class],[style]'))]) {
      el.removeAttribute('class');
      el.removeAttribute('style');
    }

    // Anchors the imported group to the viewBox origin so text offsets line up.
    // The plugin finds it again by its size, since Penpot drops ids on import.
    const bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('x', String(vb.x));
    bg.setAttribute('y', String(vb.y));
    bg.setAttribute('width', String(width));
    bg.setAttribute('height', String(height));
    bg.setAttribute('fill', background);
    svg.insertBefore(bg, svg.firstChild);

    return { svg: new XMLSerializer().serializeToString(svg), width, height, texts, caps };
  } finally {
    host.innerHTML = '';
  }
}
