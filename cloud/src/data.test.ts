import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  csv,
  dateValue,
  dedupe,
  detect,
  fields,
  growth,
  normalize,
  number,
  previousPeriod,
  readFile,
  stats,
  validateBackup,
  type Mapping,
  type Order,
} from "./data";
const mapping: Mapping = {
  id: "Order ID",
  date: "Date",
  product: "Product",
  gross: "Gross",
  net: "Net",
  fee: "Fee",
  quantity: "Qty",
  currency: "Currency",
  status: "Status",
};
const row = {
  "Order ID": "A1",
  Date: "2026-09-01 12:20:00",
  Product: "VPN",
  Gross: "10,00",
  Net: "9.10",
  Fee: ".90",
  Qty: "2",
  Currency: "EUR",
  Status: "Completed",
};
const order = (): Order => normalize([row], mapping, "test", "EUR").orders[0];
describe("money and dates", () => {
  it("handles Czech and international decimals without inventing blanks", () => {
    expect(number("1 234,56 Kč")).toBe(1234.56);
    expect(number("€1,234.56")).toBe(1234.56);
    expect(number("1.234,56")).toBe(1234.56);
    expect(number("(12,50)")).toBe(-12.5);
    expect(number("")).toBeNull();
    expect(number("abc")).toBeNull();
    expect(number("1,2,3")).toBeNull();
  });
  it("parses explicit date conventions and rejects impossible dates", () => {
    expect(dateValue("03/10/2026")).toBe("2026-10-03 00:00:00");
    expect(dateValue("03/10/2026", "mdy")).toBe("2026-03-10 00:00:00");
    expect(dateValue("31.2.2026")).toBeNull();
    expect(dateValue(46266)).toMatch(/^2026-/);
  });
  it("detects Czech and G2G column aliases", () => {
    expect(
      detect([
        "Order ID",
        "Seller Earnings",
        "Order Date",
        "Product Name",
        "Měna",
      ]),
    ).toMatchObject({
      id: "Order ID",
      net: "Seller Earnings",
      date: "Order Date",
      product: "Product Name",
      currency: "Měna",
    });
  });
});
describe("import and duplicate safety", () => {
  it("prioritizes the seller Earning Amount column even if another net column appears first", () => {
    const source = {
      Net: "99.00",
      "Order Amount": "10.00",
      Product: "Example",
      Date: "2026-10-01",
      "Order ID": "PAYOUT-1",
      Quantity: "3",
      Currency: "EUR",
      "Earning Amount": "0.65",
    };
    const map = detect(Object.keys(source));
    expect(map.net).toBe("Earning Amount");
    const result = normalize([source], map, "test", "EUR");
    expect(result.orders[0].net).toBe(0.65);
    expect(stats(result.orders, "2026-10-01", "2026-10-01").net).toBe(0.65);
  });
  it("recognizes the real G2G sold-order schema and two-digit year automatically", () => {
    const source = {
      "Order Date (Order Paid Date)": "29/10/26 04:32",
      "Sold Order ID": "TEST-G2G-1",
      "Order Status": "Cancelled",
      Service: "Software",
      Brand: "Example",
      Product: "Example product",
      Currency: "EUR",
      "Order Amount": "10.00",
      "Delivered Quantity": "0",
      "Delivered Amount": "0.00",
      "Refunded Amount": "10.00",
      "Earning Amount": "0.00",
    };
    const mapping = detect(Object.keys(source));
    expect(mapping).toMatchObject({
      id: "Sold Order ID",
      date: "Order Date (Order Paid Date)",
      net: "Earning Amount",
      quantity: "Delivered Quantity",
    });
    const result = normalize([source], mapping, "g2g", "EUR");
    expect(result.errors).toEqual([]);
    expect(result.orders[0]).toMatchObject({
      id: "TEST-G2G-1",
      date: "2026-10-29 04:32:00",
      net: 0,
      gross: 10,
      quantity: 0,
    });
  });
  it("preserves missing financial values and separates units from orders", () => {
    const result = normalize(
      [{ ...row, Gross: "", Fee: "" }],
      mapping,
      "x",
      "EUR",
    );
    expect(result.errors).toHaveLength(0);
    expect(result.orders[0]).toMatchObject({
      gross: null,
      fee: null,
      net: 9.1,
      quantity: 2,
    });
  });
  it("rejects invalid values rather than silently dropping fields", () => {
    expect(
      normalize([{ ...row, Net: "bad" }], mapping, "x", "EUR").errors,
    ).toHaveLength(1);
    expect(
      normalize([{ ...row, Date: "bad" }], mapping, "x", "EUR").orders,
    ).toHaveLength(0);
    expect(
      normalize([{ ...row, Qty: "-1" }], mapping, "x", "EUR").orders,
    ).toHaveLength(0);
  });
  it("deduplicates across reports and within one report and exposes changes", () => {
    const o = order();
    expect(dedupe([o, o], []).unique).toHaveLength(1);
    expect(dedupe([o], [o]).duplicates).toHaveLength(1);
    expect(dedupe([{ ...o, status: "Pending" }], [o]).conflicts).toHaveLength(
      1,
    );
  });
  it("uses a deterministic fallback when no order ID exists", () => {
    const o = normalize([{ ...row, "Order ID": "" }], mapping, "first", "EUR")
      .orders[0];
    const other = normalize(
      [{ ...row, "Order ID": "" }],
      mapping,
      "second",
      "EUR",
    ).orders[0];
    expect(o.key).toBe(other.key);
    expect(o.key).toMatch(/^fallback:/);
  });
  it("reads actual XLSX and semicolon CSV with a preamble", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["G2G Report"],
        ["Order ID", "Date", "Product", "Net", "Currency"],
        ["X", "2026-09-01", "VPN", 10, "EUR"],
      ]),
      "Sold",
    );
    const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const sheets = await readFile(new File([bytes], "orders.xlsx"));
    expect(sheets[0].rows).toHaveLength(1);
    expect(detect(sheets[0].headers).id).toBe("Order ID");
    const csvSheets = await readFile(
      new File(
        ['Order ID;Date;Product;Net;Currency\r\nC1;2026-09-01;VPN;"10,50";EUR'],
        "orders.csv",
      ),
    );
    expect(csvSheets[0].rows[0]["Order ID"]).toBe("C1");
    expect(
      normalize(csvSheets[0].rows, detect(csvSheets[0].headers), "csv", "EUR")
        .orders[0].net,
    ).toBe(10.5);
  });
  it("rejects unsupported files", async () => {
    await expect(readFile(new File(["x"], "orders.pdf"))).rejects.toThrow();
  });
});
describe("financial calculations", () => {
  it("refuses to sum different currencies without conversion", () => {
    expect(() =>
      stats(
        [order(), { ...order(), currency: "CZK" }],
        "2026-09-01",
        "2026-09-01",
      ),
    ).toThrow(/měny/);
  });
  it("counts zero calendar days and does not multiply order totals by quantity", () => {
    const s = stats([order()], "2026-09-01", "2026-09-10");
    expect(s.count).toBe(1);
    expect(s.units).toBe(2);
    expect(s.net).toBe(9.1);
    expect(s.gross).toBe(10);
    expect(s.days).toBe(10);
    expect(s.avgOrders).toBe(0.1);
    expect(s.avgNet).toBeCloseTo(0.91);
    expect(s.daily[1].orders).toBe(0);
  });
  it("handles missing values, empty datasets and zero denominator", () => {
    const s = stats([{ ...order(), net: null }], "2026-09-01", "2026-09-01");
    expect(s.net).toBeNull();
    expect(s.avgOrder).toBeNull();
    expect(stats([], "2026-09-01", "2026-09-01").avgOrders).toBe(0);
    expect(growth(10, 0)).toBeNull();
    expect(growth(15, 10)).toBe(50);
  });
  it("does not count future days", () => {
    const from = new Date();
    const end = new Date();
    end.setDate(end.getDate() + 10);
    expect(
      stats([], from.toISOString().slice(0, 10), end.toISOString().slice(0, 10))
        .days,
    ).toBe(1);
  });
  it("selects an equally long previous period", () => {
    expect(previousPeriod("2026-10-01", "2026-10-10")).toEqual({
      from: "2026-09-21",
      to: "2026-09-30",
    });
  });
  it("exports CSV safely and validates backup schema", () => {
    expect(csv([{ ...order(), product: '=WEBSERVICE("url")' }])).toContain(
      "'=",
    );
    expect(() =>
      validateBackup({ orders: [{}], imports: [], groups: {} }),
    ).toThrow();
    expect(
      validateBackup({ orders: [order(), order()], imports: [], groups: {} })
        .orders,
    ).toHaveLength(1);
  });
});
