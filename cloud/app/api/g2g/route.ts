import { authorized, json } from "../../../lib/api-auth";
import { database } from "../../../lib/cloud-store";
import {
  connection,
  encryptionKey,
  upsertOrder,
} from "../../../lib/g2g-service";
import { encrypt, getG2GOrder, type Credentials } from "../../../lib/g2g-core";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await authorized();
  if (!user) return json({ error: "Přihlášení je nutné." }, 401);
  const row = await connection(user.userId);
  return json({
    connected: !!row,
    webhookUrl: row
      ? new URL("/api/g2g/webhook/" + row.route_id, request.url).href
      : null,
    lastEventAt: row?.last_event_at ?? null,
    lastSyncAt: row?.last_sync_at ?? null,
    lastError: row?.last_error ?? null,
  });
}
export async function POST(request: Request) {
  const user = await authorized(request);
  if (!user)
    return json({ error: "Přihlášení nebo původ požadavku není platný." }, 401);
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const credentials: Credentials = {
      apiKey: String(body.apiKey ?? "").trim(),
      apiSecret: String(body.apiSecret ?? "").trim(),
      userId: String(body.userId ?? "").trim(),
    };
    if (
      !credentials.apiKey ||
      !credentials.apiSecret ||
      !/^\d{1,30}$/.test(credentials.userId) ||
      credentials.apiKey.length > 300 ||
      credentials.apiSecret.length > 500
    )
      return json(
        {
          error:
            "Vyplňte platné G2G User ID, Access Key ID a Secret Access Key.",
        },
        400,
      );
    const order = await getG2GOrder(
      credentials,
      String(body.orderId ?? "").trim(),
    );
    const encrypted = await encrypt(credentials, encryptionKey());
    const old = await connection(user.userId);
    const route = old?.route_id ?? crypto.randomUUID();
    await database()
      .prepare(
        "INSERT INTO g2g_connections(user_id,route_id,encrypted_credentials,last_sync_at,created_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET encrypted_credentials=excluded.encrypted_credentials,last_error=NULL,last_sync_at=excluded.last_sync_at",
      )
      .bind(
        user.userId,
        route,
        encrypted,
        new Date().toISOString(),
        new Date().toISOString(),
      )
      .run();
    await upsertOrder(user.userId, order);
    return json({
      connected: true,
      webhookUrl: new URL("/api/g2g/webhook/" + route, request.url).href,
    });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error ? error.message : "Propojení se nezdařilo.",
      },
      400,
    );
  }
}
export async function DELETE(request: Request) {
  const user = await authorized(request);
  if (!user) return json({ error: "Přihlášení je nutné." }, 401);
  await database()
    .prepare("DELETE FROM g2g_connections WHERE user_id=?")
    .bind(user.userId)
    .run();
  return json({ connected: false });
}
