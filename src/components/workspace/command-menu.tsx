"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { MODELS } from "@/app/library/models";
import { modelColor } from "@/app/library/modelColors";

export type CommandActions = {
  newComparison: () => void;
  focusPrompt: () => void;
  toggleBlind: () => void;
  openSettings: () => void;
  openKeys: () => void;
  exportCsv?: () => void;
  toggleModel: (id: string) => void;
  selectedModels: string[];
  signedIn: boolean;
};

/** ⌘K / Ctrl+K: every workspace action, model toggles, navigation and theme. */
export function CommandMenu(actions: CommandActions) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { setTheme } = useTheme();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const run = (fn: () => void) => () => {
    setOpen(false);
    // Let the dialog close (and return focus) before acting.
    requestAnimationFrame(fn);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Command menu" description="Search for an action">
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No matching command.</CommandEmpty>
        <CommandGroup heading="Comparison">
          <CommandItem onSelect={run(actions.newComparison)}>
            New comparison <CommandShortcut>⌘↵ runs</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(actions.focusPrompt)}>Focus the prompt</CommandItem>
          <CommandItem onSelect={run(actions.toggleBlind)}>Toggle blind mode</CommandItem>
          <CommandItem onSelect={run(actions.openSettings)}>Generation settings</CommandItem>
          <CommandItem onSelect={run(actions.openKeys)}>API keys</CommandItem>
          {actions.exportCsv && <CommandItem onSelect={run(actions.exportCsv)}>Export CSV</CommandItem>}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Models">
          {MODELS.map((m) => (
            <CommandItem key={m.id} value={`model ${m.label}`} onSelect={run(() => actions.toggleModel(m.id))}>
              <span aria-hidden className="size-2 rounded-full" style={{ background: modelColor(m.id) }} />
              {actions.selectedModels.includes(m.id) ? "Remove" : "Add"} {m.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Go to">
          <CommandItem onSelect={run(() => router.push("/batch"))}>Batch</CommandItem>
          {actions.signedIn && <CommandItem onSelect={run(() => router.push("/history"))}>History</CommandItem>}
          {actions.signedIn && <CommandItem onSelect={run(() => router.push("/leaderboard"))}>Leaderboard</CommandItem>}
          <CommandItem onSelect={run(() => router.push("/"))}>Home</CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Theme">
          <CommandItem onSelect={run(() => setTheme("dark"))}>Dark</CommandItem>
          <CommandItem onSelect={run(() => setTheme("light"))}>Light</CommandItem>
          <CommandItem onSelect={run(() => setTheme("system"))}>System</CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
