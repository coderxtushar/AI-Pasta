"use client";
import React, { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = { path: string };

export default function CopyLinkButton({ path }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(new URL(path, window.location.origin).toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (e.g. insecure context); the URL bar still has the link.
    }
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={copy}>
      {copied ? <Check className="size-3.5 text-success" /> : <Link2 className="size-3.5" />}
      {copied ? "Copied!" : "Copy link"}
    </Button>
  );
}
