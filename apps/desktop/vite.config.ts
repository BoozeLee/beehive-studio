import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 1420,
  },
  build: {
    rollupOptions: {
      output: {
        // Keep Tone.js separate (large, stable audio library) and let Rollup
        // handle the rest automatically to avoid circular chunk errors that
        // caused the app to render as a blank/black window.
        manualChunks(id) {
          if (id.includes("node_modules/tone/")) return "audio-vendor";
          return undefined;
        },
      },
    },
  },
});
