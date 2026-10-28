"use client";
import { useEffect, useState } from "react";
import {
  Cloud,
  Link2,
  RefreshCw,
  ShieldCheck,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "./ui";
type Status = {
  connected: boolean;
  webhookUrl: string | null;
  lastEventAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
};
export default function CloudSettings({
  orderId,
  onRefresh,
}: {
  orderId: string;
  onRefresh: () => Promise<void>;
}) {
  const [status, setStatus] = useState<Status | null>(null),
    [apiKey, setApiKey] = useState(""),
    [apiSecret, setApiSecret] = useState(""),
    [userId, setUserId] = useState(""),
    [testOrder, setTestOrder] = useState(orderId),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [edit, setEdit] = useState(false),
    [copied, setCopied] = useState(false),
    [disconnect, setDisconnect] = useState(false);
  async function readStatus() {
    const response = await fetch("/api/g2g", { cache: "no-store" });
    if (!response.ok) throw Error("Stav propojení není dostupný.");
    setStatus(await response.json());
  }
  useEffect(() => {
    void readStatus().catch((e) => setError(e.message));
  }, []);
  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/g2g", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, apiKey, apiSecret, orderId: testOrder }),
      });
      const data = (await response.json()) as {
        error?: string;
        checked: number;
        updated: number;
        errors: string[];
      };
      if (!response.ok) throw Error(data.error || "Propojení selhalo.");
      setApiKey("");
      setApiSecret("");
      setEdit(false);
      await readStatus();
      await onRefresh();
      setMessage(
        "G2G klíče byly ověřeny a zašifrovány. Nyní nastavte níže uvedený webhook v G2G.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Propojení selhalo.");
    } finally {
      setBusy(false);
    }
  }
  async function sync() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/g2g/sync", { method: "POST" });
      const data = (await response.json()) as {
        error?: string;
        checked: number;
        updated: number;
        errors: string[];
      };
      if (!response.ok) throw Error(data.error || "Kontrola selhala.");
      await readStatus();
      await onRefresh();
      setMessage(
        `Zkontrolováno ${data.checked}, aktualizováno ${data.updated} objednávek.${data.errors.length ? " Některé objednávky nebyly dostupné." : ""}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kontrola selhala.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card cloud-settings">
      <div className="card-head">
        <h2>
          <Cloud size={19} />
          Cloud a propojení G2G
        </h2>
        <span className="status complete">Soukromý účet</span>
      </div>
      <div className="cloud-content">
        <p className="muted">
          Reporty se ukládají do cloudové databáze vašeho účtu. Po přihlášení
          stejným účtem ChatGPT je uvidíte na telefonu i počítači. Do veřejného
          GitHubu se prodejní data ani klíče neukládají.
        </p>
        <div className="notice">
          <ShieldCheck size={17} />
          {status?.connected
            ? "API klíče jsou uložené zašifrovaně na serveru."
            : "Připojte existující klíče ze schváleného G2G OpenAPI."}
        </div>
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        {message && (
          <div className="notice" role="status">
            <Check size={17} />
            {message}
          </div>
        )}
        {status?.connected && !edit ? (
          <>
            <div className="status-list">
              <div>
                <span>Ověření / kontrola API</span>
                <strong>
                  {status.lastSyncAt
                    ? new Date(status.lastSyncAt).toLocaleString("cs-CZ")
                    : "—"}
                </strong>
              </div>
              <div>
                <span>Poslední přijatá změna z G2G</span>
                <strong>
                  {status.lastEventAt
                    ? new Date(status.lastEventAt).toLocaleString("cs-CZ")
                    : "Zatím žádná · nastavte webhook"}
                </strong>
              </div>
            </div>
            {status.lastError && (
              <div className="notice error">{status.lastError}</div>
            )}
            <label>
              Webhook URL pro G2G
              <input
                readOnly
                value={status.webhookUrl ?? ""}
                onFocus={(e) => e.target.select()}
              />
            </label>
            <div className="settings-actions">
              <Button
                variant="secondary"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(status.webhookUrl ?? "")
                    .then(() => setCopied(true))
                }
              >
                <Copy size={15} />
                {copied ? "Zkopírováno" : "Kopírovat webhook"}
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void sync()}
              >
                <RefreshCw size={15} />
                {busy ? "Kontroluji…" : "Zkontrolovat známé objednávky"}
              </Button>
              <Button variant="ghost" onClick={() => setEdit(true)}>
                Upravit klíče
              </Button>
              <Button variant="ghost" onClick={() => setDisconnect(true)}>
                Odpojit G2G
              </Button>
            </div>
            <p className="fine">
              V G2G OpenAPI nastavení vložte tuto URL jako webhook a povolte
              události objednávek (vytvoření, potvrzení, dokončení, zrušení a
              refundace). Změny pak přicházejí automaticky, i když web nemáte
              otevřený. Bez první přijaté události není aktivní doručování
              ověřené.
            </p>
          </>
        ) : (
          <form onSubmit={(e) => void connect(e)}>
            <div className="mapping">
              <label>
                G2G User ID
                <input
                  required
                  autoComplete="off"
                  inputMode="numeric"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="Vaše číselné seller ID"
                />
              </label>
              <label>
                Access Key ID
                <input
                  required
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Existující G2G API klíč"
                />
              </label>
              <label>
                Secret Access Key
                <input
                  required
                  type="password"
                  autoComplete="off"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  placeholder="Existující tajný klíč"
                />
              </label>
              <label>
                ID vlastní objednávky pro ověření
                <input
                  required
                  autoComplete="off"
                  value={testOrder}
                  onChange={(e) => setTestOrder(e.target.value)}
                  placeholder="Sold Order ID z reportu"
                />
              </label>
            </div>
            <p className="fine">
              Klíče se odešlou přes HTTPS do soukromého nastavení vašeho účtu,
              ověří se proti G2G a uloží se pomocí AES-GCM. Nikdy se nevracejí
              do prohlížeče ani do zdrojového kódu.
            </p>
            <div className="settings-actions">
              <Button type="submit" disabled={busy}>
                <Link2 size={16} />
                {busy ? "Ověřuji přístup…" : "Ověřit a propojit G2G"}
              </Button>
              {edit && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEdit(false)}
                >
                  Zrušit
                </Button>
              )}
            </div>
          </form>
        )}
        <div className="notice">
          API načítá ověřené objednávky a jejich stavy. Historii doplňte
          reportem; úplný seznam historických prodejů není v ověřené dokumentaci
          nabízen. Čistý výdělek se nedopočítává z tržby. Pokud jej API
          neposkytne, zůstane poslední shodná hodnota z reportu nebo „—“. Časy
          nových objednávek z API jsou v UTC; původní časy reportů zachováváme.
        </div>
        <a
          className="text-link"
          href="/signout-with-chatgpt?return_to=%2F"
          target="_top"
        >
          Odhlásit tento účet
        </a>
      </div>
      {disconnect && (
        <div className="overlay">
          <div
            className="modal detail-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="disconnect-title"
          >
            <h2 id="disconnect-title">Odpojit G2G?</h2>
            <p className="muted">
              Zašifrované přístupové klíče se odstraní a příjem webhooků se
              zastaví. Objednávky zůstanou uložené. Pro opětovné připojení
              budete klíče potřebovat znovu.
            </p>
            <div className="settings-actions">
              <Button
                variant="secondary"
                autoFocus
                onClick={() => setDisconnect(false)}
              >
                Zrušit
              </Button>
              <Button
                variant="destructive"
                onClick={() =>
                  void fetch("/api/g2g", { method: "DELETE" })
                    .then((r) => {
                      if (!r.ok) throw Error("Odpojení se nezdařilo.");
                      setDisconnect(false);
                      return readStatus();
                    })
                    .catch((e) => setError(e.message))
                }
              >
                Odpojit
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
