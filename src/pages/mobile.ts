import "../styles/index.css";
import { el } from "@/ui/dom";

export function mount(root: HTMLElement): void {
  // TODO(呈现层): 替换为真实移动页（day-switch / 252px 圆环 / 判定 / 三格指标 / 同行人 / CTA）
  root.replaceChildren(el("main", { class: "screen" }, "腿账 · 移动"));
}

const host = document.getElementById("app");
if (host) mount(host);
