# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers choosing which model and provider to build on. They are mid-decision: they have
a real prompt (or a set of real inputs) from their own product, and they want to see how
several models actually answer it, how fast, and at what cost, before committing.

## Product Purpose

AI Pasta sends one prompt to several AI models at once and shows the answers side by side
as they stream, with latency, tokens and cost for each. It exists so a model choice is
made from the developer's own prompts and numbers rather than from public benchmarks or
habit. Success: a developer leaves with a decision they can defend ("model X, because it
won my blind votes on these prompts at a third of the cost").

## Positioning

- **Your keys, no markup.** Bring your own provider API keys. Signed-in users' keys are
  encrypted (AES-256-GCM) in their account; the browser never gets them back. Users pay
  providers directly; AI Pasta never resells tokens.
- **Blind personal verdicts.** Blind mode hides model names until you vote; votes build a
  leaderboard from *your* prompts. An AI judge scores answers against a rubric, seeing them
  shuffled and labelled only by letter.
- **Decision metrics.** Time to first token, total time, input/output/reasoning tokens and
  estimated cost beside every answer.
- **Real-workload evals.** Prompt templates with an `{{input}}` slot, batch runs over many
  inputs and models, CSV export.

## Operating Context

- Models today: GPT-5.4 Mini (OpenAI), Claude Sonnet 5.5 (Anthropic), Gemini Flash
  (Google), DeepSeek Chat, GPT-OSS 120B (Groq), Qwen Plus (Alibaba). The registry lives in
  `src/app/library/models.ts`; prices are confirmed for three of the six.
- Works signed out (keys in the browser, nothing saved) or signed in with Google (history,
  sharing, saved keys, leaderboard, templates).
- Flows: compare → (blind vote / judge) → follow-up turns → save / share / export; batch
  runs from a template; history search and re-run; public read-only share links.
- Generation settings: system prompt, temperature, top-p, max tokens, global or per model.
  Some reasoning models ignore temperature/top-p and the UI says so.

## Capabilities and Constraints

- Next.js 15 App Router, React 19, Tailwind v4 (shadcn token set in `globals.css`),
  Postgres + Drizzle, Auth.js (Google), Vercel AI SDK v5.
- Answers stream token by token; one request per model; Stop cancels the provider call.
- Up to 20 turns per conversation; 20,000-character prompts; batches of up to 50 inputs.
- Rate limits: 60 model calls/min per IP; the client waits and retries on 429.
- Undecided: pricing for AI Pasta itself (currently free; users pay providers), additional
  sign-in methods, image/file inputs.

## Brand Commitments

- Name: **AI Pasta**. No logo or brand assets exist yet.
- Visual direction (chosen 2026-11-27): the category-standard dark developer-tool look,
  executed at **Raycast's** level of craft. Conventions embraced straight, no ironic or
  quirky twists; light theme available.

## Evidence on Hand

- Real: the working product and its features above; open-source code on GitHub
  (coderxtushar/AI-Pasta).
- None yet: users, customers, testimonials, usage numbers, press, benchmark results.
  Future work must not invent these. Model answers shown in marketing must be clearly
  illustrative or real captured output, never fabricated as measurements.

## Product Principles

1. **Your prompts, your numbers.** Every claim the product helps make should trace back
   to the user's own prompts and measured latency/cost.
2. **Fair comparison by default.** Same prompt, same settings, shuffled when blind;
   anything that could bias a verdict (names, position, a self-judging model) is hidden
   or disclosed.
3. **Keys are sacred.** Never show, log or resend a key; say plainly where keys live.
4. **Streaming is the product.** Watching several models answer at once is the core
   experience; nothing should slow or hide it.
5. **Honest metrics.** Unknown prices show as unknown; ignored settings are called out.

## Accessibility & Inclusion

Target WCAG 2.2 AA: full keyboard operation (including voting and the follow-up box),
visible focus, streaming regions announced politely to screen readers, respect for
reduced motion, and colour never the only signal for status.
