const KEYWORDS = [
  'flowchart', 'graph', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'stateDiagram-v2', 'erDiagram',
  'journey', 'gantt', 'pie', 'quadrantChart', 'requirementDiagram', 'gitGraph', 'mindmap', 'timeline',
  'sankey-beta', 'xychart-beta', 'block-beta', 'packet-beta', 'kanban', 'architecture-beta',
  'subgraph', 'end', 'direction', 'classDef', 'class', 'style', 'linkStyle', 'click', 'state', 'note',
  'participant', 'actor', 'loop', 'alt', 'else', 'opt', 'par', 'and', 'critical', 'break', 'rect',
  'activate', 'deactivate', 'autonumber', 'title', 'section', 'dateFormat', 'axisFormat',
  'TD', 'TB', 'BT', 'LR', 'RL',
];

// Order matters: earlier groups win where they overlap.
const TOKEN = new RegExp(
  [
    String.raw`(?<comment>%%[^\n]*)`,
    String.raw`(?<string>"[^"\n]*"|\|[^|\n]*\|)`,
    String.raw`(?<keyword>(?<![\w-])(?:${KEYWORDS.join('|')})(?![\w-]))`,
    String.raw`(?<arrow><?[-=.]{2,}>{0,2}|-{1,2}[>x)]{1,2})`,
    String.raw`(?<number>\b\d+(?:\.\d+)?\b)`,
    String.raw`(?<punct>[[\](){}:;,])`,
  ].join('|'),
  'g',
);

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function highlight(source: string): string {
  let html = '';
  let last = 0;
  for (const m of source.matchAll(TOKEN)) {
    const kind = Object.entries(m.groups!).find(([, v]) => v !== undefined)![0];
    html += escape(source.slice(last, m.index)) + `<span class="tok-${kind}">${escape(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  // A trailing newline needs content after it, or the <pre> drops the last line.
  return html + escape(source.slice(last)) + '\n';
}
