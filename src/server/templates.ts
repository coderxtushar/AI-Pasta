import { and, asc, count, eq } from "drizzle-orm";
import { MAX_TEMPLATES, type Template } from "@/app/library/templates";
import { db } from "./db";
import { templates } from "./db/schema";

const toTemplate = (r: typeof templates.$inferSelect): Template => ({
  id: r.id,
  name: r.name,
  prompt: r.prompt,
  updatedAt: r.updatedAt.toISOString(),
});

export async function listTemplates(userId: string): Promise<Template[]> {
  const rows = await db.select().from(templates).where(eq(templates.userId, userId)).orderBy(asc(templates.name));
  return rows.map(toTemplate);
}

export class TemplateLimitError extends Error {}

/** Creates the template, or replaces the user's template with the same name. */
export async function saveTemplate(userId: string, name: string, prompt: string): Promise<Template> {
  const [{ value: existing }] = await db
    .select({ value: count() })
    .from(templates)
    .where(and(eq(templates.userId, userId), eq(templates.name, name)));
  if (!existing) {
    const [{ value: total }] = await db.select({ value: count() }).from(templates).where(eq(templates.userId, userId));
    if (total >= MAX_TEMPLATES) throw new TemplateLimitError(`You can keep up to ${MAX_TEMPLATES} templates.`);
  }
  const [row] = await db
    .insert(templates)
    .values({ userId, name, prompt })
    .onConflictDoUpdate({ target: [templates.userId, templates.name], set: { prompt, updatedAt: new Date() } })
    .returning();
  return toTemplate(row);
}

export async function deleteTemplate(userId: string, id: string): Promise<void> {
  await db.delete(templates).where(and(eq(templates.id, id), eq(templates.userId, userId)));
}
