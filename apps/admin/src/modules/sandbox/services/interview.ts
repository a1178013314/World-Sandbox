import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import { LlmService } from "../llm/llm.service";
import { buildInterviewPrompt } from "../prompts/interview";
import { extractJson } from "./json";
import { WorldService } from "./world";

const InterviewOutputSchema = z.object({
  answer: z.string().trim().min(1),
  cited: z.array(z.number()).default([]),
});

export interface InterviewResult {
  answer: string;
  cited: number[];
}

@Injectable()
export class InterviewService {
  constructor(
    private readonly worlds: WorldService,
    private readonly llm: LlmService,
    private readonly config: ConfigService,
  ) {}

  async ask(worldId: string, agentId: string, question: string): Promise<InterviewResult> {
    const questionText = question.trim();
    if (!questionText) {
      throw new NotFoundException("问题不能为空");
    }
    const snapshot = await this.worlds.snapshot(worldId);
    const agent = snapshot.agents.find((item) => item.agentId === agentId);
    if (!agent) {
      throw new NotFoundException(`角色不存在：${agentId}`);
    }
    const visibleEvents = await this.worlds.visibleEvents(worldId, agentId);
    const latestRound = snapshot.rounds.at(-1);
    const activeInLatestRound = latestRound?.activeIds.includes(agentId) ?? false;
    const model = this.config.get<string>("sandbox.modelAct") ?? "claude-sonnet-5-5";

    const result = await this.llm.complete({
      worldId,
      round: snapshot.world.currentRound,
      agentId,
      purpose: "interview",
      model,
      prompt: buildInterviewPrompt({
        agent,
        agents: snapshot.agents.map((item) => item.profile),
        visibleEvents,
        question: questionText,
        activeInLatestRound,
      }),
      maxTokens: 500,
      temperature: 0.7,
    });

    let parsed: z.infer<typeof InterviewOutputSchema>;
    try {
      parsed = InterviewOutputSchema.parse(extractJson(result.raw));
    } catch {
      return { answer: result.raw.trim().slice(0, 500), cited: [] };
    }

    const visibleSeqs = new Set(visibleEvents.map((event) => event.seq));
    const cited = [...new Set(parsed.cited)].filter((seq) => visibleSeqs.has(seq));
    return { answer: parsed.answer, cited };
  }
}
