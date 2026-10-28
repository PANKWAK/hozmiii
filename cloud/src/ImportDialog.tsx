import { useEffect, useMemo, useRef, useState } from "react";
import {
  UploadCloud,
  X,
  FileSpreadsheet,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Check,
} from "lucide-react";
import { Button } from "./ui";
import {
  dedupe,
  detect,
  fields,
  labels,
  normalize,
  readFile,
  type Mapping,
  type Sheet,
  type Store,
  type Order,
} from "./data";
type FileItem = {
  name: string;
  sheets: Sheet[];
  sheet: number;
  mapping: Mapping;
};
export default function ImportDialog({
  store,
  onImport,
  onClose,
}: {
  store: Store;
  onImport: (s: Store) => Promise<void>;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<FileItem[]>([]),
    [active, setActive] = useState(0),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(""),
    [currency, setCurrency] = useState("EUR"),
    [mode, setMode] = useState("dmy"),
    [fallback, setFallback] = useState(false),
    [replace, setReplace] = useState(false),
    [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = dialog.current;
    el?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && el) {
        const items = Array.from(
          el.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input,select,[tabindex="0"]',
          ),
        );
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);
  async function read(list: FileList | File[]) {
    const selectedFiles = Array.from(list);
    setBusy(true);
    setError("");
    const items: FileItem[] = [];
    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const f = selectedFiles[i];
        const sheets = await readFile(f);
        if (!sheets.length)
          throw Error(`${f.name}: žádná tabulka nebyla nalezena.`);
        items.push({
          name: f.name,
          sheets,
          sheet: 0,
          mapping: detect(sheets[0].headers),
        });
        setProgress(Math.round(((i + 1) / selectedFiles.length) * 100));
      }
      setFiles((prev) => [...prev, ...items]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const result = useMemo(() => {
    const all: Order[] = [],
      errors: string[] = [];
    files.forEach((f, i) => {
      const n = normalize(
        f.sheets[f.sheet].rows,
        f.mapping,
        `pending-${i}`,
        currency,
        mode,
      );
      all.push(...n.orders);
      errors.push(...n.errors.map((e) => `${f.name}: ${e}`));
    });
    return { ...dedupe(all, store.orders), all, errors };
  }, [files, store, currency, mode]);
  const file = files[active];
  const hasFallback = result.all.some((o) => !o.id);
  const incomplete = files.some(
    (f) =>
      !f.mapping.date ||
      !f.mapping.product ||
      (!f.mapping.gross && !f.mapping.net),
  );
  async function commit() {
    setBusy(true);
    setError("");
    try {
      const ids = files.map(() => crypto.randomUUID());
      const imports = files.map((f, i) => ({
        id: ids[i],
        name: f.name + " · " + f.sheets[f.sheet].name,
        created: new Date().toISOString(),
        count: result.unique.filter((o) => o.importId === `pending-${i}`)
          .length,
      }));
      const incoming = replace
        ? [...result.unique, ...result.conflicts]
        : result.unique;
      const keys = new Set(incoming.map((o) => o.key));
      await onImport({
        ...store,
        orders: [
          ...store.orders.filter((o) => !keys.has(o.key)),
          ...dedupe(incoming, []).unique.map((o) => ({
            ...o,
            importId: ids[Number(o.importId.split("-")[1])],
          })),
        ],
        imports: [...store.imports, ...imports],
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="modal import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        tabIndex={-1}
        ref={dialog}
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">VAŠE DATA. VÁŠ PŘEHLED.</span>
            <h2 id="import-title">Importovat report</h2>
          </div>
          <Button variant="ghost" onClick={onClose} aria-label="Zavřít">
            <X size={20} />
          </Button>
        </div>
        <p className="muted">
          Nahrajte prodejní report G2G. Zkontrolujte sloupce a teprve potom
          potvrďte import.
        </p>
        <input
          ref={input}
          hidden
          type="file"
          multiple
          accept=".xlsx,.xls,.csv"
          onChange={(e) => {
            if (e.target.files) void read(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          className={`dropzone ${drag ? "drag" : ""}`}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void read(e.dataTransfer.files);
          }}
        >
          <span className="upload-icon">
            <UploadCloud size={26} />
          </span>
          <strong>
            {busy ? `Zpracování · ${progress} %` : "Přetáhněte sem své reporty"}
          </strong>
          <span>nebo vyberte soubory z počítače</span>
          <small>XLSX, XLS, CSV · více souborů · do 30 MB / soubor</small>
        </button>
        {busy && (
          <progress value={progress} max={100} aria-label="Průběh načítání" />
        )}
        {error && (
          <div className="notice error" role="alert">
            <AlertCircle size={18} />
            {error}
          </div>
        )}
        {!!files.length && (
          <>
            <div className="file-tabs">
              {files.map((f, i) => (
                <button
                  key={i}
                  className={active === i ? "active" : ""}
                  onClick={() => setActive(i)}
                >
                  <FileSpreadsheet size={15} />
                  {f.name}
                </button>
              ))}
            </div>
            {file && (
              <>
                <div className="filters">
                  <label>
                    List
                    <select
                      value={file.sheet}
                      onChange={(e) => {
                        const sheet = +e.target.value;
                        setFiles(
                          files.map((f, i) =>
                            i === active
                              ? {
                                  ...f,
                                  sheet,
                                  mapping: detect(f.sheets[sheet].headers),
                                }
                              : f,
                          ),
                        );
                      }}
                    >
                      {file.sheets.map((s, i) => (
                        <option value={i} key={i}>
                          {s.name} ({s.rows.length} řádků)
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Měna, pokud chybí
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                    >
                      <option>EUR</option>
                      <option>CZK</option>
                      <option>USD</option>
                      <option>GBP</option>
                    </select>
                  </label>
                  <label>
                    Pořadí data
                    <select
                      value={mode}
                      onChange={(e) => setMode(e.target.value)}
                    >
                      <option value="dmy">Den / měsíc / rok</option>
                      <option value="mdy">Měsíc / den / rok</option>
                    </select>
                  </label>
                </div>
                <div className="mapping">
                  {fields.map((f) => (
                    <label key={f}>
                      {labels[f]}
                      {["date", "product"].includes(f) ? " *" : ""}
                      <select
                        value={file.mapping[f]}
                        onChange={(e) =>
                          setFiles(
                            files.map((it, i) =>
                              i === active
                                ? {
                                    ...it,
                                    mapping: {
                                      ...it.mapping,
                                      [f]: e.target.value,
                                    },
                                  }
                                : it,
                            ),
                          )
                        }
                      >
                        <option value="">Není ve výpisu</option>
                        {file.sheets[file.sheet].headers.map((h) => (
                          <option key={h}>{h}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <p className="fine">
                  Povinné: datum, produkt a alespoň tržba nebo výdělek. Částky
                  jsou za celou objednávku. Chybějící výdělek ani poplatek
                  nedopočítáváme.
                </p>
                <div className="table-wrap preview">
                  <table>
                    <thead>
                      <tr>
                        {fields.map((f) => (
                          <th key={f}>{labels[f]}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {normalize(
                        file.sheets[file.sheet].rows,
                        file.mapping,
                        "preview",
                        currency,
                        mode,
                      )
                        .orders.slice(0, 5)
                        .map((o, i) => (
                          <tr key={i}>
                            {fields.map((f) => (
                              <td key={f}>{String(o[f] ?? "—")}</td>
                            ))}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setFiles(files.filter((_, i) => i !== active));
                    setActive(0);
                  }}
                >
                  Odebrat tento soubor
                </Button>
              </>
            )}
            {file?.mapping.net && (
              <div className="notice">
                <Check size={18} />
                Částky pro vás čteme ze sloupce „{file.mapping.net}“. Částku
                nepřepočítáváme množstvím a poplatky už znovu neodečítáme.
              </div>
            )}
            <div className="notice">
              <Check size={18} />
              {result.unique.length} nových objednávek ·{" "}
              {result.duplicates.length} duplicit · {result.errors.length}{" "}
              chybných řádků
            </div>
            {result.errors.length > 0 && (
              <details className="notice error">
                <summary>Opravte chyby před importem</summary>
                {result.errors.slice(0, 30).map((e, i) => (
                  <p key={i}>{e}</p>
                ))}
              </details>
            )}
            {result.duplicates.length > 0 && (
              <details className="notice">
                <summary>
                  Zobrazit přeskočené duplicity ({result.duplicates.length})
                </summary>
                {result.duplicates.slice(0, 50).map((o, i) => (
                  <p key={i}>
                    {o.id || "Bez ID"} · {o.date} · {o.product} ·{" "}
                    {o.net === null ? "Výdělek chybí" : o.net} {o.currency}
                  </p>
                ))}
              </details>
            )}
            {result.conflicts.length > 0 && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={replace}
                  onChange={(e) => setReplace(e.target.checked)}
                />
                Nahradit {result.conflicts.length} změněných objednávek (např.
                aktualizovaný stav). Původní hodnoty budou přepsány.
              </label>
            )}
            {hasFallback && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={fallback}
                  onChange={(e) => setFallback(e.target.checked)}
                />
                Potvrzuji kontrolu objednávek bez ID. Shodné datum, produkt,
                částky, počet a měna se považují za duplicitu; dvě skutečně
                totožné objednávky bez ID nelze rozlišit.
              </label>
            )}
            <div className="modal-foot">
              <span>
                <ShieldCheck size={16} />
                Po potvrzení se objednávky uloží do vašeho soukromého cloudu.
              </span>
              <Button
                onClick={() => void commit()}
                disabled={
                  busy ||
                  incomplete ||
                  !!result.errors.length ||
                  (hasFallback && !fallback) ||
                  (!result.unique.length &&
                    !(replace && result.conflicts.length))
                }
              >
                Potvrdit import <ArrowRight size={17} />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
