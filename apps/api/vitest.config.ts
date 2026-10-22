import { defineConfig } from "vitest/config";
import { config } from "dotenv";
config({ path: ".env.test", quiet: true });
export default defineConfig({
  test: { fileParallelism: false, testTimeout: 20000, hookTimeout: 30000 },
});
