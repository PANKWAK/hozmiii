import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { env } from "./test-cloudflare";
import { readState, writeState, ConflictError } from "./cloud-store";
import { empty, type Store } from "../src/data";
let sqlite: DatabaseSync;
type Query = { sql: string; values: unknown[] };
function prepared(sql: string, values: unknown[] = []) {
  return {
    sql,
    values,
    bind(...next: unknown[]) {
      return prepared(sql, next);
    },
    async run() {
      const result = sqlite
        .prepare(sql)
        .run(...(values as (string | number | null)[]));
      return { success: true, meta: { changes: Number(result.changes) } };
    },
    async first() {
      return (
        sqlite.prepare(sql).get(...(values as (string | number | null)[])) ??
        null
      );
    },
  };
}
beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(
      new URL("../drizzle/0000_parched_moira_mactaggert.sql", import.meta.url),
      "utf8",
    ),
  );
  env.DB = {
    prepare: prepared,
    async batch(queries: Query[]) {
      sqlite.exec("BEGIN");
      try {
        const results = queries.map((q) => {
          const stmt = sqlite.prepare(q.sql);
          if (/^SELECT/i.test(q.sql))
            return {
              results: stmt.all(...(q.values as (string | number | null)[])),
              meta: { changes: 0 },
            };
          const result = stmt.run(...(q.values as (string | number | null)[]));
          return { results: [], meta: { changes: Number(result.changes) } };
        });
        sqlite.exec("COMMIT");
        return results;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  } as unknown as D1Database;
});
afterEach(() => sqlite.close());
function store(id: string): Store {
  return {
    orders: [
      {
        key: "id:" + id,
        id,
        date: "2026-10-01 12:00:00",
        product: "Synthetic test",
        gross: 10,
        net: 9,
        fee: 1,
        currency: "EUR",
        quantity: 1,
        status: "Completed",
        importId: "test",
      },
    ],
    imports: [
      {
        id: "test",
        name: "Synthetic test",
        created: "2026-10-01T12:00:00Z",
        count: 1,
      },
    ],
    groups: {},
  };
}
describe("cloud persistence and account isolation", () => {
  it("persists records independently of browser state and separates accounts", async () => {
    await readState("alice");
    await readState("bob");
    await writeState("alice", store("A"), 0);
    expect((await readState("alice")).store.orders[0].id).toBe("A");
    expect((await readState("bob")).store).toEqual(empty);
    await writeState("bob", store("B"), 0);
    expect((await readState("alice")).store.orders).toHaveLength(1);
    expect((await readState("bob")).store.orders[0].id).toBe("B");
  });
  it("rejects stale saves without deleting or duplicating records", async () => {
    await writeState("alice", store("A"), 0);
    await expect(writeState("alice", store("B"), 0)).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect((await readState("alice")).store.orders[0].id).toBe("A");
    expect((await readState("alice")).revision).toBe(1);
  });
  it("saves hundreds of rows atomically and deletes only the current account data", async () => {
    const bulk = store("A");
    bulk.orders = Array.from({ length: 616 }, (_, i) => ({
      ...bulk.orders[0],
      key: "id:" + i,
      id: String(i),
    }));
    await writeState("alice", bulk, 0);
    await writeState("bob", store("B"), 0);
    expect((await readState("alice")).store.orders).toHaveLength(616);
    await writeState("alice", empty, 1);
    expect((await readState("alice")).store.orders).toHaveLength(0);
    expect((await readState("bob")).store.orders).toHaveLength(1);
  });
});
