import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// Nest DI 依赖 design:paramtypes，esbuild 不产出 decorator metadata，必须走 SWC 转译
export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        target: "es2022",
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
      module: { type: "es6" },
    }),
  ],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.e2e-spec.ts"],
    setupFiles: ["./test/setup-env.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
