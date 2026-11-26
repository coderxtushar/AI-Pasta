import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUserId, isAuthConfigured } from "@/auth";
import { getComparisonForViewer, type SavedResponse } from "@/server/comparisons";
import Model, { type RunState } from "../../components/Model";
import CopyLinkButton from "../../components/CopyLinkButton";
import { findModel } from "../../library/models";
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

export default async function ComparisonPage({ params }: Props) {
  const { id } = await params;
  const found = await load(id);
  if (!found) notFound();
  const { comparison, responses, isOwner } = found;
  const byModel = new Map(responses.map((r) => [r.modelId, r]));

  return (
    <main style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <h1 style={{ margin: 0, marginRight: "auto" }}>{isOwner ? "Comparison" : "Shared comparison"}</h1>

        <Link href={`/?from=${comparison.id}`} style={{ ...button, color: "#111827" }}>
          {isOwner ? "Re-run" : "Try this prompt"}
        </Link>

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
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Prompt</div>
        <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontFamily: "inherit" }}>{comparison.prompt}</pre>
        <time
          dateTime={comparison.createdAt.toISOString()}
          style={{ display: "block", marginTop: 8, fontSize: 12, color: "#6b7280" }}
        >
          {comparison.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
        </time>
      </section>

      <div style={{ display: "grid", gap: 12 }}>
        {comparison.models.map((modelId) => {
          const saved = byModel.get(modelId);
          const state: RunState = saved
            ? toRunState(saved)
            : { status: "error", text: "", error: "No response saved yet." };
          return <Model key={modelId} label={findModel(modelId)?.label ?? modelId} state={state} />;
        })}
      </div>
    </main>
  );
}
