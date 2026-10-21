import type { PackSource } from "@ifss/shared";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppLoggerService } from "../../../logger/app-logger.service";

export interface SearchOutcome {
  hits: PackSource[];
  failed: boolean;
}

interface AnySearchResponse {
  code?: number;
  message?: string;
  data?: {
    results?: {
      title?: unknown;
      url?: unknown;
      snippet?: unknown;
      content?: unknown;
    }[];
  };
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function httpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** anysearch 检索：只读外部资料，失败由调用方降级，不阻断造包。 */
@Injectable()
export class SearchService {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: AppLoggerService,
  ) {}

  get enabled(): boolean {
    return this.config.get<boolean>("sandbox.searchEnabled") ?? true;
  }

  async search(query: string, limit = 5): Promise<SearchOutcome> {
    if (!this.enabled) {
      return { hits: [], failed: false };
    }
    const endpoint =
      this.config.get<string>("sandbox.searchEndpoint") ?? "https://api.anysearch.com/v1/search";
    const timeoutMs = this.config.get<number>("sandbox.searchTimeoutMs") ?? 9000;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, max_results: limit }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`检索服务返回 ${response.status}`);
      }
      const payload = (await response.json()) as AnySearchResponse;
      if (typeof payload.code === "number" && payload.code !== 0) {
        throw new Error(payload.message ?? `检索服务错误码 ${payload.code}`);
      }

      const hits = (payload.data?.results ?? [])
        .map((item) => {
          const url = httpUrl(textOf(item.url));
          const title = textOf(item.title).slice(0, 120);
          if (!url || !title) {
            return null;
          }
          const snippet = (textOf(item.snippet) || textOf(item.content)).slice(0, 280);
          return { title, url, snippet };
        })
        .filter((hit): hit is PackSource => hit !== null)
        .slice(0, limit);

      return { hits, failed: false };
    } catch (error) {
      this.logger.warnWithFields("外部检索失败，降级为直接生成", {
        query: query.slice(0, 60),
        error: error instanceof Error ? error.message : String(error),
      });
      return { hits: [], failed: true };
    }
  }
}
