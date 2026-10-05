import type { Board, Shape } from '@penpot/plugin-types';
import {
  DATA_KEY,
  type Diagram,
  type DiagramSettings,
  type DiagramText,
  type PathCaps,
  type PluginMessage,
  type Point,
  type UIMessage,
} from './model';

// Without it `appendChild` puts children at the bottom. Not in plugin-types 1.4.
(penpot as typeof penpot & { flags: { naturalChildOrdering: boolean } }).flags.naturalChildOrdering = true;

penpot.ui.open('Mermaid', `?theme=${penpot.theme}`, { width: 420, height: 640 });

function send(message: PluginMessage) {
  penpot.ui.sendMessage(message);
}

function readSettings(shape: Shape): DiagramSettings | null {
  const raw = shape.getPluginData(DATA_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DiagramSettings;
  } catch {
    return null;
  }
}

function selectedDiagram(): Shape | null {
  const [shape] = penpot.selection;
  return penpot.selection.length === 1 && shape && readSettings(shape) ? shape : null;
}

function sendSelection() {
  const shape = selectedDiagram();
  send({ type: 'selection', settings: shape ? readSettings(shape) : null });
}

// Plain text in Penpot's default font: the UI measured labels with the
// same font, so the auto-width box lands where Mermaid put the label.
function createText(board: Board, t: DiagramText) {
  const text = penpot.createText(t.lines.join('\n'));
  if (!text) return;

  board.appendChild(text);
  text.name = t.lines.join(' ');
  text.fontSize = String(t.fontSize);
  if (t.fontWeight !== '400') text.fontWeight = t.fontWeight;
  if (t.fontStyle === 'italic') text.fontStyle = 'italic';
  text.fills = [{ fillColor: t.color, fillOpacity: t.opacity }];
  text.align = t.align;
  text.x = board.x + t.x;
  text.y = board.y + t.y;
}

function descendants(shape: Shape): Shape[] {
  const children = 'children' in shape ? shape.children : [];
  return children.flatMap((c) => [c, ...descendants(c)]);
}

function endPoints(shape: Shape): [Point, Point] | null {
  if (shape.type !== 'path') return null;
  const points = shape.commands.flatMap(({ params }) =>
    params?.x !== undefined && params.y !== undefined ? [{ x: params.x, y: params.y }] : [],
  );
  return points.length > 1 ? [points[0], points[points.length - 1]] : null;
}

const near = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) < 1.5;

function applyCaps(group: Shape, caps: PathCaps[], origin: Point) {
  const pending = [...caps];
  for (const shape of descendants(group)) {
    const ends = endPoints(shape);
    if (!ends) continue;
    const [first, last] = ends.map((p) => ({ x: p.x - origin.x, y: p.y - origin.y }));
    const i = pending.findIndex(
      (c) => (near(c.from, first) && near(c.to, last)) || (near(c.from, last) && near(c.to, first)),
    );
    if (i < 0) continue;
    const [cap] = pending.splice(i, 1);
    const [start, end] = near(cap.from, first) ? [cap.start, cap.end] : [cap.end, cap.start];
    shape.strokes = shape.strokes.map((stroke) => ({
      ...stroke,
      ...(start && { strokeCapStart: start }),
      ...(end && { strokeCapEnd: end }),
    }));
  }
}

function buildDiagram(diagram: Diagram, settings: DiagramSettings): Board {
  const group = penpot.createShapeFromSvg(diagram.svg);
  if (!group) throw new Error('Penpot could not import the diagram SVG');

  const board = penpot.createBoard();
  board.name = 'Mermaid diagram';
  board.clipContent = false;
  board.fills = [];
  board.resize(diagram.width, diagram.height);

  board.appendChild(group);
  group.name = 'Shapes';
  group.x = board.x;
  group.y = board.y;

  // The background rect spans the viewBox, so it marks the SVG origin.
  const background = descendants(group).find(
    (c) => c.type === 'rectangle' && Math.abs(c.width - diagram.width) < 1 && Math.abs(c.height - diagram.height) < 1,
  );
  const origin = background ? { x: background.x, y: background.y } : { x: group.x, y: group.y };
  applyCaps(group, diagram.caps, origin);

  if (background) {
    if (settings.background && background.fills !== 'mixed') {
      board.fills = background.fills;
    }
    background.remove();
  }

  for (const t of diagram.texts) createText(board, t);

  board.setPluginData(DATA_KEY, JSON.stringify(settings));
  return board;
}

function insert(diagram: Diagram, settings: DiagramSettings, replace: boolean) {
  const previous = replace ? selectedDiagram() : null;
  const board = buildDiagram(diagram, settings);

  if (previous) {
    const parent = previous.parent;
    if (parent && 'insertChild' in parent && parent.id !== board.parent?.id) {
      parent.insertChild(previous.parentIndex, board);
    }
    board.x = previous.x;
    board.y = previous.y;
    previous.remove();
  } else {
    const center = penpot.viewport.center;
    board.x = Math.round(center.x - diagram.width / 2);
    board.y = Math.round(center.y - diagram.height / 2);
  }

  penpot.selection = [board];
}

penpot.ui.onMessage<UIMessage>((msg) => {
  switch (msg.type) {
    case 'ready':
      sendSelection();
      break;
    case 'insert':
      try {
        insert(msg.diagram, msg.settings, msg.replace);
        send({ type: 'inserted' });
      } catch (e) {
        send({ type: 'error', message: e instanceof Error ? e.message : String(e) });
      }
      break;
  }
});

penpot.on('selectionchange', sendSelection);
penpot.on('themechange', (theme) => send({ type: 'theme', theme }));
