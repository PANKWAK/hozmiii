# hozmiii Cloud

Soukromá cloudová analytika G2G. React/TypeScript, Vinext, Cloudflare Workers a D1. Zdrojový kód je veřejný na GitHubu, objednávky jsou v oddělené databázi za přihlášením přes ChatGPT.

Hlavní přehled, pořadí produktů, porovnání, denní průměry a prognóza vycházejí z čistého výdělku. U G2G reportu má sloupec `Earning Amount` přednost před obecnými sloupci jako `Net` či `Amount`. Jeho částka je za objednávku: neodečítáme z ní znovu G2G provizi a nenásobíme ji počtem kusů. Hrubá tržba je dostupná pouze v rozkladu analytiky, exportu a detailu objednávky. U dříve importovaných chybných dat zopakujte import a výslovně zvolte nahrazení změněných objednávek.

## Použití

1. Otevřete web a přihlaste se účtem ChatGPT. Na dalších zařízeních použijte stejný účet.
2. Nahrajte G2G sold-order XLSX/CSV. Nativní schéma se mapuje automaticky včetně `Sold Order ID`, `Order Date (Order Paid Date)`, `Earning Amount`, `Delivered Quantity` a dat se dvouciferným rokem. Nulové doručené množství je platné u zrušených či dosud nedoručených objednávek. V této podobě reportu počet kusů znamená doručené kusy, ne zakoupené kusy.
3. Potvrďte náhled. Normalizované záznamy se uloží do D1. Původní soubor neukládáme.
4. Starší lokální data exportujte ze staré GitHub Pages verze přes `?local-backup=1` jako JSON a obnovte zde v Data a nastavení. Nová verze sama nečte jiné originy ani nemaže původní data.

## G2G OpenAPI

V **Data a nastavení → Cloud a propojení G2G** vložte existující schválené G2G User ID, Access Key ID, Secret Access Key a ID vlastní objednávky. Server ověří přístup přes `GET https://open-api.g2g.com/v2/orders/{id}` a klíče zašifruje AES-256-GCM. Celý tajný klíč se nikdy neposílá zpět klientovi.

Poté do G2G webhook nastavení vložte adresu z aplikace. Povolte události vytvoření, potvrzení, dokončení, refundace, zrušení a další změny objednávek. Doručování funguje bez otevřeného prohlížeče. Dokud nepřijde skutečná podepsaná událost, UI uvádí, že webhook není ověřen doručením. Aplikace nemůže sama zpřístupnit G2G oprávnění, vytvořit klíče či nastavit webhook bez přístupu do seller nastavení.

Oficiálně ověřená dokumentace nabízí načtení konkrétní objednávky a webhooky, ne kompletní historický seznam nebo automatické stažení XLSX reportů. Pro historii slouží import. Ruční kontrola obnoví až 15 nejnovějších známých nedokončených objednávek, s minimální přestávkou 30 sekund. Automatické webhooky zpracovávají nové i změněné objednávky průběžně.

API může neposkytovat název produktu ani čistý výdělek. V tom případě se zobrazí popsaný chybějící název / prázdný výdělek. U shodných částek se zachovává poslední skutečný údaj z reportu; po změně částky, refundaci nebo zrušení se nepotvrzený čistý výdělek vyprázdní. Výdělek se neodhaduje z tržby ani z domnělé provize. API timestampy nových objednávek jsou UTC, reporty zachovávají původní čas. Report používá doručené kusy; API používá `delivered_qty`, případně známé `purchased_qty`, když doručené množství chybí.

## Ochrana dat

- Server u každého čtení/zápisu ověřuje platformní identitu a filtruje podle jejího stabilního ID. Anonymní datové požadavky vracejí 401.
- Zápisy z prohlížeče vyžadují stejný Origin. API klíče nejsou v klientském JavaScriptu, repozitáři, zálohách ani logu.
- D1 obsahuje objednávky, metadata importů a šifrované připojení. Hlavní šifrovací klíč `DATA_ENCRYPTION_KEY` je serverový secret, mimo zdrojový kód. Neodstraňujte jej bez migrace připojení.
- Webhook ověřuje HMAC-SHA256, přesnou URL a časovou platnost pěti minut. Protože podpis G2G neobsahuje JSON body, data se před uložením znovu načtou přímo z oficiálního API a ověří se seller ID. Neukládají se buyer ID ani celý příchozí payload.
- Opakované eventy se neduplikují. Revize a atomické SQL zápisy brání přepsání současných změn z druhého zařízení nebo webhooku. Při konfliktu se vyžádá obnovení a opakovaný import.
- Nejvýše 40 000 objednávek na účet; importy je možné přidávat po částech. Záloha JSON zachovává reporty a názvy produktů, nezahrnuje API tajemství.
- Smazání všech prodejů nemaže připojení G2G; pokud si nepřejete další přenosy, nejdříve odpojte G2G.

## Vývoj

Vyžaduje Node.js 22.13+; testy úložiště používají vestavěné `node:sqlite` (Node 22.13+ / 24).

```sh
npm ci
npm test
npm run typecheck
npm run db:generate
npm run build
```

Pro preview aplikujte vygenerovanou SQL migraci přes Wrangler do lokální DB a spusťte `npm run dev`. Přenosné preview má pouze lokální simulaci ChatGPT identity; do produkce se simulace nezahrnuje. Výrobní přihlášení obsluhuje Sites.

Hostování řídí `.openai/hosting.json`. Databázi vlastní migrační soubory v `drizzle/`; již použité migrace neupravujte. Sites při publikaci aplikuje schema do hostované D1. V public GitHub Pages repozitáři je tato cloudová aplikace zrcadlená v `cloud/`; samotné Pages nejsou server ani databáze.

## Ověření

Testy pokrývají parser XLSX/CSV, reálné G2G názvy sloupců, dvouciferný rok, nulové doručené množství, duplicity, měny a výpočty, šifrování klíčů, podpis a expiraci webhooku, omezení na oficiální API, kontrolu vlastníka objednávky, izolaci uživatelů a atomické ukládání 616 syntetických objednávek s konflikty revizí.

Referenční dokumentace: [G2G API](https://docs.g2g.com/), [Get Order](https://docs.g2g.com/get-order-18583489e0), [Authentication](https://docs.g2g.com/v1/authentication-intro-1237120m0), [Webhook Message Signature](https://docs.g2g.com/message-signature-1237168m0), [Official HMAC example](https://github.com/g2g-official/open-api-sample).
