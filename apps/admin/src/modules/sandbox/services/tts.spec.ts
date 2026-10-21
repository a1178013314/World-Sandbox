import { describe, expect, it } from "vitest";
import {
  assignVoices,
  DEFAULT_TTS_VOICES,
  detectAudioType,
  pickTtsVoice,
  splitVoices,
} from "./tts";

describe("TTS 音色", () => {
  it("同一个角色稳定拿到同一个音色，前 6 个角色互不重复", () => {
    expect(pickTtsVoice("agent_1", DEFAULT_TTS_VOICES)).toBe(
      pickTtsVoice("agent_1", DEFAULT_TTS_VOICES),
    );
    const used = new Set(
      Array.from({ length: 6 }, (_, index) =>
        pickTtsVoice(`agent_${index + 1}`, DEFAULT_TTS_VOICES),
      ),
    );
    expect(used.size).toBe(6);
  });

  it("按首次开口顺序分配，前 6 个角色互不重复，第 7 个开始循环", () => {
    const order = ["sun_quan", "zhang_zhao", "lu_su", "zhuge_liang", "huang_gai", "lu_ji"];
    const voices = assignVoices(order, DEFAULT_TTS_VOICES);
    expect([...voices.values()]).toEqual(DEFAULT_TTS_VOICES);
    const seventh = assignVoices([...order, "bu_zhi"], DEFAULT_TTS_VOICES);
    expect(seventh.get("bu_zhi")).toBe(DEFAULT_TTS_VOICES[0]);
    expect(seventh.get("sun_quan")).toBe(DEFAULT_TTS_VOICES[0]);
  });

  it("空音色配置时用默认列表，重复角色不重复占位", () => {
    const voices = assignVoices(["a", "a", "b"], []);
    expect(voices.get("a")).toBe(DEFAULT_TTS_VOICES[0]);
    expect(voices.get("b")).toBe(DEFAULT_TTS_VOICES[1]);
  });

  it("按音频魔数识别真实格式，不被声明的 mp3 误导", () => {
    const wav = Buffer.from("RIFF\u0000\u0000\u0000\u0000WAVEfmt ", "latin1");
    expect(detectAudioType(wav)).toBe("audio/wav");
    expect(detectAudioType(Buffer.from([0xff, 0xfb, 0x90, 0x00]))).toBe("audio/mpeg");
    expect(detectAudioType(Buffer.from("ID3\u0004\u0000\u0000", "latin1"))).toBe("audio/mpeg");
  });

  it("没有角色时用第一个音色", () => {
    expect(pickTtsVoice(null, ["Cherry", "Ethan"])).toBe("Cherry");
    expect(pickTtsVoice("agent_1", [])).toBe(DEFAULT_TTS_VOICES[0]);
  });

  it("空配置回退默认音色，逗号与空格都能清理", () => {
    expect(splitVoices(undefined)).toEqual(DEFAULT_TTS_VOICES);
    expect(splitVoices(" , ")).toEqual(DEFAULT_TTS_VOICES);
    expect(splitVoices(" Cherry , Ethan ")).toEqual(["Cherry", "Ethan"]);
  });
});
