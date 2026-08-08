import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/google-job-monitor.test.ts"],
    testTimeout: 10_000,
  },
});
