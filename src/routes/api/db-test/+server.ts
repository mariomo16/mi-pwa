import { json } from "@sveltejs/kit";
import { db } from "#lib/server/db";
import { task } from "#lib/server/db/schema";

export const GET = async () => {
  const created = await db.insert(task).values({ title: "neon e2e", priority: 5 }).returning();
  const rows = await db.select().from(task);
  return json({ created, rows });
};
