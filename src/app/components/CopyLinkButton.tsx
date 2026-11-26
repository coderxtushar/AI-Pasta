"use client";
import React, { useState } from "react";

type Props = { path: string; style?: React.CSSProperties };

export default function CopyLinkButton({ path, style }: Props) {
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
    <button type="button" onClick={copy} style={style}>
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}
