import { authorized, json } from "../../../lib/api-auth";
import { readState, writeState, ConflictError } from "../../../lib/cloud-store";
import { validateBackup } from "../../../src/data";
export const dynamic = "force-dynamic";
export async function GET() {
  const user = await authorized();
  if (!user) return json({ error: "Přihlášení je nutné." }, 401);
  return json(await readState(user.userId));
}
export async function PUT(request: Request) {
  const user = await authorized(request);
  if (!user)
    return json({ error: "Přihlášení nebo původ požadavku není platný." }, 401);
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 15 * 1024 * 1024)
      return json(
        { error: "Import je příliš velký. Rozdělte jej na menší části." },
        413,
      );
    const body = (await request.json()) as { revision: number; store: unknown };
    if (!Number.isSafeInteger(body.revision) || body.revision < 0)
      return json({ error: "Neplatná verze dat." }, 400);
    const store = validateBackup(body.store);
    if (store.orders.length > 40000)
      return json({ error: "Limit je 40 000 objednávek v jednom účtu." }, 413);
    return json({
      revision: await writeState(user.userId, store, body.revision),
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Uložení selhalo." },
      error instanceof ConflictError ? 409 : 400,
    );
  }
}
