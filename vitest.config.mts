import { fileURLToPath } from "node:url";

import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path("./src"),
      // Next resolves "server-only" to an empty module on the server; do the same here.
      "server-only": path("./node_modules/server-only/empty.js"),
    },
  },
  test: {
    environment: "node",
    projects: [
      { extends: true, test: { name: "unit", include: ["tests/unit/**/*.test.ts"] } },
      {
        // Route handlers against the local Supabase stack (npm run db:start).
        extends: true,
        test: {
          name: "api",
          include: ["tests/api/**/*.test.ts"],
          // .env.local, like `next dev` (Next itself skips it when NODE_ENV=test).
          env: loadEnv("development", process.cwd(), ""),
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
