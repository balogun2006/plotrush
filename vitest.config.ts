import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
export default defineConfig({
  resolve: { alias: { "@": resolve(import.meta.dirname, ".") } },
  test: { include: ["tests/**/*.test.ts"], maxWorkers: 1, testTimeout: 20000 },
});
