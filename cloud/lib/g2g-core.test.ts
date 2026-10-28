import { describe, it, expect, vi, afterEach } from "vitest";
import {
  sign,
  verifySignature,
  encrypt,
  decrypt,
  fromG2G,
  getG2GOrder,
} from "./g2g-core";
const credentials = {
  apiKey: "test-api-key",
  apiSecret: "test-secret",
  userId: "123",
};
afterEach(() => vi.unstubAllGlobals());
describe("G2G authentication and financial integrity", () => {
  it("matches an HMAC-SHA256 reference vector", async () => {
    expect(
      await sign("The quick brown fox jumps over the lazy dog", "key"),
    ).toBe("f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8");
  });
  it("accepts exact signed webhooks and rejects stale, changed and forged ones", async () => {
    const url = "https://example.com/api/g2g/webhook/id",
      ts = "1793220000000";
    const signature = await sign(
      url + credentials.apiKey + credentials.userId + ts,
      credentials.apiSecret,
    );
    expect(
      await verifySignature(url, credentials, ts, signature, Number(ts)),
    ).toBe(true);
    expect(
      await verifySignature(
        url + "/other",
        credentials,
        ts,
        signature,
        Number(ts),
      ),
    ).toBe(false);
    expect(
      await verifySignature(
        url,
        credentials,
        ts,
        signature,
        Number(ts) + 301000,
      ),
    ).toBe(false);
    expect(
      await verifySignature(url, credentials, ts, "0".repeat(64), Number(ts)),
    ).toBe(false);
  });
  it("encrypts secrets with randomized authenticated encryption", async () => {
    const key = "12".repeat(32);
    const a = await encrypt(credentials, key),
      b = await encrypt(credentials, key);
    expect(a).not.toBe(b);
    expect(a).not.toContain("test-secret");
    expect(await decrypt(a, key)).toEqual(credentials);
    await expect(decrypt(a, "34".repeat(32))).rejects.toThrow();
  });
  it("does not invent net payout from gross and preserves known report amounts", () => {
    const payload = {
      order_id: "A1",
      seller_id: "123",
      currency: "EUR",
      created_at: 1793220000000,
      amount: 10,
      purchased_qty: 2,
      delivered_qty: 1,
      order_status: "delivering",
    };
    const order = fromG2G(payload);
    expect(order.net).toBeNull();
    expect(order.gross).toBe(10);
    expect(order.quantity).toBe(1);
    expect(
      fromG2G(payload, { ...order, product: "Report product", net: 9 }).net,
    ).toBe(9);
    expect(
      fromG2G({ ...payload, amount: 8 }, { ...order, net: 9 }).net,
    ).toBeNull();
    expect(
      fromG2G({ ...payload, order_status: "refunded" }, { ...order, net: 9 })
        .net,
    ).toBeNull();
  });
  it("uses only the official API origin and signs the documented path", async () => {
    const mocked = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          code: 20000001,
          payload: { order_id: "A1", seller_id: "123" },
        }),
      );
    vi.stubGlobal("fetch", mocked);
    await getG2GOrder(credentials, "A1");
    expect(mocked.mock.calls[0][0]).toBe(
      "https://open-api.g2g.com/v2/orders/A1",
    );
    await expect(getG2GOrder(credentials, "../../secret")).rejects.toThrow();
  });
  it("rejects orders belonging to another seller", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({
            code: 20000001,
            payload: { order_id: "A1", seller_id: "OTHER" },
          }),
        ),
    );
    await expect(getG2GOrder(credentials, "A1")).rejects.toThrow(/nepatří/);
  });
});
