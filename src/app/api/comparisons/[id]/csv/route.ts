import { NextResponse } from "next/server";
import { currentUserId, isAuthConfigured } from "@/auth";
import { RESULT_COLUMNS, resultRow, toCsv } from "@/app/library/csv";
import { findModel } from "@/app/library/models";
import { effectiveSettings } from "@/app/library/settings";
import { getComparisonForViewer } from "@/server/comparisons";
import { userTurns } from "@/app/library/conversation";

/** Downloads a saved comparison as CSV. Same access rule as its page: owner, or anyone if shared. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = isAuthConfigured() ? await getComparisonForViewer(id, await currentUserId()) : null;
  if (!found) return NextResponse.json({ error: "Comparison not found." }, { status: 404 });

  const { comparison, responses, vote, verdicts } = found;
  const saved = new Map(responses.map((r) => [`${r.modelId}:${r.turn}`, r]));
  const rows = userTurns(comparison).flatMap((prompt, turn) =>
    comparison.models.map((modelId) => {
      const r = saved.get(`${modelId}:${turn}`);
      return resultRow({
        prompt,
        turn,
        modelId,
        state: r
          ? {
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
                notes: r.notes ?? undefined,
              },
            }
          : { status: "error", text: "", error: "No response saved." },
        settings: effectiveSettings(comparison.settings, modelId),
        // Judges and blind votes are about the first prompt.
        judgeScores:
          turn === 0
            ? verdicts
                .filter((v) => v.scores[modelId])
                .map((v) => `${findModel(v.judgeModelId)?.label ?? v.judgeModelId} ${v.scores[modelId].score}/10`)
            : undefined,
        blindPick: turn === 0 && vote?.winnerModelId === modelId,
      });
    })
  );

  return new NextResponse("\uFEFF" + toCsv(RESULT_COLUMNS, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ai-pasta-${comparison.id.slice(0, 8)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
