"use client";

import { useEffect, useState } from "react";
import { CopyButton } from "./copy-button";

type Props = {
  code: string;
  lang?: string;
  /** Highlight only once the answer has finished streaming. */
  highlight: boolean;
  /** No language/copy bar, for tight previews. */
  compact?: boolean;
};

/**
 * A fenced code block with a copy button. Syntax highlighting loads lazily
 * (shiki is large) and only after streaming ends, so tokens aren't re-highlighted.
 */
export function CodeBlock({ code, lang, highlight, compact = false }: Props) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    if (!highlight) return;
    let cancelled = false;
    import("shiki")
      .then(({ codeToHtml, bundledLanguages }) =>
        codeToHtml(code, {
          lang: lang && lang in bundledLanguages ? lang : "text",
          themes: { light: "github-light", dark: "github-dark-default" },
          defaultColor: false,
        })
      )
      .then((out) => !cancelled && setHtml(out))
      .catch(() => {
        // Fall back to the plain block.
      });
    return () => {
      cancelled = true;
    };
  }, [code, lang, highlight]);

  return (
    <div className="group/code relative my-3 overflow-hidden rounded-lg border bg-subtle">
      {!compact && (
        <div className="flex h-8 items-center justify-between border-b px-3 text-xs text-muted-foreground">
          <span className="font-mono">{lang || "text"}</span>
          <CopyButton text={code} label="Copy code" />
        </div>
      )}
      {html ? (
        // shiki escapes the code; this is its own generated markup.
        <div className="shiki-wrap overflow-x-auto p-3 text-[13px] leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className="overflow-x-auto p-3 font-mono text-[13px] leading-relaxed">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
