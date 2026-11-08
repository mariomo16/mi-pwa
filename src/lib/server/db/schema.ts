import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  jsonb,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const syncSequence = pgSequence("core_sync_seq");

export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey(),
    ownerId: uuid("owner_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    name: text("name").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("devices_owner_idx").on(table.ownerId)],
);

export const documents = pgTable(
  "documents",
  {
    ownerId: uuid("owner_id").notNull(),
    collection: text("collection").notNull(),
    id: text("id").notNull(),
    data: jsonb("data").notNull().$type<Record<string, unknown>>(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    deletedAt: bigint("deleted_at", { mode: "number" }),
    serverSeq: bigint("server_seq", { mode: "number" })
      .notNull()
      .default(sql`nextval('core_sync_seq')`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.collection, table.id] }),
    index("documents_owner_seq_idx").on(table.ownerId, table.serverSeq),
  ],
);
