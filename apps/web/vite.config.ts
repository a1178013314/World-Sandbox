import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv, type Plugin } from "vite";
import { defineConfig } from "vitest/config";

/** 启动时打印一条端口/代理日志，排查环境错配用 */
function logServerPlugin(port: number, target: string): Plugin {
  return {
    name: "ifss:log-server",
    configureServer(server) {
      server.config.logger.info(`[web] dev server http://localhost:${port}，/api -> ${target}`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const adminPort = env.PORT || "3001";
  const port = Number(env.VITE_PORT || 5173);
  const proxyTarget = env.VITE_API_PROXY_TARGET || `http://localhost:${adminPort}`;

  return {
    plugins: [react(), tailwindcss(), logServerPlugin(port, proxyTarget)],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      port,
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: "happy-dom",
      include: ["src/**/*.test.{ts,tsx}"],
      passWithNoTests: true,
    },
  };
});
