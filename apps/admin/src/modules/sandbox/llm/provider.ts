export type LlmPurpose = "act" | "act_repair" | "cast" | "compact" | "interview" | "card" | "pack";

export interface LlmRequest {
  purpose: LlmPurpose;
  model: string;
  prompt: string;
  maxTokens: number;
  temperature: number;
  /** 单次调用超时；缺省用 provider 默认值。造包这种长输出需要更久。 */
  timeoutMs?: number;
}

export interface LlmResult {
  raw: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
}

export interface LlmProvider {
  complete(request: LlmRequest): Promise<LlmResult>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export const LLM_PROVIDER = "SANDBOX_LLM_PROVIDER";
