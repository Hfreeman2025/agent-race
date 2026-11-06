import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/integration/receipts.integration.ts"],
    testTimeout: 45000,
    maxWorkers: 1,
  },
});
