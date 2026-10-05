import { defineConfig } from 'vite';

// The plugin code runs in Penpot's sandbox, which cannot load modules,
// so it is bundled on its own into a single classic script.
export default defineConfig({
  publicDir: false,
  build: {
    emptyOutDir: false,
    lib: {
      entry: 'src/plugin.ts',
      formats: ['iife'],
      name: 'mermaidPlugin',
      fileName: () => 'plugin.js',
    },
  },
});
