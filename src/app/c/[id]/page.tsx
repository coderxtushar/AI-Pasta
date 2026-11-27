import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUserId, isAuthConfigured } from "@/auth";
import { getComparisonForViewer, type SavedResponse } from "@/server/comparisons";
import Model from "../../components/Model";
import type { RunState } from "../../library/generateClient";
import CopyLinkButton from "../../components/CopyLinkButton";
import { findModel } from "../../library/models";
import { userTurns } from "../../library/conversation";
import { verdictLine, verdictSummary } from "../../library/judge";
import { cleanSettings, describeSettings, type ComparisonSettings } from "../../library/settings";
import { deleteComparisonAction, setShareAction } from "../../actions";
import { modelColor } from "../../library/modelColors";
import { ChevronRight, Download, Globe, Lock, RotateCcw, Scale, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, PageShell } from "@/components/site/page-header";
import { CopyButton } from "@/components/workspace/copy-button";

type Props = { params: Promise<{ id: string }> };

// Shared by generateMetadata and the page so the lookup runs once per request.
const load = cache(async (id: string) => {
  if (!isAuthConfigured()) return null;
  return getComparisonForViewer(id, await currentUserId());
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await load((await params).id);
  if (!found) return { title: "Not found · AI Pasta" };
  const snippet = found.comparison.prompt.replace(/\s+/g, " ").slice(0, 60);
  // Shared prompts may be personal, so keep them out of search engines.
  return { title: `${snippet} · AI Pasta`, robots: { index: false, follow: false } };
}

function toRunState(r: SavedResponse): RunState {
  return {
    status: r.status,
    text: r.text,
    error: r.error ?? undefined,
    metrics: {
      ttftMs: r.ttftMs,
      totalMs: r.totalMs,
      inputTokens: r.inputTokens ?? undefined,
      outputTokens: r.outputTokens ?? undefined,
      reasoningTokens: r.reasoningTokens ?? undefined,
      costUsd: r.costUsd ?? undefined,
      finishReason: r.finishReason ?? undefined,
      notes: r.notes ?? undefined,
    },
  };
}


/** What the models were run with: shared settings, per-model overrides, and the system prompt(s). */
function SettingsSummary({ settings }: { settings: ComparisonSettings | null }) {
  const all = cleanSettings(settings?.all);
  const overrides = Object.entries(settings?.perModel ?? {})
    .map(([id, s]) => [id, cleanSettings(s)] as const)
    .filter(([, s]) => Object.keys(s).length > 0);
  const systemPrompts = [
    ...(all.systemPrompt ? [["All models", all.systemPrompt] as const] : []),
    ...overrides
      .filter(([, s]) => s.systemPrompt)
      .map(([id, s]) => [findModel(id)?.label ?? id, s.systemPrompt!] as const),
  ];

  return (
    <div aria-label="Generation settings" className="space-y-1 text-[13px] text-muted-foreground">
      <div>
        <span className="font-medium text-foreground">Settings:</span> {describeSettings(all) || "provider defaults"}
      </div>
      {overrides.map(([id, s]) => (
        <div key={id}>
          <span className="font-medium text-foreground">{findModel(id)?.label ?? id}:</span> {describeSettings(s)}
        </div>
      ))}
      {systemPrompts.map(([who, text]) => (
        <details key={who} className="group">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
            System prompt ({who})
          </summary>
          <pre className="mt-1 rounded-md bg-muted px-3 py-2 font-sans text-[13px] whitespace-pre-wrap text-foreground">
            {text}
          </pre>
        </details>
      ))}
    </div>
  );
}

export default async function ComparisonPage({ params }: Props) {
  const { id } = await params;
  const found = await load(id);
  if (!found) notFound();
  const { comparison, responses, isOwner, vote, verdicts } = found;
  const nameOf = (id: string) => findModel(id)?.label ?? id;
  const turns = userTurns(comparison);
  const saved = new Map(responses.map((r) => [`${r.modelId}:${r.turn}`, r]));
  const stateAt = (modelId: string, turn: number): RunState => {
    const r = saved.get(`${modelId}:${turn}`);
    return r ? toRunState(r) : { status: "error", text: "", error: "No response saved yet." };
  };

  return (
    <PageShell wide>
      <PageHeader
        title={isOwner ? "Comparison" : "Shared comparison"}
        description={
          isOwner
            ? comparison.isPublic
              ? "Anyone with the link can view this comparison. Your API keys and account details are never shown."
              : "Only you can see this comparison."
            : "Answers saved from a real run. Try the same prompt with your own keys."
        }
      >
        <Button asChild variant={isOwner ? "secondary" : "default"} size="sm">
          <Link href={`/app?from=${comparison.id}`}>
            <RotateCcw className="size-3.5" />
            {isOwner ? "Re-run" : "Try this prompt"}
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <a href={`/api/comparisons/${comparison.id}/csv`} download>
            <Download className="size-3.5" /> Export CSV
          </a>
        </Button>
        {isOwner && (
          <>
            {comparison.isPublic && <CopyLinkButton path={`/c/${comparison.id}`} />}
            <form action={setShareAction}>
              <input type="hidden" name="id" value={comparison.id} />
              <input type="hidden" name="isPublic" value={comparison.isPublic ? "false" : "true"} />
              <Button type="submit" variant="ghost" size="sm">
                {comparison.isPublic ? <Lock className="size-3.5" /> : <Globe className="size-3.5" />}
                {comparison.isPublic ? "Make private" : "Share publicly"}
              </Button>
            </form>
            <form action={deleteComparisonAction}>
              <input type="hidden" name="id" value={comparison.id} />
              <input type="hidden" name="redirectTo" value="/history" />
              <Button type="submit" variant="ghost" size="sm" className="text-danger hover:text-danger">
                <Trash2 className="size-3.5" /> Delete
              </Button>
            </form>
          </>
        )}
      </PageHeader>

      <section aria-label="Prompt" className="mb-4 rounded-xl border bg-card p-4">
        <div className="mb-2 flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Prompt</span>
          {turns.length > 1 && <span> · conversation of {turns.length} turns</span>}
          <time dateTime={comparison.createdAt.toISOString()} className="ml-auto tabular">
            {comparison.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
          </time>
        </div>
        <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{comparison.prompt}</p>
        <div className="mt-3 space-y-1 border-t pt-3">
          <SettingsSummary settings={comparison.settings} />
          {comparison.blind && (
            <p className="text-[13px] text-muted-foreground">
              <span className="font-medium text-foreground">Blind comparison:</span>{" "}
              {!vote
                ? "no vote was cast."
                : vote.winnerModelId === null
                  ? `${isOwner ? "you" : "the author"} called it a tie.`
                  : `${isOwner ? "you" : "the author"} picked ${findModel(vote.winnerModelId)?.label ?? vote.winnerModelId} without seeing names.`}
            </p>
          )}
        </div>
      </section>

      {verdicts.length > 0 && (
        <section aria-label="AI judges" className="mb-4 rounded-xl border bg-card p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Scale className="size-4 text-muted-foreground" aria-hidden /> AI judges
          </h2>
          {verdicts.map((v) => {
            const s = verdictSummary(v, nameOf);
            return (
              <p key={v.judgeModelId} className="mt-1 text-sm">
                <strong className="font-semibold">{s.judge}</strong> {s.pick}. {s.summary}
              </p>
            );
          })}
        </section>
      )}

      <h2 className="sr-only">Answers</h2>
      <div className="grid items-start gap-3 md:grid-cols-[repeat(auto-fit,minmax(340px,1fr))]">
        {comparison.models.map((modelId) => {
          const last = turns.length - 1;
          return (
            <Model
              key={modelId}
              label={findModel(modelId)?.label ?? modelId}
              color={modelColor(modelId)}
              state={stateAt(modelId, last)}
              earlierTurns={turns.slice(0, last).map((prompt, t) => ({ prompt, state: stateAt(modelId, t) }))}
              currentPrompt={turns[last]}
              badge={vote?.winnerModelId === modelId ? "Blind pick" : undefined}
              actions={stateAt(modelId, last).text ? <CopyButton text={stateAt(modelId, last).text} label="Copy answer" /> : null}
              footer={verdicts.map((v) => {
                const line = verdictLine(v, modelId, nameOf);
                return line ? (
                  <p key={v.judgeModelId} className="mt-3 border-t pt-2 text-[13px] text-muted-foreground">
                    <strong className="font-medium text-foreground">
                      Judge ({findModel(v.judgeModelId)?.label ?? v.judgeModelId}
                      {turns.length > 1 ? ", first answer" : ""}):
                    </strong>{" "}
                    {line}
                  </p>
                ) : null;
              })}
            />
          );
        })}
      </div>
    </PageShell>
  );
}
