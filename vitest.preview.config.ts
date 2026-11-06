import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/integration/preview.integration.ts"],
    testTimeout: 15000,
    maxWorkers: 1,
  },
});
