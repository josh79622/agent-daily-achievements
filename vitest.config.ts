import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// The default environment stays "node": test/web/styles-rtl.test.ts and
// test/web/language-pack.test.ts read files via `new URL(..., import.meta.url)`
// + `readFileSync`, and jsdom's URL shim breaks that when set globally
// ("The URL must be of scheme file"). Component tests opt into jsdom per
// file instead, with a `// @vitest-environment jsdom` docblock.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    setupFiles: ["test/setup/jest-dom.ts"],
  },
});
