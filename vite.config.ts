import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": at("./src") } },
  server: { port: Number(process.env.VITE_PORT) || 5173 },
  build: {
    rollupOptions: {
      // 双入口必须显式声明，否则 build 只产出 index.html，mobile.html 静默丢失
      input: { desktop: at("./index.html"), mobile: at("./mobile.html") },
    },
  },
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.ts"],
  },
});
