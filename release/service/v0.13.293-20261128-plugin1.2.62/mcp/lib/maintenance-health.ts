import { retentionPolicies } from "./retention-policy.ts";

export const MAINTENANCE_WARNING_BACKLOG = 7_000;
export type MaintenanceHealthState = {
  due_at?: number;
  last_attempt_at?: number | null;
  last_success_at?: number | null;
  failures?: number;
  backlog?: number;
  overloaded?: number;
};
/** Fixed codes and numbers only. Missing installation identity never grants access. */
export function maintenanceHealth(
  state: MaintenanceHealthState | undefined,
  owner: string | undefined,
  now: number,
) {
  return {
    owner_configured: !!owner?.trim() && owner.length <= 256,
    backlog: state?.backlog ?? null,
    limit: 10_000,
    warning: (state?.backlog ?? 0) >= MAINTENANCE_WARNING_BACKLOG,
    overloaded: state?.overloaded === 1,
    failures: state?.failures ?? null,
    overdue: state?.due_at !== undefined && state.due_at + 120_000 < now,
  };
}

/** Read-only whitelist aggregates, using the exact server retention predicates.
 * No content, keys, owner IDs, row samples, SQL or caller-selected targets escape.
 * A row eligible for several policies is counted once for its table. */
export async function retentionInventory(db: D1Database, now: number) {
  const grouped = new Map<string, { where: string[]; values: number[] }>();
  for (const policy of retentionPolicies(now)) {
    const group = grouped.get(policy.table) ?? { where: [], values: [] };
    group.where.push(`(${policy.where})`);
    group.values.push(...policy.values);
    grouped.set(policy.table, group);
  }
  const entries = [...grouped];
  const rows = await db.batch<{ total: number; due: number }>(
    entries.map(([table, p]) =>
      db
        .prepare(
          `SELECT count(*) AS total, COALESCE(sum(CASE WHEN ${p.where.join(" OR ")} THEN 1 ELSE 0 END),0) AS due FROM ${table}`,
        )
        .bind(...p.values),
    ),
  );
  const storage = await db
    .prepare("SELECT is_gc,count(*) AS n FROM sb_storage_writes GROUP BY is_gc")
    .all<{ is_gc: number; n: number }>();
  return {
    measured_at: now,
    tables: entries.map(([table], i) => {
      const row = rows[i].results[0];
      return { table, due: row.due, not_due: row.total - row.due };
    }),
    storage: {
      unsettled_puts: storage.results.find((r) => r.is_gc === 0)?.n ?? 0,
      pending_gc: storage.results.find((r) => r.is_gc === 1)?.n ?? 0,
      retired_fences: storage.results.find((r) => r.is_gc === 2)?.n ?? 0,
    },
  };
}
