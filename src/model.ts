export type MermaidTheme = 'default' | 'neutral' | 'dark' | 'forest' | 'base';

export interface DiagramText {
  lines: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontWeight: string;
  fontStyle: 'normal' | 'italic';
  color: string;
  opacity: number;
  align: 'left' | 'center' | 'right';
}

export type Cap = 'line-arrow' | 'triangle-arrow' | 'square-marker' | 'circle-marker' | 'diamond-marker';

export interface Point {
  x: number;
  y: number;
}

// Penpot strips ids on SVG import, so edges are matched by their end points.
export interface PathCaps {
  from: Point;
  to: Point;
  start?: Cap;
  end?: Cap;
}

export interface Diagram {
  svg: string;
  width: number;
  height: number;
  texts: DiagramText[];
  caps: PathCaps[];
}

export interface DiagramSettings {
  source: string;
  theme: MermaidTheme;
  background: boolean;
}

export type UIMessage =
  | { type: 'ready' }
  | { type: 'insert'; diagram: Diagram; settings: DiagramSettings; replace: boolean };

export type PluginMessage =
  | { type: 'theme'; theme: string }
  | { type: 'selection'; settings: DiagramSettings | null }
  | { type: 'inserted' }
  | { type: 'error'; message: string };

// Penpot's default text font, so labels need no font change on insert.
export const FONT_FAMILY = 'Source Sans Pro';
export const DATA_KEY = 'mermaid';
