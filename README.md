# hozmiii — Sales Analytics

**Aktuální cloudová aplikace:** [hozmiii Cloud](https://hozmiii-cloud.tiny-jam-1176.chatgpt.site/). GitHub Pages nyní přesměruje na cloud. Zdroj cloudového serveru, databázové migrace, API, přihlášení a testy najdete v [`cloud/`](cloud/README.md). Reporty se ukládají v soukromé D1 databázi podle přihlášeného účtu; GitHub obsahuje pouze zdrojový kód.

Původní lokální verze zůstává dostupná pouze pro export starších dat na [stránce záloh](https://pankwak.github.io/hozmiii/?local-backup=1). V Data a nastavení exportujte JSON a v cloudové aplikaci jej obnovte. Žádná starší lokální data se automaticky nemažou.

G2G nativní report se nyní rozpoznává automaticky (`Sold Order ID`, `Order Date (Order Paid Date)`, `Earning Amount`, `Delivered Quantity`, datum `dd/MM/yy HH:mm`). Ověřeno lokálně na původním 616řádkovém reportu bez chyb; report samotný není součástí repozitáře.

Níže je dokumentace původní lokální verze. Pro novou verzi platí [cloudová dokumentace](cloud/README.md).

Česká, soukromá analytika prodejních reportů G2G. React, TypeScript, Vite, Tailwind CSS, shadcn-style Button s Radix Slot, Recharts, Motion, SheetJS, date-fns a IndexedDB. Bez backendu, účtu nebo API klíče.

## Spuštění

Vyžaduje Node.js 22+.

```sh
npm ci
npm run dev
```

```sh
npm test
npm run typecheck
npm run build
```

## GitHub Pages

1. Nahrajte projekt do větve `main` veřejného repozitáře.
2. V GitHub → Settings → Pages → Source nastavte **GitHub Actions**.
3. Workflow `.github/workflows/deploy.yml` při pushi spustí testy, TypeScript, build a nasadí `dist`.
4. Otevřete URL z úspěšného jobu Deploy. Pro repozitář `PANKWAK/hozmiii` jde o `https://pankwak.github.io/hozmiii/`.

Vite používá relativní `base: './'`, takže sestavení funguje také v podadresáři nebo na vlastní doméně. Aplikace nepotřebuje přepisování URL.

## Import

Zvolte více `.xlsx`, `.xls` nebo `.csv` souborů (max. 30 MB každý). U každého vyberte list, zkontrolujte mapování a náhled. Potřebné jsou datum, produkt a alespoň hrubá tržba nebo čistý výdělek. Měnu lze zadat jako výchozí, pokud ve výpisu chybí. Rozlišení den/měsíc lze změnit. Částky jsou vždy za celou objednávku, množstvím se znovu nenásobí. U reportů s jednotkovou cenou částky nejprve upravte ve zdroji. Kód automaticky neodhaduje chybějící výdělek či poplatek.

ID objednávky je klíč deduplikace. Řádky stejného ID představují jednu objednávku; změněný stav nebo částku lze při importu výslovně nahradit. Reporty s více položkami jedné objednávky nejprve agregujte na objednávku. Bez ID se použije přesná kombinace data a času, normalizovaného produktu, částek, množství a měny. Identické skutečné objednávky bez ID nelze odlišit; aplikace vyžaduje potvrzení a ukáže duplicity. Chybné řádky brání importu, takže nezmizí bez upozornění. První řádek alespoň tří neprázdných buněk se bere jako hlavička; případnou složitější titulní stránku odstraňte v Excelu.

Výpočty vždy oddělují EUR a CZK; volitelný vlastní kurz v Nastavení umožní explicitní přepočet. Kurz není automaticky aktualizován ani uložen. Ostatní měny zůstávají samostatné. Součty zobrazují známé částky s upozorněním na neúplné pokrytí. Denní průměry zahrnují dny s nulovými prodeji a neobsahují budoucí dny. Celé období začíná první a končí poslední importovanou objednávkou, nejpozději dneškem. Stavy zachovávají původní text reportu; rozpoznané Completed/Pending a české varianty tvoří souhrnné kategorie. Analytika zahrnuje všechny stavy; ve výpisu je lze filtrovat.

Prognóza používá posledních 30 kalendářních dní, známý průměrný čistý výdělek a ručně upravitelný počet objednávek denně. Při chybějících výdělcích finanční prognózu nezobrazuje. Neobsahuje sezónnost a není zárukou budoucích příjmů.

## Soukromí a zálohy

Zpracování probíhá v prohlížeči. Importované soubory ani prodejní záznamy se neodesílají na server. IndexedDB uchovává data pouze v daném zařízení a originu. Používejte zálohy JSON pro přenos mezi zařízeními. CSV slouží k exportu normalizovaných záznamů, JSON zachová také importy a uživatelská seskupení produktů. Obnova zálohy nahrazuje současná data po potvrzení. Demo žije pouze v paměti a nikdy se nemíchá s reálnými importy.

V tomto repozitáři nejsou prodejní data ani uživatelské zálohy. Hosting může standardně zaznamenávat návštěvy webu, nikoli obsah reportů.

## Testování

Vitest pokrývá místní a mezinárodní částky, data a neplatné datum, skutečný XLSX/CSV parser, mapování, chybějící hodnoty, změny a duplicity, fallback bez ID, počty objednávek proti kusům, nulové kalendářní dny, budoucí dny, růst a bezpečný CSV export/obnovu zálohy. Responzivní layout má spodní mobilní navigaci; animace respektují reduced motion.
