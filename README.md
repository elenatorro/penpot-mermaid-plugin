# Penpot Mermaid plugin

Turns Mermaid code into editable Penpot shapes.

## How it works

1. The UI (iframe) renders the code with Mermaid, using SVG text labels and Source Sans Pro.
2. `src/convert.ts` cleans the SVG so Penpot imports it as plain shapes:
   - copies CSS rules onto each element as attributes (Penpot ignores `<style>`)
   - turns arrow markers into Penpot stroke caps
   - takes out `<text>` and `<foreignObject>` and records each label's box, font and colour
3. `src/plugin.ts` imports the SVG with `createShapeFromSvg`, puts it in a board,
   and adds one Penpot text per label in the default font (Source Sans Pro).
4. The board keeps the code, theme, background and shadow settings in plugin
   data. Select a diagram and the plugin loads it; **Update selected** replaces
   it in place.

The plugin UI follows Penpot's light or dark theme.

## Develop

```sh
npm install
npm run dev      # builds on change and serves http://localhost:4410
```

In Penpot press `Ctrl + Alt + P` and load `http://localhost:4410/manifest.json`.

`npm run build` writes the plugin to `dist/`. `plugin.js` is built on its own
(`vite.plugin.config.ts`) as a single script, because Penpot's sandbox cannot
load modules.

## Deploy

Host the contents of `dist/` on any static host and load
`https://<host>/manifest.json` in Penpot. Penpot fetches the plugin from
another origin, so the host must send `Access-Control-Allow-Origin: *`;
`public/_headers` sets it on Netlify and Cloudflare Pages.
