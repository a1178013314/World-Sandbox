import { describe, expect, it, vi } from "vitest";
import { clear, el, on, qs } from "@/ui/dom";

describe("dom.ts", () => {
  it("el 合并 attrs 与子节点", () => {
    const node = el("div", { class: "card", "data-day": "3" }, "腿账", el("span", {}, "138"));

    expect(node.className).toBe("card");
    expect(node.getAttribute("data-day")).toBe("3");
    expect(node.textContent).toBe("腿账138");
    expect(node.children).toHaveLength(1);
  });

  it("el 跳过 null / undefined 子节点", () => {
    const node = el("div", {}, null, undefined, "x");

    expect(node.childNodes).toHaveLength(1);
    expect(node.textContent).toBe("x");
  });

  it("on 返回的解绑函数会移除监听", () => {
    const button = el("button");
    const handler = vi.fn();
    const off = on(button, "click", handler);

    button.click();
    expect(handler).toHaveBeenCalledTimes(1);

    off();
    button.click();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("clear 清空子节点", () => {
    const node = el("div", {}, "a", "b");

    clear(node);

    expect(node.childNodes).toHaveLength(0);
  });

  it("qs 能在给定作用域内查找", () => {
    const scope = el("div", {}, el("p", { id: "day-3" }));

    expect(qs<HTMLParagraphElement>("#day-3", scope)?.id).toBe("day-3");
    expect(qs("#day-1", scope)).toBeNull();
  });
});
