import * as XLSX from "xlsx";
import {
  eachDayOfInterval,
  format,
  isValid,
  parse,
  startOfDay,
  subDays,
} from "date-fns";
import { openDB } from "idb";
export type Order = {
  key: string;
  id: string;
  date: string;
  product: string;
  gross: number | null;
  net: number | null;
  fee: number | null;
  quantity: number;
  currency: string;
  status: string;
  importId: string;
};
export type Dataset = {
  id: string;
  name: string;
  created: string;
  count: number;
};
export type Store = {
  orders: Order[];
  imports: Dataset[];
  groups: Record<string, string>;
};
export const empty: Store = { orders: [], imports: [], groups: {} };
export const fields = [
  "id",
  "date",
  "product",
  "gross",
  "net",
  "fee",
  "quantity",
  "currency",
  "status",
] as const;
export type Field = (typeof fields)[number];
export type Mapping = Record<Field, string>;
export const labels: Record<Field, string> = {
  id: "ID objednávky",
  date: "Datum a čas",
  product: "Produkt",
  gross: "Hrubá tržba (celá objednávka)",
  net: "Výdělek po poplatcích",
  fee: "Poplatek tržiště",
  quantity: "Počet kusů",
  currency: "Měna",
  status: "Stav",
};
const aliases: Record<Field, string[]> = {
  id: [
    "orderid",
    "orderno",
    "ordernumber",
    "cisloobjednavky",
    "idobjednavky",
    "id",
  ],
  date: [
    "ordercreatedat",
    "orderdate",
    "createdat",
    "creationdate",
    "date",
    "datum",
    "createdtime",
    "ordercreationdate",
    "ordercreationtime",
  ],
  product: [
    "productname",
    "product",
    "itemname",
    "offername",
    "title",
    "produkt",
    "nazev",
    "offer",
  ],
  gross: [
    "saleprice",
    "grossrevenue",
    "totalamount",
    "orderamount",
    "orderprice",
    "sellingprice",
    "price",
    "amount",
    "trzba",
    "cena",
  ],
  net: [
    "sellerearnings",
    "sellerpayout",
    "netearnings",
    "netamount",
    "earnings",
    "payout",
    "net",
    "vydelek",
    "income",
    "sellerincome",
    "receivedamount",
  ],
  fee: [
    "marketplacefees",
    "fee",
    "fees",
    "commission",
    "poplatek",
    "servicefee",
  ],
  quantity: ["quantity", "qty", "units", "pocet", "mnozstvi"],
  currency: ["currency", "mena", "currencycode"],
  status: ["orderstatus", "status", "stav"],
};
export const canonical = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
export function detect(headers: string[]): Mapping {
  return Object.fromEntries(
    fields.map((f) => [
      f,
      headers.find((h) => aliases[f].includes(canonical(h))) || "",
    ]),
  ) as Mapping;
}
export function number(value: unknown): number | null {
  if (value == null || String(value).trim() === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let s = String(value).trim();
  const neg = /^\(.*\)$/.test(s);
  s = s.replace(/[^\d.,+\-]/g, "");
  if (!s || !/[0-9]/.test(s)) return null;
  const comma = s.lastIndexOf(","),
    dot = s.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    s = s.replace(decimal === "," ? /\./g : /,/g, "").replace(",", ".");
  } else if (comma >= 0) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -Math.abs(n) : n) : null;
}
export function dateValue(v: unknown, mode = "dmy"): string | null {
  if (v instanceof Date)
    return isValid(v) ? format(v, "yyyy-MM-dd HH:mm:ss") : null;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return format(
      new Date(d.y, d.m - 1, d.d, d.H, d.M, d.S),
      "yyyy-MM-dd HH:mm:ss",
    );
  }
  const s = String(v ?? "").trim();
  for (const f of [
    "yyyy-MM-dd HH:mm:ss",
    "yyyy-MM-dd HH:mm",
    "yyyy-MM-dd",
    ...(mode === "mdy"
      ? ["MM/dd/yyyy HH:mm:ss", "MM/dd/yyyy HH:mm", "MM/dd/yyyy"]
      : ["dd/MM/yyyy HH:mm:ss", "dd/MM/yyyy HH:mm", "dd/MM/yyyy"]),
    "d.M.yyyy H:mm:ss",
    "d.M.yyyy H:mm",
    "d.M.yyyy",
    "d. M. yyyy",
    "yyyy/MM/dd HH:mm:ss",
  ]) {
    const d = parse(s, f, new Date());
    if (isValid(d)) return format(d, "yyyy-MM-dd HH:mm:ss");
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    if (isValid(d)) return format(d, "yyyy-MM-dd HH:mm:ss");
  }
  return null;
}
export type Sheet = {
  name: string;
  headers: string[];
  rows: Record<string, unknown>[];
};
export async function readFile(file: File): Promise<Sheet[]> {
  if (!/\.(xlsx|xls|csv)$/i.test(file.name))
    throw Error("Podporujeme pouze .xlsx, .xls a .csv.");
  if (file.size > 30 * 1024 * 1024)
    throw Error("Soubor je větší než 30 MB. Rozdělte report.");
  const book = XLSX.read(await file.arrayBuffer(), {
    type: "array",
    cellDates: true,
    raw: true,
  });
  return book.SheetNames.map((name) => {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name], {
      header: 1,
      defval: "",
      raw: true,
    });
    const idx = grid.findIndex(
      (row) => row.filter((x) => String(x).trim()).length >= 3,
    );
    if (idx < 0) return { name, headers: [], rows: [] };
    const used = new Set<string>();
    const headers = grid[idx].map((x, i) => {
      let h = String(x).trim() || `Sloupec ${i + 1}`;
      if (used.has(h)) h += ` (${i + 1})`;
      used.add(h);
      return h;
    });
    return {
      name,
      headers,
      rows: grid
        .slice(idx + 1)
        .filter((r) => r.some((x) => String(x).trim()))
        .map((row) =>
          Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ""])),
        ),
    };
  }).filter((s) => s.rows.length);
}
export function normalize(
  rows: Record<string, unknown>[],
  map: Mapping,
  importId: string,
  defaultCurrency: string,
  mode = "dmy",
) {
  const errors: string[] = [];
  const orders: Order[] = [];
  rows.forEach((r, i) => {
    const get = (f: Field) => (map[f] ? r[map[f]] : null);
    const date = dateValue(get("date"), mode),
      product = String(get("product") ?? "").trim();
    const gross = number(get("gross")),
      net = number(get("net")),
      fee = number(get("fee"));
    const currency = String(get("currency") || defaultCurrency)
      .trim()
      .toUpperCase();
    const quantity = number(get("quantity")) ?? 1;
    if (
      !date ||
      !product ||
      !/^[A-Z]{3}$/.test(currency) ||
      quantity <= 0 ||
      !Number.isInteger(quantity) ||
      (gross === null && net === null)
    ) {
      errors.push(
        `Řádek ${i + 2}: zkontrolujte datum, produkt, částku, měnu a množství.`,
      );
      return;
    }
    if (
      ["gross", "net", "fee", "quantity"].some(
        (f) =>
          get(f as Field) != null &&
          String(get(f as Field)).trim() !== "" &&
          number(get(f as Field)) === null,
      )
    ) {
      errors.push(`Řádek ${i + 2}: neplatná číselná hodnota.`);
      return;
    }
    const id = String(get("id") ?? "").trim();
    const key = id
      ? `id:${id}`
      : `fallback:${JSON.stringify([date, canonical(product), gross, net, fee, quantity, currency])}`;
    orders.push({
      key,
      id,
      date,
      product,
      gross,
      net,
      fee,
      quantity,
      currency,
      status: String(get("status") || "Neznámý"),
      importId,
    });
  });
  return { orders, errors };
}
export function dedupe(incoming: Order[], existing: Order[]) {
  const seen = new Map(existing.map((o) => [o.key, o]));
  const unique: Order[] = [],
    duplicates: Order[] = [],
    conflicts: Order[] = [];
  incoming.forEach((o) => {
    const old = seen.get(o.key);
    if (old) {
      duplicates.push(o);
      if (
        [
          "date",
          "product",
          "gross",
          "net",
          "fee",
          "quantity",
          "currency",
          "status",
        ].some((k) => old[k as keyof Order] !== o[k as keyof Order])
      )
        conflicts.push(o);
    } else {
      seen.set(o.key, o);
      unique.push(o);
    }
  });
  return { unique, duplicates, conflicts };
}
export function growth(current: number, previous: number): number | null {
  return previous === 0
    ? null
    : ((current - previous) / Math.abs(previous)) * 100;
}
export function stats(orders: Order[], from: string, to: string) {
  if (new Set(orders.map((o) => o.currency)).size > 1)
    throw Error("Před součtem oddělte měny nebo použijte výslovný kurz.");
  const end = startOfDay(new Date(to)),
    start = startOfDay(new Date(from));
  const capped = end > startOfDay(new Date()) ? startOfDay(new Date()) : end;
  const days = capped >= start ? eachDayOfInterval({ start, end: capped }) : [];
  const sum = (key: "net" | "gross" | "fee") => {
    const known = orders.filter((o) => o[key] !== null);
    return known.length ? known.reduce((s, o) => s + o[key]!, 0) : null;
  };
  const net = sum("net"),
    gross = sum("gross");
  const byDate = new Map<string, Order[]>();
  for (const order of orders) {
    const day = order.date.slice(0, 10);
    const list = byDate.get(day) ?? [];
    list.push(order);
    byDate.set(day, list);
  }
  return {
    count: orders.length,
    units: orders.reduce((s, o) => s + o.quantity, 0),
    net,
    gross,
    fee: sum("fee"),
    days: days.length,
    avgOrders: days.length ? orders.length / days.length : 0,
    avgNet: net !== null && days.length ? net / days.length : null,
    avgOrder: net !== null && orders.length ? net / orders.length : null,
    aov: gross !== null && orders.length ? gross / orders.length : null,
    netKnown: orders.filter((o) => o.net !== null).length,
    grossKnown: orders.filter((o) => o.gross !== null).length,
    daily: days.map((d) => {
      const date = format(d, "yyyy-MM-dd");
      const matches = byDate.get(date) ?? [];
      return {
        date,
        label: format(d, "d. M."),
        orders: matches.length,
        net: matches.some((o) => o.net !== null)
          ? matches.reduce((s, o) => s + (o.net ?? 0), 0)
          : matches.length
            ? null
            : 0,
        gross: matches.some((o) => o.gross !== null)
          ? matches.reduce((s, o) => s + (o.gross ?? 0), 0)
          : matches.length
            ? null
            : 0,
      };
    }),
  };
}
export function previousPeriod(from: string, to: string) {
  const days = eachDayOfInterval({
    start: new Date(from),
    end: new Date(to),
  }).length;
  return {
    from: format(subDays(new Date(from), days), "yyyy-MM-dd"),
    to: format(subDays(new Date(from), 1), "yyyy-MM-dd"),
  };
}
export function csv(orders: Order[]) {
  const columns = [
    "id",
    "date",
    "product",
    "gross",
    "net",
    "fee",
    "quantity",
    "currency",
    "status",
  ] as const;
  const escape = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return (
    "\uFEFF" +
    [
      columns.join(";"),
      ...orders.map((o) => columns.map((c) => escape(o[c])).join(";")),
    ].join("\r\n")
  );
}
const db = () =>
  openDB("hozmiii", 1, {
    upgrade(db) {
      db.createObjectStore("state");
    },
  });
export async function load(): Promise<Store> {
  return (await (await db()).get("state", "main")) ?? empty;
}
export async function save(store: Store) {
  await (await db()).put("state", store, "main");
}
export function validateBackup(v: unknown): Store {
  const x = v as Store;
  if (
    !x ||
    !Array.isArray(x.orders) ||
    !Array.isArray(x.imports) ||
    !x.groups ||
    typeof x.groups !== "object"
  )
    throw Error("Neplatná záloha.");
  if (
    !x.imports.every(
      (i) =>
        typeof i.id === "string" &&
        typeof i.name === "string" &&
        typeof i.created === "string" &&
        isValid(new Date(i.created)),
    ) ||
    !x.orders.every(
      (o) =>
        typeof o.key === "string" &&
        typeof o.id === "string" &&
        typeof o.importId === "string" &&
        typeof o.product === "string" &&
        typeof o.status === "string" &&
        typeof o.currency === "string" &&
        /^[A-Z]{3}$/.test(o.currency) &&
        typeof o.date === "string" &&
        dateValue(o.date) !== null &&
        Number.isInteger(o.quantity) &&
        o.quantity > 0 &&
        [o.gross, o.net, o.fee].every(
          (n) => n === null || (typeof n === "number" && Number.isFinite(n)),
        ),
    )
  )
    throw Error("Záloha obsahuje neplatné záznamy.");
  return {
    orders: dedupe(x.orders, []).unique,
    imports: x.imports,
    groups: Object.fromEntries(
      Object.entries(x.groups).filter(
        ([k, v]) => typeof k === "string" && typeof v === "string",
      ),
    ),
  };
}
export function demoData(): Store {
  const orders: Order[] = [];
  const names = [
    "Proton VPN",
    "Spotify Premium",
    "Xbox Game Pass",
    "CapCut Pro",
    "YouTube Premium",
  ];
  for (let i = 0; i < 240; i++) {
    const day = i % 58;
    const gross = Number((4 + ((i * 7) % 170) / 10).toFixed(2));
    orders.push({
      key: `id:DEMO-${i}`,
      id: `DEMO-${1000 + i}`,
      date:
        format(subDays(startOfDay(new Date()), day), "yyyy-MM-dd") +
        " 14:30:00",
      product: names[i % 5],
      gross,
      net: Number((gross * 0.91).toFixed(2)),
      fee: Number((gross * 0.09).toFixed(2)),
      quantity: i % 9 === 0 ? 2 : 1,
      currency: "EUR",
      status: i % 17 === 0 ? "Pending" : "Completed",
      importId: "demo",
    });
  }
  return {
    orders,
    imports: [
      {
        id: "demo",
        name: "DEMO · ukázková data",
        created: new Date().toISOString(),
        count: orders.length,
      },
    ],
    groups: {},
  };
}
