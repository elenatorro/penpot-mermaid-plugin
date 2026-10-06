export interface Example {
  id: string;
  label: string;
  source: string;
}

export const EXAMPLES: Example[] = [
  {
    id: 'flowchart',
    label: 'Flowchart',
    source: `flowchart TD
    A[Start] --> B{Is it working?}
    B -- Yes --> C[Ship it]
    B -- No --> D[Debug]
    D --> B`,
  },
  {
    id: 'colors',
    label: 'Custom colors',
    source: `%%{init: {"theme": "base", "themeVariables": {
  "primaryColor": "#f3eefe",
  "primaryBorderColor": "#6911d4",
  "primaryTextColor": "#1f1f1f",
  "lineColor": "#6911d4",
  "secondaryColor": "#e6f7f1",
  "tertiaryColor": "#fff4e5",
  "fontSize": "15px"
}}}%%
flowchart LR
  A([Idea]) --> B[Design]
  B --> C{Approved?}
  C -- Yes --> D[Build]
  C -- No --> B
  D --> E([Release])

  classDef start fill:#6911d4,stroke:#4a0c96,color:#ffffff
  classDef done fill:#00b383,stroke:#00805e,color:#ffffff
  classDef decision fill:#fff4e5,stroke:#ff8a00,stroke-width:2px,color:#7a4200
  classDef review stroke-dasharray:6 4

  class A start
  class E done
  class C decision
  class B review

  linkStyle 3 stroke:#d32f2f,stroke-width:2px`,
  },
  {
    id: 'sequence',
    label: 'Sequence',
    source: `sequenceDiagram
    actor User
    participant App
    participant API
    User->>App: Click "Save"
    App->>API: POST /files
    API-->>App: 201 Created
    App-->>User: Show "Saved"`,
  },
  {
    id: 'class',
    label: 'Class',
    source: `classDiagram
    class Shape {
      +String id
      +String name
      +move(x, y)
    }
    class Rect {
      +Number radius
    }
    class Text {
      +String content
    }
    Shape <|-- Rect
    Shape <|-- Text`,
  },
  {
    id: 'state',
    label: 'State',
    source: `stateDiagram-v2
    [*] --> Draft
    Draft --> Review: submit
    Review --> Draft: request changes
    Review --> Published: approve
    Published --> [*]`,
  },
  {
    id: 'er',
    label: 'Entity relationship',
    source: `erDiagram
    TEAM ||--o{ PROJECT : owns
    PROJECT ||--o{ FILE : contains
    FILE ||--o{ PAGE : has
    TEAM }o--o{ PROFILE : members`,
  },
  {
    id: 'journey',
    label: 'User journey',
    source: `journey
    title Design a screen
    section Explore
      Gather references: 4: Designer
      Sketch ideas: 3: Designer
    section Build
      Draw layout: 5: Designer
      Review with team: 3: Designer, Developer`,
  },
  {
    id: 'gantt',
    label: 'Gantt',
    source: `gantt
    title Release plan
    dateFormat YYYY-MM-DD
    axisFormat %b %d
    tickInterval 1week
    section Design
      Research :a1, 2026-01-05, 7d
      Mockups  :a2, after a1, 10d
    section Development
      Build    :b1, after a2, 14d
      Test     :b2, after b1, 5d`,
  },
  {
    id: 'pie',
    label: 'Pie',
    source: `pie title Time spent
    "Design" : 45
    "Code" : 30
    "Meetings" : 15
    "Review" : 10`,
  },
  {
    id: 'quadrant',
    label: 'Quadrant',
    source: `quadrantChart
    title Feature priority
    x-axis Low effort --> High effort
    y-axis Low impact --> High impact
    quadrant-1 Plan
    quadrant-2 Do now
    quadrant-3 Skip
    quadrant-4 Maybe later
    Dark mode: [0.3, 0.8]
    Export PDF: [0.7, 0.7]
    New icons: [0.2, 0.3]
    Rewrite engine: [0.9, 0.4]`,
  },
  {
    id: 'xychart',
    label: 'XY chart',
    source: `xychart-beta
    title "Monthly signups"
    x-axis [Jan, Feb, Mar, Apr, May, Jun]
    y-axis "Users" 0 --> 1000
    bar [320, 410, 530, 600, 720, 860]
    line [320, 410, 530, 600, 720, 860]`,
  },
  {
    id: 'timeline',
    label: 'Timeline',
    source: `timeline
    title Product history
    2024 : Idea : First prototype
    2025 : Public beta
    2026 : Version 1.0 : Plugin store`,
  },
  {
    id: 'mindmap',
    label: 'Mindmap',
    source: `mindmap
  root((DS))
    Colors
      Primary
      Neutral
    Typography
      Headings
      Body
    Components
      Buttons
      Inputs`,
  },
  {
    id: 'git',
    label: 'Git graph',
    source: `gitGraph
    commit
    branch feature
    checkout feature
    commit
    commit
    checkout main
    merge feature
    commit`,
  },
];
