import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds the web/ React app into dist/web, which src/server/app.ts serves as
// static files. The Node server (src/) is untouched by this config; it has
// its own tsc-based build (scripts/build.mjs).
export default defineConfig({
  root: "web",
  plugins: [react()],
  build: {
    outDir: "../dist/web",
    emptyOutDir: false,
  },
});
