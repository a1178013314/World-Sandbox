/** 从模型文本中取出第一个 JSON 值，容忍 markdown 围栏与前后废话。 */
export function extractJson(raw: string): unknown {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = Math.min(
    ...[cleaned.indexOf("{"), cleaned.indexOf("[")].filter((index) => index >= 0),
  );
  if (!Number.isFinite(start)) {
    throw new Error("输出中没有 JSON");
  }
  const opener = cleaned[start];
  const closer = opener === "{" ? "}" : "]";
  const end = cleaned.lastIndexOf(closer);
  if (end <= start) {
    throw new Error("JSON 不完整");
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}
