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
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("/react/") || id.includes("/react-dom/")) return "react-vendor";
          if (id.includes("/tone/")) return "audio-vendor";
          if (id.includes("/@tauri-apps/")) return "tauri-vendor";
          if (id.includes("/zustand/")) return "state-vendor";
          return "vendor";
        },
      },
    },
  },
});
