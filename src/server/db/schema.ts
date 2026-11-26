import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

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
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("comparison_user_created_idx").on(t.userId, t.createdAt)]
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
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.comparisonId, t.modelId] })]
);
