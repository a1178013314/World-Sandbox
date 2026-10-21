import { createHash } from "node:crypto";
import type { LlmProvider, LlmRequest, LlmResult } from "./provider";

function hashOf(text: string): number {
  return Number.parseInt(createHash("sha256").update(text).digest("hex").slice(0, 8), 16);
}

function pick<T>(items: T[], hash: number): T {
  return items[hash % items.length] as T;
}

function marker(prompt: string, name: string): string {
  const match = prompt.match(new RegExp(`${name}：(.+)`));
  return match?.[1]?.trim() ?? "";
}

const ACT_LINES = [
  "这事我得说两句，先把账贴出来。",
  "大家先别急着吵，程序上得走清楚。",
  "涨可以，但服务得跟上。",
  "我算了算，这个涨幅不太对劲。",
  "先把明细发群里，别空口说。",
];

/**
 * 测试与 CI 用的假模型：按 prompt 内容哈希给出稳定回复，
 * 不触网、不同 prompt 得到不同结果。断网演示请导入预跑世界。
 */
export class FakeProvider implements LlmProvider {
  async complete(request: LlmRequest): Promise<LlmResult> {
    const startedAt = Date.now();
    const hash = hashOf(request.prompt);
    const raw = this.render(request, hash);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 8));
    return {
      raw,
      tokensIn: Math.ceil(request.prompt.length / 2),
      tokensOut: Math.ceil(raw.length / 2),
      latencyMs: Date.now() - startedAt,
    };
  }

  private render(request: LlmRequest, hash: number): string {
    if (request.purpose === "cast") {
      return this.renderCast(request.prompt, hash);
    }
    if (request.purpose === "interview") {
      return this.renderInterview(request.prompt, hash);
    }
    if (request.purpose === "card") {
      return this.renderCards(request.prompt);
    }
    if (request.purpose === "compact") {
      return "记忆压缩：物业费要涨的事还没说清，很多人等着看明细。";
    }
    if (request.purpose === "act" || request.purpose === "act_repair") {
      return this.renderAct(request.prompt, hash);
    }
    return "{}";
  }

  private renderAct(prompt: string, hash: number): string {
    if (hash % 5 === 0) {
      return JSON.stringify({
        action: "ignore",
        target_id: null,
        text: null,
        emotion: { label: "平静", intensity: 0.2 },
        private_reason: "先不接话",
      });
    }

    const factBlock = prompt.match(/\[本轮新事实\]\n([\s\S]*?)(?:\n\[|$)/);
    const fact = factBlock?.[1]
      ?.split("\n")
      .map((line) => line.replace(/^- /, "").trim())
      .find((line) => line !== "" && line !== "（无）");

    const text = fact ? `关于「${fact.slice(0, 24)}」，我得问清楚。` : pick(ACT_LINES, hash);

    return JSON.stringify({
      action: "post",
      target_id: null,
      text,
      emotion: { label: hash % 2 === 0 ? "不满" : "焦虑", intensity: 0.3 + (hash % 6) * 0.1 },
      private_reason: "看到消息后觉得不能装没看见",
    });
  }

  private renderCast(prompt: string, hash: number): string {
    const size = Number(prompt.match(/角色数量：(\d+)/)?.[1] ?? 8);
    const issue = marker(prompt, "种子").slice(0, 18) || "当前议题";
    const cast = Array.from({ length: size }, (_, index) => ({
      id: `agent_${index + 1}`,
      name: pick(
        ["周女士", "老陈", "小林", "阿杰", "刘老师", "王师傅", "赵老板", "婷婷"],
        hash + index,
      ),
      role: pick(["业主", "租户", "物业专员", "业委会成员"], hash + index * 3),
      goals: ["表达自己的立场"],
      fears: ["被群里的人忽视"],
      voice: pick(["短句、直接", "爱讲道理", "说话谨慎", "爱算账"], hash + index * 5),
      stance: {
        issue,
        position: index % 3 === 0 ? "oppose" : index % 3 === 1 ? "support" : "neutral",
        intensity: 0.3 + (index % 5) * 0.1,
      },
      influence: Math.min(0.95, 0.25 + index * 0.05),
      activity: { level: 0.5 + (index % 4) * 0.1, hours: [9, 14, 21] },
      can_see: ["本群消息"],
    }));
    return JSON.stringify(cast);
  }

  private renderInterview(prompt: string, hash: number): string {
    const seqs = (prompt.match(/可见 seq：([\d,\s]*)/)?.[1] ?? "")
      .split(",")
      .map((raw) => Number(raw.trim()))
      .filter((value) => Number.isInteger(value) && value > 0);
    const absent = prompt.includes("本轮是否在场：否");
    const answer = absent
      ? "那会儿我没看手机，群里发生了什么我真不太清楚。"
      : pick(
          [
            "我记得当时大家主要在争物业费涨得合不合理，明细一直没贴全。",
            "我印象最深的是有人一直追问账目，但没得到正面回答。",
            "我只看到了部分消息，后来好像有人把话题岔开了。",
          ],
          hash,
        );
    const cited = absent ? [] : [seqs[0], 999_999].filter((value) => value !== undefined);
    return JSON.stringify({ answer, cited });
  }

  private renderCards(prompt: string): string {
    const seqs = (prompt.match(/可引用 seq：([\d,\s]*)/)?.[1] ?? "")
      .split(",")
      .map((raw) => Number(raw.trim()))
      .filter((value) => Number.isInteger(value) && value > 0);
    const ref = seqs[0] ?? 1;
    return JSON.stringify({
      cards: [
        { type: "出圈", quote: "先把账贴出来。", ref, why: "一句话把争论拉回证据。" },
        { type: "分歧", quote: "涨可以，服务得跟上。", ref, why: "支持与反对在这里正面相撞。" },
        { type: "沉默", quote: "……", ref, why: "有人看见了，却选择不接话。" },
      ],
    });
  }
}
