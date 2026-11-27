import Link from "next/link";
import { getSessionSafe, isAuthConfigured } from "@/auth";
import { signInAction, signOutAction } from "../actions";

const buttonStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#fff",
  cursor: "pointer",
  fontSize: 14,
};

export default async function Header() {
  const configured = isAuthConfigured();
  const session = await getSessionSafe();

  return (
    <header
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "14px 20px 0",
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}
    >
      <Link href="/" style={{ fontWeight: 700, fontSize: 18 }}>
        AI Pasta
      </Link>
      {session?.user && (
        <>
          <Link href="/history" style={{ fontSize: 14, color: "#2563eb" }}>
            History
          </Link>
          <Link href="/leaderboard" style={{ fontSize: 14, color: "#2563eb" }}>
            Leaderboard
          </Link>
        </>
      )}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
        {session?.user ? (
          <>
            <span style={{ fontSize: 14, color: "#374151" }}>{session.user.name ?? session.user.email}</span>
            <form action={signOutAction}>
              <button type="submit" style={buttonStyle}>
                Sign out
              </button>
            </form>
          </>
        ) : configured ? (
          <form action={signInAction}>
            <button type="submit" style={buttonStyle}>
              Sign in with Google
            </button>
          </form>
        ) : null}
      </div>
    </header>
  );
}
