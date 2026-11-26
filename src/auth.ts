import { unstable_rethrow } from "next/navigation";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/server/db";
import { accounts, sessions, users } from "@/server/db/schema";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
  }),
  // Reads AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET from the environment.
  providers: [Google],
  session: { strategy: "database" },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});

/**
 * Accounts are optional: without these env vars the app runs in anonymous
 * mode (compare works, nothing is saved, no sign-in button).
 */
export function isAuthConfigured(): boolean {
  return Boolean(
    process.env.AUTH_SECRET &&
      process.env.AUTH_GOOGLE_ID &&
      process.env.AUTH_GOOGLE_SECRET &&
      process.env.DATABASE_URL
  );
}

/**
 * The current session, or null when signed out, auth isn't configured, or the
 * session lookup fails (e.g. database down) so comparing still works.
 */
export async function getSessionSafe() {
  if (!isAuthConfigured()) return null;
  try {
    return await auth();
  } catch (e) {
    // Let Next.js's internal control-flow errors (dynamic rendering, redirects) through.
    unstable_rethrow(e);
    console.error("Session lookup failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** The signed-in user's ID, or null (see getSessionSafe). */
export async function currentUserId(): Promise<string | null> {
  const session = await getSessionSafe();
  return session?.user?.id ?? null;
}
