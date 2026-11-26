import { describe, expect, it } from "vitest";
import { readNdjson } from "./stream";

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
}

async function collect<T>(stream: ReadableStream<Uint8Array>) {
  const out: T[] = [];
  for await (const item of readNdjson<T>(stream)) out.push(item);
  return out;
}

describe("readNdjson", () => {
  const enc = new TextEncoder();

  it("parses events split across chunk boundaries", async () => {
    const text = '{"type":"delta","text":"Hel"}\n{"type":"delta","text":"lo"}\n{"type":"done"}\n';
    const chunks = [text.slice(0, 7), text.slice(7, 40), text.slice(40)].map((s) => enc.encode(s));
    expect(await collect(streamOf(chunks))).toEqual([
      { type: "delta", text: "Hel" },
      { type: "delta", text: "lo" },
      { type: "done" },
    ]);
  });

  it("handles a multi-byte character split between chunks", async () => {
    const bytes = enc.encode('{"text":"héllo 🍝"}\n');
    const split = bytes.indexOf(0xf0) + 2; // middle of the emoji
    expect(await collect(streamOf([bytes.slice(0, split), bytes.slice(split)]))).toEqual([
      { text: "héllo 🍝" },
    ]);
  });

  it("parses a final line without a trailing newline and skips blank lines", async () => {
    expect(await collect(streamOf([enc.encode('\n{"a":1}\n\n{"b":2}')]))).toEqual([{ a: 1 }, { b: 2 }]);
  });
});
