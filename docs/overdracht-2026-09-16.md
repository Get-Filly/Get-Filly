# Overdracht — sessie 15/16 september 2026

Alles hieronder staat **live op `main`** en de bijbehorende migraties zijn
gedraaid. Dit document is de context voor een volgende sessie; `BACKLOG.md`
blijft de werklijst en `CLAUDE.md` de projectcontext.

---

## Waar het mee begon

De rustige-momenten-detectie wees elke week dezelfde weekdagen aan. Dat was
geen datafout maar wiskundig onvermijdelijk: `gap` en `afwijking` kwamen allebei
uit het Google-weekpatroon, en dat is per weekdag constant. De score van
"maandag lunch" was dus een vast getal, en sorteren met een plafond van 2 gaf
onvermijdelijk elke week dezelfde twee dagen.

Er lag een briefing (`docs/rustige-momenten-variatie-briefing.md`) met een
analyse in vier fasen. Die analyse klopte in de kern, met zeven correcties —
waarvan twee het ontwerp veranderden. Zie het detectie-document hieronder.

---

## Wat er gebouwd is

### Datum-signalen (fase 2)

Weer (Open-Meteo, 7 dagen), evenementen in de buurt (evenementen.nl) en de NL
feestdagen schuiven nu de verwachte drukte per kalenderdatum.

**Het belangrijkste ontwerpbesluit:** die factor werkt op de **verwachte
drukte, vóór de gap-poort** — niet op de eindscore. Op de score kan een signaal
alleen herschikken; op de verwachting kan het een kans laten ontstaan. Een
vrijdag met te weinig gat om kandidaat te zijn, komt door storm alsnog over de
drempel. Dát is de eigenlijke oplossing voor het vaste patroon.

De briefing stelde voor om te dempen op de score. Dat zou het probleem niet
hebben opgelost.

### Beleidslaag (fase 1)

- **Feestdag** = harde poort. Bewust níét gekoppeld aan
  `event_holidays_enabled`: die voorkeur gaat over feestdag-*promoties*.
- **Al afgedekte dagen** vallen af — vóór de week-cap. Dat was de echte bug: de
  frontend filterde ze erná, dus een afgedekte dag vrat een weekplek op en
  maakte de lijst korter in plaats van anders.
- **Cool-down** op weekdag×dagdeel: ×0,40 deze week, ×0,70 vorige, bodem 0,25.
  Multiplicatief, want de score-schaal verschilt per zaak. Werkt ook **vooruit**
  binnen het venster — zonder dat deel verandert een stateless GET over een
  rollend venster nog steeds niets.
- Nadrukkelijk **geen willekeur**: elke afwijking van de hoogste score heeft een
  reden die als `reasonKey` + `reasonParams` meereist.

Gemeten effect op een realistisch testpatroon (8 weken, tempo 2): van 2
weekdag×dagdeel-combinaties naar 4, grootste aandeel 31%.

### Structureel vs incidenteel (fase 3)

Elke kans draagt `kind`. Op de kaart krijgt een incidentele kans een ring om het
sterretje in koper (vorm én kleur, dus ook zonder kleurwaarneming leesbaar). In
de chat gaan de twee soorten als aparte blokken naar Filly, met erbij dat het
structurele blok elke week zo is.

### Terugkoppeling (fase 4) — mig 0074

`campaign_quiet_effect` legt per campagne vast of het dagdeel waarvoor hij
bedoeld was ook echt voller werd: gemeten drukte vs de mediaan van vergelijkbare
dagen. Cron `/api/busyness/cron/measure`, dagelijks 03:30.

De weging meet **relatief** tegen de eigen mediaan van de zaak: een moment dat
niets doet terwijl andere momenten wél werken zakt, maar als er nergens iets
beweegt zakt er niets.

**Dit doet voorlopig bijna niets, en dat hoort.** Onder 3 metingen per slot
weegt er niets mee; daarboven krimpt de uitslag met n/(n+4). Bij een handvol
metingen verzet het ~8% op de score. Het begint pas te sturen na maanden.

> De briefing ging ervan uit dat de meetdefinitie al bestond. Dat klopte niet.
> `classify_campaign_performance()` (mig 0071) scoort kanaal-metrics, geen
> drukte-lift. Dit is nieuwe meetcode.

### Maandoverzicht — mig 0075

`busyness_snapshots` wordt na 120 dagen geprund, dus "vs vorig jaar" was per
definitie onbeantwoordbaar. `busyness_monthly` legt per zaak, maand, weekdag en
uur de gemeten drukte vast — **vóór** de prune, met het aantal dagen waarop de
mediaan rust én de verwachting van dát moment.

**Gaat de rollup mis, dan wordt er niet geprund.** Ruwe data die we nog hebben
is beter dan een gat in de historie. Handmatig: `/api/busyness/cron/rollup`.

### Rapportages

- **Bezetting** draait op echte data: `generateMockHourly()`, de hardgecodeerde
  YoY-deltas en de cohort-tabel zijn weg. Ervoor in de plaats: de echte
  uur-heatmap uit de live-metingen (cellen met te weinig dagen blijven leeg) en
  een nieuw blok **"waar blijf je achter bij je eigen patroon"**.
  - Het subtiele stuk: de verwachting wordt gerekend over **precies de uren die
    ook gemeten zijn**, en uren waar Google zegt dat de zaak dicht is tellen
    niet mee. Anders is het "verschil" een rekenfout. 9 tests.
- **Resultaat** heeft een blok **"wat werkt bij jou"** per kanaal: mediaan van
  de succes-score, met het aantal gemeten uitingen ernaast. Kijkt naar álles wat
  gemeten is, niet naar de gekozen periode.
- **Bezetting staat uit.** `TOON_BEZETTING` in `rapportage-tabs.tsx` op `true`
  en de tab is terug. De route werkt nog via het adres, en de backend draait
  gewoon door — er gaat geen dag historie verloren terwijl de tab uit staat.

### Mail eruit

Mail is nergens meer te kiezen als campagnekanaal. Bewust níét weggehaald: het
transactionele pad (contactformulier, uitnodigingen via Supabase auth), de
uitschrijf-route (al verstuurde mails moeten die link houden) en
`campaigns.type='mail'` met de bestaande campagnes.

### Rem per IP — mig 0076

`check_rate_limit()` telt in de database (geen Redis nodig). Contactformulier
5/kwartier per IP, onboarding-AI 5/10min per user. Fail-**open** bij een fout in
de teller — bewust de andere kant op dan de webhook-validatie: daar gaat het om
authenticiteit, hier om kosten. Het IP wordt gehasht opgeslagen.

Stopt één bron die doorramt, **geen gedistribueerde aanval**.

### Kleinere dingen

- De **reden voor de dagkeuze** staat nu op de campagne ("Waarom juist deze
  dag: regen verwacht, mensen blijven thuis"). De geleide flow schreef die
  helemaal niet weg — alleen de auto-detectie deed dat, en de flow is net het
  pad dat vanaf het dashboard gebruikt wordt.
- **"De hele dag"** in plaats van "lunch, middag, diner en avond" als een blok
  élk open dagdeel beslaat.
- **Dagdeel-namen vertalen** nu mee. `daypartLabel` was een in de backend
  gebouwde Nederlandse zin en stond zo in de Engelse UI.
- **Nieuwjaarsdag en Sinterklaasavond** toegevoegd aan `getNlHolidays`. Die
  lijst was een marketinglijst, geen kalender, en juist die twee stille dagen
  kwamen als kans naar boven.
- **Anomalie-bonus begrensd.** Bij een vlakke residu-verdeling valt `spread`
  terug op 1 en gaf een afwijking van 35 punten een bonus van 17,5 tegenover
  een vulbaarheidsterm van hooguit 1. Dit verandert de ranking in productie
  voor zaken met een bijna-vlakke verdeling.

---

## Twee incidenten, en wat eruit te leren valt

### De API lag een paar uur plat — door mij

`QuietFeedbackService` stond in `exports` van `BusynessModule` maar niet in
`providers`. Nest weigert dan de héle applicatie te laden, dus elk endpoint gaf
500. Het dashboard leek leeg: geen zaken, geen koppelingen, geen campagnes.

Het leek op dataverlies. Dat was het niet — alle data stond er nog.

**De les:** `tsc`, `eslint`, `jest` en `nest build` starten de DI-container geen
van alle op. Een module die zichzelf niet kan laden is voor alle vier
onzichtbaar. **Start de API echt op na elke module-wijziging** (`node dist/main.js`,
kijk of "successfully started" komt). Dat kost vijftien seconden.

### "Groen" is niet hetzelfde als "het werkt"

Na de deploy van de rate-limit kwamen zeven productie-verzoeken gewoon door. Dat
leek een bug, maar de teller in de database stond stil: de verzoeken bereikten de
nieuwe code helemaal niet, de deploy was nog bezig. Een 401 op een beveiligd
endpoint bewijst alleen dat er *iets* draait, niet dat het je nieuwe build is.

Meet aan de verandering die je hebt aangebracht, niet aan een signaal dat er
toevallig naast ligt.

### Ook goed om te weten

Bij het opruimen van een i18n-diff heb ik met `git checkout -- messages`
ongecommit werk van Floris vernietigd. Teruggehaald uit de stash-commit in de
reflog. **Dat werk staat al de hele week ongecommit in `messages/*.json` en
`landing-visuals.tsx`** — commit het of zet het op een branch.

---

## Waar het in de code zit

| | |
|---|---|
| `busyness/busyness.service.ts` | `getQuietMoments`, `getOccupancyReport`, `rollupMonthly` |
| `busyness/quiet-signals.ts` | de rekenregels, zonder IO |
| `busyness/quiet-feedback.service.ts` | de meting achteraf |
| `campaigns/campaign-report.service.ts` | `whatWorks` |
| `common/rate-limit.guard.ts` | de rem |
| `web/src/lib/quiet-reason.ts` | reden-sleutel → zin (één bron) |
| migraties | 0074, 0075, 0076 — alle drie gedraaid |

**Prototypes** (publiek bereikbaar, uit de zoekindex via `/proto-` in
`robots.ts`): `/proto-kansen` en `/proto-bezetting`. Beide met cijfers uit de
echte aggregatie, via `apps/api/scripts/gen-*-fixture.js`. Handig omdat het
dashboard achter login zit.

**Documentatie:** `docs/rustige-momenten-detectie.docx` is bijgewerkt met vier
nieuwe hoofdstukken (datum-signalen, beleidslaag, structureel vs incidenteel,
terugkoppeling). Let op: de layout is niet visueel gecontroleerd — LibreOffice
ontbrak op deze machine.

---

## Werkafspraken die in deze sessie golden

- Nederlands, uitleggend commentaar in de code (Floris leest mee om te leren).
- **Migraties worden handmatig gedraaid**: de volledige SQL inline in de chat
  plakken, niet alleen naar het bestand verwijzen.
- **Prototype-first** voor UI-wijzigingen: eerst laten zien op localhost, pas
  bouwen na akkoord.
- **`main` deployt automatisch naar productie.** Altijd op een feature-branch
  werken en pas mergen na expliciet akkoord — en bij een migratie pas nadat
  Floris zegt dat 'ie gedraaid is.
- Voor het mergen: `git status` controleren. Floris heeft ongecommit werk in de
  tree; dat moet apart blijven (stash → merge → pop).

---

## De volgende stap

`BACKLOG.md` opent met **"Vóór externe testers — de korte lijst"**. De twee die
Claude niet zelf kan:

1. **E-mailbevestiging aanzetten in Supabase** — het enige echt blokkerende punt
   voor mensen van buiten.
2. **De flow end-to-end doorlopen op een echt account** — het grootste gat in
   alles wat er deze week is gebouwd. Er is geen enkel scherm als ingelogde
   gebruiker gezien; alles is beredeneerd uit code, tests en prototypes. Met een
   testaccount is dit wél na te lopen.
