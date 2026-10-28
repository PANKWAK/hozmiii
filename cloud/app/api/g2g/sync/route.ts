import { authorized, json } from "../../../../lib/api-auth";
import { database, readState } from "../../../../lib/cloud-store";
import {
  connection,
  credentials,
  upsertOrder,
} from "../../../../lib/g2g-service";
import { getG2GOrder } from "../../../../lib/g2g-core";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const user = await authorized(request);
  if (!user) return json({ error: "Přihlášení je nutné." }, 401);
  const row = await connection(user.userId);
  if (!row) return json({ error: "Nejprve propojte G2G." }, 400);
  if (row.last_sync_at && Date.now() - Date.parse(row.last_sync_at) < 30000)
    return json({ error: "Další kontrolu spusťte po 30 sekundách." }, 429);
  const creds = await credentials(row);
  const state = await readState(user.userId);
  const selected = [...state.store.orders]
    .filter((o) => o.id && !/completed|cancelled|refunded/i.test(o.status))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 15);
  let updated = 0;
  const errors: string[] = [];
  for (const order of selected) {
    try {
      await upsertOrder(user.userId, await getG2GOrder(creds, order.id));
      updated++;
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : "Aktualizace selhala.",
      );
    }
  }
  await database()
    .prepare(
      "UPDATE g2g_connections SET last_sync_at=?,last_error=? WHERE user_id=?",
    )
    .bind(
      new Date().toISOString(),
      errors.length ? errors[0] : null,
      user.userId,
    )
    .run();
  return json({ updated, checked: selected.length, errors });
}
