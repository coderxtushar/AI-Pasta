import Link from "next/link";
import { Github } from "lucide-react";
import { getSessionSafe, isAuthConfigured } from "@/auth";
import { Button } from "@/components/ui/button";
import { NavLinks, type NavItem } from "@/components/site/nav-links";
import { MobileNav } from "@/components/site/mobile-nav";
import { ThemeToggle } from "@/components/site/theme-toggle";
import { UserMenu } from "@/components/site/user-menu";
import { HeaderCta } from "@/components/site/header-cta";
import { REPO_URL } from "../library/site";
import { signInAction, signOutAction } from "../actions";

export default async function Header() {
  const configured = isAuthConfigured();
  const session = await getSessionSafe();
  const user = session?.user;

  const items: NavItem[] = [
    { href: "/app", label: "Compare" },
    { href: "/batch", label: "Batch" },
    ...(user
      ? [
          { href: "/history", label: "History" },
          { href: "/leaderboard", label: "Leaderboard" },
        ]
      : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 sm:gap-5 sm:px-6">
        <MobileNav items={items} />
        <Link href="/" className="text-[15px] font-semibold tracking-tight">
          AI Pasta
        </Link>
        <NavLinks items={items} />

        <div className="ml-auto flex items-center gap-1">
          <Button asChild variant="ghost" size="icon" className="hidden text-muted-foreground sm:inline-flex">
            <a href={REPO_URL} target="_blank" rel="noreferrer" aria-label="AI Pasta on GitHub">
              <Github className="size-4" />
            </a>
          </Button>
          <ThemeToggle />
          {user ? (
            <UserMenu name={user.name ?? user.email ?? "Account"} email={user.email} signOut={signOutAction} />
          ) : configured ? (
            <form action={signInAction}>
              <Button type="submit" variant="ghost" size="sm" aria-label="Sign in with Google">
                Sign in<span className="hidden sm:inline"> with Google</span>
              </Button>
            </form>
          ) : null}
          <HeaderCta />
        </div>
      </div>
    </header>
  );
}
