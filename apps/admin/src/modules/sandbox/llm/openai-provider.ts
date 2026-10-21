import { LlmError, type LlmProvider, type LlmRequest, type LlmResult } from "./provider";

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

/** 原生 fetch 打 OpenAI 兼容协议，不引入 SDK。 */
export class OpenAiProvider implements LlmProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeoutMs = 25_000,
  ) {}

  async complete(request: LlmRequest): Promise<LlmResult> {
    const startedAt = Date.now();
    const endpoint = `${this.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const timeoutMs = request.timeoutMs ?? this.timeoutMs;

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: request.model,
          messages: [{ role: "user", content: request.prompt }],
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          response_format: { type: "json_object" },
          stream: false,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new LlmError(
        error instanceof Error && error.name === "TimeoutError"
          ? `模型调用超时（${timeoutMs}ms）`
          : `模型调用失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!response.ok) {
      const body = (await response.text()).slice(0, 500);
      throw new LlmError(`模型返回 ${response.status}：${body}`, response.status);
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new LlmError(payload.error?.message ?? "模型返回空内容");
    }

    return {
      raw: content,
      tokensIn: payload.usage?.prompt_tokens ?? 0,
      tokensOut: payload.usage?.completion_tokens ?? 0,
      latencyMs: Date.now() - startedAt,
    };
  }
}
