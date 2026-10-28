import { env } from "cloudflare:workers";
import type { Store } from "../src/data";
export function database() {
  if (!env.DB) throw Error("Cloudová databáze není nakonfigurovaná.");
  return env.DB;
}
export async function ensureState(userId: string) {
  await database()
    .prepare(
      "INSERT OR IGNORE INTO cloud_states (user_id, revision, imports_json, groups_json, updated_at) VALUES (?,0,'[]','{}',?)",
    )
    .bind(userId, new Date().toISOString())
    .run();
}
export async function readState(userId: string) {
  await ensureState(userId);
  const result = await database().batch([
    database()
      .prepare(
        "SELECT revision,imports_json,groups_json FROM cloud_states WHERE user_id=?",
      )
      .bind(userId),
    database()
      .prepare(
        "SELECT body_json FROM cloud_orders WHERE user_id=? ORDER BY order_key",
      )
      .bind(userId),
  ]);
  const meta = result[0].results[0] as {
    revision: number;
    imports_json: string;
    groups_json: string;
  };
  return {
    revision: meta.revision,
    store: {
      orders: result[1].results.map((row) =>
        JSON.parse(String((row as { body_json: string }).body_json)),
      ),
      imports: JSON.parse(meta.imports_json),
      groups: JSON.parse(meta.groups_json),
    } as Store,
  };
}
export class ConflictError extends Error {}
export async function writeState(
  userId: string,
  store: Store,
  revision: number,
) {
  await ensureState(userId);
  const db = database();
  const condition =
    "EXISTS(SELECT 1 FROM cloud_states WHERE user_id=? AND revision=?)";
  const statements = [
    db
      .prepare(`DELETE FROM cloud_orders WHERE user_id=? AND ${condition}`)
      .bind(userId, userId, revision),
  ];
  for (let i = 0; i < store.orders.length; i += 100) {
    statements.push(
      db
        .prepare(
          `INSERT INTO cloud_orders (user_id,order_key,body_json) SELECT ?,json_extract(value,'$.key'),value FROM json_each(?) WHERE ${condition}`,
        )
        .bind(
          userId,
          JSON.stringify(store.orders.slice(i, i + 100)),
          userId,
          revision,
        ),
    );
  }
  statements.push(
    db
      .prepare(
        "UPDATE cloud_states SET revision=revision+1,imports_json=?,groups_json=?,updated_at=? WHERE user_id=? AND revision=?",
      )
      .bind(
        JSON.stringify(store.imports),
        JSON.stringify(store.groups),
        new Date().toISOString(),
        userId,
        revision,
      ),
  );
  const results = await db.batch(statements);
  if (!results.at(-1)?.meta.changes)
    throw new ConflictError(
      "Data mezitím změnilo jiné zařízení nebo G2G. Obnovte stránku a zopakujte import; duplicity se automaticky přeskočí.",
    );
  return revision + 1;
}
