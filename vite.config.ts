import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    emptyOutDir: false,
    // Mermaid lazy-loads big diagram engines (elk, cytoscape, katex).
    chunkSizeWarningLimit: 1600,
  },
  preview: {
    port: 4410,
    strictPort: true,
    cors: true,
  },
});
