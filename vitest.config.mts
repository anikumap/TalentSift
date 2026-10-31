import { defineConfig } from "vitest/config";
import path from "node:path";

const testEnv = {
  DATABASE_URL: "file:./test.db",
  ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  APP_URL: "http://localhost:3000",
};
Object.assign(process.env, testEnv);

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    env: testEnv,
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts", "tests/benchmark/**/*.test.ts"],
    globalSetup: ["tests/setup/global.ts"],
    pool: "forks",
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 20000,
  },
});
