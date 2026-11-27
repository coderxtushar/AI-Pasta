import { Button } from "@/components/ui/button";

/** Shown on account-only pages to signed-out visitors. */
export function SignInCard({ message, signIn }: { message: string; signIn: () => Promise<void> }) {
  return (
    <div className="rounded-xl border bg-card px-6 py-10 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      <form action={signIn} className="mt-4">
        <Button type="submit">Sign in with Google</Button>
      </form>
    </div>
  );
}
