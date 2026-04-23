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
    testTimeout: 90_000,
    hookTimeout: 30_000,
    // Run integration tests sequentially to avoid hammering the API.
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    reporters: ["verbose"],
  },
});
