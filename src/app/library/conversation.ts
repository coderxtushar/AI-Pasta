// Multi-turn conversations (client-safe). Each model keeps its own history: the
// user's messages are shared, the assistant replies are that model's own.

/** Most user messages in one conversation (the first prompt plus follow-ups). */
export const MAX_TURNS = 20;

export type ChatMessage = { role: "user" | "assistant"; content: string };

/**
 * One model's history: each user turn, followed by that model's answer when it
 * produced text. A turn that failed with no text leaves just the user message.
 */
export function buildHistory(userTurns: string[], answers: (string | undefined)[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  userTurns.forEach((content, i) => {
    out.push({ role: "user", content });
    const answer = answers[i];
    if (answer?.trim()) out.push({ role: "assistant", content: answer });
  });
  return out;
}

/**
 * Drops empty messages and merges back-to-back messages from the same role, so
 * every provider receives strictly alternating turns (some reject two user
 * messages in a row, which happens after a failed turn).
 */
export function normalizeMessages(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (!m.content.trim()) continue;
    const last = out.at(-1);
    if (last && last.role === m.role) last.content = `${last.content}\n\n${m.content}`;
    else out.push({ ...m });
  }
  return out;
}

/** A saved comparison's user messages in order: the first prompt, then each follow-up. */
export function userTurns(c: { prompt: string; followUps: string[] }): string[] {
  return [c.prompt, ...c.followUps];
}
