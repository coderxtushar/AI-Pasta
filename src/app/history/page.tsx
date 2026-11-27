import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUserId, isAuthConfigured } from "@/auth";
import { listComparisons } from "@/server/comparisons";
import { findModel } from "../library/models";
import { deleteComparisonAction, signInAction } from "../actions";

// Always render per request: whether accounts are enabled is read from runtime
// env vars, and a build without them must not bake in a static 404.
export const dynamic = "force-dynamic";

export const metadata = { title: "History · AI Pasta" };

const card: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 12,
  background: "#fff",
};

type Props = { searchParams: Promise<{ q?: string }> };

export default async function HistoryPage({ searchParams }: Props) {
  if (!isAuthConfigured()) notFound();
  const { q } = await searchParams;
  const userId = await currentUserId();

  if (!userId) {
    return (
      <main style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
        <h1>History</h1>
        <p style={{ color: "#6b7280" }}>Sign in to see the comparisons you&apos;ve run.</p>
        <form action={signInAction}>
          <button type="submit" style={{ ...card, cursor: "pointer" }}>
            Sign in with Google
          </button>
        </form>
      </main>
    );
  }

  const items = await listComparisons(userId, q);

  return (
    <main style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 12 }}>History</h1>

      <form method="get" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search prompts…"
          style={{ flex: 1, padding: 8, border: "1px solid #d1d5db", borderRadius: 6 }}
        />
        <button type="submit" style={{ ...card, padding: "8px 14px", cursor: "pointer" }}>
          Search
        </button>
      </form>

      {items.length === 0 ? (
        <p style={{ color: "#6b7280" }}>
          {q ? `No comparisons match “${q}”.` : "No comparisons yet. Run one and it will show up here."}
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
          {items.map((c) => (
            <li key={c.id} style={card}>
              <Link href={`/c/${c.id}`} style={{ display: "block", color: "#111827" }}>
                <div
                  style={{
                    fontWeight: 600,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {c.prompt}
                </div>
              </Link>
              <div style={{ marginTop: 6, fontSize: 13, color: "#6b7280" }}>
                {c.models.map((id) => findModel(id)?.label ?? id).join(", ")}
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 12, alignItems: "center", fontSize: 13 }}>
                <time dateTime={c.createdAt.toISOString()} style={{ color: "#6b7280" }}>
                  {c.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                </time>
                {c.isPublic && <span style={{ color: "#16a34a", fontWeight: 600 }}>Shared</span>}
                {c.blind && <span style={{ color: "#4f46e5", fontWeight: 600 }}>Blind</span>}
                {c.followUps.length > 0 && (
                  <span style={{ color: "#374151", fontWeight: 600 }}>{c.followUps.length + 1} turns</span>
                )}
                <Link href={`/app?from=${c.id}`} style={{ color: "#2563eb", marginLeft: "auto" }}>
                  Re-run
                </Link>
                <form action={deleteComparisonAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <button
                    type="submit"
                    style={{ border: "none", background: "none", color: "#b91c1c", cursor: "pointer", fontSize: 13 }}
                  >
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
