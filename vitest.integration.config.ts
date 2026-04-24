import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.integration.test.ts"],
    // Each AI call can take 15–60 s; allow ample time per suite.
    testTimeout: 120_000,
    hookTimeout: 30_000,
    // Run integration tests sequentially to avoid hammering the API quota.
    pool: "forks",
    fileParallelism: false,
    // Retry once on rate-limit / transient AI failures.
    retry: 2,
    reporters: ["verbose"],
  },
});
