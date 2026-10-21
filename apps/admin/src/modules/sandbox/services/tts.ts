import { createHash } from "node:crypto";
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AppLoggerService } from "../../../logger/app-logger.service";
import { EventEntity } from "../entities/event.entity";

export const DEFAULT_TTS_VOICES = ["Cherry", "Serena", "Ethan", "Chelsie", "Dylan", "Ryan"];

const CACHE_LIMIT = 80;
const MAX_TEXT_CHARS = 600;
/** 0 数据 WAV，测试与断网演示用，避免真去调外部 TTS。 */
const SILENT_WAV = Buffer.from(
  "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
  "base64",
);

export interface TtsAudio {
  buffer: Buffer;
  contentType: string;
  voice: string;
  cached: boolean;
}

export function splitVoices(raw: string | undefined): string[] {
  const voices = (raw ?? "")
    .split(",")
    .map((voice) => voice.trim())
    .filter((voice) => voice !== "");
  return voices.length > 0 ? voices : DEFAULT_TTS_VOICES;
}

/** 网关会无视 response_format，直接回 WAV，这里按魔数补上真实类型。 */
export function detectAudioType(buffer: Buffer): string {
  if (
    buffer.subarray(0, 4).toString("latin1") === "RIFF" &&
    buffer.subarray(8, 12).toString("latin1") === "WAVE"
  ) {
    return "audio/wav";
  }
  if (buffer.subarray(0, 3).toString("latin1") === "ID3") {
    return "audio/mpeg";
  }
  if (buffer[0] === 0xff && (buffer[1] ?? 0) >= 0xe0) {
    return "audio/mpeg";
  }
  if (buffer.subarray(4, 8).toString("latin1") === "ftyp") {
    return "audio/mp4";
  }
  return "audio/mpeg";
}

/** 按角色首次发言的先后分配音色：前 6 个开口的角色互不重复，之后循环。 */
export function assignVoices(actorOrder: string[], voices: string[]): Map<string, string> {
  const list = voices.length > 0 ? voices : DEFAULT_TTS_VOICES;
  const assigned = new Map<string, string>();
  let cursor = 0;
  for (const actorId of actorOrder) {
    if (assigned.has(actorId)) {
      continue;
    }
    assigned.set(actorId, list[cursor % list.length] as string);
    cursor += 1;
  }
  return assigned;
}

/** 同一个角色在同一世界里始终拿到同一个音色；前 6 个 agent 刚好错开。 */
export function pickTtsVoice(agentId: string | null, voices: string[]): string {
  if (voices.length === 0) {
    return DEFAULT_TTS_VOICES[0] as string;
  }
  if (!agentId) {
    return voices[0] as string;
  }
  let hash = 0;
  for (const char of agentId) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return voices[hash % voices.length] as string;
}

/** 可重试的瞬时错误：网络抖动、超时、空音频。 */
class TtsTransientError extends Error {}

const RETRY_DELAY_MS = 300;
const VOICE_CACHE_LIMIT = 64;

@Injectable()
export class TtsService {
  private readonly cache = new Map<string, TtsAudio>();
  private readonly voiceCache = new Map<string, Map<string, string>>();

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(EventEntity)
    private readonly events: Repository<EventEntity>,
    private readonly logger: AppLoggerService,
  ) {}

  async audioForEvent(worldId: string, seq: number): Promise<TtsAudio> {
    if (!this.enabled) {
      throw new ServiceUnavailableException("语音朗读未启用");
    }
    const event = await this.events.findOne({ where: { worldId, seq } });
    if (!event) {
      throw new NotFoundException(`发言不存在：${seq}`);
    }
    if (event.kind !== "post" && event.kind !== "reply") {
      throw new BadRequestException("这条事件不是角色发言");
    }
    const text = (event.content ?? "").trim().slice(0, MAX_TEXT_CHARS);
    if (text === "") {
      throw new BadRequestException("这条发言没有可朗读的内容");
    }

    const voice = await this.voiceFor(worldId, event.actorId);
    const key = createHash("sha1").update(`${this.model}|${voice}|${text}`).digest("hex");
    const hit = this.cache.get(key);
    if (hit) {
      this.logger.info("语音命中缓存", { worldId, seq, voice, chars: text.length });
      return { ...hit, cached: true };
    }

    const startedAt = Date.now();
    const buffer = await this.synthesize(text, voice, worldId, seq);
    const audio: TtsAudio = {
      buffer,
      contentType: detectAudioType(buffer),
      voice,
      cached: false,
    };
    this.cache.set(key, audio);
    if (this.cache.size > CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }
    this.logger.info("语音合成完成", {
      worldId,
      seq,
      voice,
      chars: text.length,
      bytes: buffer.length,
      latencyMs: Date.now() - startedAt,
    });
    return audio;
  }

  private async voiceFor(worldId: string, actorId: string | null): Promise<string> {
    const voices = this.voices;
    let map = this.voiceCache.get(worldId);
    if (!map || (actorId !== null && !map.has(actorId))) {
      map = await this.loadVoiceMap(worldId, voices);
      this.voiceCache.set(worldId, map);
      if (this.voiceCache.size > VOICE_CACHE_LIMIT) {
        const oldest = this.voiceCache.keys().next().value;
        if (oldest !== undefined) {
          this.voiceCache.delete(oldest);
        }
      }
    }
    if (actorId === null) {
      return voices[0] as string;
    }
    return map.get(actorId) ?? pickTtsVoice(actorId, voices);
  }

  /** 用发言历史里每个角色第一次开口的 seq 排序，重启后音色也不会变。 */
  private async loadVoiceMap(worldId: string, voices: string[]): Promise<Map<string, string>> {
    const rows = await this.events
      .createQueryBuilder("event")
      .select("event.actorId", "actorId")
      .addSelect("MIN(event.seq)", "firstSeq")
      .where("event.worldId = :worldId", { worldId })
      .andWhere("event.actorId IS NOT NULL")
      .groupBy("event.actorId")
      .orderBy("firstSeq", "ASC")
      .getRawMany<{ actorId: string; firstSeq: number }>();
    return assignVoices(
      rows.map((row) => row.actorId),
      voices,
    );
  }

  private async synthesize(
    text: string,
    voice: string,
    worldId: string,
    seq: number,
  ): Promise<Buffer> {
    if (this.fake) {
      return SILENT_WAV;
    }

    let lastError = "";
    // 上游偶发超时/断连，重试一次比直接把 502 抛给播放器体验好。
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        return await this.requestSpeech(text, voice);
      } catch (error) {
        if (!(error instanceof TtsTransientError)) {
          throw error;
        }
        lastError = error.message;
        this.logger.warnWithFields("语音合成请求失败", {
          worldId,
          seq,
          voice,
          attempt,
          error: lastError,
        });
        if (attempt === 1) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
    }
    throw new BadGatewayException(`语音合成请求失败：${lastError}`);
  }

  private async requestSpeech(text: string, voice: string): Promise<Buffer> {
    const baseUrl = (this.config.get<string>("sandbox.baseUrl") ?? "").replace(/\/$/, "");
    const apiKey = this.config.get<string>("sandbox.apiKey") ?? "";
    if (baseUrl === "" || apiKey === "") {
      throw new ServiceUnavailableException("语音合成缺少 LLM_BASE_URL / LLM_API_KEY");
    }

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/audio/speech`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          voice,
          input: text,
          response_format: "mp3",
          speed: 1,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new TtsTransientError(error instanceof Error ? error.message : String(error));
    }

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200);
      this.logger.warnWithFields("语音合成返回非 2xx", { voice, status: response.status });
      throw new BadGatewayException(`语音合成失败（${response.status}）：${detail}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) {
      throw new TtsTransientError("语音合成返回空音频");
    }
    return buffer;
  }

  private get enabled(): boolean {
    return this.config.get<boolean>("sandbox.ttsEnabled") ?? true;
  }

  private get fake(): boolean {
    return (this.config.get<string>("sandbox.provider") ?? "openai") === "fake";
  }

  private get model(): string {
    return this.config.get<string>("sandbox.ttsModel") ?? "qwen3-tts-flash";
  }

  private get timeoutMs(): number {
    return this.config.get<number>("sandbox.ttsTimeoutMs") ?? 20_000;
  }

  private get voices(): string[] {
    return splitVoices(this.config.get<string>("sandbox.ttsVoices"));
  }
}
