import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    globalSetup: ["./test/global-setup.ts"],
    setupFiles: ["./test/setup-env.ts"],
    environment: "node",
    include: ["test/**/*.test.ts"],
    // DB-backed tests share one SQLite file; run files serially to avoid clashes.
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
