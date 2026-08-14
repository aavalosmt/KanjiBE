import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    setupFiles: ["./tests/setup.ts"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "file:./data/test.db",
      ADMIN_API_KEY: "test-admin-key",
      PUBLIC_BASE_URL: "http://localhost:3000",
      UPLOAD_DIR: "./uploads-test",
      CORS_ORIGIN: "*"
    }
  }
});
