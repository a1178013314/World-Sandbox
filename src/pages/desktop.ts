import "../styles/index.css";
import { el } from "@/ui/dom";

export function mount(root: HTMLElement): void {
  // TODO(呈现层): 替换为真实桌面页（首屏三环 / 三天账单 / 怎么算的 / 减负对比 / 同行人 / 收尾）
  root.replaceChildren(el("main", { class: "screen" }, "腿账 · 桌面"));
}

const host = document.getElementById("app");
if (host) mount(host);
