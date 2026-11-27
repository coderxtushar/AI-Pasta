"use client";

import { memo, useDeferredValue } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { CodeBlock } from "./code-block";

type Props = { text: string; streaming: boolean; className?: string };

function makeComponents(streaming: boolean): Components {
  return {
    a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
    pre: ({ children }) => <>{children}</>,
    code: ({ node: _node, className, children, ...props }) => {
      const match = /language-([\w-]+)/.exec(className ?? "");
      const text = String(children ?? "");
      // Block code has a language class or spans lines; everything else is inline.
      if (match || text.includes("\n")) {
        return <CodeBlock code={text.replace(/\n$/, "")} lang={match?.[1]} highlight={!streaming} />;
      }
      return (
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]" {...props}>
          {children}
        </code>
      );
    },
    table: ({ node: _node, ...props }) => (
      <div className="my-3 overflow-x-auto">
        <table {...props} />
      </div>
    ),
  };
}

const streamingComponents = makeComponents(true);
const finishedComponents = makeComponents(false);

/**
 * An answer rendered as Markdown (no raw HTML; links open in a new tab).
 * While tokens stream, rendering is deferred so typing and other panels stay smooth.
 */
export const AnswerMarkdown = memo(function AnswerMarkdown({ text, streaming, className }: Props) {
  const deferred = useDeferredValue(text);
  return (
    <div className={cn("answer-prose", streaming && "streaming-caret", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={streaming ? streamingComponents : finishedComponents}>
        {deferred}
      </ReactMarkdown>
    </div>
  );
});
