import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";
import type { ProviderId } from "@/app/library/providers";
import type { ComparisonSettings } from "@/app/library/settings";
import type { JudgeVerdict } from "@/app/library/judge";

// ---- Auth.js tables (shape required by @auth/drizzle-adapter) ----

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })]
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

// ---- App tables ----

export const comparisons = pgTable(
  "comparison",
  {
    // Random UUID, so share links can't be guessed.
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    models: text("models").array().notNull(),
    isPublic: boolean("isPublic").notNull().default(false),
    /** Generation settings used for this run. Null means provider defaults. */
    settings: jsonb("settings").$type<ComparisonSettings>(),
    /** Answers were shown anonymized (Model A/B/C) until the user voted. */
    blind: boolean("blind").notNull().default(false),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("comparison_user_created_idx").on(t.userId, t.createdAt)]
);

// Provider API keys, encrypted with AES-256-GCM (see src/server/crypto.ts).
// The plaintext key is never stored and never sent back to the browser.
export const apiKeys = pgTable(
  "api_key",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").$type<ProviderId>().notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    authTag: text("authTag").notNull(),
    keyId: text("keyId").notNull(),
    /** Last 4 characters, shown as a hint ("••••abcd"). */
    last4: text("last4").notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.provider] })]
);

export type ResponseStatus = "done" | "error" | "stopped";

export const responses = pgTable(
  "response",
  {
    comparisonId: text("comparisonId")
      .notNull()
      .references(() => comparisons.id, { onDelete: "cascade" }),
    modelId: text("modelId").notNull(),
    status: text("status").$type<ResponseStatus>().notNull(),
    text: text("text").notNull().default(""),
    error: text("error"),
    ttftMs: integer("ttftMs"),
    totalMs: integer("totalMs").notNull(),
    inputTokens: integer("inputTokens"),
    outputTokens: integer("outputTokens"),
    reasoningTokens: integer("reasoningTokens"),
    costUsd: doublePrecision("costUsd"),
    finishReason: text("finishReason"),
    /** Provider warnings, e.g. a setting the model ignored. */
    notes: text("notes").array(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.comparisonId, t.modelId] })]
);

// One vote per blind comparison, by its owner. A null winner means "tie".
export const votes = pgTable(
  "vote",
  {
    comparisonId: text("comparisonId")
      .primaryKey()
      .references(() => comparisons.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    winnerModelId: text("winnerModelId"),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("vote_user_idx").on(t.userId)]
);

// LLM-as-judge verdicts; one per judge model per comparison (re-judging replaces it).
export const judgements = pgTable(
  "judgement",
  {
    comparisonId: text("comparisonId")
      .notNull()
      .references(() => comparisons.id, { onDelete: "cascade" }),
    judgeModelId: text("judgeModelId").notNull(),
    verdict: jsonb("verdict").$type<JudgeVerdict>().notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.comparisonId, t.judgeModelId] })]
);
