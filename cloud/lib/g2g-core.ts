import type { Order } from "../src/data";
export type Credentials = { apiKey: string; apiSecret: string; userId: string };
const encoder = new TextEncoder();
export function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export async function sign(message: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(
    await crypto.subtle.sign("HMAC", key, encoder.encode(message)),
  );
}
export async function verifySignature(
  url: string,
  credentials: Credentials,
  timestamp: string,
  signature: string,
  now = Date.now(),
) {
  if (
    !/^\d{13}$/.test(timestamp) ||
    Math.abs(now - Number(timestamp)) > 5 * 60_000 ||
    !/^[a-f0-9]{64}$/i.test(signature)
  )
    return false;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(credentials.apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    Uint8Array.from(signature.match(/../g)!.map((x) => parseInt(x, 16))),
    encoder.encode(url + credentials.apiKey + credentials.userId + timestamp),
  );
}
export async function encrypt(value: Credentials, keyHex: string) {
  if (!/^[a-f0-9]{64}$/i.test(keyHex))
    throw Error("Šifrovací klíč serveru není nastaven.");
  const key = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(keyHex.match(/../g)!.map((x) => parseInt(x, 16))),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(JSON.stringify(value)),
  );
  return JSON.stringify({
    iv: bytesToHex(iv.buffer),
    data: bytesToHex(ciphertext),
  });
}
export async function decrypt(
  value: string,
  keyHex: string,
): Promise<Credentials> {
  if (!/^[a-f0-9]{64}$/i.test(keyHex))
    throw Error("Šifrovací klíč serveru není nastaven.");
  const data = JSON.parse(value);
  const toBytes = (s: string) =>
    Uint8Array.from(s.match(/../g)!.map((x) => parseInt(x, 16)));
  const key = await crypto.subtle.importKey(
    "raw",
    toBytes(keyHex),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  return JSON.parse(
    new TextDecoder().decode(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: toBytes(data.iv) },
        key,
        toBytes(data.data),
      ),
    ),
  );
}
export async function getG2GOrder(credentials: Credentials, orderId: string) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(orderId))
    throw Error("Neplatné ID objednávky.");
  const path = "/v2/orders/" + encodeURIComponent(orderId),
    timestamp = String(Date.now());
  const signature = await sign(
    path + credentials.apiKey + credentials.userId + timestamp,
    credentials.apiSecret,
  );
  const response = await fetch("https://open-api.g2g.com" + path, {
    headers: {
      "g2g-api-key": credentials.apiKey,
      "g2g-userid": credentials.userId,
      "g2g-signature": signature,
      "g2g-timestamp": timestamp,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw Error(
      `G2G API odpovědělo ${response.status}. Zkontrolujte přístup a ID objednávky.`,
    );
  const body = (await response.json()) as {
    code: number;
    payload?: Record<string, unknown>;
  };
  if (body.code !== 20000001 || !body.payload)
    throw Error("G2G objednávku neposkytlo. Zkontrolujte oprávnění a ID.");
  if (
    String(body.payload.seller_id) !== credentials.userId ||
    String(body.payload.order_id) !== orderId
  )
    throw Error("Objednávka nepatří tomuto prodejci.");
  return body.payload;
}
export function fromG2G(
  payload: Record<string, unknown>,
  previous?: Order,
): Order {
  const numeric = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const id = String(payload.order_id ?? "");
  const currency = String(payload.currency ?? "").toUpperCase();
  const date = new Date(Number(payload.created_at));
  const gross = numeric(payload.amount);
  const quantity =
    numeric(payload.delivered_qty) ?? numeric(payload.purchased_qty);
  const status = String(payload.order_status ?? "Neznámý");
  if (
    !id ||
    !/^[A-Z]{3}$/.test(currency) ||
    !Number.isFinite(date.getTime()) ||
    gross === null ||
    quantity === null ||
    !Number.isInteger(quantity) ||
    quantity < 0
  )
    throw Error("G2G vrátilo neúplné údaje objednávky.");
  const sameFinancials =
    previous?.gross === gross &&
    previous.currency === currency &&
    !/refund|cancel|rollback/i.test(status);
  const net =
    numeric(payload.seller_earnings) ??
    numeric(payload.seller_payout) ??
    (sameFinancials ? (previous?.net ?? null) : null);
  const fee =
    numeric(payload.commission_fee) ??
    (sameFinancials ? (previous?.fee ?? null) : null);
  // Preserve the source wall-clock date from an imported report; API timestamps
  // for new records are normalized to UTC and explicitly identified in the UI.
  return {
    key: "id:" + id,
    id,
    date: previous?.date ?? date.toISOString().slice(0, 19).replace("T", " "),
    product:
      typeof payload.product_name === "string"
        ? payload.product_name
        : (previous?.product ?? "G2G objednávka · název v API chybí"),
    gross,
    net,
    fee,
    quantity,
    currency,
    status,
    importId: previous?.importId ?? "g2g-api",
  };
}
