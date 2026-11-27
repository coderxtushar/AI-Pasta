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

const button: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#fff",
  cursor: "pointer",
  fontSize: 14,
};

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
    <div style={{ marginTop: 8, fontSize: 13, color: "#374151" }} aria-label="Generation settings">
      <div>
        <strong>Settings:</strong> {describeSettings(all) || "provider defaults"}
      </div>
      {overrides.map(([id, s]) => (
        <div key={id}>
          <strong>{findModel(id)?.label ?? id}:</strong> {describeSettings(s)}
        </div>
      ))}
      {systemPrompts.map(([who, text]) => (
        <details key={who} style={{ marginTop: 4 }}>
          <summary style={{ cursor: "pointer" }}>System prompt ({who})</summary>
          <pre style={{ whiteSpace: "pre-wrap", margin: "4px 0 0", fontFamily: "inherit" }}>{text}</pre>
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
    <main style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <h1 style={{ margin: 0, marginRight: "auto" }}>{isOwner ? "Comparison" : "Shared comparison"}</h1>

        <Link href={`/?from=${comparison.id}`} style={{ ...button, color: "#111827" }}>
          {isOwner ? "Re-run" : "Try this prompt"}
        </Link>
        <a href={`/api/comparisons/${comparison.id}/csv`} download style={{ ...button, color: "#111827" }}>
          Export CSV
        </a>

        {isOwner && (
          <>
            {comparison.isPublic && <CopyLinkButton path={`/c/${comparison.id}`} style={button} />}
            <form action={setShareAction}>
              <input type="hidden" name="id" value={comparison.id} />
              <input type="hidden" name="isPublic" value={comparison.isPublic ? "false" : "true"} />
              <button type="submit" style={button}>
                {comparison.isPublic ? "Make private" : "Share publicly"}
              </button>
            </form>
            <form action={deleteComparisonAction}>
              <input type="hidden" name="id" value={comparison.id} />
              <input type="hidden" name="redirectTo" value="/history" />
              <button type="submit" style={{ ...button, color: "#b91c1c" }}>
                Delete
              </button>
            </form>
          </>
        )}
      </div>

      {isOwner && (
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 0 }}>
          {comparison.isPublic
            ? "Anyone with the link can view this comparison. Your API keys and account details are never shown."
            : "Only you can see this comparison."}
        </p>
      )}

      <section
        style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, background: "#fafafa", marginBottom: 16 }}
      >
        <div style={{ fontWeight: 600, marginBottom: 6 }}>
          Prompt
          {turns.length > 1 && (
            <span style={{ fontWeight: 400, color: "#6b7280" }}> · conversation of {turns.length} turns</span>
          )}
        </div>
        <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontFamily: "inherit" }}>{comparison.prompt}</pre>
        <time
          dateTime={comparison.createdAt.toISOString()}
          style={{ display: "block", marginTop: 8, fontSize: 12, color: "#6b7280" }}
        >
          {comparison.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
        </time>
        <SettingsSummary settings={comparison.settings} />
        {comparison.blind && (
          <div style={{ marginTop: 6, fontSize: 13, color: "#374151" }}>
            <strong>Blind comparison:</strong>{" "}
            {!vote
              ? "no vote was cast."
              : vote.winnerModelId === null
                ? `${isOwner ? "you" : "the author"} called it a tie.`
                : `${isOwner ? "you" : "the author"} picked ${findModel(vote.winnerModelId)?.label ?? vote.winnerModelId} without seeing names.`}
          </div>
        )}
      </section>

      {verdicts.length > 0 && (
        <section
          aria-label="AI judges"
          style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, background: "#fafafa", marginBottom: 16 }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>AI judges</div>
          {verdicts.map((v) => {
            const s = verdictSummary(v, nameOf);
            return (
              <div key={v.judgeModelId} style={{ fontSize: 14, marginTop: 4 }}>
                <strong>{s.judge}</strong> {s.pick}. {s.summary}
              </div>
            );
          })}
        </section>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {comparison.models.map((modelId) => {
          const last = turns.length - 1;
          return (
            <Model
              key={modelId}
              label={findModel(modelId)?.label ?? modelId}
              state={stateAt(modelId, last)}
              earlierTurns={turns.slice(0, last).map((prompt, t) => ({ prompt, state: stateAt(modelId, t) }))}
              currentPrompt={turns[last]}
              badge={vote?.winnerModelId === modelId ? "Blind pick" : undefined}
              footer={verdicts.map((v) => {
                const line = verdictLine(v, modelId, nameOf);
                return line ? (
                  <div key={v.judgeModelId} style={{ marginTop: 6, fontSize: 13, color: "#374151" }}>
                    <strong>
                      Judge ({findModel(v.judgeModelId)?.label ?? v.judgeModelId}
                      {turns.length > 1 ? ", first answer" : ""}):
                    </strong>{" "}
                    {line}
                  </div>
                ) : null;
              })}
            />
          );
        })}
      </div>
    </main>
  );
}
