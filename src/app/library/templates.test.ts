import { beforeEach, describe, expect, it, vi } from "vitest";
import { browserTemplateStore, fillTemplate, hasInputSlot, parseInputs } from "./templates";

describe("fillTemplate", () => {
  it("fills every {{input}} slot, tolerating spaces", () => {
    expect(fillTemplate("Translate {{input}} to French. Original: {{ input }}", "cat")).toBe(
      "Translate cat to French. Original: cat"
    );
  });

  it("uses the input as the whole prompt when there's no slot", () => {
    expect(hasInputSlot("No slot here")).toBe(false);
    expect(fillTemplate("No slot here", "Just this")).toBe("Just this");
  });

  it("doesn't treat $ patterns in the input as replacement codes", () => {
    expect(fillTemplate("Price: {{input}}", "$& and $1")).toBe("Price: $& and $1");
  });
});

describe("parseInputs", () => {
  it("splits on --- separator lines", () => {
    expect(parseInputs("first\nline two\n---\nsecond\n  ---  \n\nthird\n")).toEqual(["first\nline two", "second", "third"]);
  });

  it("without separators, uses one input per non-empty line", () => {
    expect(parseInputs("a\n\n b \r\nc")).toEqual(["a", "b", "c"]);
  });
});

describe("browserTemplateStore", () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    });
  });

  it("saves, replaces by name, lists by name and deletes", async () => {
    await browserTemplateStore.save("Zeta", "z");
    const first = await browserTemplateStore.save("Alpha", "a1");
    const replaced = await browserTemplateStore.save("Alpha", "a2");
    expect(replaced.id).toBe(first.id);
    expect((await browserTemplateStore.list()).map((t) => [t.name, t.prompt])).toEqual([
      ["Alpha", "a2"],
      ["Zeta", "z"],
    ]);
    await browserTemplateStore.remove(first.id);
    expect((await browserTemplateStore.list()).map((t) => t.name)).toEqual(["Zeta"]);
  });
});
