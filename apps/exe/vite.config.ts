import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  // Fever owns 5173; BOARD.EXE gets its own port so both desktops can run.
  server: { port: 5175 },
  resolve: {
    alias: {
      // Point straight at the engine's TypeScript source, same as fever: the
      // worker bundle and the app bundle must share one module, not two copies.
      "@fourscore/engine": fileURLToPath(
        new URL("../../packages/engine/src/index.ts", import.meta.url),
      ),
    },
  },
});
