import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Check, Download, Github, Lock, Plus, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { DemoReplay, type DemoRun } from "@/components/landing/demo-replay";
import { EnterToStart } from "@/components/landing/enter-to-start";
import { Spotlight } from "@/components/landing/spotlight";
import Model from "./components/Model";
import { formatMetrics } from "./library/format";
import demo from "./library/demo-run.json";
import { MODELS, findModel } from "./library/models";
import { modelColor } from "./library/modelColors";
import { REPO_URL } from "./library/site";

type Props = { searchParams: Promise<{ from?: string }> };

const run = demo as DemoRun;
const exampleNote =
  run.source === "recorded" ? "From the recorded run above." : "Example values, from the illustrative run above.";

/** One feature: a short claim on one side, the real UI that backs it on the other. */
function Feature({
  title,
  children,
  visual,
  flip = false,
}: {
  title: string;
  children: React.ReactNode;
  visual: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <section className="grid items-center gap-8 py-14 md:grid-cols-2 md:gap-14">
      <div className={flip ? "md:order-2" : undefined}>
        <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</h2>
        <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-muted-foreground">{children}</div>
      </div>
      <div className={flip ? "md:order-1" : undefined}>{visual}</div>
    </section>
  );
}

function Frame({ children, caption }: { children: React.ReactNode; caption?: string }) {
  return (
    <figure className="reveal-on-scroll">
      <Spotlight className="rounded-xl border bg-card p-4 shadow-window">{children}</Spotlight>
      {caption && <figcaption className="mt-2 text-xs text-muted-foreground">{caption}</figcaption>}
    </figure>
  );
}

function KeysVisual() {
  const rows = [
    { label: "OpenAI", hint: "••••8f2c" },
    { label: "Anthropic", hint: "••••q7Lm" },
    { label: "Gemini", hint: null },
    { label: "Groq", hint: "••••3XwA" },
  ];
  return (
    <Frame caption="The API keys panel, signed in. Key endings are examples.">
      <div className="grid gap-2.5">
        {rows.map((r) => (
          <div key={r.label} className="grid gap-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {r.label}
              {r.hint && (
                <span className="inline-flex items-center gap-1 text-success">
                  <Lock className="size-3" aria-hidden /> saved
                </span>
              )}
            </div>
            <div className="flex h-9 items-center rounded-md border bg-subtle px-3 font-mono text-[13px] text-muted-foreground">
              {r.hint ?? <span className="text-muted-foreground/60">Paste key</span>}
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** The last sentence of a demo answer, as a short excerpt. */
function excerpt(modelId: string) {
  const text = run.answers.find((a) => a.modelId === modelId)?.text ?? "";
  const prose = text.split("```").at(-1)?.trim() ?? "";
  return prose.split(/(?<=\.)\s/)[0] ?? prose;
}

function BlindVisual() {
  const pair = [run.answers[0]?.modelId, run.answers[1]?.modelId].filter(Boolean) as string[];
  return (
    <Frame caption="Blind mode before the vote, and a personal leaderboard. Example values.">
      <div className="grid grid-cols-2 gap-2.5">
        {pair.map((id, i) => {
          const name = i === 0 ? "Model A" : "Model B";
          return (
            <Model
              key={id}
              label={name}
              anonymous
              state={{ status: "done", text: excerpt(id) }}
              footer={
                <span className="mt-3 inline-flex h-7 items-center rounded-md bg-secondary px-2.5 text-xs font-medium">
                  Pick {name}
                </span>
              }
            />
          );
        })}
      </div>
      <div className="mt-3 divide-y rounded-lg border text-[13px]">
        {[
          ["claude-sonnet-5-5", "64%"],
          ["gpt-5.4-mini", "52%"],
          ["gemini-flash-latest", "41%"],
        ].map(([id, rate], i) => (
          <div key={id} className="flex items-center gap-3 px-3 py-2">
            <span className="w-4 text-muted-foreground tabular">{i + 1}</span>
            <span aria-hidden className="size-2 rounded-full" style={{ background: modelColor(id) }} />
            <span className="flex-1">{findModel(id)?.label}</span>
            <span className="tabular">{rate}</span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function MetricsVisual() {
  const picks = run.answers.slice(0, 3);
  const fastest = picks.reduce((a, b) => (b.totalMs < a.totalMs ? b : a)).modelId;
  return (
    <Frame caption={exampleNote}>
      <div className="divide-y">
        {picks.map((a) => (
          <div key={a.modelId} className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span aria-hidden className="size-2 rounded-full" style={{ background: modelColor(a.modelId) }} />
              {findModel(a.modelId)?.label}
              {fastest === a.modelId && (
                <span className="ml-auto rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
                  Fastest
                </span>
              )}
            </div>
            <p className="mt-1 font-mono text-[11.5px] text-muted-foreground tabular">
              {formatMetrics({
                ttftMs: a.ttftMs,
                totalMs: a.totalMs,
                inputTokens: a.inputTokens,
                outputTokens: a.outputTokens,
                costUsd: a.costUsd,
              })}
            </p>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function BatchVisual() {
  const inputs = ["Arrived fast, box was crushed.", "Great fit, runs a size small.", "Stopped working after a week."];
  return (
    <Frame caption="A batch run in progress. Example inputs.">
      <div className="rounded-md border bg-subtle px-3 py-2 font-mono text-[12.5px]">
        Summarize this review in five words: <span className="text-brand">{"{{input}}"}</span>
      </div>
      <table className="mt-3 w-full text-left text-[12.5px]">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="pb-1.5 font-medium">Input</th>
            <th className="pb-1.5 font-medium">GPT-5.4 Mini</th>
            <th className="pb-1.5 font-medium">Qwen Plus</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {inputs.map((input, i) => (
            <tr key={input}>
              <td className="py-1.5 pr-2">{input}</td>
              <td className="py-1.5 pr-2 text-success">
                <Check className="inline size-3.5" aria-label="done" />
              </td>
              <td className="py-1.5 text-muted-foreground">
                {i < 2 ? (
                  <Check className="inline size-3.5 text-success" aria-label="done" />
                ) : (
                  <span className="animate-pulse">Running…</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span className="tabular">5 / 6 done</span>
        <span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-foreground">
          <Download className="size-3.5" aria-hidden /> Export CSV
        </span>
      </div>
    </Frame>
  );
}

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "What does it cost?",
    a: "AI Pasta is free to use. Every model runs on your own API key, so you pay each provider directly at their own prices. Nothing is resold or marked up.",
  },
  {
    q: "Do I need an account?",
    a: "No. Paste one key and compare. Signing in with Google adds history, share links, a blind-vote leaderboard, templates in your account and encrypted key storage.",
  },
  {
    q: "Where do my keys go?",
    a: "Signed out, keys stay in your browser and are sent only with the request for that provider's model. Signed in, they're encrypted with AES-256-GCM in your account and never sent back to the browser. Keys are never logged.",
  },
  {
    q: "Which models can I compare?",
    a: `${MODELS.map((m) => m.label).join(", ")}. The model list is one file in the open-source code, so adding a model is a one-line change.`,
  },
  {
    q: "Is it open source?",
    a: (
      <>
        Yes. The code is on{" "}
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="text-foreground underline">
          GitHub
        </a>
        .
      </>
    ),
  },
];

export default async function Landing({ searchParams }: Props) {
  // Old re-run links pointed at /?from=<id>; the workspace now lives at /app.
  const { from } = await searchParams;
  if (from) redirect(`/app?from=${encodeURIComponent(from)}`);

  return (
    <main className="overflow-x-clip">
      {/* Hero */}
      <section className="relative mx-auto max-w-[1200px] px-4 pt-12 sm:px-6 sm:pt-14">
        <div
          aria-hidden
          className="hero-glow pointer-events-none absolute inset-x-0 -top-24 -z-10 mx-auto h-[460px] max-w-4xl"
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in oklch, var(--foreground) 5%, transparent), transparent)",
          }}
        />
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="motion-rise text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-6xl">
            <span className="sm:block">Same prompt. Every model.</span> <span className="sm:block">Real numbers.</span>
          </h1>
          <p style={{ "--d": "90ms" } as React.CSSProperties} className="motion-rise mx-auto mt-5 max-w-2xl text-base leading-relaxed text-balance text-muted-foreground sm:text-lg">
            One prompt to GPT, Claude, Gemini, DeepSeek, Groq and Qwen at once: answers side by side, with latency
            and cost, on your own API keys.
          </p>
          <div style={{ "--d": "180ms" } as React.CSSProperties} className="motion-rise mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="h-11 px-5 text-[15px]">
              <Link href="/app">
                Start comparing
                <Kbd data-enter-kbd className="bg-primary-foreground/10 text-primary-foreground pointer-coarse:hidden">↵</Kbd>
              </Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="h-11 px-4 text-[15px] text-muted-foreground">
              <a href={REPO_URL} target="_blank" rel="noreferrer">
                <Github className="size-4" /> View on GitHub
              </a>
            </Button>
          </div>
          <p style={{ "--d": "260ms" } as React.CSSProperties} className="motion-rise mt-4 text-xs text-muted-foreground">No signup. One API key is enough.</p>
        </div>

        <div className="motion-window mt-10">
          <EnterToStart />
          <DemoReplay run={run} />
        </div>
      </section>

      {/* Features */}
      <div className="mx-auto max-w-[1100px] divide-y px-4 pt-10 sm:px-6">
        <Feature title="Your keys. No markup." visual={<KeysVisual />}>
          <p>
            Paste a key for any provider you already use. You pay each provider directly at their prices; AI Pasta
            never resells tokens.
          </p>
          <p>
            Signed out, keys stay in your browser. Signed in, they&apos;re encrypted with AES-256-GCM in your account
            and never sent back to the browser.
          </p>
        </Feature>

        <Feature title="Blind votes build your own leaderboard." visual={<BlindVisual />} flip>
          <p>
            Turn on blind mode and the answers arrive as Model A, B and C, with anything that could give a model away
            hidden. Pick the best one, then see who wrote it.
          </p>
          <p className="flex gap-2">
            <Scale className="mt-1 size-4 shrink-0 text-foreground" aria-hidden />
            <span>
              Or ask an AI judge to score every answer against your rubric. It sees them shuffled and labelled only by
              letter.
            </span>
          </p>
        </Feature>

        <Feature title="Numbers beside every answer." visual={<MetricsVisual />}>
          <p>
            Time to first token, total time, input and output tokens, and cost at list price, for every model, every
            time. Unknown prices stay unknown instead of guessed.
          </p>
          <p>When a model ignores a setting, like temperature on a reasoning model, the answer says so.</p>
        </Feature>

        <Feature title="Run your real workload, not a toy prompt." visual={<BatchVisual />} flip>
          <p>
            Save prompts as templates with an <code className="font-mono text-foreground">{"{{input}}"}</code> slot,
            run them over a list of inputs and every model you pick, and export the results as CSV for your design doc.
          </p>
        </Feature>

        <section className="py-14">
          <h2 className="text-xl font-semibold tracking-tight">Also in the box</h2>
          <ul className="mt-5 grid gap-x-10 gap-y-3 text-[15px] text-muted-foreground sm:grid-cols-2">
            {[
              "Follow-up turns, with each model continuing its own conversation",
              "A system prompt, temperature, top-p and max tokens, shared or per model",
              "History, re-run and public share links when signed in",
              "Markdown answers with highlighted code and a word-level diff",
              "Stop at any time; the provider call is cancelled with it",
              <>
                A command menu for every action: <Kbd>⌘K</Kbd>
              </>,
            ].map((item, i) => (
              <li key={i} className="flex gap-2.5">
                <Check className="mt-1 size-4 shrink-0 text-success" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="faq" className="py-14">
          <h2 id="faq" className="text-xl font-semibold tracking-tight">
            Questions
          </h2>
          <div className="mt-5 divide-y rounded-xl border">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="faq-item group px-4 py-3.5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium select-none [&::-webkit-details-marker]:hidden">
                  {q}
                  <Plus aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-out-expo group-open:rotate-45" />
                </summary>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>

      {/* Closing call to action */}
      <section className="border-t">
        <div className="mx-auto flex max-w-[1100px] flex-col items-center gap-5 px-4 py-20 text-center sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Pick your next model with numbers.
          </h2>
          <Button asChild size="lg" className="group h-11 px-5 text-[15px]">
            <Link href="/app">
              Start comparing{" "}
              <ArrowRight className="size-4 transition-transform duration-300 ease-out-expo group-hover:translate-x-0.5" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-xs text-muted-foreground sm:px-6">
          <span className="font-medium text-foreground">AI Pasta</span>
          <Link href="/app" className="hover:text-foreground">
            Compare
          </Link>
          <Link href="/batch" className="hover:text-foreground">
            Batch
          </Link>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:text-foreground">
            GitHub
          </a>
          <span className="ml-auto">Model names are trademarks of their respective owners.</span>
        </div>
      </footer>
    </main>
  );
}
