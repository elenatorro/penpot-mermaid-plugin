import { ANCHOR_FILL, type Box, type Cap, type Dash, type Diagram, type DiagramText, type PathCaps, type Point } from './model';

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

// Penpot imports SVG filters with feDropShadow as shadows, but not the CSS
// drop-shadow() Mermaid uses, so each one becomes a shared <filter>.
function shadowFilter(svg: SVGSVGElement, value: string, cache: Map<string, string>): string | null {
  if (value.startsWith('url(')) return value;
  if (!value.startsWith('drop-shadow(')) return null;
  const cached = cache.get(value);
  if (cached) return cached;

  const color = parseColor(value) ?? { hex: '#000000', alpha: 1 };
  const [dx = 0, dy = 0, blur = 0] = Array.from(value.matchAll(/(-?[\d.]+)px/g), (m) => parseFloat(m[1]));
  const id = `shadow-${cache.size}`;

  const filter = document.createElementNS(SVG_NS, 'filter');
  filter.id = id;
  for (const [k, v] of Object.entries({ x: '-50%', y: '-50%', width: '200%', height: '200%' })) filter.setAttribute(k, v);
  const shadow = document.createElementNS(SVG_NS, 'feDropShadow');
  for (const [k, v] of Object.entries({
    dx,
    dy,
    stdDeviation: blur / 2,
    'flood-color': color.hex,
    'flood-opacity': color.alpha,
  })) shadow.setAttribute(k, String(v));
  filter.appendChild(shadow);

  let defs = svg.querySelector(':scope > defs');
  if (!defs) defs = svg.insertBefore(document.createElementNS(SVG_NS, 'defs'), svg.firstChild);
  defs.appendChild(filter);

  const url = `url(#${id})`;
  cache.set(value, url);
  return url;
}

function inlineStyles(svg: SVGSVGElement) {
  const filters = new Map<string, string>();
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
    const filter = cs.filter !== 'none' && shadowFilter(svg, cs.filter, filters);
    if (filter) el.setAttribute('filter', filter);
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
  [/point|arrow|head|extension|barb/i, 'triangle-arrow'],
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
// Markers with no Penpot cap (e.g. ER crow's feet) are copied onto the path
// end as plain shapes, placed the way the browser draws the marker.
function flattenMarker(el: SVGGeometryElement, marker: Element, atStart: boolean) {
  const num = (name: string, fallback: number) => parseFloat(marker.getAttribute(name) ?? '') || fallback;
  const length = el.getTotalLength();
  const step = Math.min(0.5, length / 2);
  const p = el.getPointAtLength(atStart ? 0 : length);
  const q = el.getPointAtLength(atStart ? step : length - step);
  const forward = atStart ? Math.atan2(q.y - p.y, q.x - p.x) : Math.atan2(p.y - q.y, p.x - q.x);

  const orient = marker.getAttribute('orient') ?? '0';
  let angle = orient.startsWith('auto') ? (forward * 180) / Math.PI : parseFloat(orient) || 0;
  if (atStart && orient === 'auto-start-reverse') angle += 180;

  const strokeWidth = parseFloat(el.getAttribute('stroke-width') ?? '1') || 1;
  const units = marker.getAttribute('markerUnits') === 'userSpaceOnUse' ? 1 : strokeWidth;
  let scale = units;
  const viewBox = marker.getAttribute('viewBox')?.split(/[\s,]+/).map(Number);
  if (viewBox && viewBox[2] > 0 && viewBox[3] > 0) {
    scale = units * Math.min(num('markerWidth', 3) / viewBox[2], num('markerHeight', 3) / viewBox[3]);
  }
  const [refX, refY] = [num('refX', 0), num('refY', 0)];

  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute(
    'transform',
    `translate(${p.x} ${p.y}) rotate(${angle}) scale(${scale}) translate(${-refX} ${-refY})`,
  );
  for (const child of Array.from(marker.children)) g.appendChild(child.cloneNode(true));
  el.after(g);
}

// Mermaid draws a state diagram's start as a filled circle node. Penpot has a
// circle cap, so the circle goes and its outgoing edges start at its centre.
function startStatesToCaps(svg: SVGSVGElement) {
  for (const circle of Array.from(svg.querySelectorAll<SVGGraphicsElement>('circle.state-start'))) {
    const b = rootBounds(svg, circle);
    const c = new DOMPoint(b.x + b.width / 2, b.y + b.height / 2);
    const reach = b.width / 2 + 3;

    for (const el of Array.from(svg.querySelectorAll<SVGPathElement>('.edgePaths path, .edges path'))) {
      const m = toRootMatrix(svg, el);
      const start = new DOMPoint(el.getPointAtLength(0).x, el.getPointAtLength(0).y).matrixTransform(m);
      if (Math.hypot(start.x - c.x, start.y - c.y) > reach) continue;
      const local = c.matrixTransform(m.inverse());
      const d = el.getAttribute('d') ?? '';
      el.setAttribute('d', `M ${local.x} ${local.y} L ${d.replace(/^\s*M/, '')}`);
      el.setAttribute('data-start-cap', 'circle-marker');
    }
    (circle.closest('.node') ?? circle).remove();
  }
}

// Mermaid's dotted (`..`, `-.->`) links draw 2px dashes and its dashed ones
// (`-->>`, requirement links) longer ones; solid edges get zero-gap arrays.
function dashStyle(el: Element): Dash | undefined {
  if (el.getAttribute('class')?.match(/edge-pattern-(\w+)/)?.[1] === 'solid') return undefined;
  const values = (el.getAttribute('stroke-dasharray') ?? '').split(/[\s,]+/).map(parseFloat);
  const i = values.findIndex((v, j) => j % 2 === 0 && v > 0);
  if (i < 0 || !(values[i + 1] > 0)) return undefined;
  return values[i] <= 2 ? 'dotted' : 'dashed';
}

function extractCaps(svg: SVGSVGElement): PathCaps[] {
  const markerFor = (value: string | null) => {
    const id = value?.match(/url\(["']?#([^"')]+)["']?\)/)?.[1];
    return id ? svg.querySelector(`marker[id="${CSS.escape(id)}"]`) : null;
  };
  const caps: PathCaps[] = [];

  const edges = Array.from(svg.querySelectorAll('path, line, polyline')).filter(
    (el) =>
      !el.closest('defs, marker') &&
      (el.tagName === 'line' ||
        el.getAttribute('fill') === 'none' ||
        MARKER_PROPS.some((prop) => el.hasAttribute(prop)) ||
        el.hasAttribute('data-start-cap')),
  );
  for (const el of edges) {
    const startMarker = markerFor(el.getAttribute('marker-start'));
    const endMarker = markerFor(el.getAttribute('marker-end'));
    const start =
      (startMarker ? markerCap(startMarker) : undefined) ??
      ((el.getAttribute('data-start-cap') as Cap | null) || undefined);
    const end = endMarker ? markerCap(endMarker) : undefined;
    if (start && startMarker) extendPath(el, startMarker, true);
    if (end) extendPath(el, endMarker!, false);
    if (el instanceof SVGGeometryElement) {
      if (startMarker && !start) flattenMarker(el, startMarker, true);
      if (endMarker && !end) flattenMarker(el, endMarker, false);
    }
    el.removeAttribute('data-start-cap');

    const dash = dashStyle(el);
    if ((start || end || dash) && el instanceof SVGGeometryElement) {
      const m = toRootMatrix(svg, el);
      const length = el.getTotalLength();
      // Chromium returns a legacy SVGPoint, whose matrixTransform rejects DOMMatrix.
      const toRoot = ({ x, y }: DOMPointReadOnly) => new DOMPoint(x, y).matrixTransform(m);
      const from = toRoot(el.getPointAtLength(0));
      const to = toRoot(el.getPointAtLength(length));
      caps.push({ from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, start, end, dash });
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

  // Rotated labels (e.g. vertical axis titles) keep their unrotated size
  // around the same centre; the plugin turns the Penpot text afterwards.
  const m = toRootMatrix(svg, el);
  const rotation = Math.round((Math.atan2(m.b, m.a) * 180) / Math.PI);
  let box: Box = bounds;
  if (rotation !== 0) {
    const local = el.getBBox();
    const [width, height] = [local.width * bounds.scale, local.height * bounds.scale];
    box = { x: bounds.x + (bounds.width - width) / 2, y: bounds.y + (bounds.height - height) / 2, width, height };
  }

  return {
    lines,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    ...(rotation !== 0 && { rotation }),
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

const center = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const contains = (b: Box, p: { x: number; y: number }) =>
  p.x > b.x && p.x < b.x + b.width && p.y > b.y && p.y < b.y + b.height;
const area = (b: Box) => b.width * b.height;

// A text's container is the smallest filled shape around its centre that holds
// no smaller shape and no other text, so clusters and class boxes are skipped.
// Texts are centred across it; vertically only if Mermaid centred them, so
// titles at the top of a box stay there.
function assignContainers(svg: SVGSVGElement, texts: DiagramText[]) {
  const boxes = Array.from(svg.querySelectorAll<SVGGraphicsElement>('rect, circle, ellipse, polygon, path'))
    .filter((el) => !el.closest('defs') && (el.getAttribute('fill') ?? 'none') !== 'none')
    .map((el) => rootBounds(svg, el))
    .filter((b) => b.width >= 1 && b.height >= 1)
    .map(({ x, y, width, height }) => ({ x, y, width, height }));
  const leaves = boxes.filter((b) => !boxes.some((o) => o !== b && area(o) < area(b) && contains(b, center(o))));

  for (const t of texts) {
    if (t.rotation) continue;
    const c = center(t);
    const container = leaves
      .filter((b) => contains(b, c) && texts.filter((o) => contains(b, center(o))).length === 1)
      .sort((a, b) => area(a) - area(b))[0];
    if (!container) continue;
    t.container = container;
    t.middle = Math.abs(center(container).y - c.y) <= 2;
  }
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

  assignContainers(svg, texts);
  svg.querySelectorAll('text, foreignObject').forEach((n) => n.remove());
  return texts;
}

function removeHidden(svg: SVGSVGElement) {
  for (const el of Array.from(svg.querySelectorAll('*'))) {
    if (el.closest('defs')) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') el.remove();
  }
  // A <switch> draws only its first child; Firefox still measures the rest.
  for (const sw of Array.from(svg.querySelectorAll('switch'))) {
    for (const child of Array.from(sw.children).slice(1)) child.remove();
  }
  // Mermaid leaves unsized label rects; browsers skip them but Penpot imports
  // them as tiny rects.
  for (const el of Array.from(svg.querySelectorAll<SVGGraphicsElement>('rect, circle, ellipse'))) {
    if (el.closest('defs, marker')) continue;
    const box = el.getBBox();
    if (box.width === 0 || box.height === 0) el.remove();
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
    startStatesToCaps(svg);
    const offset = (p: Point): Point => ({ x: p.x - vb.x, y: p.y - vb.y });
    const caps = extractCaps(svg).map((c) => ({ ...c, from: offset(c.from), to: offset(c.to) }));
    const texts = extractTexts(svg).map((t) => ({
      ...t,
      ...offset(t),
      ...(t.container && { container: { ...t.container, ...offset(t.container) } }),
    }));

    svg.querySelectorAll('style').forEach((s) => s.remove());
    for (const el of [svg, ...Array.from(svg.querySelectorAll('[class],[style]'))]) {
      el.removeAttribute('class');
      el.removeAttribute('style');
    }

    // Spans the viewBox and marks the diagram origin; the plugin finds it by
    // its fill, aligns the group to it and removes it.
    const anchor = document.createElementNS(SVG_NS, 'rect');
    anchor.setAttribute('x', String(vb.x));
    anchor.setAttribute('y', String(vb.y));
    anchor.setAttribute('width', String(width));
    anchor.setAttribute('height', String(height));
    anchor.setAttribute('fill', ANCHOR_FILL);
    svg.insertBefore(anchor, svg.firstChild);

    return { svg: new XMLSerializer().serializeToString(svg), background, width, height, texts, caps };
  } finally {
    host.innerHTML = '';
  }
}
