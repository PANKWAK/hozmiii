import { database } from "../../../../../lib/cloud-store";
import {
  credentials,
  upsertOrder,
  type Connection,
} from "../../../../../lib/g2g-service";
import { verifySignature, getG2GOrder } from "../../../../../lib/g2g-core";
import { json } from "../../../../../lib/api-auth";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ routeId: string }> },
) {
  const { routeId } = await context.params;
  if (!/^[a-f0-9-]{36}$/.test(routeId))
    return json({ error: "Nenalezeno." }, 404);
  const row = await database()
    .prepare("SELECT * FROM g2g_connections WHERE route_id=?")
    .bind(routeId)
    .first<Connection>();
  if (!row) return json({ error: "Nenalezeno." }, 404);
  try {
    const creds = await credentials(row);
    if (
      !(await verifySignature(
        request.url,
        creds,
        request.headers.get("g2g-timestamp") ?? "",
        request.headers.get("g2g-signature") ?? "",
      ))
    )
      return json({ error: "Neplatný podpis." }, 401);
    if (Number(request.headers.get("content-length") ?? 0) > 65536)
      return json({ error: "Příliš velká událost." }, 413);
    const event = (await request.json()) as {
      id?: string;
      event_type?: string;
      payload?: { order_id?: string };
    };
    if (
      typeof event.id !== "string" ||
      event.id.length > 150 ||
      !/^order\./.test(String(event.event_type)) ||
      !event.payload?.order_id
    )
      return json({ error: "Neplatná událost." }, 400);
    if (
      await database()
        .prepare(
          "SELECT event_id FROM g2g_events WHERE route_id=? AND event_id=?",
        )
        .bind(routeId, event.id)
        .first()
    )
      return json({ received: true, duplicate: true });
    // The G2G webhook signature covers URL/key/user/timestamp, not JSON body.
    // Re-read the order over authenticated HTTPS before trusting any amounts.
    const order = await getG2GOrder(creds, event.payload.order_id);
    await upsertOrder(row.user_id, order);
    await database().batch([
      database()
        .prepare(
          "INSERT OR IGNORE INTO g2g_events(route_id,event_id,received_at) VALUES (?,?,?)",
        )
        .bind(routeId, event.id, new Date().toISOString()),
      database()
        .prepare(
          "UPDATE g2g_connections SET last_event_at=?,last_error=NULL WHERE user_id=?",
        )
        .bind(new Date().toISOString(), row.user_id),
      database().prepare(
        "DELETE FROM g2g_events WHERE received_at < datetime('now','-30 days')",
      ),
    ]);
    return json({ received: true });
  } catch {
    await database()
      .prepare("UPDATE g2g_connections SET last_error=? WHERE user_id=?")
      .bind(
        "Poslední G2G událost se nepodařilo ověřit nebo načíst. Zkuste kontrolu známých objednávek.",
        row.user_id,
      )
      .run();
    return json(
      { error: "Zpracování události selhalo; zopakujte požadavek." },
      503,
    );
  }
}
