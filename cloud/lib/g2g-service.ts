import { env } from "cloudflare:workers";
import { database, readState, writeState, ConflictError } from "./cloud-store";
import { decrypt, fromG2G, type Credentials } from "./g2g-core";
export type Connection = {
  user_id: string;
  route_id: string;
  encrypted_credentials: string;
  last_event_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
};
export function encryptionKey() {
  return (
    (env as unknown as { DATA_ENCRYPTION_KEY?: string }).DATA_ENCRYPTION_KEY ??
    ""
  );
}
export async function connection(userId: string) {
  return database()
    .prepare("SELECT * FROM g2g_connections WHERE user_id=?")
    .bind(userId)
    .first<Connection>();
}
export function credentials(row: Connection) {
  return decrypt(row.encrypted_credentials, encryptionKey());
}
export async function upsertOrder(
  userId: string,
  payload: Record<string, unknown>,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const state = await readState(userId);
    const key = "id:" + String(payload.order_id);
    const old = state.store.orders.find((o) => o.key === key);
    const order = fromG2G(payload, old);
    const next = {
      ...state.store,
      orders: [...state.store.orders.filter((o) => o.key !== key), order],
    };
    if (!next.imports.some((i) => i.id === order.importId))
      next.imports.push({
        id: "g2g-api",
        name: "G2G OpenAPI · automatické objednávky",
        created: new Date().toISOString(),
        count: 0,
      });
    try {
      await writeState(userId, next, state.revision);
      return order;
    } catch (error) {
      if (!(error instanceof ConflictError) || attempt === 2) throw error;
    }
  }
  throw Error("Aktualizace se nepodařila.");
}
