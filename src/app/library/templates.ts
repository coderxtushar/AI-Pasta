// Prompt templates (client-safe). Signed-in users keep them in their account;
// everyone else keeps them in this browser.

export type Template = { id: string; name: string; prompt: string; updatedAt: string };

export const MAX_TEMPLATE_NAME = 100;
export const MAX_TEMPLATES = 200;

const INPUT_SLOT = /\{\{\s*input\s*\}\}/g;

/** True if the prompt has an {{input}} slot for batch runs. */
export const hasInputSlot = (prompt: string) => new RegExp(INPUT_SLOT.source).test(prompt);

/** Puts `input` into every {{input}} slot; without a slot, the input is the whole prompt. */
export function fillTemplate(prompt: string, input: string): string {
  return hasInputSlot(prompt) ? prompt.replace(INPUT_SLOT, () => input) : input;
}

/**
 * Splits batch inputs: blocks separated by a line containing only "---", or,
 * without any separator, one input per non-empty line.
 */
export function parseInputs(raw: string): string[] {
  const text = raw.replace(/\r\n/g, "\n");
  const parts = /^\s*---\s*$/m.test(text) ? text.split(/^\s*---\s*$/m) : text.split("\n");
  return parts.map((p) => p.trim()).filter(Boolean);
}

export type TemplateStore = {
  list(): Promise<Template[]>;
  save(name: string, prompt: string): Promise<Template>;
  remove(id: string): Promise<void>;
};

const STORAGE_KEY = "promptTemplates";

function readLocal(): Template[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((t) => t && typeof t.name === "string" && typeof t.prompt === "string") : [];
  } catch {
    return [];
  }
}

function writeLocal(templates: Template[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

const byName = (a: Template, b: Template) => a.name.localeCompare(b.name);

export const browserTemplateStore: TemplateStore = {
  async list() {
    return readLocal().sort(byName);
  },
  async save(name, prompt) {
    const all = readLocal();
    const existing = all.find((t) => t.name === name);
    if (!existing && all.length >= MAX_TEMPLATES) throw new Error(`You can keep up to ${MAX_TEMPLATES} templates.`);
    const template: Template = { id: existing?.id ?? crypto.randomUUID(), name, prompt, updatedAt: new Date().toISOString() };
    writeLocal([...all.filter((t) => t.name !== name), template]);
    return template;
  },
  async remove(id) {
    writeLocal(readLocal().filter((t) => t.id !== id));
  },
};

async function json(res: Response) {
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Server error ${res.status}`);
  return data;
}

export const accountTemplateStore: TemplateStore = {
  async list() {
    return (await json(await fetch("/api/templates"))).templates;
  },
  async save(name, prompt) {
    const res = await fetch("/api/templates", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, prompt }),
    });
    return (await json(res)).template;
  },
  async remove(id) {
    const res = await fetch(`/api/templates?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) await json(res);
  },
};
