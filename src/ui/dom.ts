/**
 * 极简 DOM 助手：全项目唯一的 DOM 语法糖。
 *
 * 约定：
 * - 不拼 HTML 字符串，不用 innerHTML 渲染业务内容；
 * - attrs 只收字符串，class / id / data-* 走同一入口；
 * - on 必须返回解绑函数，重渲染时才有得收；
 * - 超过 60 行或开始处理 style，说明该开新文件。
 */

/** 创建元素：el("div", { class: "card" }, "腿账", 子节点) */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Array<Node | string | null | undefined>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, value);
  }
  for (const child of children) {
    // null / undefined 静默跳过，便于写条件子节点
    if (child === null || child === undefined) continue;
    node.append(child);
  }
  return node;
}

/** 查询单个元素：qs<HTMLDivElement>("#app") */
export function qs<T extends HTMLElement = HTMLElement>(
  selector: string,
  scope: ParentNode = document,
): T | null {
  return scope.querySelector<T>(selector);
}

/** 绑定事件，返回解绑函数 */
export function on<K extends keyof HTMLElementEventMap>(
  target: HTMLElement,
  type: K,
  handler: (ev: HTMLElementEventMap[K]) => void,
): () => void {
  const listener = handler as EventListener;
  target.addEventListener(type, listener);
  return () => target.removeEventListener(type, listener);
}

/** 清空子节点，避免重渲染时 listener 与旧节点一起泄漏 */
export function clear(node: HTMLElement): void {
  node.replaceChildren();
}
