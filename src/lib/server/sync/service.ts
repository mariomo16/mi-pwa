import { sql } from "drizzle-orm";
import type {
  DocumentEnvelope,
  SyncDocument,
} from "#lib/core/sync/protocol.js";
import { db } from "#lib/server/db/index.js";

const columns = sql`
  collection,
  id,
  data,
  updated_at::double precision as "updatedAt",
  deleted_at::double precision as "deletedAt",
  server_seq::double precision as "serverSeq"
`;

type Row = {
  collection: string;
  id: string;
  data: Record<string, unknown>;
  updatedAt: number;
  deletedAt: number | null;
  serverSeq: number;
};

function normalize(row: Row): SyncDocument {
  return {
    collection: row.collection,
    id: row.id,
    data: row.data ?? {},
    updatedAt: Number(row.updatedAt),
    deletedAt: row.deletedAt === null ? null : Number(row.deletedAt),
    serverSeq: Number(row.serverSeq),
  };
}

function key(document: { collection: string; id: string }): string {
  return `${document.collection}\u0000${document.id}`;
}

export async function applyChanges(
  ownerId: string,
  changes: DocumentEnvelope[],
): Promise<SyncDocument[]> {
  if (changes.length === 0) return [];

  const payload = JSON.stringify(changes);

  const upserted = await db.execute(sql`
    insert into documents (owner_id, collection, id, data, updated_at, deleted_at)
    select
      ${ownerId}::uuid,
      change->>'collection',
      change->>'id',
      change->'data',
      (change->>'updatedAt')::bigint,
      (change->>'deletedAt')::bigint
    from jsonb_array_elements(${payload}::jsonb) as t(change)
    on conflict (owner_id, collection, id)
    do update set
      data = excluded.data,
      updated_at = excluded.updated_at,
      deleted_at = excluded.deleted_at,
      server_seq = nextval('core_sync_seq')
    where documents.updated_at < excluded.updated_at
    returning ${columns}
  `);

  const applied = (upserted.rows as Row[]).map(normalize);
  const appliedKeys = new Set(applied.map(key));
  const missing = changes.filter((change) => !appliedKeys.has(key(change)));

  if (missing.length === 0) return applied;

  const missingPayload = JSON.stringify(
    missing.map((change) => ({ collection: change.collection, id: change.id })),
  );

  const current = await db.execute(sql`
    select ${columns}
    from documents
    where owner_id = ${ownerId}::uuid
      and (collection, id) in (
        select c.collection, c.id
        from jsonb_to_recordset(${missingPayload}::jsonb) as c(collection text, id text)
      )
  `);

  return [...applied, ...(current.rows as Row[]).map(normalize)];
}

export async function pullChanges(
  ownerId: string,
  cursor: number,
  limit: number,
): Promise<{ changes: SyncDocument[]; cursor: number; hasMore: boolean }> {
  const result = await db.execute(sql`
    select ${columns}
    from documents
    where owner_id = ${ownerId}::uuid
      and server_seq > ${cursor}
    order by server_seq asc
    limit ${limit + 1}
  `);

  const rows = (result.rows as Row[]).map(normalize);
  const hasMore = rows.length > limit;
  if (hasMore) rows.pop();

  const nextCursor = rows.length > 0 ? rows[rows.length - 1].serverSeq : cursor;

  return { changes: rows, cursor: nextCursor, hasMore };
}
