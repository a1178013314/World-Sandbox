import { readFileSync } from "node:fs";
import { join } from "node:path";

interface AppMeta {
  name: string;
  version: string;
}

let cached: AppMeta | null = null;

/**
 * 读取应用元信息用于 Swagger 标题/版本。
 * 兼容源码运行（src/infra）与产物运行（dist/infra）两种目录深度，最后回退 cwd。
 */
export function readAppMeta(): AppMeta {
  if (cached) {
    return cached;
  }

  const candidates = [
    ...(typeof __dirname === "string"
      ? [join(__dirname, "../../package.json"), join(__dirname, "../package.json")]
      : []),
    join(process.cwd(), "package.json"),
  ];

  for (const file of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as {
        name?: unknown;
        version?: unknown;
      };
      if (typeof parsed.name === "string" && typeof parsed.version === "string") {
        cached = { name: parsed.name, version: parsed.version };
        return cached;
      }
    } catch {
      // 换下一个候选路径
    }
  }

  cached = { name: "@ifss/admin", version: "0.0.0" };
  return cached;
}
