# Opdracht: haal het vaste patroon uit de rustige-momenten-detectie

> **📦 Gearchiveerd — Afgerond.** Uitgevoerd in de sessie van 15/16 september 2026 — met zeven correcties,
> waarvan twee het ontwerp veranderden. Wat het geworden is staat in
> `docs/CHANGELOG.md` en `docs/werking/rustige-momenten-detectie.docx`.


Je werkt in de repo `Get-Filly/Get-Filly` (monorepo: `apps/api` = NestJS,
`apps/web` = Next.js). Lees de genoemde code voordat je iets voorstelt. Alles
hieronder is in de code geverifieerd, niet uit het hoofd.

## Wat Get-Filly doet

Get-Filly detecteert wanneer een horecazaak rustig is en laat een AI-assistent
(Filly) daar marketingcampagnes voor maken. Dezelfde detectie voedt het
dashboard (staafgrafiek met sterretjes op kansdagen), de chat en de geleide
campagne-flow.

## Het probleem

De detectie merkt elke week dezelfde weekdagen aan als kans. In de
maand-weergave staan de sterretjes op maandag 14, dinsdag 15, maandag 21,
dinsdag 22, maandag 28 en dinsdag 29. Dat is geen datafout maar wiskundig
onvermijdelijk in het huidige model.

Waarom dat erg is, en niet alleen cosmetisch:

1. Het oogt als een opzoektabel, niet als een model. De eigenaar heeft het na
   twee weken door en stopt met kijken. Dat is het beeld van een zwak AI-model.
2. Het negeert dat er vorige week al een campagne voor dat moment is gemaakt.
3. Het mist juist de momenten waar een assistent waarde toevoegt: een vrijdag
   die uitzonderlijk stil wordt door weer, een vakantie of een evenement.
4. Elk week hetzelfde slot pushen heeft afnemend rendement, ook richting het
   publiek dat de uitingen ziet.

## Hoe het model nu werkt

`apps/api/src/busyness/busyness.service.ts`, methode `getQuietMoments`:

1. Bron is het Google-weekpatroon (`busyness_snapshots.pattern`, 7 x 24, het
   gemiddelde uit "populaire tijden"). Eén curve per weekdag, identiek voor
   elke maandag.
2. Dagdeel-rooster (`DAYPART_DEFS`: ochtend 6-11, lunch 11-14, middag 14-17,
   diner 17-21, avond 21-24), bijgesneden op open uren, `MIN_COVERAGE = 2`.
3. Median polish (Tukey) over het weekdag x dagdeel-raster geeft per cel een
   verwachting; afwijking = werkelijk - verwacht; normale schommeling via
   robuuste MAD (x 1,4826).
4. Poort: `gap = piek - dagdeelgemiddelde` moet boven `GAP_FLOOR = 15`.
   `EDGE_ACTIVITY_FRAC = 0.3` gooit het eerste/laatste open dagdeel eruit als
   het onder 30% van de eigen piek zit.
5. Score: `gap / piek + ANOMALY_WEIGHT (0.5) * max(0, -afwijking) / spreiding`.
6. Aaneengesloten rustige dagdelen worden samengevoegd tot één kans per dag.
7. Sorteren op score, daarna cappen op `businesses.quiet_moments_per_week`
   (default 2).

## Waarom dat per definitie een vast patroon geeft

Beide termen in de score komen uit het weekpatroon, en dat patroon is per
weekdag constant. **De score van "maandag lunch" is dus een constante.** Hij
verandert pas als Google zijn patroon verschuift, en dat gaat traag.

Sorteren op een vaste lijst met een cap van 2 geeft onvermijdelijk elke week
dezelfde top 2. De tempo-instelling van de eigenaar (1 tot 6 per week) bepaalt
alleen hoevéél van diezelfde lijst je ziet, niet welke.

Even scherp: er bestaat vandaag **geen enkele incidentele kans**. Elk signaal
dat het model gebruikt is weekdag-constant, dus het model kán niet zien dat
juist aanstaande vrijdag afwijkt.

## Valkuil: het anker verschuiven lost dit NIET op

In de projectaantekeningen staat als vervolgstap: verschuif de verwachting van
het Google-gemiddelde naar de eigen mediaan per weekdag en uur zodra er genoeg
live-metingen in `busyness_snapshots.live_pct` staan. Goede stap, maar niet
voor dit probleem.

Voor een dag die nog moet komen is er geen meting. Je ruilt dan één constante
per weekdag (Google-gemiddelde) in voor een andere constante per weekdag (eigen
mediaan). Vooruitkijkend blijft het een vaste lijst. De ankerverschuiving
verbetert de terugblik ("hoe liep het echt?"), niet de vooruitblik ("welke dag
volgende week?").

Neem dit expliciet mee: wie dit over het hoofd ziet bouwt maandenlang aan de
verkeerde oplossing.

## Het goede nieuws: de datum-specifieke bronnen liggen er al

Dit is het belangrijkste deel van deze opdracht. Alle drie de signalen die per
kalenderdatum verschillen bestaan al in deze repo, zijn al gemodelleerd, en
worden al gebruikt — alleen niet door de detectie. `busyness.service.ts`
importeert uitsluitend Supabase en de Apify-client.

**Evenementen** — `apps/api/src/events/`
- `events-sync.service.ts`: wekelijkse sync van de 6 sitemap-XML's van
  evenementen.nl (festivals, concerten/theater, events, sportevenementen,
  kermis, markten). Geen detailpagina-scraping; de slugs bevatten naam, plaats
  en datum. Plaatsnamen worden via PDOK gegeocodeerd met een permanente cache
  (`event_places`) en een incrementeel budget per run. Horizon 120 dagen.
- `events.service.ts`: `findNearby(businessId)` geeft events binnen een
  afstandsstaffel per categorie (kermis/markten 2 km, concerten/sport/events
  5 km, festivals 10 km), venster 21 dagen, maximaal 8 in het promptblok, en
  respecteert de eigenaar-voorkeuren `businesses.event_categories` en
  `event_max_distance_km` (migratie 0054). Fail-soft.
- Wordt nu gebruikt door `suggestions.service.ts` en `campaigns.service.ts`.

**Weer** — `apps/api/src/weather/weather.service.ts`
- Open-Meteo-verwachting, `forecast_days=7`, per dag min/max temperatuur plus
  een weercode die naar een omschrijving wordt vertaald (`ForecastDay`).
- Wordt nu gebruikt door `business-context.service.ts` (chat-prompt) en
  `suggestions.service.ts`.
- **Let op de horizon**: 7 dagen vooruit, terwijl de kansen-detectie 21 dagen
  vooruit kijkt. Weer kan dus alleen de eerste week verfijnen. Verwacht daar
  geen wonderen op dag 18.

**Feestdagen** — `apps/api/src/ai/timing-factors.ts`
- Volledige NL-feestdagenset, deterministisch berekend (Meeus voor Pasen en
  alles wat daaraan hangt). Per feestdag: omzet-impact, `promoLeadDays`, en een
  `avoid`-vlag voor dagen waarop je juist níét moet promoten.
- Wordt nu alleen gebruikt voor campagne-timing.

Gevolg van die scheiding, en dit is een concrete inconsistentie die je kunt
aanhalen: Filly kan in de chat over een festival om de hoek praten, terwijl de
detectie die de dag koos niets van dat festival weet. En een feestdag op maandag
wordt gewoon als rustige maandag aangemerkt.

## Voorstel in vier fasen

### Fase 1 — Beleidslaag (geen nieuwe bron nodig)

Stop met puur de hoogste score pakken. Toe te voegen in `getQuietMoments` na
het sorteren:

- **Uitsluiting**: datums waarvoor al een concept of campagne bestaat vallen
  af. Die data staat er al (`campaigns` per datum).
- **Cool-down**: een weekdag x dagdeel-combinatie die in de afgelopen K weken
  (begin met 3) gekozen is, krijgt een dempingsfactor op de score. Dempen, niet
  hard uitsluiten, anders bouw je gewoon een ander vast patroon.
- **Spreiding**: bij meer dan één kans per week, forceer verschillende
  weekdagen of verschillende dagdelen.

Effect: de lijst gaat rouleren zonder dat er één bron bij hoeft.

### Fase 2 — De bestaande signalen aansluiten op de detectie

Dit is waar de echte variatie vandaan komt, en het is vooral bedrading.

1. **Feestdagen als poort.** Een feestdag (zeker met `avoid`) is geen rustig
   moment om te vullen. Eerst dit: het is de goedkoopste en voorkomt de meest
   gênante voorstellen.
2. **Evenementen als verschuiving.** Een groot event binnen de staffel-radius
   op die datum verlaagt de kans dat de zaak stil is, of verandert juist de
   hoek ("iedereen is bij het festival, doe iets voor wie thuisblijft"). Begin
   met een dempingsfactor op de score, niet met een harde poort.
3. **Weer als verfijning voor de eerste week.** Terrasweer, regen en
   temperatuur verschuiven de verwachting per datum. Alleen dag 0 tot 7.

Vanaf hier verschilt de score per kalenderdatum en niet meer alleen per weekdag.
Dát is de echte oplossing voor het vaste patroon.

### Fase 3 — Scheid "structureel" van "deze week"

Pas nu betekenisvol, want pas nu bestaat er zoiets als een incidentele kans.

Het model gooit twee verschillende dingen op één hoop:

- **Structureel laag**: maandaglunch is bij deze zaak altijd het stilste
  moment. Dat is een strategisch gegeven. Eén keer zeggen, en aanpakken met een
  meerwekenplan. Geen wekelijks nieuwsbericht.
- **Deze week afwijkend**: aanstaande vrijdag wordt uitzonderlijk stil door
  weer, vakantie of een event elders. Tactisch, met houdbaarheidsdatum, en dát
  hoort in de wekelijkse melding.

Laat `getQuietMoments` beide teruggeven met een expliciet type, bijvoorbeeld
`kind: 'structureel' | 'incidenteel'`, en laat dashboard en chat ze anders
behandelen.

### Fase 4 — Terugkoppeling

Meet het effect van een campagne op het moment waarvoor hij bedoeld was; de
definitie bestaat al in het project (campagnedag versus de mediaan van andere
gelijke weekdagen). Slots waar campagnes structureel niets doen, demp je.
Slots die reageren, beloon je. Dit is meteen de reden dat fase 1 al een
cool-down moet hebben: je hebt variatie nodig om te kunnen meten wat werkt.

## Wat je NIET moet doen

**Geen willekeur.** De verleiding is de lijst te schudden voor de variatie. Dat
is even zwak als een vaste lijst en bovendien niet uit te leggen. Elke afwijking
van de hoogste score moet een reden hebben die je kunt opschrijven: al gedaan,
recent gedaan, feestdag, event, of weer.

**Niet eerst het anker verschuiven.** Zie de valkuil hierboven.

**Geen nieuwe evenementen- of weerbron bouwen.** Die bestaan, inclusief
geocoding, caching, eigenaar-voorkeuren en fail-soft-gedrag. Sluit aan.

## Acceptatiecriteria

- Over een venster van acht weken bestaat niet meer dan de helft van de
  voorgestelde kansen uit dezelfde weekdag x dagdeel-combinatie.
- Een datum waarvoor al een concept of campagne bestaat, verschijnt niet
  opnieuw als kans.
- Een feestdag verschijnt niet als kans.
- Elke kans kan in één zin uitleggen waaróm juist die dag, en die zin verschilt
  tussen een structureel en een incidenteel geval.
- De detectie blijft fail-soft: valt de weer- of eventbron weg, dan draait het
  model door op het patroon, precies zoals nu.
- De bestaande tests in `apps/api/src/busyness/busyness.service.spec.ts` blijven
  groen, of worden bewust en beargumenteerd aangepast.

## Wat ik van je wil

1. Lees `getQuietMoments` in `apps/api/src/busyness/busyness.service.ts`, plus
   `events.service.ts`, `weather.service.ts` en `timing-factors.ts`, en
   controleer of deze analyse klopt. Zeg het als er iets niet klopt.
2. Kom met een concreet implementatieplan voor fase 1 en 2 samen: welke
   functies, welke datastructuren, of er een migratie nodig is, hoe je de
   detectie fail-soft houdt als een bron wegvalt, en wat er in het dashboard en
   de chat mee moet.
3. Geef bij de cool-down aan welke dempingsformule je kiest en waarom, en wat
   er gebeurt als álle kandidaten gedempt zijn.
4. Geef aan hoe je fase 2 test zonder op productiedata te wachten.
5. Bouw pas na akkoord, en op een feature-branch. Main deployt automatisch naar
   productie.
