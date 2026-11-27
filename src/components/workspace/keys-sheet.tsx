"use client";

import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import ApiManager from "@/app/components/ApiManager";
import AccountKeyManager from "@/app/components/AccountKeyManager";
import type { ApiKeys, SavedKeyInfo } from "@/app/library/providers";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Number of providers with a key, out of six. */
  count: number;
  /** Account keys (hints only); null means keys live in this browser. */
  accountKeys: SavedKeyInfo[] | null;
  onAccountKeysChange: (keys: SavedKeyInfo[]) => void;
  onBrowserKeysChange: (keys: ApiKeys) => void;
};

/** API keys in a side sheet: the account's encrypted keys when signed in, else this browser's. */
export function KeysSheet({ open, onOpenChange, count, accountKeys, onAccountKeysChange, onBrowserKeysChange }: Props) {
  const none = count === 0;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant={none ? "secondary" : "ghost"}
          size="sm"
          className={cn("gap-2", none ? "text-brand" : "text-muted-foreground")}
        >
          <KeyRound className="size-4" />
          {none ? "Add API keys" : "API keys"}
          <span className="font-mono text-xs tabular text-muted-foreground">{count}/6</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>API keys</SheetTitle>
          <SheetDescription>
            {accountKeys
              ? "Saved to your account, encrypted. You pay each provider directly; AI Pasta adds nothing."
              : "Each model runs on your own key. You pay each provider directly; AI Pasta adds nothing."}
          </SheetDescription>
        </SheetHeader>
        <div className="overflow-y-auto p-4">
          {accountKeys ? (
            <AccountKeyManager keys={accountKeys} onChange={onAccountKeysChange} />
          ) : (
            <ApiManager onChange={onBrowserKeysChange} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
