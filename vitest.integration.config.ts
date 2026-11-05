import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["tests/integration/**/*.integration.ts"], testTimeout: 45000, maxWorkers: 1 },
});
