import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Point straight at the engine's TypeScript source. The workspace symlink
      // would resolve too, but the alias keeps the worker bundle and the app
      // bundle pointing at the same module rather than two copies.
      "@fourscore/engine": fileURLToPath(new URL("../../packages/engine/src/index.ts", import.meta.url)),
    },
  },
});
