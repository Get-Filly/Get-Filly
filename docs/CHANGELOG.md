# Get-Filly — Changelog

Wat er wanneer gebouwd is, nieuwste boven. Dit is **historie, geen werklijst** —
de openstaande punten uit deze verslagen staan in [`BACKLOG.md`](../BACKLOG.md).
Een `[ ]` hieronder betekent dus: *dat stond op dat moment nog open*, niet dat
het hier bijgehouden wordt.

---

## 🗓️ 2026-09-16 — Rem per IP op de endpoints die geld kosten (mig 0076)

**Wat er mis was.** `/public/contact` had alleen een honeypot en stuurt per
aanroep een mail (Resend kost geld). De pre-onboarding AI-limiet was een `Map`
in het geheugen — de code zei zelf al dat dat "niet multi-instance correct" is,
en op Vercel is elke request een mogelijk verse functie-instantie, dus die Map
telde in de praktijk bijna niets.

**Wat het nu is.** `check_rate_limit()` (mig 0076) telt in de database, net als
`AiRateLimitGuard` al deed. Eén atomaire statement, dus twee gelijktijdige
requests kunnen de limiet niet samen omzeilen. `RateLimitGuard` + `@RateLimit()`
hangt 'm op een endpoint:
- contactformulier: 5 per kwartier per IP
- onboarding-AI (4 endpoints): 5 per 10 minuten per user

**Keuzes die erin zitten:**
- **Vaste vensters**, geen glijdend. Rond een vensterovergang is tot 2× de
  limiet mogelijk. Voor een rem tegen kostenmisbruik ruim voldoende.
- **Fail-open** bij een fout in de teller. Bewust de andere kant op dan de
  Resend-webhook (die is fail-closed): daar gaat het om authenticiteit, hier om
  kosten, en een klant die geen contact kan opnemen is erger dan een uur zonder
  rem. De fout wordt luid gelogd.
- **Het IP wordt gehasht** opgeslagen, met salt. Een IP is een persoonsgegeven
  en voor een teller is de hash genoeg; een kale sha256 over de IPv4-ruimte is
  triviaal terug te rekenen, vandaar de salt (`RATE_LIMIT_SALT`, valt terug op
  `CRON_SECRET`).

- [ ] **Dit is geen bescherming tegen een gedistribueerde aanval.** Een botnet
      met duizend IP's loopt er gewoon omheen. Daarvoor is een WAF nodig
      (Vercel Firewall staat al als los punt in de backlog). Dit vangt het
      meest voorkomende geval af: één bron die doorramt.
- [ ] Optioneel `RATE_LIMIT_SALT` in de API-env zetten. Zonder die var valt
      'ie terug op `CRON_SECRET`, wat prima werkt; zonder allebei logt de guard
      een waarschuwing en zijn de hashes terug te rekenen.

---


## 🗓️ 2026-09-16 — Bezettingsrapportage op echte data + maandoverzicht

**Wat er weg is.** De bezettingspagina toonde drie dingen die module-constanten
in de frontend waren, geen demo-fallback: `generateMockHourly()` (uur-heatmap
uit een vaste basislijn + ruis), `yoy = { occ: 7, guests: 12, revenue: 9 }` en
een hardgecodeerde retentie-cohort met vaste maandnamen. Die werden aan élke
klant getoond. Weg.

**Wat ervoor in de plaats komt.** `GET /busyness/me/occupancy-report`:
- **Bezetting per uur**, echt: per (datum, uur) de mediaan van de metingen,
  daarna de mediaan over de dagen. Cellen onder 3 gemeten dagen blijven leeg
  (gestreept) — dat vakje is zelf informatie.
- **Waar blijf je achter bij je eigen patroon**: Google-patroon naast de eigen
  metingen, per weekdag×dagdeel. Staat nergens anders in de app. Alleen
  afwijkingen ≥ 3 punten; anders verdrinken de momenten die ertoe doen.

Het subtiele stuk: de verwachting wordt gerekend over **precies de uren die ook
gemeten zijn**, en uren waar het patroon 0 is (dicht) tellen niet mee. Anders is
het "verschil" een rekenfout. 9 tests in `occupancy-report.spec.ts`.

**Tabs.** De pagina hing aan één secundaire knop en stond nergens in de zijbalk.
Nu twee tabs bovenaan Rapportages: Resultaat / Bezetting.

**Maandoverzicht (mig 0075, `busyness_monthly`).** `busyness_snapshots` wordt na
120 dagen geprund, dus "vs vorig jaar" is per definitie onbeantwoordbaar — dat
was de reden dat die percentages hardgecodeerd stonden. Er wordt nu per zaak,
maand, weekdag en uur een overzicht weggeschreven **vóór** de prune, met de
gemeten drukte, het aantal dagen waarop die rust, én de verwachting van dát
moment (het Google-patroon verschuift).

- Draait mee in `refreshAll()`, vóór `pruneOldSnapshots()`. **Gaat de rollup
  mis, dan wordt de prune overgeslagen**: ruwe data die we nog hebben is beter
  dan een gat in de historie. De volgende run pakt het hele venster en haalt de
  overgeslagen maand vanzelf in.
- Handmatig vangnet: `GET /api/busyness/cron/rollup`.
- Omvang: ~60-80 rijen per zaak per maand (alleen open uren), dus een paar
  honderd per jaar.

- [ ] **Over twaalf maanden**: de vergelijking met vorig jaar daadwerkelijk
      bouwen op `busyness_monthly`. Tot die tijd staat er niets over vorig jaar
      op de pagina, en dat is correct.
- [ ] **Controleren dat er echt iets in `busyness_monthly` landt** zodra 0075
      gedraaid is. Ik kan dat niet zien zonder productie-toegang; één keer
      `/api/busyness/cron/rollup` aanroepen en de tabel bekijken volstaat.

---


## 🗓️ 2026-09-15 — Rustige momenten: variatie per datum (branch `feat/rustige-momenten-variatie`)

**Het probleem.** `getQuietMoments` rekende alleen op het Google-weekpatroon, en
dat is per weekdag constant. `gap` en `afwijking` kwamen er allebei uit, dus de
score van "maandag lunch" was een constante. Sorteren met een cap van 2 gaf
onvermijdelijk elke week dezelfde twee weekdagen (ma 14, di 15, ma 21, di 22, …).
Er bestond geen enkel signaal waarmee het model kon zien dat júist aanstaande
vrijdag afwijkt.

**Let op de valkuil.** Het anker verschuiven van het Google-gemiddelde naar de
eigen mediaan-per-weekdag (staat verderop in deze backlog) lost dit NIET op: je
ruilt één weekdag-constante voor een andere. Dat verbetert de terugblik, niet de
vooruitblik.

**Wat er gebouwd is (fase 1 + 2 samen, één PR).**

- **Datum-signalen** (`busyness/quiet-signals.ts`, puur en los te testen): weer
  (Open-Meteo, 7 dagen) en evenementen (evenementen.nl via `events`) leveren een
  drukte-factor per kalenderdatum. Die werkt op de **verwachte drukte, vóór de
  gap-poort**, niet op de eindscore. Op de score kan een signaal alleen
  herschikken; op de verwachting kan een vrijdag met te weinig gat alsnog over
  `GAP_FLOOR` komen als er storm staat. Dát is het verschil tussen een andere
  volgorde van dezelfde lijst en een echte incidentele kans.
- **Feestdag = harde poort.** Bewust niet gekoppeld aan `event_holidays_enabled`
  (mig 0055): die voorkeur gaat over feestdag-promoties.
- **Uitsluiting** van dagen met een lopende campagne of een openstaand voorstel,
  **vóór** de week-cap. Dat was de echte bug: de frontend filterde ze erná, dus
  een afgedekte dag vrat een weekplek op en maakte de lijst korter i.p.v. anders.
- **Cool-down** op weekdag×dagdeel: ×0,40 deze week, ×0,70 vorige week, bodem
  0,25. Multiplicatief want de score-schaal verschilt per zaak. Dempend, nooit
  uitsluitend. Werkt ook **vooruit** binnen het venster — zonder dat deel
  verandert een stateless GET over een rollend venster nog steeds niets.
- **`kind: structureel | incidenteel`** + een `reasonKey`/`reasonParams` per kans,
  en `notes` voor dagen die op een harde poort afvielen. Zichtbaar op de kaart en
  in Filly's chat-context. Key i.p.v. zin, want de app is NL/EN.
- **`applyPolicy: false`** voor de drie aanroepers die een door de eigenaar zélf
  gekozen dag bevragen (geleide flow); daar mag de beleidslaag niet filteren.

**Meegenomen modelfix.** De anomalie-bonus was onbegrensd: bij een vlakke
residu-verdeling valt `spread` terug op 1 en levert een afwijking van 35 punten
een bonus van 17,5 tegenover een vulbaarheidsterm van hooguit 1. De vulbaarheid,
de bedoelde hoofdmaat, verdween daarmee in de ruis en élke factor op de score was
betekenisloos. Nu begrensd op `ANOMALY_WEIGHT`, met `ABS_DEV_FLOOR` als
ondergrens voor de schaal. **Dit verandert de ranking in productie** voor zaken
met een bijna-vlakke residu-verdeling.

**Architectuur-detail dat bijna misging.** `WeatherService` injecteert
`RequestSupabaseService` en is dus `Scope.REQUEST`. Hem in `BusynessService`
injecteren maakt die ook request-scoped en breekt de cron-controllers. De pure
HTTP-call staat daarom nu in `OpenMeteoClient` (singleton, TTL-cache 30 min);
`WeatherService` delegeert ernaar.

**Geen migratie.** Alles leest bestaande tabellen (`campaigns`, `ai_suggestions`,
`events`, `businesses`) of rekent in code.

**Gemeten effect** (realistisch synthetisch patroon, 8 weken, tempo 2): van 2
weekdag×dagdeel-combinaties (8× di-middag, 8× vr-lunch) naar 4 (5/4/4/3), grootste
aandeel 31%. Acceptatie-eis was ≤ 50%.

**Nog open:**
- [ ] Visuele check op het ingelogde dashboard (sterretjes, reden-regel, de
      "alles al afgedekt"-tekst). Niet gedaan: vraagt een echte login.
- [x] **Fase 3 af** — een incidentele kans krijgt op de kaart een eigen
      markering (ring om de ster, koper; vorm én kleur, dus ook zonder
      kleurwaarneming leesbaar) en de legenda noemt "vaste kans" en "kans deze
      week" apart. In de chat gaan de momenten als twee blokken de prompt in:
      het incidentele blok is het nieuws om mee te beginnen, bij het
      structurele blok staat dat het elke week zo is en hooguit één keer
      benoemd hoeft te worden.
- [x] **Fase 4 gebouwd** (mig 0074 `campaign_quiet_effect`). De aanname in de
      briefing dat de definitie al bestond klopte niet: `classify_campaign_
      performance()` (mig 0071) scoort kanaal-metrics, geen drukte-lift. Dit is
      dus nieuwe meetcode. Definitie: `actual` = gemeten drukte in het
      doel-dagdeel op de doeldatum (per uur de mediaan van `live_pct`, dan het
      gemiddelde over de uren), `baseline` = mediaan over vergelijkbare dagen
      (zelfde weekdag + dagdeel, geen campagne), `lift` = het verschil in
      drukte-punten. Per campagne vastgelegd omdat `busyness_snapshots` na 120
      dagen geprund wordt. Cron `/api/busyness/cron/measure`, dagelijks 03:30.
      De weging meet **relatief** tegen de eigen mediaan van de zaak: een slot
      dat niets doet terwijl andere slots wél werken zakt, maar als er nergens
      iets beweegt zakt er niets (dan ligt het niet aan het slot).
  - [ ] **Dit doet voorlopig bijna niets, en dat hoort.** Onder 3 metingen per
        slot weegt er niets mee, en daarboven krimpt de uitslag met n/(n+4).
        Bij 4 metingen per slot is het verschil tussen een bewezen en een
        do-niets-slot ~8% op de score (gemeten op een synthetische reeks van
        12 weken). Het begint pas te sturen na een stuk of tien campagnes per
        slot, dus na maanden. De loop moet nu gaan verzamelen om later iets
        waard te zijn.
  - [ ] **Geen controlegroep.** Weer, evenementen en feestdagen op de doeldatum
        tellen mee in de "lift". Daarom mediaan over meerdere campagnes en een
        kleine begrenzing (±25%, tegenover −60% voor de cool-down). Wie dit
        ooit serieus wil: de datum-factor die de detectie al berekent zou bij
        de meting opgeslagen kunnen worden om voor te corrigeren.
  - [ ] **Campagnes zonder `ai_suggestion_id` worden niet gemeten.** Het
        doelmoment staat in `ai_suggestions.trigger_context`;
        `campaigns.scheduled_for` is het verzendmoment en daar is geen dagdeel
        uit af te leiden. Als er veel campagnes buiten de voorstel-flow om
        ontstaan, is een eigen doel-kolom op `campaigns` de volgende stap.
  - [ ] **Nog niet zichtbaar voor de eigenaar.** De metingen staan in de tabel
        en sturen de ranking, maar er is geen rapportage-weergave. Bewust niet
        als reden op de kaart gezet ("dit moment werkte eerder") — dat is een
        te stellige claim op drie ruizige metingen. Een rapportage-blok dat de
        lift per slot toont met het aantal metingen erbij is eerlijker.
- [ ] Bron-beperkingen om rekening mee te houden: `events` heeft geen omvang en
      geen einddatum, dus een meerdaags festival matcht alleen z'n startdag en
      "groot" is alleen te benaderen via categorie × afstand. Weer reikt 7 dagen,
      de detectie kijkt 21 dagen vooruit.
- [ ] Observatie, niet gefixt: op realistische patronen komt bijna elk moment als
      `unusual` uit de MAD-drempel, dus de chat zegt bijna altijd "ongewoon
      rustig". Drempel `UNUSUAL_SPREAD_MULT` een keer tegen echte data ijken.

**Prototype om het te bekijken zonder login:** `/proto-kansen` rendert de échte
BusynessCard met een gestubde netwerk-laag; `?oud=1` zet de beleidslaag uit.
De kansen in `fixture.json` komen uit de echte service
(`apps/api/scripts/gen-quiet-fixture.js` — opnieuw draaien na `nest build` als
de detectie wijzigt). Maandweergave op het bistro-testpatroon:
oud = di 15, vr 18, di 22, vr 25, di 29; nieuw = di 15, do 17 (regen), vr 25,
za 26, di 29 (22 sep viel af, al afgedekt).

**Meegenomen i18n-fix (2026-09-15).** `daypartLabel` is een in de backend
gebouwde Nederlandse zin en stond zo in de Engelse UI ("Tuesday middag en diner
is your biggest opportunity"). `QuietMoment` stuurt nu ook de kale sleutels mee
(`dayparts`); `apps/web/src/lib/dayparts.ts` maakt daar een zin van. Het label
blijft voor de prompts + trigger_context, waar NL juist klopt. Regel voor later:
**geen samengestelde zinnen uit de backend naar de UI** — sleutel + params, de
frontend maakt de zin. De geleide flow matchte hier trouwens op met
`daypartLabel.includes(dp.label)`; dat is nu een vergelijking op sleutels.

---


## 🗓️ 2026-09-09 — Backend naar sociale media: analyse + stappenplan (P0/P1)

Grondige backend-analyse na de site-omzetting. Het kanaal-model zit in drie
lagen die niet gelijk zijn: `campaigns.type` (check-constraint
`mail|social|whatsapp`), `campaign_social_content.platforms[]` (vrij tekstveld,
géén constraint — hier zit het echte kanaal) en `FillyChannel` (8 waarden) in
het brein. Google Business rijdt mee als `type='social'` +
`platforms=['google_business']`. Een platform toevoegen vraagt dus GEEN
migratie op die tabel.

**Het social-publiceerpad zelf is in orde** en hoeft niet om:
`publishSocialCampaign` routeert al naar Meta (FB+IG), TikTok (Direct Post via
`/media/c/:id`) en GBP, is idempotent op `published_at`, de cron pakt
ingeplande social-campagnes op, en terugtrekken werkt. Bundels, per-kanaal-
concepten, media, varianten en de anti-repetitie-fingerprint zijn kanaal-
agnostisch. Het is bijstellen, niet herbouwen.

### Stappen (in deze volgorde)

- [x] **1. WhatsApp onzichtbaar + de twee prompt-blokken repareren** (P0, geen
  migratie) — AF 2026-09-09. Drie dingen die nu actief tegen de positionering in werken:
  (a) de generatie-prompt stuurt Filly hardcoded naar WhatsApp voor precies de
  kern-usecase — `* vaste-gast/VIP-segment + acute dag (<5 dagen) → whatsapp`
  op `suggestions.service.ts:1227` en `:1789` — terwijl WhatsApp GEEN
  verzendpad heeft (alleen een content-tabel; de verzend-modal zegt "alleen
  mail"); (b) diezelfde twee prompts geven
  `buildAllChannelsBlock(['mail','instagram_feed','whatsapp','tiktok'])`: géén
  Facebook en géén GBP, terwijl de kanaalkeuze die wél aanbiedt, dus schrijft
  Filly FB-copy zonder FB-regels; (c) WhatsApp staat in
  `ALLOWED_ACTION_CHANNELS`, in de chat-system-prompt en in de kanaalkeuze.
  WhatsApp NIET slopen (legitiem toekomstig retentie-kanaal, zie memory
  "ongebruikte code kan toekomstig zijn") — alleen niet meer aanbieden of
  genereren. Parsen/renderen van bestaande opgeslagen kaarten blijft werken.
- [ ] **2. Kanaal-lijsten samentrekken naar één bron** (P1). Nu op 7 plekken
  los: `FillyChannel` (filly-brain.config:52), `ALLOWED_ACTION_CHANNELS`
  (chat.service:1533), de toegestane waarden in de chat-system-prompt
  (chat.service:1459), `ReachChannel` (channel-reach.service:29), `REACH_LABEL`
  (suggestions.service:1450), `CHANNEL_LABEL` + platform→type-mapping
  (campaigns.service:1163) en `ChannelChoice` (filly-chat-choice-card.tsx:38).
  Neem hierin mee: het legacy single-type tool-schema
  (`campaign_type: enum ['social','mail']`, suggestions.service:285) kan
  `google_business` niet aanbieden zolang `campaigns.type` de check-constraint
  `mail|social|whatsapp` heeft — GBP loopt daar nu om heen via het
  platform-pad (`type='social'` + `platforms=['google_business']`). Of de
  constraint verruimen, of dat schema helemaal naar het platform-pad trekken.
- [x] **3. Succes-score per kanaal i.p.v. mail-only** (P0 voor de leerloop) —
  AF 2026-09-09, migraties **0071 + 0072 gedraaid**.
  - 0071: vier kolommen (`spend_cents`, `link_clicks`, `paid`, `score_basis`),
    `classify_campaign_performance()` naar drie paden (rate per kanaal-familie /
    conversion_only op de eigen mediaan / no_data), views
    `campaign_channel_map` + `campaign_performance_report`.
  - 0072: **bugfix op 0071.** De FOR-loop joinde campaigns met een INNER JOIN
    plus `deleted_at is null`; rijen van soft-deleted campagnes vielen daardoor
    buiten de loop en hielden `classification = null`, waardoor ze eeuwig in de
    wachtrij bleven (32 rijen wachtend, 0 verwerkt). Nu LEFT JOIN + expliciet
    `no_data` voor die rijen.
  - API: `CampaignReportService` + `GET /campaigns/report?days=&kind=&channels=`
    levert één payload voor de hele pagina. Route staat vóór `@Get(':id')`.
  - Pagina: `/dashboard/rapportages` herbouwd (was de hub met mail als kopstuk
    en "Binnenkort"-tegels). Filters op periode/soort/kanaal, NL + EN.
    `/rapportages/bezetting` blijft ongewijzigd.
  - Verificatie tegen productie: de select + filters van de service geven 200
    met 29 rijen over 90 dagen (google_business 3, facebook 13, instagram 13);
    `paid=eq.true` geeft 0, want er is nog geen advertentiebudget.
  - **Let op:** de functie pakt alleen rijen met `classification is null`. Na
    0072 moet `select * from public.classify_campaign_performance();` één keer
    lopen (of de nachtelijke pg_cron van 03:17 UTC afwachten) voordat er scores
    in de UI staan. Bestaande `no_data`-rijen worden niet herbeoordeeld zonder
    reset-update.
  - Prototype met mockdata blijft staan in `get-filly-proto/rapportages-v2.html`.
  De nachtelijke classificatie is 100% mail: geen `mail_delivered` →
  `classification='no_data'`, `success_score=null`. Zowel in SQL
  (`0047_campaign_performance_classification.sql:76`) als in TS
  (`campaign-performance.service.ts:250`); de score is open-rate + click-rate +
  reserverings-rate. Zonder mail krijgt élke campagne `no_data` en leert Filly
  niets meer — en "boekingen per uiting" op de site blijft leeg. Minimale
  variant zonder nieuwe scopes: score op `reservations_attributed` per uiting.
  Volledige variant vraagt Insights fase 2. `social_reach`,
  `social_engagement`, `social_video_views` en `social_watch_time_seconds`
  staan al in `campaign_performance`.
- [ ] **4. Kanaalkeuze + voorselectie social-first** (P1). Nu vinkt de geleide
  flow bij "nergens bereik" **mail + Instagram** voor
  (`suggestions.service.ts:1466`). Moet worden: de gekoppelde kanalen, en
  zonder koppeling Instagram + Facebook met een nudge "koppel eerst je
  accounts" i.p.v. stil terugvallen op mail. `ChannelReach` meet voor social
  alleen koppelstatus, geen volgers — volger-aantallen vragen Insights fase 2.
- [ ] **5. Organisch vs. betaald in de flow** (P1). Extra stap met per kanaal
  een toggle + budgetveld dat naar `campaigns.budget_cents` schrijft (die kolom
  bestaat al met comment "v2: voor betaalde ads" en wordt nu 0× gebruikt).
  Vóór `ads_management` als "voorbereid, jij zet 'm live in Ads Manager"; dan
  is de flow al af zodra de scope er is. Voor "kosten per boeking" is nodig:
  budget + spend + reach per uiting (attributie bestaat al).
- [ ] **6. YouTube als platform** (P2). Ontbreekt volledig in de backend: geen
  provider-module (naast `meta/` en `tiktok/`), geen OAuth, geen publish-tak in
  `publishSocialCampaign`, geen `CHANNEL_RULES`-entry (dus geen lengte-band in
  de copy-guard), en `createConceptForPlatform` gooit `'Ongeldig kanaal.'`.
  Eén echte migratie nodig: `campaign_style_fingerprints.channel` heeft een
  check-constraint zonder youtube (`0048:30`), dus anti-repetitie faalt
  fail-soft voor YouTube.
- [ ] **7. Dode code opruimen** (P3). Nul verwijzingen buiten hun eigen
  definitie, geen feature eraan: tabel `campaign_templates`, en in
  `filly-brain.config.ts` de constanten `CHANNEL_MIX_PER_THEME` (schrijft nota
  bene `whatsapp` voor bij `rustige_dag_actie`), `FUNNEL_STAGE_TO_CHANNELS`,
  `RETENTION_ACQUISITION_BALANCE`, `PERSUASION_EXAMPLES`, `DEFAULT_RATE_LIMITS`
  plus de functies `classifyLeadTime`, `planChannelPlacement` en
  `suggestChannelMix`. **Laten staan** (scaffolding of superseded, niet dood):
  `campaigns.budget_cents` (nodig in stap 5), `ab_variant`, `unsubscribe_token`,
  `campaign_recipients` (superseded door `campaign_sends`),
  `campaign_benchmarks` (leeg, `MailStats.benchmark` is hardcoded), `segments` /
  `target_segment_id` (nooit gevuld, segmentatie staat wel op de site).
- [ ] **8. Marketing-hub-statussen omdraaien** (P2). Mail staat op `"live"`,
  Instagram/Facebook/TikTok op `"coming-soon"` en WhatsApp op `"future"`
  (`dashboard/marketing/page.tsx:70`) — omgekeerd t.o.v. de site, terwijl social
  publiceren écht werkt.

Let op: `MailService` blijft nodig ook als campagne-mail verdwijnt — contact-
formulier, feedback-tool, SEO-rapport en team-invites lopen erlangs. Alleen
`sendCampaign`/`sendCampaignByMode`, de recipients-preview, unsubscribe, de
Resend-webhook-stats en het mail-domein zijn campagne-specifiek.


## 🗓️ 2026-09-09 — Site praat sociale media, product nog niet (P2, open)

De publieke site is live omgezet van "campagnes via e-mail en WhatsApp" naar
**uitingen op sociale media** (organisch én betaald), met Instagram, Facebook,
TikTok en YouTube als kanalen. Commit `04f1091` op main. Daarmee belooft de
site nu drie dingen die de app nog niet kan, plus één losse asset:

- [ ] **Dashboard meetrekken naar sociale media** (P2). De app-kant praat nog
  over mail en WhatsApp en loopt dus uit de pas met de site. Raakt in elk geval:
  `dash_marketing_mail_page`, de campagne-voorstellen in de Filly-chat
  (`dash__components_filly_chat_proposal_card`: `typeMail`/`typeWhatsapp`),
  de kanaal-labels op de koppelingen-pagina en de "alleen mail-campagnes kunnen
  via deze flow"-melding in de verzend-modal.
- [ ] **YouTube-koppeling aanvragen en bouwen** (P2). Er is nu alleen een
  Meta- (FB/IG) en TikTok-integratie. YouTube vraagt een eigen Google-OAuth-
  koppeling (YouTube Data API, upload-scope) plus API-review. Het merk-logo
  staat al in `brand-logos.tsx` en YouTube staat al op de site.
- [ ] **Betaalde advertenties: `ads_management` aanvragen** (P2). De Meta- en
  TikTok-koppelingen publiceren alleen organisch; er is geen advertentie-
  account, budget of targeting in de code. De site noemt betaald bereik wel
  ("Betaald bereik op de dagen die gevuld moeten worden", Ultimate-pakket,
  FAQ over advertentiebudget). Vergt nieuwe app-review bij beide platforms.
- [ ] **Eigen beeld voor de YouTube-kaart** (P3). `public/visuals/youtube.jpg`
  is nu een kopie van `facebook.jpg`, dus in de social-waaier op de home staat
  dezelfde foto twee keer. Geen webfoto's gebruiken (licentie), Floris levert aan.

Let bij werk aan de home op: **de drie feature-rijen moeten exact even hoog
blijven** (nu alle drie 600px, de `min-height` van `.feature-row`); houd elke
pijler-visual onder ~488px. Zie memory `getfilly-site-sociale-media-uitingen`.


## 🗓️ 2026-08-07 — Site-herpositionering: asset-ronde (P3, open)

De publieke site is tekstueel herpositioneerd van "AI-marketing voor horeca"
naar **AI-capaciteitoptimalisator voor lokale ondernemers** (multi-branche,
NL + EN, live op main). De copy is neutraal/multi-branche; de **visual-mockups
met vaste beelden zijn nog horeca** en moeten mee. Vergt nieuw beeldmateriaal
(andere-branche-foto's + evt. andere logo's).

- [ ] Home feature-visual-kaarten (`components/landing-visuals.tsx`):
  zoekmachine/AI/review (ingebakken ChatGPT/Tripadvisor-logo's) + de 4
  social-foto's (`public/visuals/{facebook,tiktok,instagram,youtube}.jpg`) + de
  thumbnail op de Bereikbaarheid-kaart. De mail/WhatsApp-visual bestaat niet
  meer (2026-09-09).
- [ ] Product-visual-mock (nog horeca: bezetting / 3-gangen / terras).
- [ ] Over-ons-foto's (leeg → vol restaurant) + hun alt-teksten (`about.alt1/2/3`).

Het home-hoofddashboard-mockup is al omgezet naar een kapper-case; de rest
hierboven kan pas met beeld. Zie memory `getfilly-site-herpositionering`.


## 🗓️ 2026-08-06/07 — Grote sessie: multi-branche, rename, site, feedback (alles live op main)

Samenvatting van wat deze sessie live ging (migraties 0066 t/m 0070 gedraaid):

- [x] **Multi-branche (Deel 1)** — `businesses.industry` (mig 0066) + code-registry
  `apps/api/src/ai/industry/`; Filly's brein leest per branche een pack
  (lexicon/framing/channelFlavor). Horeca byte-identiek. Onboarding branche-keuze.
  Analytics-dimensie `industry` op performance-tabellen (mig 0067, trigger).
- [x] **Rename → business (Deel 2)** — `restaurants→businesses`,
  `restaurant_id→business_id`, functies, header `X-Restaurant-Id→X-Business-Id`,
  guards/services/decorators/mappen (mig 0068). Hotfix embed-mapping-bug (access).
- [x] **Rustige momenten = vulbaarheid-first** (was anomalie-only) — structureel-
  lege dagen tellen weer mee; docx bijgewerkt. **Tijdvenster** instelbaar (mig 0069).
- [x] **Campagne-flow** — 24u-historie-grace (mig 0070, cron uurlijks) + de
  "rustige/speciale dagen"-balk verwijderd van /campagnes.
- [x] **Publieke site herpositioneerd** → AI-capaciteitoptimalisator (NL+EN):
  home/product/about/pricing/contact/blog + SEO-meta + JSON-LD + favicon.ico.
  Hero "Vul je rustige momenten. Automatisch." Home-mockup = kapper-case.
- [x] **Feedback-tool** — disclaimer + "Geef ons feedback"-link onder de Filly-chat
  → `POST /mail/feedback` → info@get-filly.com.

Details in de memory-index (multi-branche-plan, rustige-momenten, site-
herpositionering, postgrest-embed-cast-gotcha).


## 🗓️ 2026-07-29 — Filly-chat + geleide flow op de dagdeel-detectie (live op main)

De chat en de geleide flow hangen nu aan de rustige-momenten-detectie.

- [x] **Geen percentages in de chat** — live-drukte/bezetting kwalitatief
  (rustig/normaal/druk) + dagdeel; guardrail in de chat-prompt tegen "53%".
- [x] **Dagdeel door de flow-keten** — `generate-for-dates` mikt op het
  gedetecteerde rustige dagdeel (venster + reden) i.p.v. de hele dag;
  `getDayContext` levert `quietMoment` + `dayparts` per datum.
- [x] **Flow-UI** — opener toont dagdeel + toon i.p.v. %, hoeken-stap heeft een
  **dagdeel-selector** (● = gedetecteerd), aanbevolen kanalen voorgevinkt.
  Ander dagdeel kiezen kan; kiest de eigenaar niks anders, dan blijft het
  samengestelde gedetecteerde moment intact. (Segment-keuze bewust NIET: geen
  klantgegevens.)
- [x] **Rand-van-de-shift eruit** — eerste/laatste open dagdeel (opening/
  afsluiting) telt alleen mee als het niet doods is (≥ 30% van de piek), zodat
  logisch-lege sluitings-/openingsmomenten niet meer flaggen.
- [ ] **Vervolg (bekend), maar LET OP:** dit lost het "elke week dezelfde weekdagen"-probleem NIET op (zie de entry van 2026-09-15) — het verbetert de terugblik, niet de vooruitblik. Anker verschuiven van Google-gemiddelde naar eigen
  gemeten historie per weekdag/uur — pas mogelijk na weken live-data. Nu rollen
  structureel-slechte dagen (ma/wo) elke week terug; dat is inherent aan de
  gemiddelde-bron.


## 🗓️ 2026-07-27 — Rustige momenten per dagdeel (live op main)

Voorspellende detectie van rustige **dagdelen** (was: hele dagen). Draait op het
verwachte Google-weekpatroon, niet op live. Zelfde bron voedt grafiek + chat +
auto-detectie. Volledige uitleg + verantwoording afgevallen methodes in
[`docs/rustige-momenten-detectie.docx`](docs/rustige-momenten-detectie.docx).

- [x] **Model** `BusynessService.getQuietMoments` — dagdeel-rooster (vaste
  vensters, bijgesneden op open uren, gemiddelde per open uur, min-dekking) →
  robuuste two-way ontleding (**median polish**) → afwijking = werkelijk −
  verwacht → rustig = onder verwachting én buiten de normale schommeling
  (**MAD**) → vulbaarheid als poort → **tempo-cap per week**.
- [x] **Detectie + Filly** — `detectAndGenerateLowOccupancy` + Filly's
  chat-context draaien op de momenten (dag + dagdeel + toon).
- [x] **Dashboard + chat** — endpoint `GET /busyness/me/quiet-moments`;
  busyness-card markers/venster + chat-blokjes (`use-actionable-days`) uit
  dezelfde bron. Bestaande UI ongemoeid.
- [x] **Tempo instelbaar per zaak** — migratie **0065**
  (`restaurants.quiet_moments_per_week`, default 2, 1–6) + account-instelling.
  Migratie 0065 gedraaid in Supabase (2026-07-28).
- [x] **Migratie 0065 gedraaid** (2026-07-28).
- [x] **Fase 5 backend geverifieerd** — `getQuietMoments` tegen echte Supabase-data
  (demo-zaken, Bar Barolo-patroon): tempo uit DB, zinnige momenten, week-cap klopt.
  Ingelogde dashboard-render nog niet visueel gecheckt (auth).
- [x] **Week-navigatie uitgebreid** — terug tot begin dit jaar (minOffset uit
  1 jan) + 6 weken vooruit; werkelijk-lijn volgt de bekeken week; rustige
  markers blijven vooruitkijkend (vast venster vanaf vandaag).
- [x] **Kans per dag** — aaneengesloten rustige dagdelen (bv. diner + avond)
  worden één kans; tempo capt op het aantal DAGEN per week (max 1 kans/dag).
  Plafond blijft (geen opvulling). Word-doc + account-instelling bijgewerkt.
- [ ] Visuele check op de ingelogde dashboard (markers, terugbladeren, chat-blokjes).
- [ ] Branch mergen naar main na de visuele check.

**Verwachte lijn = Google-patroon, niet historische werkelijk.** De grijze lijn is
altijd het weekpatroon uit het Google-profiel per weekdag (zelfde voor elke
dinsdag); een toekomstige dag toont alleen die lijn (geen werkelijk-lijn). De
werkelijk-lijn bestaat enkel voor gemeten dagen en is 40/60 naar het patroon
gedempt. Vervolgstap (ongebouwd): anker verschuiven naar eigen mediaan-per-weekdag
zodra er weken metingen zijn.


## 🗓️ 2026-07-18 — Bezetting: Apify vervangt Outscraper + werkelijk-lijn glad (live op main)

**Outscraper bleek de live-drukte te CACHEN** (bevroren `100@13`, ververste
niet binnen een dag; getest: async, cache-buster, én Outscraper's eigen
UI-endpoint gaven allemaal dezelfde bevroren waarde). **Overgestapt naar
Apify** (`compass/crawler-google-places`) — die scrapet echt vers; live-
waarde varieert per uur en matcht Google. Merge `dc8cfe4`.

- **Client** (`apify.client.ts`): batched `run-sync-get-dataset-items` —
  ALLE place_ids in één run (scrape duurt ~15-90s, dus niet per zaak).
  `scrapePlaceDetailPage:true` levert populaire tijden + live + openingstijden.
- **Parser** (`apify.parser.ts`, getest 9/9): `popularTimesHistogram`
  (`Mo…Su`, `occupancyPercent`) → 7×24; `popularTimesLivePercent` → live
  (getal, ook 0 = echt; null = geen live); `openingHours`-tekst → opening_hours.
- **Service** batched: `refreshAll`/`refreshLive`/`refreshRestaurant`.
  `getLatest`/`getActualByDate`/`getDailyExpectation` ongewijzigd.
- **`vercel.json`** `maxDuration` 60→300 (Apify-run past niet in 60s).
- **Env:** `APIFY_TOKEN` (in .env + Vercel-api). `OUTSCRAPER_API_KEY` weg.
  Outscraper-client/parser/fixture verwijderd; oude snapshots opgeruimd.
- **Werkelijk-lijn gladgestreken** (merges `a17f518`, `3601ac4`): Google-live
  is grof (springt 0↔100). In `busyness.ts` `shapeActual`: 5-punts gewogen
  gemiddelde + demping naar het historische patroon (`ACTUAL_DAMP=0.4` = 40%
  meting / 60% normaal) + als Catmull-Rom bezier-curve getekend, zonder
  meetpunt-stippen. Ruwe data blijft in de DB (altijd bij te stellen). Geldt
  bij het tekenen, dus ook voor al gemeten dagen.
- **Nog open (P2/P3):**
  - [ ] Zodra er weken eigen live-data zijn: anker verschuiven van Google's
    generieke patroon naar de **eigen mediaan-per-weekdag/uur** + demping
    losser (evt. adaptief op hoeveelheid historie).
  - [ ] Werkelijk blijft een grove bron; voor écht precieze bezetting later
    eigen reserveringen/POS. Cron draait uurlijks (open zaken); check dat de
    live-waarden per uur variëren.
  - [ ] Filly-chat/detectie strakker koppelen aan de grafiek (rustige
    dagen/momenten beter bepalen + hoe erop inspelen) — aparte sessie.

---


## 🗓️ 2026-07-15 — Bezetting: echte databron via Outscraper (fase B, historisch)

> ⚠️ Superseded 2026-07-18: Outscraper vervangen door Apify (zie entry hierboven).
> Onderstaande beschrijft de eerste opzet; parser/client/env zijn sindsdien
> gewijzigd, maar het datamodel (busyness_snapshots, busyness_place_id,
> opening_hours) + de fase B-backend gelden nog.

De `getBusyness`-naad heeft nu een echte bron: **Outscraper** (Google
"Populaire tijden"), los-gekoppeld gebouwd achter de bestaande grafiek.
Nieuwe module `apps/api/src/busyness/`.

- **Parser** (`outscraper.parser.ts`, getest tegen een echte Bar Barolo-pull):
  `popular_times` → 7×24 patroon (dag 1=ma…7=zo, uren 6-23, 0-5=0),
  live-drukte uit het `{day:"live"}`-element, `working_hours` → `opening_hours`.
- **Client** (`outscraper.client.ts`): `/google-maps-search` (sync + async-poll-terugval), `X-API-KEY`, geen enrichments.
- **Service**: `refreshRestaurant`/`refreshAll` (weekpatroon) + `refreshLive`
  (belt alleen open zaken) + `getLatest`/`getActualByDate` (leeskant).
- **Cron**: `GET /api/busyness/cron/live` (elk uur) + `/refresh` (wekelijks vangnet),
  zelfde `CRON_SECRET`-patroon. Handmatig: `POST /api/busyness/me/refresh`.
- **Dashboard**: verwachte lijn = Google's patroon, werkelijke lijn = echte
  live-metingen per dag (mediaan per uur), grafiek-x-as volgt de
  openingstijden uit de pull. Seed blijft terugval voor zaken zonder bron.
- **Migraties (gedraaid):** `0062_busyness_snapshots`, `0063_restaurant_busyness_place_id`
  (drukte-bron LOS van GBP `google_place_id`), `0064_busyness_opening_hours`.
- **Env:** `OUTSCRAPER_API_KEY` (in .env + Vercel-api). Demo's "Trattoria Demo"
  + "Demo Bistro" wijzen via `busyness_place_id` naar Bar Barolo (GBP ongemoeid).
- **Nog open (P2):**
  - [ ] Werkelijk-lijn vult zich pas met echte historie zodra de uurlijkse
    cron op productie draait (na deze deploy).
  - [x] ~~Fase B-backend~~ (✅ 2026-07-15): `getDailyExpectation` (verwachte
    drukte + relatief niveau) gedeeld door `restaurant-context.service`
    (Filly's LLM-context: verwachte drukte + live) en
    `detectAndGenerateLowOccupancy` (kandidaat-rustige-dagen uit het
    busyness-model, level 'rustig'). `occupancy_days` blijft terugval voor
    zaken zonder `busyness_place_id`. DI-boot + builds groen.
  - [ ] Snapshot-bloat: nu `raw`+`pattern` bij elke live-tick → later lite
    live-rows / prunen van oude snapshots.
  - [ ] Onboarding zet nog `service_periods` → omzetten naar `opening_hours`.

---


## 🗓️ 2026-07-14 — Reserveringen weg + Filly-detectie op busyness-grafiek (live op main)

Commit 96100a2:
- **Reserveringen uit het menu**: sidebar-item + pagina `dashboard/reserveringen/`
  + de reserverings-functies/types in web `api.ts` verwijderd. Backend
  reservations-module + tabel BLIJVEN (Filly's `restaurant-context.service`
  gebruikt `ReservationsService`; tabel gelezen door KPI/Rapportages/data-export).
- **Chat-detectie gekoppeld aan de grafiek (fase A)**: `useActionableDays` draait
  nu op het busyness-model (`buildDayBusyness`→`isQuiet`) i.p.v. ruwe
  occupancy_days → chat-chips, campagnes-strook en KPI-ring tonen dezelfde
  rustige momenten als de grafiek. Grafiek-knop "Maak een campagne" opent de
  geleide flow voor die dag (`FillyChat.seedDate`).
- **Fase B (later, met de echte scraper-data):** busyness-model naar de backend
  (Filly LLM-context + `detectAndGenerateLowOccupancy`), ruwe-occupancy_days-
  detectie uitfaseren. Generatie-pijplijn (`generate-for-dates`) is datum-gedreven
  en blijft ongemoeid.
- Follow-up: onboarding gebruikt nog de per-shift `service-periods-editor`
  (omzetten naar per-dag openingstijden, dan die editor opruimen).

---


## 🗓️ 2026-07-14 — Dashboard-grafiek + openingstijden per dag (live op main)

Vervolgronde op het dashboard-blok (commit 9c7abed):
- Dag-grafiek vult de kaart, y-as met kopruimte (tot 115, pieken plakken niet
  meer aan de bovenkant), verwacht=grijs / werkelijk=groen zonder area-fill.
- "Maak een campagne" = volledige-breedte-knop, uitgelijnd met de chat-invoer.
- **Openingstijden nu PER DAG** i.p.v. per shift: nieuwe `OpeningHoursEditor`
  op /account schrijft `opening_hours`; grafiek-x-as volgt die (service_periods
  als terugval). `Restaurant.opening_hours` mag nu null per dag (= gesloten).
- **Follow-ups:** onboarding zet nog `service_periods` → omzetten naar de per-dag
  openingstijden; daarna `service-periods-editor.tsx` opruimen.

---


## 🗓️ 2026-07-10 — Dashboard-herontwerp fase 1 (GEMERGED naar main + live)

Nieuw dashboard-home gebouwd na akkoord op het prototype. Kernidee: bezetting
draait niet meer om exacte percentages maar om **relatieve drukte + rustige
momenten (kansen)**, want er is geen echte bezettingsdata (Zenchef/SevenRooms
weigeren; mail-parsing viel af om AVG). Bron wordt Google "populaire tijden".

- [x] **BusynessCard** (`_components/busyness-card.tsx`) vervangt de kalender +
  de twee groene banners. Eén blok: week-navigatie (vorige/deze/volgende week;
  toekomst = voorspeld), dag-strip met 7 mini-sparklines + markers (● rustig
  moment, ★ speciale dag), en een dag-grafiek met **dubbele lijn** (gemiddeld
  patroon vs werkelijke drukte; toekomst = 1 gestippelde voorspel-lijn) met
  gearceerd rustig-venster. Datums als dd/mm.
- [x] **KPI-ringen** (`_components/kpi-rings.tsx`) vervangen de platte KPI-rij:
  4 ring-meters onder de bezetting, links; Filly-chat rechts (ongewijzigd,
  alleen verplaatst).
- [x] **Data-adapter** `_lib/busyness.ts` = de naad naar de latere Google-bron.
  Leidt nu af uit `occupancy_days` (seed) + patronen in `hour-heatmap.ts`.
  Hergebruikt `special-days.ts` (markers) + `useActionableDays` (kansen).
- [x] i18n NL+EN toegevoegd (`dash__components_busyness`, `_kpi_rings`).
  `tsc` + `next build` groen.
- **Nog open (P2):**
  - [ ] **Echte databron via THIRD-PARTY** (bijv. Outscraper/SerpAPI) achter de
    `getBusyness(placeId)`-seam. Besloten 2026-07-10 na scraper-spike. Levert
    populaire tijden + live als schone JSON, regelt pb/IP/consent. Nog te doen:
    provider kiezen + API-key in env, fetch-adapter, cron.
    - Datamodel staat al: tabel `busyness_snapshots` (migratie gedraaid) =
      per scrape `pattern` (7×24, Google's gemiddelde = "verwacht") + `live_pct`
      (accumuleert tot eigen "werkelijk"-historie). Verwacht = laatste pattern;
      werkelijk = live-metingen per weekdag/uur (mediaan tegen uitschieters).
    - Voor campagne-effect: werkelijk op campagnedag vs mediaan andere
      same-weekdays, met feestdagen/campagnedatums getagd.
    - **Spike-bevindingen (2026-07-10, NIET opnieuw doen — eigen scrape werkt niet):**
      - Consent-wall omzeilbaar met cookie `CONSENT=YES+...; SOCS=CAI` → 200.
      - HTTP-scrape: populaire tijden zitten NIET in de place-pagina (JS-shell) of
        `/maps/preview/place`. Zoek-endpoint (`tbm=map&tch=1&pb=...`) mét de
        VOLLEDIGE populartimes-`pb` geeft de plek terug maar `detail[84]` (de
        populaire-tijden-slot) blijft `null` — Google heeft dit dichtgezet voor
        kale HTTP-verzoeken.
      - Headless browser (Playwright, niet ingelogd): laadt het paneel wél, maar
        toont "You're seeing a limited view of Google Maps" ZONDER
        populaire-tijden-sectie.
      - Conclusie: ze verschijnen alleen in een INGELOGDE Google-sessie
        (ToS-schending, hoog detectierisico, fragiel). Betrouwbaar gratis zelf
        scrapen = niet haalbaar. → **Third-party is de enige realistische route.**
    - Uurlijkse live-meting tijdens openingstijden nodig voor de volledige
      dagcurve (Google geeft geen historische per-dag data, alleen "nu").
  - **KPI-ringen definitief maken** — Floris herziet welke 4 metingen. Ring 1
    (uitingen-quota 10/30) en ring 4 (vindbaarheid 85%) zijn nog PLACEHOLDER;
    ring 2 (rustige momenten benut) + ring 3 (lopende campagnes) = echte data.
  - **"Maak concept"-CTA** koppelt nu alleen naar de Filly-chat (scroll). Fase 2:
    de gekozen dag vooraf invullen in de geleide flow.
  - [x] Dode code opgeruimd: `calendar-card.tsx`, `kpi-row.tsx`,
    `service-grid.tsx`, `hour-heatmap.tsx` (render) verwijderd. Bewust
    behouden: `upcoming-actions-block` (nog op /campagnes), `use-actionable-days`,
    `calendar-data` (chart-card/occupancy-window), `_lib/hour-heatmap` (busyness.ts).

---


## 🗓️ 2026-07-07 — Google Bedrijfsprofiel end-to-end live + campagne-fixes (live op main)

Google Bedrijfsprofiel is van "code-af, wacht op API" naar **volledig werkend op productie** gegaan, plus een reeks campagne-bugfixes. Alles live op `main` + Vercel.

- **`invalid_client` opgelost** — de Vercel-env `GOOGLE_OAUTH_CLIENT_ID` had letterlijk de placeholder-string als *waarde* (op web én api). Juiste waarde gezet (`167329672884-…apps.googleusercontent.com`) + redeploy → consent-scherm werkt, verbinden lukt, tokens (access + refresh) bevestigd opgeslagen in `integration_credentials`.
- **Cloud-project (167329672884, developer@get-filly):** Account Management + Business Information + Google My Business API v4 staan aan; gekoppeld aan Get-Filly's eigen GBP.
- **Beheer-writes (business.manage echt in gebruik):**
  - Omschrijving, openingstijden (regularHours) en speciale dagen (specialHours) bewerkbaar → `locations.patch` (Business Information API).
  - Reviews lezen + beantwoorden (v4) + Filly-suggestie (`generateReplyForText` op losse velden). De **Reviews-sectie** toont nu live Google-reviews (en verbergt seed-reviews met bron google); elke ophaaluitkomst is zichtbaar (laden/0-reviews/fout).
  - Google Posts plaatsen (`localPosts.create`) — met foto — óók vanuit campagnes + Filly-chat.
  - Foto-beheer: upload uit de Filly-bibliotheek naar het profiel (`media.create`, omslag/logo/extra).
  - Basisgegevens (naam/adres/categorie/telefoon/website) worden nu via de geauthenticeerde API gelezen i.p.v. Places (demovideo scène 5).
- **Campagne-fixes:**
  - `publishSocialCampaign` had geen `google_business`-tak → GBP-campagne activeren gaf "Publiceren mislukt". Tak toegevoegd (post + foto naar Google).
  - Builder-default `["instagram"]` → `[]` (geen kanaal meer voorgevinkt).
  - `detectPlatform` kende `google_business` niet → koos je GBP, dan toonde de editor Instagram. Gefixt (+ voorstel-pagina + suggestie-types).
  - Kanban "Compleet" telde de vereiste foto niet mee (lijst-API miste media/kanaal-info) → `social_platform` + `has_media` toegevoegd; foto telt nu mee.
- **Foto verplicht** voor Instagram, TikTok, **Facebook én Google Business** (`PHOTO_REQUIRED` uitgebreid; `PHOTO_OPTIONAL` leeg).
- **Profiel-pagina opgeschoond:** kaarten "Vragen & antwoorden" (Q&A-API stopgezet nov 2025) en "Inzichten" (Performance API, geen must-have) verwijderd.
- **Nog open:** OAuth-app-verificatie (sensitive scope) + demovideo opnemen (nu is er écht beheer om te tonen); privacybeleid moet Anthropic als subverwerker noemen (voor de Filly-reviewreply / Limited Use).

---


## 🗓️ 2026-06-25 — Filly-chat / geleide-flow opgeschoond (live op main)

De geleide campagne-flow in de dashboard-chat strakker getrokken. Alles live op `main` + Vercel.

- [x] **Geen TikTok-voorselectie** — kanaal-stap vinkte alle gekoppelde kanalen voor-aan (TikTok dook ongevraagd op). Nu alleen wat de eigenaar expliciet noemt; anders leeg (eigenaar kiest zelf).
- [x] **Spoor in chat-historie na genereren** — de flow liet niets na (resultaat alleen in component-state). Nu een Filly-bericht met een **klikbare kaart** (titel + "Bekijken & aanpassen →" → de concept-campagne). Subtiel: kleine titel, zacht groen tekstlinkje, geen kanaal-emoji. `POST /chat/conversations/:id/note` (geen LLM) + `CampaignCreatedCard`.
- [x] **Geen dubbele "done"-kaart** — de oude inline done-kaart ("Klaar, ik heb een voorstel…") is weg; de chat-kaart is het enige resultaat.
- [x] **Emoji achter "Klaar" weg** (`done.title`).
- [x] **Rust-stap na genereren** — geen stappen-menu meer opdringen; "Wil je nog een campagne maken? [Ja]" (`step:"idle"`, bewaard in active_action). Typen kan altijd. **Smart**: de net-gebruikte dag(en) worden uit de dag-keuze gefilterd (usedDates in de chat-parent → overleeft de flow-instantie-wissel).
- [x] **Chats > 7 dagen automatisch opruimen** — `GET /chat/cron/cleanup` (dagelijks 03:00, admin-client). Filly start elke kalenderdag een vers gesprek; learnings leven los in `restaurant_chat_memory`.

**Gotcha (belangrijk voor de chat):** de geleide flow leeft náást het chat-model en wisselt van render-plek (on-ramp ↔ active) zodra het eerste bericht verschijnt → race-condities op active_action/state. Opgelost met een idle-sync-effect + usedDates in de parent. Grotere refactor (flow-stappen als echte chat-gebeurtenissen) staat nog open.

---


## 🔬 2026-06-25 — Platform-audit (developer + UX): flows, robuustheid, dode code

Brede audit over `apps/web` + `apps/api` (5 parallelle analyses: routing/navigatie,
auth/onboarding, campagne+Filly-kern, frontend-UX, backend/multi-tenant). Alle
bevindingen zijn in de code geverifieerd; `file:line` erbij. Severity: 🔴 = security
of data-integriteit · 🟡 = robuustheid/flow · 🟢 = opruimen/polish.

**Corrigeert eerdere aannames (geen actie):**
- De seeded nep-bezetting is grotendeels al weg: `use-actionable-days.ts:119` draait met
  `seedMissing=false`, dus chat-flow én UpcomingActionsBlock tonen geen verzonnen rustige
  dagen meer. `seededOccupancy` leeft alléén nog in de kalender-tegels (`calendar-card.tsx:388`).
- `suggested_scheduled_for`/`_reasoning` zijn NIET dood — actief geschreven
  (`campaigns.service.ts:904`, `suggestions.service.ts:2146`) en gelezen door de frontend.
  CLAUDE.md is daar stale → regel corrigeren (zie 🟢 opruimen).

### 🔴 Data-integriteit
- [x] ~~**Multi-channel activeren niet atomair**~~ (✅ 2026-06-25, `ee404d7`) — activeren flipt nu per kanaal de status direct na zijn eigen geslaagde send/publish, met fout-attributie per kanaal; geslaagde kanalen blijven actief bij een deelfout.
- [x] ~~**`approveBundle` + `approveMultiChannel` laten wees-groepen + duplicaten achter**~~ (✅ 2026-06-25, `5f89994` + dead-code-ronde) — try/catch om de create-loop ruimt bij een fout de aangemaakte kanalen + group op, zodat een retry schoon begint. **Correctie:** `approveMultiChannel` is NIET dood — het wordt aangeroepen vanuit `approve()` (regel 2018) bij multi-channel suggesties; dezelfde rollback is daar nu ook toegepast.
- [~] **Lost-update op `variants[]`-jsonb** — (✅ deels 2026-06-25, dead-code/robuustheid-ronde) optimistisch slot op `editVariant` + `generateMoreVariants` via de bestaande `updated_at` als versie-stempel (`writeVariantsGuarded`): bij een gelijktijdige wijziging volgt een nette 409 ("ververs de pagina") i.p.v. stil overschrijven. Géén migratie nodig. **Rest open:** `selectVariant` (alleen index, lage schade — bewust niet geslot om valse conflicten te vermijden) en `suggested_campaign`-jsonb in `suggestions.service.ts`. Kanttekening: zeldzame valse 409 als een ándere actie (foto-upload) `updated_at` net bumpt → veilige faal (geen dataverlies, alleen verversen).
- [~] **Ongevalideerde cast op Claude tool-output** — (✅ deels 2026-06-25, robuustheid-rest) `ai.service.ts` (beide structured-paden) weigert nu echt-corrupte output (null/primitief/array) met een nette fout i.p.v. een cast die downstream crasht/corrumpeert; afgekapte (max_tokens) output wordt zo ook afgevangen. Leeg object `{}` blijft bewust doorgelaten (callers vangen dat al af, bv. `generateMoreVariants`-retry). **Rest open:** volledige per-caller zod-schema-validatie + `parseSuggestedCampaign()` bij read-vóór-write (grotere refactor, alle AI-callers).

### 🔴 Security
- [x] ~~**SSRF in website-analyzer**~~ (✅ 2026-06-25, `8605644`) — `website-analyzer.service.ts` volgt redirects nu handmatig (`redirect:'manual'`) en checkt elke hop via `assertPublicUrl`: DNS-resolve → weiger loopback/private/link-local/metadata (169.254.169.254)/CGNAT/multicast + IPv4-mapped IPv6. IP-literals direct gecheckt.
- [x] ~~**Cross-tenant unsubscribe**~~ (✅ 2026-06-25, `8605644`) — `mail.service.ts` scopet de `campaign_sends`-update nu via de campagne-id's van het restaurant (`campaign_sends` heeft geen `restaurant_id`-kolom). Geen cross-tenant reporting-vervuiling meer.
- [x] ~~**Resend-webhook fail-open**~~ (✅ 2026-06-25, `8605644`) — `mail.controller.ts` is nu fail-closed: 401 zonder secret/rawBody/geldige signature. ⚠️ Vereist `RESEND_WEBHOOK_SECRET` in de API-env, anders worden ALLE webhook-events geweigerd.
- [x] ~~**Open-redirect op /login**~~ (✅ 2026-06-25, `8605644`) — `login/page.tsx` valideert `?next=` via `safeNextPath` (alleen interne paden, geen `//`/scheme).
- [x] ~~**Geen IP-rate-limiting**~~ (✅ 2026-09-16, mig 0076) — `check_rate_limit()` telt in de database, net als `AiRateLimitGuard` al deed; geen Redis nodig. Contactformulier 5/kwartier per IP, onboarding-AI 5/10min per user. Fail-open bij een fout in de teller (kosten, geen authenticiteit — anders dan de webhook-validatie), IP gehasht opgeslagen. Geverifieerd op productie: 5 door, dan 429, ander IP niet meegeblokkeerd. ⚠️ **Stopt één bron die doorramt, geen gedistribueerde aanval** — daarvoor blijft een WAF (Vercel Firewall) nodig; dat punt staat nog open.

### 🟡 Robuustheid & flows
- [x] ~~**Ingeplande mail wordt nooit automatisch verstuurd**~~ (vervallen 2026-09-16) — mail is eruit als campagnekanaal (besluit Floris), dus er komen geen nieuwe mail-campagnes meer bij. ⚠️ Bestaande campagnes met `type='mail'` en status `ingepland` blijven wél liggen; die moeten handmatig afgehandeld of gearchiveerd worden.
- [ ] **Geleide-flow verliest state bij on-ramp→active wissel** — `filly-chat-message-list.tsx:151-291`: bij het eerste bericht rendert een nieuwe `FillyGuidedFlow`-instantie (andere `key`) → gekozen hoek/aangevinkte context weg; `active_action` herstelt alleen datum/topic/kanalen/step. *(bekend pijnpunt, nog open; hangt aan de grotere flow-refactor)*
- [x] ~~**Ontbrekende sequence-guards (stale-data races)**~~ (✅ 2026-06-25, `ee404d7`) — `cancelled`-flag toegevoegd op reserveringen, bezetting, dashboard-kalender + unmount-guard op kpi-row.
- [x] ~~**Stille fout = lege empty-state**~~ (✅ 2026-07-07, al opgelost) — `reserveringen`, `gasten` en `campagnes/history` hebben een aparte foutstaat (`error`/`loadError` + `retryNonce`) met een **"Probeer opnieuw"**-knop; een fout is dus onderscheiden van "geen data". `suggesties` bestaat niet meer als route.
- [ ] **restaurant-context slikt query-fouten** — `restaurant-context.service.ts:82,291` + callers met extra `.catch(() => '')`: transient Supabase-fout → leeg context-blok → Filly genereert generiek/gehallucineerd en "slaagt". Fix: query-error onderscheiden van "geen data" en netjes afbreken.
- [ ] **Auth-edge-cases:**
  - [ ] Account-delete + handmatige user-delete laten **wees-restaurants** achter (geen FK/trigger) — `account-deletion.service.ts:72`. Fix: DB-trigger op laatste-owner-verwijdering. *(overlapt COO P0 "Test-account FK-cascade")*
  - [ ] Invite-`upsert` kan een **owner stil downgraden** naar staff — `team.service.ts:484`. Fix: niet downgraden bij bestaande hogere rol.
  - [ ] Uitgenodigd teamlid met gefaalde accept belandt in de **onboarding-wizard** en maakt een eigen restaurant — `middleware.ts:130`. Fix: pending-invite detecteren → banner i.p.v. wizard.
  - [x] ~~3 van 4 wachtwoord-flows tonen **rauwe Engelse Supabase-fouten**~~ (✅ 2026-07-07, al opgelost) — forgot/reset/welkom/login gebruiken allemaal `authErrorKey`/`translateAuthError`/`translateInviteError` + `t()`; geen rauwe Supabase-fout meer in beeld.
  - [x] ~~**State-conflicten als 500 i.p.v. 4xx** + rauwe Postgres-message lekt naar client~~ (✅ 2026-07-07) — nieuwe gedeelde `throwDbError(logger, error)` (`common/db-error.ts`) logt de rauwe DB-melding server-side en geeft een generieke NL-melding terug; toegepast op alle ~63 `InternalServerErrorException(err.message)`-sites in campaigns/suggestions/mail. State-conflicten in `suggestions.service.ts` gebruikten al `ConflictException`/`BadRequestException` (4xx).

### 🟡 UX — werk-verlies & onduidelijkheid
- [x] ~~**Review-reply concept verdwijnt**~~ (✅ 2026-06-25, `ee404d7`) — backdrop/×/Esc/Annuleren vragen nu bevestiging bij een nog niet verzonden antwoord (`closeReply` + `discardConfirm`).
- [x] ~~**`originalIdxRef` reset niet**~~ (✅ 2026-06-25, `ee404d7`) — reset nu in een effect gekeyd op `sectionId`; ✕ revert niet meer naar de variant van de vorige campagne.
- [x] ~~**Geen succes-feedback** na review-antwoord versturen~~ (✅ 2026-06-25, UX-ronde 3) — auto-verdwijnende succesbanner ("✓ Je antwoord is geplaatst.", `role=status`) na een geslaagde `sendReply`. **Rest open:** gefaald chat-bericht blijft als wees-bubble zonder retry (`filly-chat.tsx`). *(AccessGuard-flash ✅ `ee404d7`.)*
- [x] ~~**Geen onopgeslagen-wijzigingen-waarschuwing** op account + identiteit~~ (✅ 2026-07-07) — gedeelde `useUnsavedChangesWarning(dirty)`-hook (`lib/use-unsaved-changes.ts`) met `beforeunload`. Account: nieuwe `dirty`-flag (true bij `update`, false na opslaan/laden). Identiteit: hergebruikt de bestaande `dirtyCount`. Dekt harde navigatie (sluiten/verversen/externe link); in-app Next-navigatie bewust buiten scope.
- [x] ~~**Dubbele-submit + eeuwig "submitting"** op choice/date-cards~~ (✅ 2026-06-25, UX-ronde 3) — `sendingRef` als synchroon slot (blokkeert de 2e snelle klik vóór de state update), en `sendText` geeft nu een boolean terug zodat de keuze-kaart alleen "verstuurd" toont als het écht ging (anders terug naar pending).
- [x] ~~**Filly-chat instance-switch reset niet alle card-states**~~ (✅ geverifieerd 2026-07-01 — claim was achterhaald) — `switchConversation` én `startNewConversation` resetten al `proposalStatus` + `bundleStatus` + `choiceState` + `dateChoiceState` (`filly-chat.tsx:560-563, 584-587`). Geen actie nodig.
- [~] **Mock-data als echt gepresenteerd** — bezettingspagina is schoon (2026-09-16): `generateMockHourly()`, de hardgecodeerde YoY-deltas en de cohort-tabel zijn weg, de uur-heatmap draait nu op echte live-metingen. ⚠️ **Nog open**: de jaarview-heatmap (`chart-card.tsx:50`, `calendar-card.tsx:224,388`). Dat is dezelfde soort fout — verzonnen cijfers zonder markering, voor élke klant hetzelfde — en het blijft het punt waar een testklant het snelst z'n vertrouwen op verliest.
- [~] **Modals zonder `aria-labelledby`/focus-trap/Escape** — (✅ grotendeels) UX-ronde 3 (2026-06-25): review-antwoord, "maak eigen campagne"-builder, media-pop-up (campagne-detail). UX-ronde 4 (2026-07-01): `role="dialog"` + `aria-modal` + `aria-labelledby` + Escape op delete-modal (account), invite-modal (team) en media-library-picker; history-restore had al `role="menu"` + Escape. **Rest open:** alleen nog **focus-trap** (focus binnen de modal houden) — bewust apart, vereist een gedeelde trap-helper.
- [ ] **Responsive-gaten** — uur-heatmap, brede tabellen (gasten/bezetting), `aspecten-tabel.tsx:134` (5 koloms nowrap op ~380px), `missende-aspecten-card.tsx:325` (`marginLeft:126` off-canvas), chat-choice-cards `repeat(2,1fr)`, identiteit-savebar `left:220` (hardcoded sidebar-breedte).

### 🟢 Dode / verweesde flows + opruimen
- [x] ~~**Orphaned routes `taken` + `suggesties` verwijderd**~~ (✅ 2026-06-25) — beide routes + hun `PATH_MODULE_MAP`/`titleKeyFor`/`MODULE_KEYS`-entries + de `taken`/`suggesties`-modules uit `packages/shared/permissions.ts` (rol-defaults + Module-type) weg. `resolvePermissions` filtert oude opgeslagen rechten met die namen automatisch weg → geen breuk. `marketing` (hub + IG/FB/mail/TikTok) BEWUST behouden: daar loopt echte Meta-data en Rapportages linkt ernaar. Restje (onschadelijk): ongebruikte i18n-keys `dash_taken_page`/`dash_suggesties_page` in `messages/{nl,en}.json` + 2 historische comments in `sidebar.tsx`.
- [~] **Pending/accept/dismiss-flow vrijwel dood** — de dode voorstel-berekening op het campagnebord is weg (2026-09-16) en een mislukte goedkeuring faalt niet meer in stilte: die wordt gelogd én gemeld aan de eigenaar. ⚠️ **Nog open**: `acceptProposal`/`acceptBundle` en de "Nee bedankt"-knop (`filly-chat.tsx`, persisteert niets) lopen nog steeds niet. Eerst bevestigen of historische pending-kaarten voorkomen, dan opruimen.
- [x] ~~**`step==="done"`-blok + ongebruikte `result`-state**~~ (✅ 2026-06-25, dead-code-ronde) — onbereikbaar dood blok verwijderd, inclusief `result`/`setResult`, de `restart`-helper, de `CHANNEL_LABEL`-map en het ongebruikte `AiSuggestion`-type-import. ~85 regels weg. (i18n-keys `done.*`/`result.viewEdit` nu ongebruikt maar onschadelijk; `result.fallbackName` blijft elders in gebruik.)
- [ ] **Legacy FORMAAT-parsers** (`chat.service.ts:1547`) draaien elke chat-beurt als "vangnet". *(BEWUST NIET verwijderd 2026-06-25: de parse-tak draait nog elke beurt; verwijderen vereist eerst verifiëren dat geen enkele render-/historie-pad op de oude kaarten leunt. Net als bij `approveMultiChannel` — dat "dood" leek maar via `approve()` wordt aangeroepen — eerst zorgvuldig narekenen. Aparte stap.)*
- [x] ~~**Frontend cap-detectie matcht op stale string**~~ (✅ 2026-06-25, `d115721`) — stale `"grens van 20"` weg; matcht nu op de stabiele `"nieuw gesprek"`-formulering. (HTTP-status/error-code blijft de nettere vervolgstap.)
- [x] ~~**`/dashboard/design-system`** voor elke ingelogde klant opvraagbaar~~ (✅ 2026-06-25, `d115721`) — achter env-flag `NEXT_PUBLIC_DESIGN_SYSTEM` (default uit); klant ziet "Niet beschikbaar".
- [ ] **`findBundle` N+1** (`campaigns.service.ts:674`) + serial N+1 in `channelCampaignsInGroup` (`:1230`). *(bewust uitgesteld 2026-06-25: draait al parallel en bundels zijn ≤6 kanalen → geen reële last; de queries scopen wél netjes op `restaurant_id`. Batch-`IN` blijft de nette fix zodra >10-kanaal-bundels bestaan.)*
- [x] ~~**Dode tweede `mapAuthError`**~~ (✅ 2026-06-25, `d115721`) — module-niveau variant verwijderd; de lokale i18n-variant blijft.
- [x] ~~**Doc-drift opruimen**~~ (✅ 2026-07-07) — middleware-comment gecorrigeerd (/signup is een uitlegpagina, geen redirect); CLAUDE.md: `suggested_scheduled_*` is wéér in gebruik (niet dood) + structuurnoot bijgewerkt (taken/suggesties verwijderd, marketing/ = rapportage-kanaaldetails).

---


## 🗓️ 2026-06-24 — Campagne-detail "foto-interface" + kanaalbeheer + publiceer-flow (live op main)

Campagne-detailpagina gelijkgetrokken met de voorstel/"foto"-interface, kanaalbeheer toegevoegd en de publiceer-flow gerepareerd + dichtgetimmerd. Alles live op `main` + Vercel.

- [x] **Campagne-detail = foto-interface** — Aspecten-tabel terug op de detailpagina (foute revert ongedaan); media (foto óf video) via een pop-up uit de cel i.p.v. een losse FotoCard; performance-card + mail-verstuur-card alleen nog bij ingepland/actief (concept eindigt bij "Waarom dit voorstel").
- [x] **"Maak eigen campagne" multi-channel** — builder kiest één of meer kanalen; `CampaignsService.createBundle` maakt groep + concept per kanaal (`POST /campaigns` met `platforms[]`).
- [x] **Kanalen toevoegen/verwijderen op een concept** — klikbare "Kanaal in deze campagne"-chips; `POST/DELETE /campaigns/:id/channels`. Losse concept-campagne promoveert automatisch tot bundel; min. 1 kanaal; alleen op concept. +5 Jest-tests (suite nu 99).
- [x] **Bug: social-campagne activeren faalde** — `publishSocialCampaign` las `social_platforms`/`social_hashtags`; echte kolommen zijn `platforms`/`hashtags` (mig 0001). Geen migratie nodig.
- [x] **Bug: "Genereer 3 versies" gaf Internal server error op een zelf-aangemaakt concept** — placeholder-inhoud → Filly schrijft nu 3 eerste versies o.b.v. naam + context; parsing afgeschermd zodat onverwachte AI-output nooit meer een generieke 500 geeft (nette melding + log).
- [x] **Bug: gegenereerde versies verdwenen bij parallelle acties** — race-conditie: elke actie eindigt met `load()`; een trager-binnenkomende oudere refetch overschreef verse data (bv. net-gegenereerde versies bij gelijktijdig foto uploaden). Sequence-guard op `load()`: alleen het laatst-gestarte antwoord zet de state.
- [x] **Publicatiefout zichtbaar gemaakt** — `published_at`/`publish_error` (kwamen al mee via `findById`) worden nu in de view ontsloten + getoond als banner op de detailpagina. Geen stille mislukking meer; geldt voor zelf-gemaakt én voorgesteld.
- [x] **Onuitgewerkt concept niet plaatsbaar** — de placeholdertekst telde als ingevulde body → je kon 100% halen + activeren/inplannen met onuitgewerkte tekst. `isUnwrittenBody` telt de placeholder nu als niet-ingevuld (frontend: knoppen blijven disabled); `publishSocialCampaign` weigert 'm ook serverside (alle paden).

- [x] **Filly geleide flow: geen TikTok-voorselectie** — de kanaal-stap vinkte alle gekoppelde kanalen voor-aan; TikTok dook ongevraagd op. Nu alleen voor-aanvinken wat de eigenaar expliciet noemde, anders leeg (eigenaar kiest zelf).
- [x] **Filly geleide flow: spoor in chat-historie** — de flow liet niets na (resultaat alleen in component-state, active_action reset na genereren) → bij terugkomst een leeg scherm. Nu schrijft de flow ná genereren een Filly-notitie in het gesprek (`POST /chat/conversations/:id/note`, geen LLM-call).

**Nog open / context (geen bug):**
- [ ] **Filly geleide flow leeft náást het chat-model** — de flow is een parallel UI-spoor dat z'n stappen niet als chatberichten vastlegt (alleen de losse `active_action` + component-state). Daardoor blijft 'm fragiel (state na-ijlen, weinig historie). Grotere refactor: de flow-stappen/resultaat als compacte chat-gebeurtenissen vastleggen zodat "terugkomen" = "je gesprek terugzien". *(architectuur, los plannen)*
- [x] ~~**Geplande social-posts timing**~~ (✅ 2026-06-25) — Vercel Pro actief; cron `/api/campaigns/cron/run-scheduled` staat nu op `*/30 * * * *` (elk half uur, `apps/api/vercel.json`). Ingeplande social gaat ~30 min na z'n tijd live. Direct = "Activeer nu" (synchroon, geen cron). ⚠️ Vereist op Vercel: project onder het Pro-team (✅ get-filly-api staat daar) + `CRON_SECRET` gezet in get-filly-api. **Mail blijft open** — zie "Ingeplande mail wordt nooit automatisch verstuurd".
- [x] ~~Instagram vereist een afbeelding/video (Meta-API-eis)~~ (✅) — afgedwongen via `PHOTO_REQUIRED` + de blokkade hierboven. **Update 2026-07-07:** foto is nu óók verplicht voor **Facebook en Google Business** (Floris-wens); `PHOTO_OPTIONAL` leeg. GBP-post stuurt de foto mee (`localPosts` media).

---


## 🔬 Audit-ronde 2026-06-18 — 4 expert-analyses (Prio / Frontend / Backend / Beveiligingen)

> Vier parallelle code-audits: data-engineer/developer, UI-analist, UX-expert en
> security-engineer. Alle bevindingen zijn in de code geverifieerd. Items die al
> elders in deze backlog stonden zijn gemarkeerd **(bevestigd)**. Severity:
> 🔴 vóór productie-klanten · 🟡 belangrijk · 🟢 polish.

### 🎯 Prioriteit — eerst oppakken (vóór productie-klanten)
- [x] ~~🔴 **AuthGuard globaal maken (deny-by-default)**~~ (✅ 2026-06-18) — APP_GUARD + @Public() op de 5 bewust-publieke controllers; lokaal geverifieerd (publiek→200, beschermd→401). *(Backend + Beveiliging)*
- [x] ~~🔴 **9 server-only keys uit `get-filly-web` Vercel-env**~~ — ✅ verwijderd (2026-06-18, Floris). Alleen `NEXT_PUBLIC_*` + publieke OAuth-app/client-id's (`META_APP_ID`, `GOOGLE_OAUTH_CLIENT_ID`) resteren. *(Beveiliging)*
- [x] ~~🔴 **Resend-webhook Svix-signature valideren**~~ (✅ 2026-06-18) — rawBody + `verifySvixSignature`; handhaaft zodra **`RESEND_WEBHOOK_SECRET`** in get-filly-api gezet is (⚠️ nog te zetten in Vercel). *(Beveiliging)*
- [x] ~~🔴 **Cron-secrets constant-time vergelijken**~~ (✅ 2026-06-18) — gedeelde `timingSafeBearer`-helper in alle 3 cron-controllers. *(Backend + Beveiliging)*
- [x] ~~🔴 **Ontbrekende migratie 0044 committen**~~ (✅ 2026-06-22, `fix/schema-drift-0044`) — `0044_restaurant_identity_extension.sql` toegevoegd (8 identiteit-velden: tone_of_voice/do_not_mention/brand_story/location_description/keywords/default_hashtags/awards/target_audience_segments). Idempotent `add column if not exists`. **Correctie op de oude omschrijving:** 0039 bestaat bewust niet (gereserveerd voor encrypted API-key-storage, werd uiteindelijk 0052), en 0056/0057 stáán inmiddels al in de map — alleen 0044 ontbrak echt. ⚠️ SQL handmatig in Supabase draaien (zie chat). *(Backend)*
- [x] ~~🔴 **`:focus-visible` toevoegen (publiek én dashboard)**~~ (✅ 2026-06-22) — gedeelde a11y-baseline in `globals.css` dekt nu alle clickables site-breed. *(Frontend)* (Restje onder Dashboard-UI: `.cal-cell`/`.yr-cell` als echte buttons.)
- [ ] 🔴 **Conversie publieke site**: vertrouwenssignalen (reviews/logo's/cijfers) toevoegen + de volledig geblurde prijzen-pagina oplossen. *(Frontend/UX)*
- [x] ~~🔴 **Filly geleide flow**: stille redirect bij 0 resultaten + `aria-live` op chat~~ (✅ 2026-06-22) — 0-resultaten + typ-/done-staat al gefixt bij de active-action-merge; laatste gaten gedicht: `role="alert"` op de guided-flow-foutmelding + chat-error-banner, `aria-live="polite"` op de berichten-container. Zie regels hieronder. *(Frontend/UX)*
- [x] ~~🟡 **SSRF in website-analyzer**~~ (✅ 2026-06-25, `8605644`) — DNS→IP-blocklist + redirects handmatig herchecked. *(Beveiliging)*

### 🎨 Frontend

**Publieke site — UI**
- [x] ~~🔴 `:focus-visible` ontbreekt volledig (0 regels)~~ (✅ 2026-06-22) — één gedeelde a11y-baseline in `globals.css` (geldt publiek + dashboard): `a/button/input/select/textarea/summary/[tabindex]/[role]` krijgen `outline: 2px solid var(--color-brand)` + offset. Zelfde stijl als de losse `.ui-btn`/`.blog-card`-regels; componenten met eigen focus-stijl overschrijven het.
- [ ] 🔴 Typografieronde ~12% af: 130 hardcoded px font-sizes vs 18 token-uses in `landing.css` (hero 74, `.pillars-cta-title` 32, `.pricing-price` 38, `.diff-card-title` 24…) → koppen op `--fs-*`, nieuwe `--fs-hero`-token.
- [ ] 🟡 Drie/vier verschillende "primaire groene knop"-implementaties (`.btn-primary`/`.nav-demo`/`.cta-btn`/`.pricing-btn`); `ui.css` Button nergens hergebruikt → één `.btn`/`<Button>`.
- [x] ~~🟡 Dode/dubbele CSS: `.features::before` 2×~~ (✅ 2026-07-01) — de eerste `.features::before` werd volledig overschreven door de tweede en is verwijderd (rendering ongewijzigd). `.about-hero-grid` (3393) en `.about-mv` (3488) blijken **bewuste responsive-overrides** binnen een `@media`, geen echte duplicaten → ongemoeid.
- [ ] 🟡 Breakpoint-sprawl (560/640/720/760/820/860/880/980; blog 860 ≠ nav 880) → consolideren naar 880/640/480.
- [ ] 🟡 `font-weight: 800` buiten de schaal + 113 raw weights + ~50 hardcoded brand/status-hex → `--font-weight-*` / `--color-*`.
- [~] 🟢 Logo nav 44px vs footer 35px + dode `.nav-logo-mark`-selector; kaart-radii driften 12/16/20/24/32 → radius-tokens. **(deels ✅ 2026-06-22)** — dode `.nav-logo-mark`-selector verwijderd. Logo-groottes bewust níet gelijkgetrokken (header > footer is een normale design-keuze, geen bug). Kaart-radii-tokens nog open.

**Dashboard — UI**
- [ ] 🔴 `campaign-send-modal.tsx` volledig inline-styled mét niet-bestaande var-namen + foute hex-fallbacks (`var(--danger,#B3261E)`, `var(--tl,#6B6F71)`) → bestaande `.sg-modal` hergebruiken.
- [ ] 🔴 `UpcomingActionsBlock` herbouwt de alert-bar inline met hardcoded `RED/GREEN` + alias-misbruik `--rs` → `.alert-bar`-class met `--color-danger/-brand`.
- [~] 🔴 `:focus-visible` vrijwel afwezig (1 regel); klikbare `.cal-cell`/`.yr-cell` zijn `<div>` zonder role/tabindex → focus-outline + echte buttons. **(deels ✅ 2026-06-22)** — focus-outline nu site-breed gedekt via de gedeelde `globals.css`-baseline; resteert: `.cal-cell`/`.yr-cell` echte `<button>` maken (role/tabindex) zodat de ring ook iets selecteert.
- [ ] 🟡 Twee parallelle knop-systemen; `<Button>` in maar 6/32 componenten (pill vs rounded-rect inconsistent) → migreren.
- [ ] 🟡 Type-/shadow-tokens vrijwel ongebruikt (243 raw px, 0× `--font-size-*`, 0× `--shadow-*`, .5px-uitschieters) → tokens.
- [ ] 🟡 379 inline-`style={{}}`-blokken; `hour-heatmap` heeft geen mobiele behandeling (geen `@media`) → naar classes.
- [ ] 🟡 Geen gedeelde skeleton (2 implementaties + stale `fillyShimmer` + hardcoded `#efeae0`) → één `<Skeleton>`.
- [ ] 🟢 Heatmap-tiers 3× gedefinieerd (CSS 2× + JS) → `--heat-0..4`-tokens; `880px` stray-breakpoint + `!important` op `.stats-row`-grid opruimen.

**UX (publiek + app)**
- [ ] 🔴 Geen vertrouwenssignalen op de publieke site (reviews/logo's/cijfers) — grootste conversielek → social proof boven de CTA.
- [ ] 🔴 Prijzen-pagina volledig geblurd (`HIDE_PRICING`) en doodlopend → prijs-range of eerlijke uitleg + directe CTA.
- [x] ~~🔴 Geleide campagne-flow stuurt bij 0 resultaten stil naar `/campagnes`~~ (✅ 2026-06-18, bevestigd 2026-06-22) — blijft nu in de flow met inline-melding (`errors.noResult`, `setStep("channels")`); de melding krijgt `role="alert"` zodat een screenreader 'm aankondigt.
- [x] ~~🔴 Geen `aria-live` op Filly-antwoorden + "maakt voorstel"-staat~~ (✅ 2026-06-22) — typ-indicator had al `aria-live`; nu ook `aria-live="polite"` op de berichten-container (kondigt nieuwe Filly-antwoorden aan, leest historie bij mount niet voor) + `role="alert"` op beide foutweergaven.
- [x] ~~🟡 Login toont rauwe Engelse Supabase-fout~~ (✅ 2026-06-22) — pure mapper `lib/auth-errors.ts` (`authErrorKey`, matcht op Supabase-`code` → message-substring → status 429) + `auth.errors.*`-keys in nl/en; login rendert nu `t(errors.<key>)` i.p.v. `error.message`. 4 gevallen: invalidCredentials / emailNotConfirmed / rateLimited / generic.
- [x] ~~🟡 Form-labels zonder `htmlFor`/`id` (login/contact/welkom/reset)~~ (✅ 2026-06-22) — 12 labels gekoppeld via `htmlFor`+`id` op login (2), forgot-password (1), reset-password (2), welkom (2), contact (5). Honeypot omsluit z'n input al (impliciet, aria-hidden) → ongemoeid.
- [x] ~~🟡 Contact-formulier: geen verwachting + "bericht" verplicht~~ (✅ 2026-07-01) — verwachting stond al in de intro ("vrijblijvende kennismaking"); `bericht` is nu optioneel (`required` weg) + label toont "(optioneel)".
- [~] 🟡 Inconsistente CTA-labels ("Vraag een demo aan"/"Plan een gratis kennismaking") → **VERVALT**: variatie is een bewuste keuze (zie beslissing/auto-memory "CTA-labels bewust gevarieerd"), niet consolideren.
- [x] ~~🟡 `/signup` stille redirect → korte uitleg-pagina~~ (✅ 2026-06-22) — `/signup` toont nu een "Op uitnodiging"-uitleg + CTA "Vraag een demo aan" → `/contact` + link naar inloggen, in dezelfde auth-stijl (`.login-box`). NL/EN via `auth.signup.*`. Geverifieerd: HTTP 200 (geen redirect), beide talen.
- [~] 🟡 Disabled knoppen ogen klikbaar + vage labels in de guided flow. **Labels ✅ 2026-07-01**: "Selecteer een optie" → "Kies minstens één kanaal", "Geen kiezen" → "Wis selectie" (NL+EN). **Rest open**: disabled knoppen ogen nog klikbaar → duidelijker disabled-stijl.
- [x] ~~🟡 Legacy-routes (`taken/`, `suggesties/`, `marketing/`) zonder terug-pad~~ (✅ 2026-07-07) — `taken/` + `suggesties/` bestaan al niet meer (verwijderd). `marketing/` (index + mail/instagram/facebook/tiktok, bereikbaar vanuit rapportages) heeft nu een gedeelde **"← Terug naar rapportages"**-link (`BackToReportsLink` + `common.backToReports`).
- [x] ~~🟡 Modals missen `aria-labelledby`~~ (✅ 2026-07-01) — de resterende modals (account-delete, team-invite, media-library-picker) hebben nu `role="dialog"` + `aria-modal` + `aria-labelledby` + Escape. Klikbare kaarten-focus-ring valt al onder de gedeelde `:focus-visible`-baseline in `globals.css`.
- [ ] 🟡 Concept-werk verloren bij weg-navigeren (review-reply) + geen succes-toast na goedkeuren → sessionStorage-autosave + toast met undo.
- [ ] 🟡 Campagne-detail: inconsistente actie-labels ("Terugtrekken" vs "Terug naar concept"), geen tijdzone-hint bij plan-veld, geen onopgeslagen-markering op de kanaal-tab.
- [x] ~~🟢 Em-dashes / `&mdash;` / `&middot;` in zichtbare copy~~ (✅ 2026-06-22) — sinds i18n staat de copy in `messages/{nl,en}.json`; 20 strings met em/en-dash opgeschoond volgens dezelfde regel als `naturalizeDashes` (dash → komma), brand-titel met punt. TSX-treffers waren enkel code-comments (niet zichtbaar) → ongemoeid.

### ⚙️ Backend
- [x] ~~🔴 **Schema-drift**: migratie 0044 ontbrak als `.sql`~~ (✅ 2026-06-22) — toegevoegd als `0044_restaurant_identity_extension.sql`. 0039 = bewust gereserveerd gat (geen migratie), 0056/0057 bestonden al → de reeks is nu sluitend t/m 0059 op één bewust gat (0039) na.
- [x] ~~🟡 Migratie-nummer **0043 dubbel**~~ (✅ 2026-06-22) — de schema-cleanup heeft een vrij nummer gekregen (`0060_drop_campaign_filly_variants.sql`); 0043 blijft de auto-archive.
- [ ] 🟡 `runScheduledSocial`: status-flip + publish niet transactioneel, geen overlap-guard → status-flip vóór de side-effects of een `rpc()`-transactie.
- [ ] 🟡 Read-modify-write op `variants`-jsonb zonder locking (lost update) in `selectVariant`/`editVariant`/`mutateChannel`/`refine` → `jsonb_set` via `rpc()` of `version`-kolom.
- [x] ~~🟡 Cron-precisie social: max 1×/dag op Vercel Hobby~~ (✅ 2026-06-25) — Pro actief, cron elk half uur. Zie "Geplande social-posts timing".
- [ ] 🟡 Multi-channel status-transitie zonder rollback — **(bevestigd, al P1)**.
- [ ] 🟡 Legacy `FORMAAT`-parsers + dead-code-kolommen (`filly_variants` e.d.) + dode API-functies — **(bevestigd, al P1 + Filly-audit #7)**.
- [ ] 🟢 ~62 zwakke types (`any`/`as`/`Record<string,unknown>`) in `apps/api` → per-tabel rij-types of lichte zod-validatie bij het inlezen.
- [x] ~~🟢 Schedule-suggestie-cache zonder TTL/invalidatie~~ (✅ achterhaald 2026-06-22) — niet meer van toepassing: de generator (`suggestSchedule` + `POST /:id/suggest-schedule`) is bij de mig-0043-opschoning verwijderd (zat aan het oude refine-paneel vast), dus `suggested_scheduled_for`/`_reasoning` worden nergens meer geschreven — geen cache meer om te invalideren. **Update 2026-06-22:** de `suggested_scheduled_*`-kolommen zijn weer in gebruik — bij approve schrijven we Filly's gekozen moment + reden er nu in (zie "Wanneer plaatsen"-card-item hieronder), dus de auto-suggestie + "waarom"-uitleg in de card zijn terug. Geen drop-kandidaat meer.
- [ ] 🟢 `findBundle` N+1 (per kanaal `findById`) — *(bewust uitgesteld 2026-06-25: al parallel, ≤6 kanalen, scopet op `restaurant_id`; batch-`IN` pas nodig bij >10-kanaal-bundels.)*
- [x] ~~🟢 Doc/comment 301 vs 308 bij apex→www~~ (✅ 2026-06-22) — CLAUDE.md (2×) + `config/seo.ts`-comment gelijkgetrokken op 308 + verduidelijkt dat het in code via `next.config.ts` `redirects()` gebeurt (niet in Vercel Domains).

### 🔒 Beveiligingen
- [x] ~~🔴 **AuthGuard niet globaal (allow-by-default)**~~ (✅ 2026-06-18) — nu APP_GUARD deny-by-default; 5 publieke controllers @Public(), lokaal geverifieerd.
- [x] ~~🔴 **Cron-secret-check niet constant-time**~~ (✅ 2026-06-18) — `timingSafeBearer` (sha256 + timingSafeEqual) in alle 3 cron-controllers.
- [x] ~~🔴 **Server-only keys in `get-filly-web`** (9 vars, incl. service_role)~~ — ✅ verwijderd (2026-06-18); enkel publieke `NEXT_PUBLIC_*` + OAuth-app/client-id's resteren.
- [x] ~~🔴 **Resend-webhook zonder signature-validatie**~~ (✅ 2026-06-18) — Svix-verificatie via rawBody; ⚠️ zet **`RESEND_WEBHOOK_SECRET`** (get-filly-api) om handhaving te activeren.
- [x] ~~🟡 **SSRF in website-analyzer**~~ (✅ 2026-06-25, `8605644`) — `assertPublicUrl` (DNS→IP) blokkeert loopback/private/link-local/metadata/CGNAT/multicast + IPv4-mapped IPv6; redirects worden handmatig per hop herchecked.
- [ ] 🟡 Publieke `/public/contact` + `/public/unsubscribe` zonder rate-limit/CAPTCHA → IP-rate-limit (Vercel WAF) op `/public/*`.
- [ ] 🟡 Storage-bucket `restaurant-assets` mist per-tenant path-RLS (tenant A kan in B's pad schrijven) → pad-prefix-RLS op `(storage.foldername(name))[1]`.
- [ ] 🟡 Pre-onboarding rate-limit in-memory (niet multi-instance-veilig) — **(bevestigd, al P1)** → gedeelde store (Supabase-tabel/Redis).
- [x] ~~🟡 Enkele cron-/bundle-queries scopen alleen op `group_id`/`campaign_id` zonder `restaurant_id`~~ (✅ nagelopen 2026-06-25) — mail-unsubscribe was de echte (cross-tenant) → gefixt (`8605644`). Campagne-admin-paden (publish/cron) scopen al op `restaurant_id`; de cron-due-query is bewust cross-tenant (verwerkt per restaurant) en de publieke TikTok-video-route is by-design publiek. Geen verder gat gevonden.
- [x] ~~🟢 `requireAccess` lekt 404 vs 403 (UUID-enumeration)~~ (✅ 2026-06-22) — niet-bestaand restaurant geeft nu dezelfde generieke 403 ("Geen toegang tot dit restaurant.") als bestaand-zonder-koppeling; verschil alleen nog server-side gelogd (debug). Non-member kan UUID-bestaan niet meer aftasten.
- ✅ **Geverifieerd OK** (geen actie): open-redirect-bescherming `/auth/confirm`, Meta-OAuth CSRF + state-cookie, AES-256-GCM token-crypto (random IV + auth-tag), multi-tenant dubbelscoping + RLS-backstop, Meta `signed_request`-HMAC-validatie, JWT-verificatie (JWKS + issuer).

---


## 🌍 Internationalisering NL/EN (gestart 2026-06-19, branch `feat/i18n`)

Doel: hele frontend tweetalig (NL + EN) met taalwisselaar rechtsboven. Stack:
**next-intl v4** + `app/[locale]/`-routing, `localePrefix: "as-needed"` (NL =
kale URL, EN = `/en`). Berichten in `apps/web/messages/{nl,en}.json`. Werk
gebeurt in kleine stappen met een build + commit per groep; nog **niet gepusht**
naar main.

**Architectuur-keuzes:**
- Alle routes onder `app/[locale]/`; `[locale]/layout.tsx` is de root-layout.
- Machine-route-handlers (`/auth/*`, `/oauth/*`) + metadata (`robots`/`sitemap`/
  icons) bewust op `app/`-root → vaste URLs + externe callbacks intact.
- Middleware = next-intl-routing + bestaande Supabase-auth-gates samengevoegd
  (auth-padmatching op pad zónder locale-prefix; redirects behouden taal+cookies).
- Navigatie via `@/i18n/navigation` (`Link`/`useRouter`/`usePathname`/`redirect`)
  i.p.v. `next/*` zodat de actieve taal meegaat.

**Status:**
- [x] ~~Fase 1: fundament + home + navbar + taalswitcher~~ (✅)
- [x] ~~Fase 2a: product + pricing~~ (✅, incl. mock-widgets + FAQ-JSON-LD)
- [x] ~~Fase 2b: auth-flow (login/signup/forgot/reset + PasswordStrength)~~ (✅)
- [x] ~~Fase 2c: site-brede chrome (footer + cookie-banner)~~ (✅)
- [x] ~~Fase 2d: functionele publieke pagina's~~ (✅) — about, contact, welkom,
  invite/accept, u/[token] (unsubscribe), not-found, blog (index + CTA;
  blog/[slug] heeft geen UI-tekst). **Plus:** custom-404 hersteld na de
  [locale]-move via `[locale]/[...rest]/page.tsx` (catch-all → notFound),
  sync `not-found.tsx` (useTranslations), en root `app/layout.tsx` +
  `app/not-found.tsx` (taal-neutrale fallback voor paden buiten [locale]).
- [x] ~~Fase 2e: juridische + grote pagina's~~ (✅) — privacy, voorwaarden,
  onboarding, delete-data, account-verwijderd, data-deletion-status (via
  agent-workflow; nullable COMPANY-velden als ICU-arg met `?? ""`-fallback).
  ⚠️ **Engelse privacy + voorwaarden = 1-op-1 vertaling van de NL-concepttekst;
  jurist-check op de EN-versie aanbevolen vóór livegang** (NL-versie is formeel
  ook nog concept).
- [x] ~~Fase 3: **dashboard**~~ (✅) — chrome (sidebar/topbar + switcher) + 73
  bestanden (campagnes, account/team, gasten, google-business, marketing, menu,
  rapportages, reserveringen, reviews, suggesties, taken, koppelingen + alle 38
  gedeelde `_components`). Bulk via parallelle-agent-workflow (1 agent/bestand →
  NL/EN-fragment → deterministische merge), per batch geverifieerd: prod-build
  groen, alle literal `t()`-keys gevalideerd, navigatie-imports omgezet. Alleen
  `design-system` (interne dev-pagina) overgeslagen. Klein restpunt (fase 4):
  enkele datum-formatters gebruiken nog hardcoded `nl-NL` Intl-locale.
- [x] ~~Fase 4 (SEO-kern)~~ (✅) — `pageMetadata` locale-bewust (canonical per
  taal, `hreflang` nl/en/x-default, OG-locale nl_NL/en_US); publieke pagina's +
  root-layout via `generateMetadata` met gelokaliseerde title/description
  ("meta"-namespace); sitemap met beide talen + hreflang-alternates.
  Geverifieerd via prod-build.
- [x] ~~Fase 4 (polish, rest)~~ (✅) — gedeelde helper `src/lib/locale-format.ts`
  (`localeTag`/`useLocaleTag`, nl→nl-NL / en→en-GB); 27 dashboard-bestanden +
  `structured-data` (`inLanguage`) locale-bewust gemaakt (via workflow).
  → **i18n-frontend volledig afgerond.**
- [ ] **Bug: hero-apparaat-mockups op de homepage nog NL op `/en`** — de hero-
  tekst (titel/subtitle/CTA's) en "Waarom het werkt" zijn vertaald, maar de
  mockups ín de hero tonen nog hardcoded Nederlands: het laptop-scherm
  (`MiniDashboard` in `app/[locale]/page.tsx`) + de telefoon (`LandingPhone`)
  en `LandingFillyChat` (`components/landing-*.tsx`). Strings extraheren naar de
  `home`-namespace + `t()`. (Geconstateerd door Floris op iPhone + laptop, 2026-06-21.)
- [ ] Follow-up (los): Next 16 deprecate't `middleware` → `proxy` (warning in build);
  bewust níet in i18n-werk meegenomen (verandert runtime edge→nodejs op auth-pad)

**Buiten scope (apart spoor):** Filly's AI-antwoorden, review-replies,
campagnetekst en e-mails komen uit de api (Claude-prompts) en blijven NL tot we
de prompts een `locale` meegeven.

- [x] ~~Filly-CHAT in het Engels~~ (✅ branch `feat/filly-language`, mig 0059
  gedraaid) — kolom `restaurants.filly_language` ('nl'/'en') + toggle in
  account → Algemeen; `buildSystemPrompt` schakelt de antwoordtaal. ⏳ nog te
  mergen naar main.
- [ ] **Filly-Engels doortrekken naar de rest van de AI-output** — campagne-
  generatie, review-replies, geleide flow (generate-for-dates), suggesties en
  e-mails laten dezelfde `filly_language`-kolom lezen en hun prompts in het
  Engels laten schrijven. Zelfde kolom, andere prompt-plekken (o.a.
  `campaigns`-service, `suggestions`-service, review-reply-prompt, mail-templates).

---


## 🔧 Filly-flow developer-audit (2026-06-12) — één voor één afwerken

Bevindingen uit de code-audit van de Filly-keten (chat → geleide flow →
generate-for-dates → brein/events/reach). Geordend op aanpak-volgorde
(boven = eerst); werk van boven naar beneden.

- [x] ~~**1. Pure-functie-testsuite**~~ (2026-06-12) — Jest-suite (ts-jest, al geconfigureerd) voor de deterministische kernfuncties: `extractGuidedStart`, `checkCopyLength`+`findLengthViolations`+`buildLengthRetryInstruction`, `getNlHolidays`+`buildExternalFactorsBlock`+`salaryContext`+`seasonContext`, `suffixCandidates`+`stripPlaceSuffix`+`prettify`+`normalizePlace`+`isExactPlaceMatch`+`isContainedPlaceMatch`, `haversineKm`, `mapCampaignTypeToChannel`. 6 nieuwe spec-files + de kapotte boilerplate-spec gefixt (SupabaseService-stub + juiste greeting). **43 tests, 7 suites, groen** via `pnpm --filter api test`. Specs uitgesloten van de build (tsconfig.build `**/*spec.ts`).
- [x] ~~**2. Deterministische NL-datum-parsing**~~ (2026-06-12) — `resolveDutchDate(phrase, today)` in `common/dutch-date.ts` (Europe/Amsterdam-anker; vandaag/morgen/overmorgen, kale weekdag, volgende-week-weekdag, weekend, "DD maand [jaar]", feestdag-namen via getNlHolidays). Het LLM emit nu `day_phrase` (de dag letterlijk) i.p.v. een zelf-berekende ISO-datum; `extractGuidedStart` rekent 'm om. ISO-`date` blijft als fallback voor carry-forward. 10 resolver-tests + 2 extractGuidedStart-tests. **55 tests groen.**
- [x] ~~**3. Events-tabel opschonen**~~ (2026-06-12) — `prunePastEvents()` (`delete from events where starts_on < today`) aan het eind van de wekelijkse `runSync`; fail-soft + count in de log. event_places-cache blijft.
- [x] ~~**4. Logging consistent maken**~~ (2026-06-12) — alle `console.warn`/`console.error` in chat.service + suggestions.service vervangen door `this.logger.*`; eslint-disable-regels + stale "geen logger"-comment weg.
- [x] ~~**5. Dag-rekenlogica gededupliceerd**~~ (2026-06-12) — `UpcomingActionsBlock` consumeert nu `useActionableDays` (hook uitgebreid met `coveredLowOccupancyCount`/`coveredSpecialCount`); de ~80 regels gedupliceerde fetch + filter-logica zijn weg → drift-risico opgelost, één bron-van-waarheid. **Bewust níet aangeraakt (negligible/te invasief):** (a) `day-context` fetcht coords 2× — twee triviale queries, niet in een loop; deduppen vereist signatuur-wijziging op findNearby + getForecastForRestaurant (ook elders gebruikt). (b) cross-component dubbel-fetch (block + flow roepen elk de hook) — vereist een gedeelde provider/React-Query; aparte optimalisatie.
- [x] ~~**6. Multi-channel parallel i.p.v. sequentieel**~~ (2026-06-12) — de per-kanaal-generaties draaien nu via `Promise.all` (latency = traagste kanaal i.p.v. de som; ~15-30s → ~die van één call). Elk kanaal houdt z'n eigen lengte-guard, volgorde + fail-soft behouden. **Gekozen voor parallel i.p.v. één-call-schema:** lost de UX-pijn (wachttijd) met near-zero risico op; de kosten-optimalisatie (1 call i.p.v. N via een channels[]-schema) blijft een mogelijke vervolgstap maar verandert de LLM-output en is niet vanaf dev te testen. ⚠️ Live verifiëren dat een multi-channel-bundel snel + correct genereert.
- [ ] **7. Legacy dood gewicht opruimen** — de oude FORMAAT-parsers (`extractCampaignProposal/Bundle/Choice/DateChoice`) + chat-kaarten staan er nog "als vangnet" maar het LLM emit ze niet meer: bewust verwijderen óf documenteren waarom ze blijven. Idem `row: Record<string, unknown>` in `generateForSelectedDates` → echt type geven.
- [x] ~~**8. (Architectuur, grootste klus) één `active_action`-state**~~ (2026-06-12) — gekozen voor **optie A**: één gepersisteerde lopende actie per gesprek (`active_action` jsonb-kolom op `chat_conversations`, migratie **0056**) waar zowel de geleide flow als de chat-LLM op lezen/schrijven. **Backend:** `ActiveAction`-type + `ActiveChatState.activeAction`; pure helpers `mergeActiveAction`/`sanitizeActionInput`/`formatActiveActionBlock` (12 unit-tests); `getActiveAction`/`updateActiveAction`/`setActiveAction` (server-authoritative merge); `sendMessage` vervangt de tekst-annotatie-workaround door één deterministisch `[LOPENDE ACTIE]`-promptblok, merget een `FILLY_START_GUIDED`-emit in de state en vult de kaart vanuit de gemergede actie (topic-only emit behoudt de eerder gekozen datum — de kern-bug); `PATCH /chat/conversations/:id/active-action`; prompt-instructie aangepast ("systeem houdt de datum vast, laat day_phrase weg"). **Frontend:** `updateChatActiveAction`-fetch; `FillyChat` houdt de actie als lifted state (geseed uit elke load/switch/new, bijgewerkt uit de send-respons); `FillyGuidedFlow` PATCHt de gekozen dag (auto-start schrijft níet terug zodat een nieuwere actie niet geclobberd wordt) + wist de actie bij afronding/herstart. **67 tests groen, typecheck web+api schoon.** ⚠️ Migratie 0056 moet in Supabase gedraaid zijn vóór deploy; LLM-gedrag (datum/thema-carry-forward) is niet vanaf dev te testen → live verifiëren. Legacy-parsers (audit #7) bewust ongemoeid.

---


## ⏭️ Eerstvolgende open taken (begin volgende chat hier)

Laatst bijgewerkt einde sessie 2026-05-21 (laat) — Vindbaarheid-hub
+ Identiteit-verhuizing + auto-archive + restore-uit-historie +
progress-checklists herschreven.

> **Update 2026-06-11 (verificatie-sweep code + live site):** deze sectie
> liep achter. Billing gaat via **Stripe**, niet Mollie (besluit 2026-05-30).
> Optie #2 hieronder is inmiddels vrijwel volledig af. De opties zijn
> hieronder gecorrigeerd; de "State"-lijst erboven is een momentopname
> van 2026-05-21 en bewust ongewijzigd gelaten.

**State op dit moment**:
- Demo-account `floriskoevermans@outlook.com` met restaurant_id
  `a462cf39-ef9b-49cb-bd8e-a84a10a3f888` gevuld met realistische
  data.
- **Migraties t/m 0042 in productie** (NB: 0039 bestaat niet,
  gereserveerd voor encrypted API-key-storage; volgende vrije = 0043).
- **Hosting compleet** (2026-05-21):
  - Frontend Vercel: `https://get-filly-web.vercel.app` (basic-auth
    `DEMO_AUTH_USERNAME` + `DEMO_AUTH_PASSWORD`).
  - ~~Backend Railway~~ → **gemigreerd naar Vercel** (2026-05-28/29, zie de afgevinkte migratie-entry hierboven): api draait als serverless functions (regio `fra1`) op `https://get-filly-api-three.vercel.app/api`. `railway.json` is legacy.
  - **Node 22.x verplicht** (engines + .nvmrc) voor jose@6 ESM-only. CORS leest `WEB_URL` + `CORS_ORIGINS` uit env.
  - Vercel env `NEXT_PUBLIC_API_URL` wijst naar de Vercel api-URL (`-three`).
  - CI groen sinds Suspense-fix `28bdfe2`.
- App is responsive op 320–1280px (geen horizontale pagina-scroll). Dashboard-breakpoints 1280/1024/900/768/480, publiek 880/640/480/360. Sweep-2 op 2026-06-02 (zie changelog) fixte de resterende mobiel-gaten.
- Tool-use migratie compleet — geen JSON.parse-fouten meer mogelijk.
- **Per-request Supabase-client live (2026-05-01)** — RLS-policies
  blokkeren cross-tenant reads/writes hard op DB-niveau. Alleen
  bewuste admin-flows draaien nog op service_role.
- **Campagnes-revisie 2026-05-12 (commits `720ae5a` + `1df6037`)**:
  - Unified kanban-card-layout door alle 4 statussen heen: titel +
    prominente datum onder titel + lichtgroene kanaal-chips + status-pill
    (✓ Alles compleet / ⚠ wat mist) + status-specifieke knoppen.
  - Acties per status: Voorstel = ✓ Goedkeur + × Afwijzen; Concept =
    📅 Plan in + × Verwijderen; Ingepland = ↩ Terugtrekken; Actief =
    read-only. Hoofdknop disabled tot ready; klik op grijs navigeert
    naar detail.
  - Detail-page voorstel: nieuw "Missende aspecten"-blok per kanaal
    + 📅 Direct inplannen-knop met confirm onder Goedkeur/Afwijzen.
  - Backend status-transities uitgebreid: concept→actief (voor "Activeer
    nu" toekomstig) en ingepland→concept (voor Terugtrekken).
  - Migratie 0040: soft-delete via `campaigns.deleted_at`. Verwijderde
    campagnes verschijnen in `/campagnes/history` onder tab "Verwijderd"
    naast "Afgerond".
  - Shared lib `apps/web/src/lib/campaign-checks.ts` met missing-field-
    logica (date/body/subject/photo); foto-vereiste alleen IG + TikTok.
  - UpcomingActionsBlock extracted naar shared component (gebruikt op
    dashboard + /campagnes).
  - MediaLibraryPicker upload + drag-drop direct in de modal ipv
    doorverwijzing naar Account-pagina.

### Volgende sessie — kies één van deze drie

1. **🔴 P0: Stripe-billing flow** (was Mollie; besluit 2026-05-30 =
   Stripe) — eerste klant kan niet betalen zonder. 4 sub-taken: SDK
   installeren + checkout-flow op pricing-pagina, migratie
   `subscriptions`-tabel (plan/status/stripe_customer_id),
   plan-enforcement in backend (limieten op AI-calls/campagnes/teamleden
   per plan), Stripe webhook voor status-changes (trial → active →
   past_due → cancelled). **Vereist**: Stripe-account (zakelijk).
   Per 2026-06-11 nog volledig onaangeraakt — grootste launch-blokker.

2. ~~**🟡 P1: Site-fundamenten (publieke site)**~~ — **vrijwel af per
   2026-06-11**: contact-formulier, 404, sitemap, robots, OG-images,
   About-pagina én footer staan allemaal live. Resteert alleen nog:
   blog-content (eerste 4 artikelen), Google Search Console + Bing
   aanmelden, beeldoptimalisatie en de `sameAs`-URL's (zie P1-sectie).

3. **🟡 P1: Resend SMTP + email-confirmation weer aan** — Resend
   onder Supabase Auth → SMTP Settings configureren. Lost 3-4/uur
   rate-limit op. Daarna `Confirm email` weer aanzetten in Supabase
   Dashboard zodat fake-signups in productie geweerd worden.
   **Vereist**: Resend-account (overlap met taak #2).

### Mijn aanbeveling

**Begin met #1 (Stripe-billing)**. Het is de enige resterende
P0-blokker voor de eerste betalende klant — zonder kun je niet
live. Accountwerk (Stripe zakelijk) is sowieso onvermijdelijk en
kan parallel met de technische implementatie.

Site-fundamenten (#2) zijn inmiddels vrijwel af; #3 (Resend SMTP
voor Supabase Auth) staat nog volledig open en is klein.

### Andere vermeldenswaardige open punten

- **🔴 Test-account FK-cascade fix** (COO P0) — `auth.user` delete
  laat wees-restaurants achter. Of DB-trigger + cascade, of een
  reset-script. Niet acuut want we gebruiken nu het demo-account
  vanuit `floriskoevermans@outlook.com`.
- **🟡 Resend SMTP voor Supabase Auth** — lost de 3-4/uur rate-
  limit op. Email-confirmation kan dan weer aan in dev. Vereist
  Resend-account.
- **🟡 Geocoding-backfill-script** — bestaande restaurants zonder
  lat/long. Bij demo-account: gebruik `update restaurants set
  latitude=..., longitude=... where id='...'`-snippet als de
  WeatherForecast-card '—' toont.
- **🟢 Platform-specifieke output per social-media-post** (P2 in
  Filly AI-features) — Floris-verzoek 2026-04-30 om te bepalen
  welke output per kanaal optimaal is. Vereist tool-schema +
  prompt per campaign_type + nieuw social_platform-veld.


## Audit 2026-04-29 — Bevindingen per rol

Markers: 🔴 P0 kritiek · 🟡 P1 productie-hygiëne · 🟢 P2 verbetering.
Items in deze sectie staan los van de hoofd-prio's hierboven; bij oppakken
verplaatsen naar de juiste P-bucket.

### Data Analyst
- [x] ~~🔴 Mock-data van dashboard af~~ (2026-04-29) — `FILLY_MOCK` weggehaald uit kpi-row, alle "door Filly"-onderregels weg. Komen pas terug als reservations.via_campaign_id-FK gevuld wordt door de send-engine.
- [x] ~~🔴 `isFromFilly()` is een hash-mock~~ (2026-04-29) — gasten-pagina: hele "Via Filly"-kolom + stat-card weg. Reserveringen-pagina: nu gebaseerd op echte `source`-veld (alleen "filly"-source matcht), niet meer op hash.
- [x] ~~🔴 `reservations.via_campaign_id` FK ontbreekt~~ (2026-04-29 — migratie 0022) — ook `guests.acquired_via_campaign_id`. Reserveringen-pagina heeft nu een dropdown om handmatig te koppelen. KpiService berekent op basis van deze FK Filly-ROI; rapportages-pagina toont 6-maanden grafiek + per-campagne tabel.
- [x] ~~🔴 `FILLY_ROI_6M` + `FILLY_BY_TYPE` in rapportages~~ (2026-04-29) — hard-coded arrays + ROI-sectie weg, vervangen door eerlijke "Filly-ROI nog niet meetbaar"-empty-state. Komt terug zodra send-engine attributie heeft.
- [x] ~~🟡 **`weekday_avg_pct = 68` hard-coded**~~ (2026-04-30) — vervangen door 3-staps cascade in `computeWeekdayAvgPct`: (1) eigenaar-target (nieuwe `restaurants.target_weekday_occupancy_pct` via mig 0027) → (2) 6-maanden ma-vr aggregaat als ≥30 datapunten → (3) fallback 68. Eigenaar kan target zelf instellen op account-pagina (Capaciteit-sectie).
- [x] ~~🟡 **`audit_log`-tabel** — alle relevante writes live~~ (2026-04-30 fase A). `AuditLogService` integraties: `CampaignsService` (created/status_changed/deleted), `RestaurantService` (updated/website_analyzed), `ReservationsService` (attribution_set), `MenuService` (item_created/updated/deleted + card_imported/removed), `ReviewsService` (response_updated), `OnboardingService` (onboarding_completed). Alle service-signatures ontvangen nu een echte `userId` (controllers reiken `@CurrentUser` door). Bij menu-card-import kan userId null zijn (pre-onboarding-uploads).
- [ ] 🟡 **`ai_usage` tracking heeft geen dashboard** — Claude-kosten zijn alleen via DB-query zichtbaar. Mini-page voor admin om kosten per restaurant te zien.
- [ ] 🟢 **Geen Plausible/PostHog** op publieke site — onbekend waar bezoekers afhaken.

### Developer
- [x] ~~🔴 Storage-bucket `restaurant-assets` had `anon insert/update`-policies~~ (2026-04-29 — migratie 0021) — nu alleen `authenticated`-rol mag schrijven. Anon-read blijft (publieke logo-vertoning in mail-templates). Toekomst: per-restaurant path-prefix RLS.
- [x] ~~🔴 **Backend draait op `service_role`** → RLS bypass'd~~ (2026-05-01) — `RequestSupabaseService` (Scope.REQUEST) live; 13 services gemigreerd. RLS-policies nu defense-in-depth actief. Test bewees: cross-tenant SELECT → `[]`, cross-tenant INSERT → HTTP 403. Bewust op service_role gebleven: AuditLog/Anonymization/AccountDeletion/Onboarding/AiService(ai_usage)/TeamService(auth.admin).
- [ ] 🟡 **Pre-onboarding rate-limit is in-memory Map** → overleeft geen multi-instance deploy. Naar Redis/Upstash.
- [ ] 🟡 **Geen tests behalve `app.controller.spec.ts`** — 8.500 regels backend, één spec. Minimaal smoke-tests op auth + tenant-isolatie + key endpoints.
- [x] ~~🟡 Geen GitHub Actions CI~~ (2026-04-29) — `.github/workflows/ci.yml` toegevoegd: typecheck (api + web) + build (shared + api + web) per PR + push naar main. pnpm cache + concurrency-cancel voor snelle runs.
- [ ] 🟡 **WebsiteAnalyzer + MenuImporter zijn synchroon** (5-15s blocking). Bij gelijktijdige uploads loopt Node-process vast. Job-queue (BullMQ + Redis) toevoegen.
- [~] 🟡 **TODO's in code** — kpi.service.ts (weekday-avg) staat nog open. kpi-row.tsx (FILLY_MOCK) en suggesties/page.tsx (getMockProposal) zijn beide opgeruimd 2026-04-29 / 2026-04-30.
- [ ] 🟢 **Inline styling overal** — `style={{...}}` in elke component. Refactor naar Tailwind / CSS-modules voor onderhoudbaarheid op schaal.
- [x] ~~🟢 **`RestaurantService.update` accepteert `Record<string, unknown>`**~~ (2026-04-30) — vervangen door `RestaurantUpdateSchema` (zod) in `restaurant-update.schema.ts`. Allowlist via inclusion-in-schema; default `.strip` (niet `.strict`) zodat bestaande frontend die hele form-object stuurt niet breekt. Wel hygiëne-log van gefilterde keys via `logger.debug`.
- [ ] 🟢 **`@RequireModule`-decorator** voor module-permissies ontbreekt (alleen frontend-filtering).

### CTO
- [~] 🔴 **20 migraties handmatig** — setup-guide in [docs/database-migrations.md](docs/database-migrations.md). **Jouw actie**: Supabase CLI installeren + `supabase migration repair` runnen om bestaande migraties als applied te markeren.
- [x] ~~🔴 Prompt-caching activeren~~ (2026-04-29) — `cache_control: ephemeral` actief in `AiService` op chat + campaign-refine + reviews-refine. ~90% korting op input-tokens bij recurring calls binnen 5 min cache-TTL.
- [~] 🔴 **Sentry / error-tracking** — setup-guide in [docs/sentry-setup.md](docs/sentry-setup.md). **Jouw actie**: account aanmaken + 2 projecten + DSN's invullen.
- [~] 🔴 **Cost-alerts Anthropic** — setup-guide in [docs/anthropic-cost-alerts.md](docs/anthropic-cost-alerts.md). **Jouw actie**: monthly spending limit + alerts in Anthropic Console + aparte API-keys per environment.
- [~] 🟡 **Staging-omgeving** — setup-guide in [docs/staging-setup.md](docs/staging-setup.md). **Jouw actie**: 2e Supabase-project + 2e Railway-instance + Vercel preview-branch.
- [ ] 🟡 **Geen feature-flag systeem** — bij 1000+ klanten kan een release niet veilig naar 5% eerst.
- [~] 🟡 **Multi-instance scaling roadmap** — gedocumenteerd in [docs/scaling-roadmap.md](docs/scaling-roadmap.md). Concrete actie pas nodig bij ~100+ klanten (Redis voor rate-limits, BullMQ voor zware AI-calls).
- [x] ~~🟢 Graceful degradation bij Claude-downtime~~ (2026-04-29) — `AiService` vangt nu Anthropic-errors specifiek af (connection / rate-limit / 5xx / auth) en gooit NL-vriendelijke `ServiceUnavailable` i.p.v. raw 500.
- [x] ~~🟢 DB-schema-documentatie~~ (2026-04-29) — [docs/database-schema.md](docs/database-schema.md) met overzicht van alle 25 tabellen + relaties + open punten.

### CEO
- [ ] 🔴 **Stripe-billing ontbreekt** (was Mollie; besluit 2026-05-30 = Stripe) — eerste klant kan niet betalen. 4 sub-taken: SDK + checkout, subscriptions-tabel, plan-enforcement, webhook. Zie P0 → Billing.
- [~] 🔴 **Privacy-verklaring + AV** — dynamisch rendering live (2026-04-30) via `apps/web/src/config/company.ts`. Banner verdwijnt zodra `legalName + kvk` ingevuld zijn. **Jouw actie**: KvK-inschrijving + bedrijfsgegevens invullen in `config/company.ts` + jurist-review boeken.
- [x] ~~🔴 Cookie-banner ontbreekt~~ (2026-04-29) — `<CookieBanner />` in root-layout, accept/reject keuze in localStorage. Klaar voor wanneer Plausible/PostHog wordt aangezet (analytics-init achter consent-check).
- [ ] 🔴 **Geen "Start trial / Probeer gratis"-flow** vanaf pricing-pagina.
- [x] ~~🟡 Geen onboarding-checklist op dashboard~~ (2026-04-30) — `OnboardingChecklist` bovenaan dashboard-home toont 6 setup-stappen met progress-bar; verbergt zich zodra alles ✓.
- [ ] 🟡 **Geen referral / vriend-werft-vriend**-systeem.
- [x] ~~🟡 **About-pagina is leeg / placeholder**~~ (afgevinkt 2026-06-11) — `/about` gevuld met missie + pijlers + roadmap, live.
- [x] ~~🟡 **Geen contactformulier** op publieke site~~ (afgevinkt 2026-06-11) — `/contact` live sinds 2026-05-30, zie P1 → Site-fundamenten.
- [ ] 🟢 **Concurrent-positionering** (vs. Resengo/Zenchef) onduidelijk in marketing.

### COO
- [ ] 🔴 **Geen interne admin-tooling** — klant-support gebeurt via Supabase Studio. Onhoudbaar bij 50+ klanten.
- [ ] 🔴 **Test-account opruimen heeft FK-cascade-gotcha** — auth.user delete laat wees-restaurants achter.
- [ ] 🟡 **Geen klanten-dashboard** ("welke klanten hebben KvK ingevuld? wie heeft Filly nooit gebruikt?").
- [ ] 🟡 **Geen incident-response runbook** — wat doe je als Claude API down is, Supabase storage faalt?
- [x] ~~🟡 Geen klant-data-export~~ (2026-04-29) — `GET /restaurant/me/export` endpoint met blob-download via `downloadRestaurantExport`. Geeft alle business-data (restaurant, gasten, reserveringen, menu, campagnes, reviews, chat, audit-log) in één JSON-bestand. Knop op account-pagina sectie "Data & privacy".
- [x] ~~🟡 **Logging is inconsistent**~~ (2026-06-11) — api: overal NestJS `Logger` (0× `console.*`). Web: alle 20 `console.error`-calls vervangen door `lib/logger.ts` — server-side (route-handlers) logt altijd (Vercel function-logs), client-side alleen in development. De logger is hét toekomstige hook-punt voor Sentry `captureException`. **Log-aggregator zelf = het bestaande Sentry-item (CTO-sectie / P1 Monitoring).**
- [ ] 🟡 **Geen rate-limit per user op AI** (alleen 100/uur/restaurant). Eén user kan binnen 1 uur €5-10 verbranden.
- [ ] 🟢 **Geen monitoring** Claude/Supabase uptime — storingen alleen via klant-mails.

### Designer
- [x] ~~🔴 Niet mobile responsive~~ (2026-04-30) — alle 5 fasen afgerond. Zie hoofdsectie "Dashboard algemeen → Mobile responsive pass".
- [x] ~~🟢 KPI-row breekt onder 1280px~~ (2026-04-30) — KPI-row 5→2→1 cols via responsive pass.
- [~] 🟡 **Inline styling overal — design-tokens-laag toegevoegd** (2026-04-30 fase 1+2+3) — `tokens.css` is nu single source-of-truth (kleuren, spacing, radii, shadows, typography). globals.css + dashboard.css duplicaten weg; oude korte aliases (`--ts`/`--bl`/`--blue`/`--r`) blijven werken via aliases. Spacing-pas op dashboard-home + account-formulieren naar 8px-grid. **Nog open**: incidenteel inline `style={{...}}` vervangen wanneer je toch in een file zit.
- [~] 🟡 **Iconen-set is volledig emoji** (2026-04-30) — Lucide-react geïnstalleerd; selectief gemigreerd voor functionele controls (chat-send, modal-close, photo-replace, topbar burger/bell/search). Brand-decoratieve emoji's (✨ Filly-sparkle, 📷, 📄, 🍷, ⚠️ + sidebar-iconen) blijven bewust staan.
- [ ] 🟡 **Geen focus-states / aria-labels** op veel knoppen → WCAG-toegankelijkheid onder de maat.
- [x] ~~🟡 **`filly-chat.tsx` is 635 regels**~~ (2026-04-30) — gesplitst zoals voorgesteld; orchestrator nu 331 regels, sub-components gemiddeld <100 regels.
- [ ] 🟢 **Geen dark-mode**, geen i18n-voorbereiding (alles hard-coded NL).
- [x] ~~🟢 **Inconsistente knop-stijlen — base-component toegevoegd**~~ (2026-04-30 fase 1+2A) — `<Button variant="primary|secondary|ghost|danger" size="sm|md">` in `components/ui/button.tsx` + `<ButtonLink>` voor Link-as-button. **35 dashboard-knoppen gemigreerd** in 12 files (dashboard/account/campagnes/menu/gasten/reserveringen + 3 modal-components). `.btn-primary-dash` / `.btn-secondary-dash` CSS-classes blijven bestaan voor de paar resterende plekken (legacy onbelangrijke knoppen).
- [~] 🟢 **Geen Storybook / design-systeem documentatie** (2026-04-30) — light-weight reference-pagina op `/dashboard/design-system` toont alle tokens + 8 base-components (Button/ButtonLink/Badge/Card/PageHeader/EmptyState/Tabs/Input+Textarea) met live demos. Echte Storybook later als de component-library groeit.

---


## Recent voltooid

### 2026-06-22 — TikTok volwaardig campagne-kanaal + guided-flow reasoning-fix

**TikTok als campagne-kanaal** (branch `feat/tiktok-campaign-channel`, live op main): TikTok is nu eersterangs naast mail/instagram/facebook/whatsapp/google_business — kanaalkeuze, bundel, campagne-detail, publiceren-bij-activeren (Direct Post via `directPost`, SELF_ONLY in sandbox), video-upload (mp4/mov/webm, 50MB) + publieke serving-route `/media/c/:campaignId` voor PULL_FROM_URL op het geverifieerde domein, en een admin-clientpad in TikTokService zodat ook de cron publiceert. Domein `get-filly.com` + `www.get-filly.com` geverifieerd in de sandbox.

**Guided-flow reasoning-fix** (branch `fix/guided-flow-channels`): drie bugs bij een getypt verzoek als "ik wil een tiktok campagne". (1) Een kanaal-wens belandde als vrije tekst onder de gerecht-hoek → backend scheidt nu `channels` van `topic` in FILLY_START_GUIDED (`extractGuidedStart` + prompt + GuidedStartCard + carry-forward via active_action). (2) Angles waren multi-select → nu single-select (radio). (3) Op de kanalen-stap stonden alle recommended kanalen aangevinkt ongeacht het verzoek → bij expliciete kanalen worden alléén die voor-aangevinkt, anders terugval op recommended. FillyChat geeft `initialChannels` door aan FillyGuidedFlow. API-suite 94 tests groen (+4 voor channels-parsing). **Live te verifiëren:** welke channels het LLM daadwerkelijk emit is niet vanaf dev te testen.

### 2026-06-22 — Homepage-pijlers vertaald (NL/EN)

Live (merge `0ec2912`). De pijler-sectie op de homepage ("Meer gasten. Volle tafels." + de drie blokken Vindbaarheid / Zichtbaarheid / Bereikbaarheid: eyebrow, titel, desc, bullets) was hardcoded NL en bleef dus NL op `/en`. Verplaatst naar `home.pillars` in `messages/{nl,en}.json` (bullets als array via `t.raw().map()`, sectietitel via `t.rich` met `<br>`). **NB:** de hero-apparaat-mockups (MiniDashboard-nav/KPI + LandingPhone + LandingFillyChat) staan nog steeds apart open als NL-op-/en (zie i18n-sectie) — dat is een ander blok.

### 2026-06-22 — Schema-cleanup: legacy campaigns.filly_variants gedropt (mig 0060)

Gemerged naar `main` + live (merge `e747c68`), branch `chore/mig-0043-drop-filly-variants`. Afronding van de "Mig 0043"-cleanup uit de BACKLOG:

- **Code (stap 1):** alle resterende write-paden naar `campaigns.filly_variants` / `filly_variants_regen_count` / `variant_applied_at` verwijderd — de create-seed in `campaigns.service` + de hele `seed_variants`-keten in `campaigns.service` en `suggestions.service` (beide approve-routes) + de twee `variant_applied_at`-typevelden (api + web). `campaigns.variants[]` (sinds mig 0041) blijft de bron-van-waarheid.
- **DB (stap 2):** `0060_drop_campaign_filly_variants.sql` dropt de drie kolommen. Nummer 0060 omdat 0043 al bezet was (auto-archive). `reviews.filly_variants` (andere tabel) blijft.
- Verificatie: api Jest 90/90 groen, `tsc` schoon (api + web), geen lees/schrijf-refs meer naar de kolommen.
- ⚠️ **Incident-leerpunt:** de DROP-SQL is gedraaid vóórdat de code-deploy groen was → kort venster waarin campagne-inserts faalden (geen data-schade, failed inserts zijn atomair). Voortaan bij een kolom-drop strikt expand/contract: eerst code live, dán DROP.

### 2026-06-22 — Filly-flow a11y + /signup-uitlegpagina + requireAccess-hardening

Gemerged naar `main` + live (merge `9c6df70`), branch `fix/filly-flow-a11y`. Vier commits:

- **Filly geleide flow (a11y, 🔴):** de meeste a11y zat al goed (0-resultaten blijft in de flow, typ-/done-staat heeft `aria-live`) — laatste gaten gedicht: `role="alert"` op de guided-flow-foutmelding + chat-error-banner, `aria-live="polite"` op de berichten-container (kondigt nieuwe Filly-antwoorden aan, leest historie bij mount niet voor). Drie stale BACKLOG-items afgevinkt.
- **`/signup` (🟡):** stille redirect naar `/contact` vervangen door een echte uitlegpagina "Welkom bij Get-Filly" + CTA "Vraag een demo aan" + link naar inloggen, in de bestaande auth-stijl. NL/EN via `auth.signup.*`. `.login-btn` werkt nu ook als `<a>`. Live geverifieerd (HTTP 200, beide talen).
- **`requireAccess` (🟢, security):** niet-bestaand restaurant gaf 404, bestaand-zonder-toegang 403 → nu beide dezelfde generieke 403 (anti-enumeration); verschil alleen server-side gelogd.

### 2026-06-22 — Schema-drift 0044 + quick-win batch (a11y, copy, login-fouten, dode code)

Gemerged naar `main` + live (merge `93990e9`), branch `fix/schema-drift-0044`. Zes commits:

- **Migratie 0044** (`0044_restaurant_identity_extension.sql`) — de 8 identiteit-velden op `restaurants` (`tone_of_voice`, `do_not_mention`, `brand_story`, `location_description`, `keywords`, `default_hashtags`, `awards`, `target_audience_segments`) die al sinds 2026-05-21 handmatig in Supabase draaiden maar nooit als `.sql` gecommit waren. Idempotent. SQL door Floris in Supabase gedraaid. **Correctie op oude BACKLOG-tekst:** 0039 is een bewust gereserveerd gat (geen migratie), 0056/0057 bestonden al — alleen 0044 ontbrak.
- **Copy/doc:** 20 zichtbare strings met em/en-dash opgeschoond in `messages/{nl,en}.json` (zelfde regel als `naturalizeDashes`); doc-comments 301→308 gelijkgetrokken (apex→www zit in code via `next.config.ts`).
- **a11y:** gedeelde `:focus-visible`-baseline in `globals.css` (publiek + dashboard); 12 form-labels via `htmlFor`/`id` gekoppeld (login/forgot/reset/welkom/contact).
- **Login:** rauwe Engelse Supabase-fout vervangen door NL/EN-microcopy via `lib/auth-errors.ts` + `auth.errors.*`-keys.
- **Dode code:** 4 ongebruikte campagne-componenten (~57 KB) + 4 ongebruikte `lib/api.ts`-functies verwijderd; backend `GET :id/variants` / `POST :id/refine` / `PATCH :id` / `POST :id/suggest-schedule` + service-methodes (~635 regels) gesloopt. `refine` was de laatste write-path naar `campaigns.filly_variants` → mig-0043-kolom-cleanup nu onblokkeerd.

### 2026-06-17 — Publieke site: kennishub "De marketing cocktail", home-sectie "Waarom het werkt" + eyebrow-consistentie

Visuele ronde op de publieke site (live op **www.get-filly.com**), in losse branches vanaf `main` gebouwd en per onderdeel gepusht.

- **/blog → kennishub "De marketing cocktail"**: de blog-index herontworpen (was "binnenkort"-lijst) naar één uitgelicht groen pijler-artikel + 6 kernpunt-kaarten + "Meest recent"-strip. Witte achtergrond + groene gloed (identiek aan `.product-walkthrough`), kaarten in `.blog-card`-stijl. Kaarten zijn klikbaar en tonen een "Deze post komt binnenkort online"-toast; ze worden **automatisch echte `<Link>`s** zodra er een artikel met dezelfde `slug` in `content/blog/` staat. Pagina blijft `noindex` zolang er geen gepubliceerde posts zijn. Nieuw: `app/blog.css`, `app/blog/blog-index.tsx` (client). Titel "Kennishub" → "De marketing cocktail".
- **Home — nieuwe sectie "Waarom het werkt"** direct na de hero met 4 kernpunt-kaarten (Gegevens 18% / Profiel 2,3× / Reviews / Posten), doorlink naar `/blog`. Kaarten poppen één-voor-één op via de site-brede scroll-reveal (`data-reveal` op een wrapper, reveal-snelheid 1,4s ease afgestemd op de `.hero-diff` fade-up). Hero + "Waarom het werkt" + pijlers staan nu in één `.home-flow`: één witte achtergrond met één doorlopende groene gloed (losse achtergronden/gloeden + hero-raster van die 3 secties uitgezet).
- **/about**: intro → "Het beste restaurant zit niet altijd vol. De best vindbare wel." (die zin niet meer dubbel met de "Ons verhaal"-opening, die start nu met "We zagen het overal:"); Missie & Visie-labels als groene eyebrows (zoals VINDBAARHEID); "Wat ons drijft"-kaarten uitgelijnd via simpele kolom-layout i.p.v. de `.hero-diff` subgrid (die klopt alleen mét nummer-cirkel).
- **Eyebrow-consistentie site-breed**: home-pijler-labels (Vindbaarheid/Zichtbaarheid/Bereikbaarheid) en de /product-stap-labels (Detectie t/m Resultaat) hebben geen pill meer en zijn groene eyebrows (12px/600/1px/uppercase, `var(--accent)`). De /product-stap leest nu als "DETECTIE: maandag · 09:14", met de datum/tijd op normaal gewicht + subtiel grijs (`--text-secondary`) zodat alleen het label de groene eyebrow is. Dode CSS (`.feature-eyebrow--pill`, `.walk-step` pill-stijl) bleef staan maar wordt niet meer gebruikt.

### 2026-06-11 — Social-posting-brein compleet: dekking-fix + timing v1.1 + lengte-guard + doc-generator

**Naamgeving + opslag (op verzoek Floris):** dit geheel heet het
**social-posting-brein**. Opslaglocaties:
- `docs/social-posting-brein.docx` — het brondocument (Floris' Word-doc,
  voorheen "Timing Brein" / Posting-Tijden v1.1; origineel stond op Desktop,
  nu ook in de repo onder versiebeheer).
- `apps/api/src/ai/filly-brain.config.ts` — de uitvoerbare kern
  (CHANNEL_RULES: lengtes, hashtags, timing, toon, CTA per kanaal).
- `apps/api/src/ai/timing-factors.ts` — externe factoren (feestdagen/
  loondagen/seizoenen/weer-regels), deterministisch.
- `apps/api/src/ai/copy-length.guard.ts` — lengte-handhaving na generatie.
- `docs/social-posting-brein-kanalen.md` — gegenereerd lengte-hoofdstuk
  (`pnpm brein:doc`), nooit handmatig bewerken.

Aanleiding: Floris merkte dat het brein (lengte per uiting, timing) niet
nageleefd leek te worden. Audit bevestigde twee oorzaken: (1) meerdere
generatie-routes plakten het brein helemaal niet in de prompt, (2) waar
het wél zat, stonden er eigen hardgecodeerde lengte-/timingregels naast
die het brein tegenspraken. Daarna in dezelfde sessie het hele
stappenplan afgerond. Details bij de afgevinkte items onder
P2 → "Filly-brein v2 → code-vertaling".

- **Dekking-fix** (`c0dd738` + `14ad635` + `c90e9e7`): kanaalregels in
  campagne-refine/generateMoreVariants + alle 4 suggestie-prompts;
  dubbele hardgecodeerde regels uit chat/suggesties weg; chat-bugs
  gefixt ("variant 3 ~130% van max-lengte" + dubbele FORMAAT 1-header).
- **Timing Brein v1.1 → config** (`b4f2e02`): bestTimes van alle 8
  kanalen op de onderzoekswaarden uit Get-Filly-Posting-Tijden-v1_1.docx;
  CHANNEL_RULES v1→v2.
- **Externe factoren deterministisch** (`d0dc8c6`): `ai/timing-factors.ts`
  met NL-feestdagen/loondagen/seizoenen/weer-regels →
  `buildExternalFactorsBlock()` in de timing-relevante prompts.
- **Lengte-guard** (`70afd79`): `ai/copy-length.guard.ts` — check op
  `copyLength` per kanaal + max 1 gerichte herschrijf, op 5 routes.
- **Doc-generator** (`985cf5d`): `pnpm brein:doc` →
  `docs/social-posting-brein-kanalen.md`, het lengte-hoofdstuk dat het
  brondocument miste, gegenereerd uit code.
- **Ronde 3 — flexibiliteit** (`38bc620` + `5f3ae91` + `53b565c`, n.a.v.
  Floris' feedback "hij moet verder denken dan alleen het beste moment"):
  (a) tweede-beste vensters + gradatie-regel per kanaal (voorkeursvenster
  ≠ vereiste; gemist optimum → eerstvolgend redelijk moment, CHANNEL_RULES
  v3); (b) `ChannelReachService` — gemeten bereik (mail/WhatsApp-opt-ins,
  Meta-koppel-status) in chat- en suggestie-prompts, voorbereid op
  Insights-data zodra Meta/GBP-OAuth live is; (c) Filly levert nu altijd
  een alternatief (kanaal of moment + trade-off) naast het primaire
  voorstel, zonder DB-migratie via reasoning-append. Events-plan
  (gemeente/stad) staat als gefaseerd open item in de brein-sectie.

### 2026-06-05 — SEO-fundament + publieke-site copy/branding-ronde + FOUC-fix

Grote ronde op de publieke site (live op **www.get-filly.com**). Zie ook de afgevinkte items onder P1 → "Site-fundamenten" en de open SEO-to-do's daar.

- **SEO live**: `metadataBase` + title-template + per-pagina title/description/canonical (`config/seo.ts`), `sitemap.ts`, `robots.ts`, JSON-LD Organization/WebSite/SoftwareApplication (`components/structured-data.tsx`), **FAQPage-schema** op /pricing, gegenereerde **OG-deelafbeelding** (logo-only, `app/opengraph-image.tsx`), **Vercel Web Analytics + Speed Insights**, custom `not-found.tsx`. Canoniek domein **www.get-filly.com**.
- **Merk-afspraak (belangrijk!)**: **Get-Filly** = bedrijf/platform → in beschrijvende marketingtekst ("Get-Filly verstuurt…", "Get-Filly detecteert…"). **Filly** = de AI-assistent/persona → in chat-widget ("Filly AI"), "Vraag Filly…" en de dashboard-mocks (= consistent met het échte dashboard). Filly→Get-Filly toegepast op de prose van home/product/pricing/about; assistent-mocks bewust op "Filly" gehouden.
- **Visueel**: nummering 01-05 (walkthrough-stappen) + groene cirkel-bolletjes (`hero-diff-num` in hero-diffs, "Wat zit er in" en "Wat ons drijft") verwijderd; home-pijler-bullets van streepje → groen bolletje; gerechten-foto in de Instagram-mock op /product (`public/images/instagram-gerechten.jpg`); telefoon-lockscreen donkere overlay weg + subtiele text-shadow op klok/datum; telefoon-melding `NOTIF_DELAY` 1000→1400ms.
- **Diverse copy**: hero-CTA "Bekijk de dienst", "Vraag een demo aan", "Plan een gratis kennismaking in", "…tafel vrij!", 4× "onderneming"→"restaurant", "Donderdag onder doelstelling / Doel:", about-pijlers herschreven, product-H2 + samenvattings-zin aangepast.
- **FOUC-fix** (commit `8fa46f5`): reveal-kaarten (walkthrough op /product, tijdlijn op /about) flitsten kort zichtbaar bij load doordat `reveal-pending` pas ná de eerste paint via JS werd gezet. Nu zet een inline scriptje bovenaan `<body>` vóór de paint `html.reveal-armed` (alleen met JS + zonder reduced-motion); CSS verbergt `[data-reveal]` dan al vóór ze getekend worden, tot `ScrollReveal` ze toont. Fallback (no-JS/reduced-motion) intact. Reveal-timing zelf terug op de originele versie.

### 2026-06-02 — Landing-hero (homepage) verfijnd: telefoon-melding + mei-verhaallijn

De hero-mockup (laptop + telefoon ernaast) is een samenhangende mini-demo geworden, anchor-datum **maandag 4 mei 2026**. Commits `074086b` → `da35034`.

- **Telefoon**: eigen lockscreen-**wallpaper** (`apps/web/public/phone-wallpaper.jpg` + donkergroene overlay voor leesbaarheid). Pushmelding **"Rustige dagen gedetecteerd"** (titel 10px) met bouncy overshoot-pop.
- **Melding-trigger gefikst** (`landing-phone.tsx`): popte voorheen zodra de laptop-mockup 20% in beeld was → speelde af terwijl de telefoon nog ónder de vouw zat (ongezien). Nu observeert 'ie de **telefoon zelf** (threshold 0.8) zodat de pop écht zichtbaar is. `NOTIF_DELAY` 1000ms.
- **Volgorde** (`landing-filly-chat.tsx`): de MacBook-chat start op **3600ms** (`CHAT_INTRO_DELAY`) zodat de telefoon-melding ruim eerst popt, dan pas de chat.
- **Coherente mei-verhaallijn**: telefoon = ma 4 mei; chat "Dinsdag 5 mei staat op 43%" → voorstel **di 5 mei** → "volgende week woensdag" → voorstel **wo 13 mei**. Laptop-MiniDashboard (`page.tsx`): vandaag = 4 mei (Bezetting **55%**, Gasten **43**), heatmap 5 mei = 43%, rustige-dagen-banner **5/8/13 mei**, speciale dag **Moederdag (10 mei)**. Weekdagen + percentages kloppen nu onderling.
- **FAQ** (`pricing/page.tsx`, commit `0a77ddb`): onboarding-antwoord → "Binnen één dag ben je volledig onboard."

### 2026-06-02 — Multi-kanaal bundel uitgebreid naar alle 5 kanalen (+ google_business-voorstel-fix)

"Selecteer alle kanalen" in Filly's chat levert nu één concept-bundel met
élk gekozen kanaal uitgewerkt — niet langer alleen mail/IG/FB. WhatsApp +
Google Business zijn volwaardige bundel-kanalen geworden (PR #1, squash-merge
`bd7188a`). Geen DB-migratie: bundel = JSONB, campagnes via bestaande tabellen.

- **Parser + datamodel** (`apps/api/src/chat/chat.service.ts`):
  `ParsedBundle` + `CampaignBundleCard.channels` optioneel + 5 kanalen;
  `extractCampaignBundle` accepteert elke subset (min. 2 kanalen); WhatsApp +
  GBP hebben alleen een `body`. System-prompt FORMAAT 2 instrueert Filly om
  precies de gevraagde kanalen op te nemen (WhatsApp persoonlijk, GBP lokaal-
  zonder-onderwerp).
- **Approve-flow** (`apps/api/src/suggestions/suggestions.service.ts` +
  controller): `approveBundle` generiek — loopt over de aanwezige kanalen,
  maakt WhatsApp als `type:'whatsapp'` en GBP als `type:'social'` +
  `platform:'google_business'` via de bestaande `campaigns.create`.
  Idempotentie + return generiek (`campaignIds`-map + nieuw type
  `BundleApproveChannel`).
- **Frontend**: dynamische bundel-kaart (rendert de aanwezige kanalen),
  `chooseChannel` splitst WhatsApp/GBP niet meer af, `DEFAULT_BUNDLE` +
  `toBundleChannel` + `BundleChannel`-type verbreed naar 5.
- **Bonus-fix**: een `google_business` single-channel-voorstel werd niet
  geparsed door `extractCampaignProposal` (type ontbrak in de whitelist),
  waardoor het rauwe `<<FILLY_PROPOSE_CAMPAIGN>>`-blok als platte tekst in de
  chat bleef staan. Type toegevoegd.
- Verificatie: web + api `tsc --noEmit` groen; end-to-end getest tegen de
  draaiende API (chat-aanvraag → 5-kanaals-kaart → approve → 5 concept-
  campagnes mail/IG/FB/WhatsApp/GBP).

### 2026-06-02 — Vercel ignore-build-step gefikst (web-deploys werden stil overgeslagen)

Na de invite-only-push bleef productie de oude code tonen — geen codefout, maar
Vercel die de web-build oversloeg. Vercel's "Skip unaffected projects" keek
alleen naar de LAATSTE commit van een push; die was hier een `docs(backlog)`-
commit (alleen `BACKLOG.md`), dus concludeerde Vercel "geen `apps/web`-wijziging"
en annuleerde de build ("Canceled by Ignored Build Step") — terwijl de echte
web-wijziging (login/signup/middleware) in een eerdere commit van diezelfde push
zat. De production-alias bleef daardoor op deploy `19f1df9` hangen.

Diagnose-recept (handig bij "mijn wijziging staat niet live"):
`gh api repos/Get-Filly/Get-Filly/commits/<sha>/status` toont per Vercel-project
de state + description (o.a. "Canceled by Ignored Build Step");
`gh api repos/Get-Filly/Get-Filly/deployments` toont welke commit als Production
draait. Live-check zonder browser: `curl -sSI https://get-filly.com/<pad>`.

Fix (commit `1fd6271`) — eigen Ignored Build Step die vergelijkt met de VÓRIGE
geslaagde deploy i.p.v. alleen de laatste commit:
- `apps/web/vercel.json`: `"ignoreCommand": "bash scripts/vercel-ignore-build.sh"`.
- `apps/web/scripts/vercel-ignore-build.sh`: `git diff --quiet $VERCEL_GIT_PREVIOUS_SHA $VERCEL_GIT_COMMIT_SHA -- apps/web packages/shared pnpm-lock.yaml package.json`. Exit 0 = overslaan, exit !=0 = bouwen. Faalt bewust naar bouwen: geen vorige SHA / buiten de shallow clone (depth 10) / git-error → bouwen. Liever een overbodige build dan stil verouderde productie.
- `VERCEL_GIT_PREVIOUS_SHA` (SHA van de laatste geslaagde deploy van project+branch) wordt door Vercel alléén gevuld als er een Ignored Build Step is — vandaar deze opzet.

Geverifieerd: deploy `1fd6271` bouwde wél (state success), `get-filly.com/signup`
geeft nu HTTP 307 → `/contact`, en de production-deploy staat op `1fd6271`. De
**dezelfde latente skip geldt nog voor `get-filly-api`** (open punt in de
Hosting-deploy-sectie).

### 2026-06-02 — Self-service signup dicht (invite-only) + demo-CTA + eigen afzender contact-mail

Doel: concurrenten mogen zich niet zelf kunnen registreren om in de app rond
te kijken en na te bouwen. Self-service registratie volledig dichtgezet;
nieuwe klanten komen voortaan uitsluitend via ons binnen.

**De échte lock (Supabase, geen code):** Authentication → "Allow new users to
sign up" = UIT. Blokkeert élke `signUp`, óók rechtstreeks via de anon-key die
in de browser-bundle zit. `auth.admin.inviteUserByEmail()` (service_role)
blijft werken, dus zelf accounts aanmaken kan nog.

**Code (apps/web):**
- `login/page.tsx` — registratielink "Maak er een aan" → **"Vraag een demo aan"** (→ `/contact`, zelfde bestemming als de landing-CTA's, om bezoekers wél te triggeren).
- `signup/page.tsx` — client-formulier weg, nu kale server-redirect naar `/contact`. Oude /signup-URL toont geen dode/verwarrende pagina meer.
- `middleware.ts` — `/signup` is geen auth-pagina meer (`isAuthPage = path === "/login"`).

**Nieuwe klant erbij (geen admin-flow nodig):** Supabase → Authentication →
Users → Add user (e-mail + tijdelijk wachtwoord, "Auto Confirm User" aan, of
laat de klant via "Wachtwoord vergeten" zelf een wachtwoord zetten). Klant
logt in → middleware ziet geen `restaurant_users`-rij → stuurt naar
`/onboarding` → klant maakt eigen zaak. De bestaande onboarding-wizard doet
de rest; er was dus géén nieuwe admin-/invite-code nodig.

**Contact-/demo-mail afzender losgekoppeld (apps/api/mail.service.ts):** de
demo-aanvraag (`/public/contact` → `sendContactRequest`) komt binnen op
`info@get-filly.com` (ongewijzigd). De afzender stond echter op
`social@get-filly.com` = het adres waarmee we mails namens klanten (campagnes)
versturen. Nieuwe const `WEBSITE_FROM_ADDRESS = 'info@get-filly.com'` voor onze
eigen systeem-/websitemails; `DEFAULT_FROM_ADDRESS` (social@) blijft puur voor
campagnes. Reply-to = de aanvrager, dus "beantwoorden" gaat direct naar de lead.

### 2026-06-02 — Responsive-sweep deel 2 (publiek + dashboard mobiel)

Commits `174e924` → `e2b42c8`. Vervolg op de mobile-responsive-pass van
2026-04-30; die liet gaten die op echte telefoon-/tablet-breedtes opvielen.
Gevonden + gefixt, geverifieerd via browser-preview op 320/360/375/500/700/
768/900/1024/1280px (dashboard mét echte data via lokale API).

**Publiek (landing.css / globals.css / navbar.tsx / landing-visuals.css):**
- Navbar klapte niet écht in (lettertype kromp alleen) → echt **hamburger-menu < 880px** (`.nav-menu` display:contents op desktop, uitklap-paneel mobiel).
- Social-post-waaier (`.lv-social`) liep buiten beeld → **compact tot 640px** + extra-compact ≤360px (de feature-rij stapelt al vanaf 880, maar de desktop-waaier ~424px past pas vanaf ~640 in die kolom).
- Hero-laptop-mockup: toont op telefoon nu het **volledige dashboard geschaald** (3:2, vaste 300px-laptop + transform:scale) i.p.v. afgekapt; ruimte eronder strakker.
- Kanaal-mockup (`.pmock-channels`) overflow → `min-width:0` op grid-items.
- /about-tijdlijn: jaar-markers bij `zig-left`-items stonden ónder de kaart i.p.v. ernaast → `grid-row:1` op marker + kaart.
- Legal-tabellen (/privacy, /voorwaarden): rauwe `<table>` met inline width, geen scroll-fallback → `.legal-section table` horizontaal scrollbaar < 768px.

**Dashboard (dashboard.css):**
- Half-scherm (901–1024px): kalender + chat bleven gestapeld terwijl er plek was → **2-koloms tot 900px**, stapelen pas ≤900.
- Kalendercel-% liep tegen de randen op kleine telefoons → kleiner < 480px.
- Dag/Week/Maand/Jaar-toggle in de kalenderkop werd afgekapt → `.cal-controls` mag wrappen.
- **Kalender werd 0px hoog** in de gestapelde mobiele layout: het dashboard stond als app-shell op schermhoogte vast (`.dashboard-shell`/`.main` fixed + overflow:hidden) → op **≤900px de hoogte-lock losgelaten** zodat de héle pagina scrollt (kalender + chat volledig); topbar + offcanvas-sidebar `position:fixed` zodat ze tijdens scrollen blijven staan. Desktop + 901–1024px (2-koloms) ongewijzigd.
- Rauwe `<table>`'s op detail-subpagina's (marketing-kanalen, GBP-audit) ook scroll-fallback (`table:not(.data-table)` ≤1024px).

Resultaat: geen horizontale pagina-scroll meer op 320–1280px, op alle publieke
pagina's + de dashboard-hoofdpagina's. **Lokaal verifiëren**: dashboard met
data vereist de Nest-API op 3001 én CORS voor de web-poort (web op :3000 of
`CORS_ORIGINS=http://localhost:<poort>` meegeven — anders is "Geen toegang"
een CORS-fout, géén rechten-probleem).

### 2026-05-21 (laat) — Vindbaarheid-hub + Identiteit-verhuizing + progress-checklists

Commit `64e9875`. Vindbaarheid is nu het knooppunt voor alle posts-input.

**Verstreken campagnes auto naar historie** (item 2):
- **Migratie 0043**: pg_cron-job `cleanup_expired_campaigns` dagelijks
  03:17 UTC migreert non-afgeronde campagnes met `scheduled_for` in
  het verleden naar `status='afgerond'`. SECURITY DEFINER + search_path,
  idempotent re-runnable (drop+create job).
- Frontend kanban `/campagnes` + history-page filteren ook read-time
  (Array.isArray-safe + scheduled_for<nu) zodat de UI tussen cron-runs
  consistent is. History-tab 'Afgerond' toont nu OOK verstreken-niet-
  afgerond als safety-net.

**Restore-uit-historie** (item 3):
- Backend `POST /campaigns/:id/restore` + `restoreFromHistory()` met
  validatie: status concept|ingepland|actief, scheduled_for in toekomst
  (60-sec marge), bron is echt historie (status='afgerond' OR expired).
  Bij restore: `executed_at` op null + audit-log met from/to-status.
- Frontend `restoreCampaignFromHistory()` in api.ts.
- History-pagina krijgt 'Terugzetten'-knop per Afgerond-rij + modal met
  status-radios (concept/ingepland/actief, default ingepland) +
  datetime-picker met min=nu.

**Dagen filteren waar al voorstel/campagne staat** (item 1):
- `UpcomingActionsBlock` fetcht nu ook `fetchSuggestions("pending")` +
  `fetchCampaigns()`, bouwt `coveredDates`-Set van YYYY-MM-DD-strings
  (target_date uit pending suggesties + scheduled_for date-portie uit
  non-afgeronde campagnes) en filtert beide stroken + de popover.
- Variabelnamen `redStrip`/`yellowStrip` hernoemd naar `occupancyStrip`/
  `specialStrip` (legacy naming verwarde — beide stroken hebben al
  dezelfde rode accent-streep).

**Vindbaarheid-Identiteit verhuizing** (Floris-redesign):
- **Migratie 0044**: 8 nieuwe kolommen op restaurants — `location_description`,
  `keywords`, `default_hashtags`, `tone_of_voice`, `do_not_mention`,
  `brand_story`, `awards`, `target_audience_segments`. Zod-schema in
  `restaurant-update.schema.ts` uitgebreid.
- Nieuwe pagina `/dashboard/vindbaarheid/identiteit` (route slug
  google-business/identiteit voor backwards-compat) met 5 sub-tabs:
  Basics / Toon / SEO / Menu / Online.
- **Filly-analyse-banner** bovenaan Basics/Toon/SEO triggert bestaande
  `analyzeRestaurantWebsite()` voor auto-invul. Disabled als website-URL
  ontbreekt; geen valse dirty-state na analyse.
- **Menu-tab**: `MenuPage` accepteert nu `embedded?: boolean`-prop —
  bij true skip page-shell (page-full wrapper + PageHeader), upload-
  acties inline boven menu-lijst. Identiteit-Menu-tab rendert
  `<MenuPage embedded />` direct.
- **Foto-bibliotheek + branding** verhuisd van Visueel-tab naar Basics-
  tab (Visueel-tab vervallen). Logo + brand-kleuren inline-velden,
  RestaurantMediaSection als embedded sectie.
- Sidebar Menu-item weggehaald. Route `/dashboard/menu` blijft als
  standalone bestaan voor deep-link-compat.

**Account-page grote opruim**:
- AccountTab: `algemeen | identiteit | koppelingen` → `algemeen |
  koppelingen`. `?tab=identiteit` valt nu terug op Algemeen voor
  bookmark-compat.
- **445 regels weggehaald**: 5 sub-secties (foto-bibliotheek,
  identiteit-velden, website, branding, social media, menu-link) +
  dode helpers (`setBrandColor`, `handleAnalyzeWebsite`, `handleLogoUpload`,
  `toneOptions`, `formatDate`) + ongebruikte imports.

**Vindbaarheid-hub (`google-business/page.tsx`) cleanup**:
- PageHeader-title `"Google Business Profile"` → `"Vindbaarheid"`,
  subtitle weg.
- Koppeling-status-banner + `GoogleConnectModal` verwijderd. De
  koppeling beheert eigenaar nu uitsluitend via Account > Koppelingen
  (item `google_business` in `account-connections.tsx` bestond al,
  API-token-flow).
- Feature-cards: emoji-icoon weggehaald, layout naar "titel links +
  status-badge rechts".
- Identiteit toegevoegd als EERSTE card.

**Progress-checklists herschreven**:
- Nieuwe gedeelde `<ProgressChecklist>` in `_components/`:
  - Done items verdwijnen uit lijst (niet line-through)
  - Max 4 open items zichtbaar + "Toon nog N items ↓"-knop
  - Chevron-toggle voor inklappen (collapse-state in localStorage
    per `collapseKey`) vervangt permanente dismiss-X
  - Progress-bar altijd zichtbaar, ook bij ingeklapt
  - Verdwijnt alleen bij 100% complete
- `OnboardingChecklist` (account): 6 items → 4 items (logo + menu
  weggevallen, hoorden naar Vindbaarheid).
- `IdentiteitChecklist` per sub-tab: Basics (10 items), Toon (8 items),
  SEO (2 items) met builders die kijken naar de mig-0044-velden.

**TasksStrip "Overige acties"** vervangen door deze checklist-flow —
was al verwijderd in commit `167c7ea` (eerder vandaag).

**Emoji-cleanup**:
- 8 feature-card-emoji's weg uit Vindbaarheid-hub.
- ✨ + 📭 weg uit menu-suggestions empty-state.

**Vereiste hand-actie**: migratie 0043 + 0044 SQL in Supabase
draaien (beide al door Floris ge-run, bevestigd via "schaduled 3"-
return van pg_cron + "heb hem gerund").

### 2026-05-21 (avond) — Campagne-flow fixes + GBP-channel + sticky UI

**Vijf samenhangende verbeteringen** (commit `fd05949`, voorafgegaan
door `94ebb7f` met landing-design pass + visualizer-rebuilds).

**Multi-channel refine bug fix** (HTTP 400 "max reached"):
- Backend `refine()` in `apps/api/src/suggestions/suggestions.service.ts`
  leest + schrijft nu `channels[i].variants` i.p.v. legacy
  `sc.variants`. Bij channels[]-suggesties target het de actieve
  channel via `body.channel_id`; bij legacy single-channel werkt
  het op sc.variants (backwards-compat).
- Controller accepteert nieuw veld `channel_id`.
- Frontend `refineSuggestion(suggestionId, instruction, channelId?)`
  + voorstel-page `handleRegenerate()` passt `activeChannel.id` door.
- Persistence werkt automatisch: nieuwe varianten worden in DB
  opgeslagen → blijven zichtbaar bij refresh + navigatie.

**Google Business als 6e campagne-kanaal**:
- Backend `SuggestionPlatform` + `SUGGESTION_PLATFORMS` uitgebreid met
  `'google_business'`. `platformToCampaignType` mapt 'm naar `'social'`
  (hergebruikt bestaande `campaign_social_content`-tabel; geen
  migratie nodig — `platforms text[]` accepteert nieuwe waarde).
- Frontend Platform-type + PLATFORM_ICON (🔍) + PLATFORM_LABEL
  ("Google Business-post") toegevoegd in
  `_components/campaign-detail/types.ts`.
- KanalenCard `ALL_PLATFORMS` bevat nu ook `google_business` als
  6e toggle-pill naast Mail/WhatsApp/IG/FB/TikTok.
- Concept-fase volledig functioneel (Filly genereert, eigenaar
  bewerkt + plant in, status werkt). Auto-publish via GBP-API wacht
  op approval (BACKLOG fase F). Eigenaar kopieert handmatig naar
  Google Business tot dan toe.

**`channels.map is not a function` crash op /campagnes**:
- `getItemPlatforms` + dates-helper checken nu `Array.isArray()`
  i.p.v. alleen `?? []`. Legacy bundle-suggestions hadden channels
  als object opgeslagen wat `.map()` crashte.

**Kanban-sortering op datum**:
- Elke kolom (Voorstel/Concept/Ingepland/Actief) sorteert op
  vroegste scheduled-datum oplopend. Items zonder datum naar
  onderaan zodat geplande dingen prominent zijn.

**Sticky-header detail-pages** (`/campagnes/[id]` + `/voorstel/[id]`):
- Eén sticky-blok van "Terug naar campagnes" t/m de progress-balk
  plakt nu onder de dashboard-topbar tijdens scrollen.
- `.page-full` krijgt inline `paddingTop:0` zodat sticky met `top:0`
  flush onder topbar pint (anders 24px gap door de standaard
  page-full padding; negatieve top clipt de sticky boven de
  scroll-area).
- Topbar zelf: `rgba(.88) + backdrop-blur` → fully opaque
  `var(--bg)` zodat content niet meer doorschemert bij scrollen
  (was zichtbaar tussen topbar en sticky-blok).

**Sidebar/topbar label "Google Business" → "Vindbaarheid"** (commit
`94ebb7f`):
- `_components/sidebar.tsx`: label + icoon 💼 → 🔍.
- `_components/topbar.tsx`: page-title-map bijgewerkt.
- Route + module-key (`google-business` / `google_business`) blijven
  voor backwards-compat met deep-links + permissies.

**Landing-design pass** (commit `94ebb7f`):
- Border-radius bumped: zig-card 12→24, pricing-card 8→20, faq-item
  8→16, feature-row-text--card 20→24, testimonial 16→20.
- VindbaarheidVisualizer v4: cirkel-layout rond Filly met 8 echte
  brand-SVGs (Simple-Icons paths + custom voor TheFork/ChatGPT/Maps).
  Solide aderen, sequentiële reveal, pulsen Filly → logo.
- ZichtbaarheidVisualizer v3: hybride HTML+SVG met grote Filly-cirkel
  centraal + IG/FB/TikTok platform-cirkels + mini-cards met bullets
  (matcht originele PNG). Gebogen pijl-arcs met pulsen.
- Pijler 3 (Bereikbaarheid) ook in `--split`-patroon (tekst-card +
  transparante visual) voor consistentie met pijler 1 + 2.

### 2026-05-21 — Hosting compleet (Vercel + Railway) + CI-fix + mig 0041/0042

**Wat is er gebeurd**: alles wat tot vandaag alleen lokaal werkte
loopt nu volledig op de cloud — frontend op Vercel, backend op
Railway. Plus twee migraties bijgewerkt die nooit waren gedraaid
(Filly-chat crashte op "selected_variant_index column not found").

**Frontend Vercel** (`https://get-filly-web.vercel.app`):
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  + `NEXT_PUBLIC_API_URL` (= Railway-URL) gezet in Vercel UI.
  Onder "Sensitive" gemarkeerd; bij wijzigen redeploy nodig want
  `NEXT_PUBLIC_*`-vars worden in build ge-baked.
- Eerdere fetch-error "Invalid value" was een corrupte env-value
  (URL met `/rest/v1/` erachter). Gefixt door clean overnieuw plakken.

**Backend Railway** (`https://api-production-9682.up.railway.app/api`):
- Routekeuze: Vercel-API-pad afgeschreven omdat Nest een persistent
  server is, niet serverless. Vercel Hobby 10s-timeout zou Vision-
  flow breken (Opus-menukaart-upload duurt 30-60s).
- `railway.json` in repo root:
  ```json
  {
    "$schema": "https://railway.com/railway.schema.json",
    "build": {
      "builder": "NIXPACKS",
      "buildCommand": "pnpm install --frozen-lockfile --filter \"api...\" && pnpm --filter api build"
    },
    "deploy": {
      "startCommand": "pnpm --filter api start:prod",
      "restartPolicyType": "ON_FAILURE",
      "restartPolicyMaxRetries": 3
    }
  }
  ```
- **Node 22.x verplicht**. Railway pakte default Node 18 (jose@6
  crashte met `ERR_REQUIRE_ESM`). Met `engines.node: "22.x"` in
  root `package.json` + `.nvmrc=22` koos Nixpacks Node 22.18.1.
  jose@6 is ESM-only; `require(esm)` is pas standaard vanaf Node 22.
- CORS in `apps/api/src/main.ts` leest nu env-vars i.p.v. hardcoded
  localhost:3000 — `WEB_URL` (single) + optioneel `CORS_ORIGINS`
  (comma-list). `credentials: true` voor Authorization-header.
- Env-vars 1-op-1 uit lokale `apps/api/.env` overgezet (Supabase
  + Anthropic + Resend + Google Places + access-tokens), behalve
  `WEB_URL` (lokaal localhost → prod Vercel-URL).
- Railway service-config: Watch Paths leeg = redeploy bij élke
  main-push. Service heet `api`, port 8080 (via PORT env-var),
  publieke URL via Generate Domain.

**CI-fix** (commit `28bdfe2`):
- `useSearchParams()` was unwrapped op `/dashboard/account` +
  `/dashboard/google-business/reviews` — Next.js 15+ vereist
  `<Suspense>`-boundary anders crasht production-build met
  CSR-bailout-error.
- Refactor patroon: inner-component houdt hooks/UI, default-export
  wikkelt 'm in `<Suspense fallback={null}>`. Lokaal getest met
  `next build` voor push.

**Database — mig 0041 + 0042 gedraaid**:
- 0041 ontbrak in productie. Backend probeerde
  `selected_variant_index` te schrijven bij chat-bundle approve →
  PGRST204 schema-cache-error → Filly-flow brak op stap 2.
- Diagnose-query op `information_schema.columns` bevestigde dat
  alleen 0041 (variants + selected_variant_index) ontbrak; alle
  andere kolommen t/m 0040 stonden goed.
- Gecombineerde idempotente SQL gerund: ADD COLUMN IF NOT EXISTS +
  backfill per type (mail/social/whatsapp). Tested: chat-approve
  werkt nu end-to-end.

**Commits**: `28bdfe2`, `d9d61f6`, `881fac1`, `15a5e7b`, `551177c`.

### 2026-05-06 — Sessie afronding: UX-cleanup + IG/FB full-preview + content-fixes

**Onboarding stap 1 — visuele fine-tuning**:
- Subtitle: "in stap 2" → "in de volgende stap" + komma toegevoegd
  voor "dan" (grammaticaal correct als-dan-constructie)
- "✨ Laat Filly de rest invullen"-kop weggehaald
- UploadCard-component voor menu + drankkaart (papier-warm bg,
  brand-groen border bij upload, 'Vervangen'/'Verwijderen'-acties)
- "Filly, vul alles in" altijd zichtbaar (was alleen bij input):
  lichtgroen disabled bij geen input, brand-groen clickable bij input
- "Volgende — review" → "Volgende"
- Bruine kleur voor Filly-knop verworpen, brand-groen bleef passender
- Spacing-fix: `.login-btn`-class had ingebakken margin-top:24px die
  conflicteerde met inline marginTop — beide gaps nu gelijk op 16px

**'zaak' → 'onderneming' (23 files, sweep)**:
- Alle user-facing strings in apps/web (marketing/legal/dashboard)
  + Filly's system-prompts in apps/api (chat/suggestions/menu-
  suggestions/campaigns/reviews/restaurant-context). Code-comments
  + technische type-namen blijven 'zaak' (intern).

**Email-templates**:
- `GET FILLY` (uppercase, hardcoded) → `Get-Filly` in header-logo
  van alle 4 auth-mails (invite/magic_link/recovery/confirmation)
- Alle subjects + body-teksten ook met streepje
- `pnpm supabase:apply-templates` gerund — live op Supabase

**Marketing-hub fixes**:
- IG/FB/TikTok-cards op de hub waren niet klikbaar; nu wel
- Mini-stats (Verzonden + Open rate) van Mail-card weggehaald —
  alle 5 cards uniform
- Layout-fix: alle Marketing- en Google Business-pagina's gewrapt
  in `<div className="page-full">` zodat ze dezelfde links/rechts
  marge hebben als Koppelingen

**Instagram & Facebook full-preview** (na keuze A):
- /dashboard/marketing/instagram volledig uitgewerkt met realistische
  voorbeeld-data: 4 KPI-tegels, SVG-bereik-grafiek, top 5 posts,
  posttijd-heatmap, content-mix-tabel, publiek-demografie, Filly-
  acties. Gele preview-banner duidelijk zichtbaar.
- /dashboard/marketing/facebook idem maar met FB-specifieke metrics:
  page-likes, reactions-mix (👍❤️😮😂😢😡), Foto/Video/Event/Link-
  content-types, lunch-piek-pattern in heatmap, ouder publiek
  (zwaartepunt 35-54).

**Filly-voorstellen — compactere kaart + opgeschoonde modal**:
- Kaart op /campagnes: body-preview 220→140 chars, hele Expected-
  impact-blok weggehaald (+ reserveringen / Geschatte omzet /
  Confidence-bar), reasoning naar onder de actie-knoppen verplaatst
- Detail-modal: chat-edit-flow ('Praat met Filly'-rechterkolom) weg
  — verwarrend tov dashboard-chat. Single-column layout. Nieuwe
  'Genereer nieuwe versies'-knop hergebruikt refineSuggestion-API.
  -256 regels code (modal werd veel cleaner).

**Bug-fixes onderweg**:
- SuggestionsService.generateOnDemand crash bij Claude-tool-use-
  failure: defensieve `Array.isArray(raw.suggestions)` guard +
  nette NL-melding ipv 500-stacktrace.

**Demo-account herstel**:
- Floris had per ongeluk `floriskoevermans@outlook.com` verwijderd
  via account-delete (UX-issue: niet duidelijk dat 't álle restaurants
  weghaalt). Geen Pro-plan = geen Supabase backups beschikbaar.
- Opgelost: nieuwe signup + SQL-snippet die 8 gasten / 15 reserveringen
  / 14 occupancy-dagen / 6 reviews / 4 campagnes / 2 ai_suggesties /
  5 menu-items invoegt (auto user-id-lookup via email).
- Op backlog: soft-delete met 7-day window om dit nooit meer te
  laten gebeuren bij echte klanten.

**Memory bijgewerkt**:
- `feedback_auto_push.md` — workflow: na elke afgeronde wijziging
  automatisch commit + push (geen vooraf-vraag meer)
- Project-state-memory bijgewerkt met sessie-state

**Nog open na deze sessie**:
- TikTok-pagina full-preview (zelfde patroon als IG/FB) — niet
  gevraagd om nu te doen
- Soft-delete account met 7-day window (UX-fix)
- KvK-inschrijving (Floris's actie)
- Meta + TikTok approval-aanvragen indienen (na KvK)
- GBP approval-aanvraag indienen (na KvK)

### 2026-05-06 — Marketing-hub fase 1 (Mail live + IG/FB/TikTok placeholders)

**Probleem dat dit oplost**: klanten hadden geen overkoepelend overzicht
van hun marketing-prestaties per kanaal. Mail-data zat verstopt op
campagne-detail-pagina's, sociale kanalen waren überhaupt nog niet
beschikbaar. Nu één hub waar Filly later cross-channel kan adviseren.

**Architectuur**:
- Sidebar-entry "Marketing" tussen Campagnes en Google Business
- Hub: `/dashboard/marketing` met status-banner ("X van 4 kanalen
  actief"), Filly's wekelijks rapport (vanaf 1 actief kanaal),
  4 kanaal-cards (Mail / IG / FB / TikTok) + WhatsApp als "Later"
- Module-key `marketing` in `@getfilly/shared` (default-permissions
  voor owner + manager). Geen migratie nodig — bestaande klanten
  zonder custom permissions krijgen 'm automatisch.

**Mail-pagina LIVE** ([apps/web/.../marketing/mail/](apps/web/src/app/dashboard/marketing/mail/)):
- 5 KPI-tegels: verzonden / open rate / click rate / bounce rate /
  unsubscribes
- Industrie-mediaan-vergelijking (horeca-benchmark, hardcoded uit
  Mailchimp 2024-2025 industry-report)
- Per-campagne tabel (laatste 90 dagen) met clickable links naar
  campagne-detail
- Backend: [apps/api/src/marketing/](apps/api/src/marketing/) met
  `MarketingMailService` die `campaign_sends`-data aggregeert.
  Endpoints `/marketing/mail/stats` en `/marketing/mail/campaigns`.
- Empty-state als nog geen mail verzonden — verwijst naar /campagnes

**Coming Soon-pagina's** (IG / FB / TikTok):
- Gedeeld `<ComingSoonChannel>`-template
- Per platform een lijst van wat er straks komt (mockup-beschrijving)
- "Naar de hub"-link + "Bekijk Mail (werkt al)"-link

**Filly's wekelijks rapport** (eenvoudige versie):
- Deterministische tekst-samenvatting op basis van mail-stats
- Vergelijking met benchmark + suggesties bij outliers (bounce >3%,
  click <1% etc.)
- Echte Claude-call met cross-channel-analyse komt in fase 6

**LinkedIn**: bewust uit scope. Voor horeca lage relevantie. Mochten
hotel-restaurants of event-locaties klanten worden, kan 't later als
extra kanaal-card.

**Volgende fases (in BACKLOG, niet vandaag)**:
- Fase 2: `docs/meta-app-review.md` schrijven met invul-tekst
- Fase 3: Floris dient Meta + TikTok-aanvragen in (parallel aan KvK)
- Fase 4: OAuth-foundation (migraties 0035/0036, generieke OAuthService)
- Fase 5: Insights API-koppelingen (na approvals)
- Fase 6: Filly AI-laag (cron rapport + per-platform analyse +
  action-detector + anomalie-detect)
- Fase 7: WhatsApp (apart Meta-traject)

### 2026-05-05 — GBP fase B: Places-API + audit + benchmark + posts

**Probleem dat dit oplost**: de hub-pagina had alleen "Coming Soon"-
cards. Eigenaar kon nog niks met Filly's Google-features. Vereist een
Google Cloud-koppeling die voor klanten zonder approval-wachttijd
direct waarde geeft — dat is precies wat de Places API mogelijk maakt.

**Setup buiten code** (door Floris):
- Google Cloud project `Get-Filly GBP` onder organisatie `get-filly.com`
- $300 free trial credit (90 dagen) + $200/mnd Maps-credit doorlopend
- API-key met restricties: alleen Places API (New), geen IP-restrictie
  voor lokaal dev (productie krijgt Railway-IP later)
- `.env`-var: `GOOGLE_PLACES_API_KEY`

**Backend** ([apps/api/src/google-profile/](apps/api/src/google-profile/)):
- `GoogleProfileModule` + `GoogleProfileService` met 7 public methods:
  searchByText, connect, getMine, refresh, disconnect, getAudit,
  getCompetitors, generatePostVariants.
- Cache-strategie: 24u TTL in `restaurants.google_place_data` jsonb.
  Stale-refresh fail-soft (toon oude data + log warning bij API-fout).
- `audit.ts`: 12 deterministische regels (geen Claude-call, gratis,
  sub-ms runtime). Severities: critical / warning / tip met
  actionHints in NL voor de eigenaar.
- Migratie 0034: `restaurants.google_place_id` (text) + `google_place_data`
  (jsonb) + `google_place_synced_at` (timestamptz) + index op place_id.

**Frontend** ([apps/web/src/app/dashboard/google-business/](apps/web/src/app/dashboard/google-business/)):
- Hub van server-component naar client-component met `GET /me` fetch
  bij mount. Drie banner-states (loading/connected/disconnected).
  `GoogleConnectModal` voor de "Koppel met Google"-flow met search
  → kies → connect.
- 2 sub-routes:
  - `/audit` — severity-checklist met 3 KPI-tegels + finding-cards
  - `/benchmark` — KPI's (jouw vs mediaan in buurt) + tabel met radius-
    selector
  - ~~`/posts`~~ — gebouwd maar dezelfde dag verwijderd na review.
    Overlap met Filly-chat ("schrijf een Google-post") + posts in
    Google verdwijnen na 7 dagen + beperkte SEO-impact. Eventueel
    later als 4e channel in de chat-bundel-flow.

**Onboarding-integratie**:
- `OnboardingController.analyzeWebsite` → na WebsiteAnalyzer ook
  `googleProfile.searchByText(name + adres)` → top-1 als `place_match`
  in de response.
- Wizard stap 2 toont nieuwe sectie "Filly heeft je profiel gevonden"
  met confirm/wijzig/skip. Wijzigen-flow heeft inline-search.
- `OnboardingService.completeOnboarding`: na restaurant-create + link
  → optionele `googleProfile.connect()` als wizard place_id meestuurt.
  Fail-soft.
- Nieuwe endpoint `/onboarding/google-search` (alleen AuthGuard, geen
  RestaurantAccessGuard) voor de wijzigen-flow tijdens onboarding.

**Bekend voor productie** (op backlog):
- IP-restrictie op API-key zetten zodra Railway-IP bekend (productie
  deploy)
- Aparte dev-key zonder IP-restrictie voor lokale ontwikkeling

### 2026-05-05 — Google Business Profile-hub (fase A: skelet + rename)

**Probleem dat dit oplost**: de oude "Reviews"-sectie suggereerde dat
Filly alleen iets met reviews kan, terwijl reviews één van de zeven
sub-features van een volledige Google Business Profile-integratie zijn.
De rename + hub-pagina maken duidelijk waar we naartoe gaan en wat
er nog komt — fase B-F kunnen nu één voor één live zonder de
navigatie steeds te wijzigen.

**Wijzigingen**:
- Sidebar: `Reviews` ⭐ → `Google Business` 🔵
- Route: `/dashboard/reviews` → `/dashboard/google-business` (oude
  route blijft als 308-redirect-stub voor bookmarks/audit-log-links)
- Reviews-pagina verhuisd naar sub-route `/dashboard/google-business/reviews`
- Module-key in `@getfilly/shared`: `reviews` → `google_business`
  (MODULES + DEFAULT_PERMISSIONS owner/manager)
- Migratie 0033: bestaande `restaurant_users.permissions`-jsonb
  bijgewerkt + audit-log-entry voor traceerbaarheid
- AccessGuard PATH_MODULE_MAP + topbar title-mapping bijgewerkt
- Tasks-strip + taken/page deep-links direct naar nieuwe locatie
  (geen onnodige redirect-hop)
- Team-pagina MODULE_LABELS bijgewerkt
- Hub-pagina (`/dashboard/google-business/page.tsx`) met 7 cards:
  - 🟢 **Reviews** (live, klikbaar — werkt met handmatige data tot
    fase E synchronisatie aanzet)
  - 🔵 **Profiel-audit** (Coming Soon, fase B)
  - 🔵 **Concurrent-benchmark** (Coming Soon, fase B)
  - 🔵 **Filly-posts (copy-paste)** (Coming Soon, fase B)
  - ⚪ **Profiel-edits** (Coming Soon, fase F — vereist OAuth)
  - ⚪ **Foto-sync naar Google** (Coming Soon, fase F)
  - ⚪ **Inzichten** (Coming Soon, fase F)
- Status-banner bovenaan: "Niet gekoppeld met Google" (hardcoded
  tot fase D `oauth_connections` live is)
- Responsive grid (`auto-fill, minmax(280px, 1fr)`) — geen breakpoints
  nodig, vult de rij vanzelf op

**Volgende fase**: B (Places-API laag) — vereist Google Cloud
project + Places API-key. Geen klant-actie of approval-wachttijd.

### 2026-05-04 — Chat-delete + cap 20→30

Eigenaar kan oude gesprekken nu verwijderen via een 🗑-knop in de
history-dropdown. Voor delete probeert backend de Haiku-summary op
te slaan (fail-soft) zodat Filly's geleerde voorkeuren in
`restaurant_chat_memory` bewaard blijven — alleen de chat-berichten
zelf gaan weg.

- `ChatService.deleteConversation` met memory-first-save + cascade-delete
- `DELETE /chat/conversations/:id` endpoint
- `Trash2`-icoon per rij in `FillyChatHistoryMenu` (rood-highlight bij
  hover) + confirm-dialog
- Bij delete van actieve conversatie: orchestrator start automatisch
  een nieuw gesprek
- `CONVERSATION_CAP` 20 → 30 (zowel backend als frontend constant)

### 2026-05-04 — Foto-bibliotheek + multi-channel campagne-bundles + chat keuze-kaart

Drie features in één sessie, opgebouwd op de mail-flow van eerder
deze dag.

**Foto-bibliotheek per restaurant** ([apps/api/src/restaurant-media/](apps/api/src/restaurant-media/)):
- Migratie 0031: `restaurant_media`-tabel + RLS. Cap 20 foto's, 5MB
  per stuk, JPEG/PNG/WebP.
- `MediaTaggerService`: Haiku 4.5 Vision genereert NL-beschrijving +
  3-5 tags per upload. Eenmalig ~€0.005/foto, daarna geen runtime-
  cost meer omdat tekst opgeslagen blijft.
- `RestaurantMediaService` met list/upload/remove via Storage bucket
  `restaurant-assets`. Public-URL i.p.v. signed (anon-read-policy uit
  mig 0003 was al actief voor logo's).
- Frontend `RestaurantMediaSection` op account-pagina: grid met
  thumbnails + cap-warning + delete.
- `MediaLibraryPicker`-modal hergebruikt door `CampaignMediaSlot`
  (campagne-foto kan nu ook uit bibliotheek worden gekozen — frontend
  fetcht de URL als blob en uploadt 'm naar campaign-media zonder
  backend-wijziging).
- `RestaurantContextService.buildPhotosBlock`: Filly krijgt 20 foto's
  met description + tags in indices [1]-[20] in z'n campagne-context
  zodat 'ie kan suggereren welke foto past.

**Multi-channel campaign-bundles** ([apps/api/src/chat/](apps/api/src/chat/) + [campaigns/](apps/api/src/campaigns/) + [suggestions/](apps/api/src/suggestions/)):
- Migratie 0032: `campaign_groups` + `campaigns.group_id`. Optie A
  uit overleg: bestaande campaigns-rijen blijven single-type, group
  is alleen aggregaat-anker voor UI en accept-flow.
- Filly-prompt uitgebreid met FORMAAT 2 (BUNDLE) — 1 thema, 3 kanalen
  (mail + IG + FB) met aparte caption-stijlen (lengte, hashtags, tone).
- `<<FILLY_PROPOSE_BUNDLE>>` parser-tag + `extractCampaignBundle`-
  parser parallel aan single-channel proposal.
- `SuggestionsService.createBundleFromChat` slaat bundle op als
  ai_suggestions-rij met `trigger_type='chat_bundle'`.
- `SuggestionsService.approveBundle` accepteert optioneel
  `channels: ('mail'|'instagram'|'facebook')[]` zodat eigenaar
  per kanaal kan kiezen welke wel/niet aangemaakt moet worden.
- `CampaignsService.create` uitgebreid met `group_id`, `social_platforms`,
  `social_hashtags` zonder bestaande callers te raken.
- Frontend `FillyChatBundleCard`: 3 collapsibles met checkbox per
  kanaal (default alle 3 aangevinkt, eigenaar kan uitvinken). Knop-
  label is dynamisch ("Maak 2 campagnes aan" / "Maak 3 campagnes aan").
  Bij accept: 3 doorlinks naar de aangemaakte campagne-detail-pagina's.
- Idempotency-fix: bij chat-history-load detecteert orchestrator of
  bundle al approved is via `approvedMap` en zet bundle-card op
  `approved_existing`-state met "✓ Bundle al aangemaakt" + open-link.
  Voorkomt dubbele aanmaak na page-reload.
- Bumped `maxTokens` voor chat-call van 600 → 2000: bundle-output
  (3 kanaal-versies + JSON) was te groot voor 600, kreeg truncated
  antwoord en daardoor failed parser.

**Channel-choice-kaart** ([apps/web/src/app/dashboard/_components/filly-chat-choice-card.tsx](apps/web/src/app/dashboard/_components/filly-chat-choice-card.tsx)):
- Nieuwe `<<FILLY_PROPOSE_CHOICE>>` tag — Filly stelt eerst een keuze-
  vraag aan eigenaar i.p.v. zelf het kanaal te beslissen.
- Multi-select met 4 checkboxes (Mail / Instagram / Facebook / WhatsApp)
  + "Selecteer alles"-toggle + Verstuur-knop met dynamic label.
- Submit-logica: 1 keuze → single proposal voor dat kanaal; 2+ keuzes
  → bundel.
- Server-side `detectChannelHint` in [chat.service.ts](apps/api/src/chat/chat.service.ts):
  scant user-message op kanaal-keywords en injecteert keiharde
  routing-instructie in de Claude-prompt ("Gebruik FORMAAT 0 — NIET
  direct een proposal/bundle"). Voorkomt dat Claude de prompt-regels
  negeert. Als de eigenaar een specifiek kanaal noemt → skip
  keuze-vraag direct.
- Refactor `sendMsg` → `sendText(text)` zodat de choice-handler
  automatisch een follow-up user-bericht naar Filly kan sturen na
  klik op Verstuur.

### 2026-05-04 — Mail-flow live (Resend SDK + send + unsubscribe + eigen domein)

**Probleem dat dit oplost**: campagne-mails stonden alleen als concept
in de DB. Geen daadwerkelijke verzending naar klant-gasten mogelijk —
de "actief"-status in Filly's flow betekende niets praktisch.

**Foundation** ([apps/api/src/mail/](apps/api/src/mail/)):
- `MailService` met Resend SDK. From-header `<restaurant-naam> <social@get-filly.com>`
  als default, klant-eigen `mail_from_address` zodra geverifieerd.
- Reply-to via `restaurant.contact_email` zodat replies bij de klant
  terechtkomen ondanks Get-Filly als afzender.
- Per recipient: token genereren + `campaign_sends` insert + Resend
  batch.send (max 100 per call). HTML-wrapper met footer + unsubscribe-link.
- RFC 8058 List-Unsubscribe headers (Gmail/Outlook tonen native
  unsubscribe-knop bovenaan de mail — deliverability-boost + GDPR).
- Pre-flight check op `subject_line` + `body_html`/`body_plain` uit
  `campaign_mail_content`-tabel; nette NL-foutmelding bij ontbrekende
  content.

**Migratie 0030**:
- `campaign_sends` met status-enum (queued/sent/delivered/bounced/
  complained/opened/clicked/failed) + Resend message_id voor
  webhook-koppeling
- `unsubscribe_tokens` (256-bit random, idempotent gebruik)
- `restaurants.mail_*`-velden voor stap 2 (eigen domein)

**Webhook-flow**:
- `POST /webhooks/resend` (publiek) handelt delivered/bounced/opened/
  clicked/complained af. Match op resend_message_id. Signature-
  validatie (Svix) staat als TODO voor productie.
- `POST/GET /public/unsubscribe/:token` voor one-click + RFC 8058

**Frontend**:
- `<CampaignSendModal>` op campagne-detail-pagina. Twee modes: "Test
  naar mezelf" (eigenaar checkt visuele inhoud) + "Echt verzenden"
  (vereist overtypen van campagne-naam ter bevestiging — onomkeerbaar).
- Resultaat-view toont sent/failed counts + lijst van mislukte adressen.
- Publieke `/u/[token]`-pagina met "Je bent uitgeschreven van X"-melding.

**Stap 2 — eigen domein per klant**:
- `MailDomainService` met Resend Domains API (create/verify/get/remove).
  Zet records op subdomains zodat bestaande mailbox-flow van klant
  intact blijft (DKIM op `resend._domainkey.<domein>`, MX+SPF op
  `send.<domein>`).
- `<MailDomainSection>` op account-pagina met:
  - 4 status-states (none/pending/verified/failed)
  - DNS-records-tabel met copy-knoppen
  - Auto-polling elke 12s in pending-state tot Resend status syncs
  - "Verifieer"/"Loskoppelen"-acties
- Bij verified status: `MailService.resolveFromAddress` switcht
  automatisch naar klant-domein als afzender.

**Bekend voor productie** (op backlog gezet):
- Resend webhook signature-validatie (Svix-secret)
- Resend webhook URL in dashboard configureren bij deploy
- DNS help-flow voor klanten die records niet snappen
- DPA-template + privacy-update voor sub-verwerkers (Resend / Anthropic / Supabase)

### 2026-05-01 — Filly menu-suggesties (nieuwe gerechten + Afgewezen-tab)

**Probleem dat dit oplost**: chefs willen soms een externe blik op hun
menu — een gat dat ze zelf niet zien, een seizoens-impuls, of een
gewaagd "out of the box"-idee dat hun eigen denken doorbreekt. Geen
tool die als sparring-partner werkt zonder je menu vol te stoppen.

**Migratie 0029**: nieuwe tabel `suggested_menu_items` (los van
`menu_items` zodat voorstellen niet meetellen in Filly's eigen
prompts, exports, KPI-counts tot acceptatie). Lifecycle:
pending → accepted/rejected/refined_into/expired. Lazy expire op 30
dagen voor pending, 90 dagen retention voor rejected. RLS-policy
zelfde pattern als menu_items.

**Backend** ([apps/api/src/menu-suggestions/](apps/api/src/menu-suggestions/)):
- `MenuSuggestionsService` met generate/list/accept/reject/refine.
  Sonnet 4.6 tool-use voor 3 voorstellen per batch met enum
  `confidence: high|medium|low` waarbij `low` = "Out of the box"
  (positief avontuurlijk, niet "twijfel" — Filly krijgt expliciete
  prompt-instructie hierover).
- **Daily cap**: 1× per dag per restaurant via `audit_log`-lookup
  (`action='menu_suggestions_generated'` op `>= start of UTC day`).
  Bij overschrijding: NL 400 "Filly is bewust een creatieve sparring-
  tool, geen oneindige bron".
- **Refine cap**: 3 varianten per origineel-voorstel. Refine-flow
  geeft Claude het origineel + alle eerdere varianten mee zodat 'ie
  niet hetzelfde uitspuugt.
- Accept-flow: insert in `menu_items` met midden van prijs-range,
  voorstel op `accepted` met FK naar nieuwe item. Reject = soft
  (status='rejected') — chef kan in Afgewezen-tab alsnog accepteren.

**Frontend** ([apps/web/src/app/dashboard/menu/_components/menu-suggestions-tab.tsx](apps/web/src/app/dashboard/menu/_components/menu-suggestions-tab.tsx)):
- "Voorgesteld"-tab direct na Overig in de filter-rij + "Afgewezen"-tab
  daarnaast. Beide met aantal-tellers in de label.
- Voorgesteld-tab: brand-soft banner met generate-knop, grid van
  3 kaarten met source-badge (Gat/Past/Seizoen/Variant), confidence-
  dot (groen/geel/paars-out-of-the-box), prijs-range, dietary tags,
  reasoning-blok, acties: Toevoegen aan menu / Andere variant / ✕.
- Afgewezen-tab: read-only banner ("laatste 90 dagen"), zelfde
  kaarten maar alleen "Toch toevoegen"-knop.

### 2026-05-01 — Tweede restaurant toevoegen + workspace-switcher uitgebreid

**Probleem dat dit oplost**: eigenaar met meerdere zaken
(vestigingen, 2e concept) had geen manier om vanuit een actieve
sessie een nieuwe zaak aan te maken. `OnboardingService` blokkeerde
hard met `ConflictException` als er al een `restaurant_users`-rij
bestond, en de middleware redirecte `/onboarding` direct terug naar
`/dashboard`.

**Wijzigingen**:
- `OnboardingService.completeOnboarding`: `ConflictException` weg.
  Vervangen door count-query + `is_additional_restaurant`-flag in
  audit-log + `sequence_index` zodat we kunnen herleiden hoeveelste
  zaak het is voor deze eigenaar.
- `apps/web/src/middleware.ts`: bypass `?mode=add` voor de
  "user heeft al restaurant → redirect"-regel. Bestaande gebruikers
  die per ongeluk `/onboarding` bookmarken worden nog steeds
  teruggestuurd.
- `/onboarding`-page: detecteert `mode=add` via `useSearchParams`.
  Andere kop-banner ("Nieuwe zaak toevoegen"), "Annuleren" i.p.v.
  "Uitloggen" rechtsboven, en bij succes `window.location.assign('/dashboard')`
  i.p.v. soft `router.push` zodat alle dashboard-state vers mount
  voor de nieuwe tenant (zelfde reden als bij workspace-switcher).
- Account-pagina: brand-soft banner met "+ Nieuwe zaak"-knop bovenaan
  Restaurant-sectie.
- Sidebar workspace-dropdown: "+ Nieuwe zaak toevoegen"-item, altijd
  zichtbaar (ook bij 1 restaurant).

### 2026-05-01 — Per-request Supabase-client met user-JWT (RLS defense-in-depth)

**Probleem dat dit oplost**: backend draaide op `service_role`,
wat RLS volledig bypasst. Tenant-isolatie hing alleen aan TS-guards
(`RestaurantAccessGuard` + `.eq('restaurant_id', ...)`-filters in
service-code). Eén bug of vergeten guard = potentiële cross-tenant
data-lek bij 1000+ klanten.

**Oplossing**: per HTTP-request bouwt NestJS een verse Supabase-
client met het user-JWT in de Authorization-header. PostgREST ziet
het token, draait de query als die user, en RLS-policies pakken
het via `auth.uid()`. Defense-in-depth bovenop bestaande TS-guards.

**Foundation**:
- `AuthGuard` zet `req.accessToken` na JWT-verify (was eerder
  weggegooid).
- Nieuwe `RequestSupabaseService` met `Scope.REQUEST` — leest
  `req.accessToken` lazy bij eerste `.client`-toegang en bouwt een
  Supabase-client met `global.headers.Authorization` + de
  publishable-key (sb_publishable_...).
- `SupabaseModule` exporteert beide services. NestJS scope-bubbles
  REQUEST-scope automatisch op door de provider-keten.
- Nieuwe env-var: `SUPABASE_PUBLISHABLE_KEY` (publieke "anon"-key
  in nieuwe naamgeving).

**Sweep — 13 services gemigreerd**:
- MenuService (pilot, met DB-niveau RLS-tests + browser happy-path)
- Read-heavy: Reviews, Guests, Reservations, Occupancy, Kpi
- Write-heavy: Campaigns, Suggestions, Chat, ChatMemory, Restaurant,
  DataExport, Weather
- AI-context: RestaurantContextService

**Bewust op `SupabaseService` (service_role) gebleven**:
- `AuditLogService` — audit moet altijd schrijven, ook bij blokkade
- `AnonymizationService` — background-flow, geen user-context
- `AccountDeletionService` — verwijdert auth.users, vereist admin
- `OnboardingService` — creëert restaurant vóór `restaurant_users`-link
- `AiService` (alleen `ai_usage`-logging) — kan null restaurant_id
  bij pre-onboarding
- `TeamService` — gebruikt `auth.admin.inviteUserByEmail` +
  `generateLink`, vereist admin-API-toegang
- `AiRateLimitGuard` — kan pre-auth draaien

**Validatie via 4 RLS-tests met tijdelijke testgebruiker** (zelf
opgezet via Admin API + cleanup):
- Cross-tenant SELECT → `[]` ✅
- Eigen tenant SELECT → 3 gerechten ✅
- SELECT zonder filter → alleen rijen van eigen restaurant_id ✅
- Cross-tenant INSERT → **HTTP 403** + `new row violates row-level
  security policy for table "menu_items"` ✅

Plus browser-rooktest op alle 10 dashboard-pagina's groen.

### 2026-05-01 — Publieke marketing-site herbouw + dashboard-redesign

**Publieke site (commit `e1789ed`)**: alle 4 marketing-pagina's
(home/product/pricing/about) overgezet naar het Claude Design-prototype.
`apps/web/src/app/landing.css` is een 1-op-1 kopie van het design's
`styles.css` (zonder body/navbar/footer-overrides die met
dashboard/auth zouden conflicteren). Bij toekomstige design-update:
file overschrijven, niet handmatig vertalen — voorkomt kleur/vorm-
afwijkingen die we zagen tijdens de eerste poging.

**Dashboard layout-pas (commits `7598270`, `e27a8b9`)**:
- Weersvoorspelling weg uit UI (component verwijderd 2026-05-01).
  Backend `WeatherService` blijft draaien voor Filly's chat-context.
- "Campagnes deze maand"-DetailCard naast kalender weg (component
  verwijderd 2026-05-01).
- Sidebar herkleurd: van donkergroen naar wit met groen-soft active-
  pill — match met de mini-dashboard mockup van de landingspagina.
- Workspace-dropdown wit i.p.v. papier-warm.
- Kalender-cellen krijgen heatmap-bg op basis van occupancy-tier
  (rood < 40%, koper midden, groen 80%+); tekst altijd zwart;
  vandaag = groene outline-ring i.p.v. pill rond dag-nummer.
- Campagne-emoji's (✉️/📱/💬) per cel i.p.v. gekleurde stippen.
- Dag-view: nieuwe uur-staafdiagram 11:00-22:00 (mock data tot een
  `/occupancy/hours`-endpoint via reserveringsplatform-integraties).
- Week-view: nieuw tussen Dag en Maand — 7 staven Ma-Zo met dezelfde
  fallback-keten als de maand-view (`seededOccupancy`) zodat
  percentages tussen views identiek zijn.
- Jaar-view: cellen vullen volle hoogte van de card.
- KPI-onderregels donkergroen, alert-bar rood (was geel).

**Campagnes-pagina (commit `f209e86`)**:
- Verlopen-tab toegevoegd naast Open/Afgewezen, met frontend-detectie
  via `target_date` in `trigger_context`. Drie tabs altijd zichtbaar.
- Verlopen-kaart: gedimd, alleen Details-actie (niet meer goedkeurbaar).
- Afgewezen-kaart: impact-blok grijs i.p.v. groen — niet meer alsof
  de impact nog gaat komen.
- Voorstellen-grid: `minmax(380px, 1fr)` zodat kaarten breedte vullen.
- Internal scroll op Voorstellen-strip + Overige acties (max-height
  + overflow-y: auto), zelfde grid-breedte zodat ze uitlijnen.
- Drie subkoppen (Voorstellen van Filly / Overige acties / Campagnes)
  uniform: zwart, fontSize 15, geen ✨-emoji meer.
- WhatsApp-detail: Inhoud-card + Foto-card naast elkaar in 2-koloms
  grid (1fr + 320px), default grid-stretch zodat onderkanten gelijk
  uitlijnen.
- Witregel-fix: `landing.css` definieert globaal
  `section { padding: 112px 24px }` — dat lekte door naar het
  dashboard. Override in `dashboard.css`: `.dashboard-shell section
  { padding: 0 }`.

**Opruim 2026-05-01**: WeatherForecast + DetailCard components verwijderd,
bijhorende CSS (`.weather-row`, `.weather-day`, `.det-*`,
`.detail-campaigns`, `.pg/.po/.pr`) opgeruimd. `occupancyClass`-helper
weg (vervangen door tier-classes op cell-niveau).

### 2026-05-01 — Chat-history + 20-bericht cap + chat-memory (kostenbescherming)

**Probleem dat dit oplost**: lange chats stapelen input-tokens op (elke
nieuwe user-msg stuurt de hele history mee aan Claude). Tegelijk wil je
NIET dat Filly geleerde voorkeuren ("vermijd het woord 'gezellig'",
"geen €-prefix") vergeet als je een nieuwe chat begint.

**Architectuur**: hybrid summary-based memory (NIET vector DB — overkill
voor huidige schaal). Bij chat-cap (20 berichten) vat Haiku 4.5 de chat
samen + slaat op in `restaurant_chat_memory`. Volgende chats krijgen de
laatste 5 memories als blok in de system-prompt (cacheable in
prompt-cache).

**Migratie 0028**:
- `restaurant_chat_memory` tabel + RLS-policies (drop+create voor
  re-run-idempotency)
- Index op `chat_messages.conversation_id` voor de cap-count query
- Seed-cleanup: oude mock-conversaties van vóór 2026-01-01 weg
  (donderdag/38%-demo uit 0001-seed)

**Backend**:
- `ChatMemoryService` (nieuw) — `summarizeAndSave` (Haiku tool-use met
  `has_learning`-flag voor skip bij niet-leerzame chats) +
  `getRecentMemories` + `formatMemoryBlock`
- `ChatService.CONVERSATION_CAP = 20` constante
- `ChatService.sendMessage` — cap-check werpt 400 met NL-tekst zodra
  count + 2 ≥ cap; bij cap-bereikt fire-and-forget memory-summary
- `ChatService.listConversations` (max 50) + `getConversation` +
  `createConversation` voor de history-flow
- `ActiveChatState.messageCount` toegevoegd (UI-indicator)
- `buildSystemPrompt` injecteert `=== EERDER GELEERD ===`-blok met
  laatste 5 memories
- 3 nieuwe endpoints: `GET /chat/conversations`, `GET /chat/conversations/:id`,
  `POST /chat/conversations`

**Frontend**:
- `FillyChatHistoryMenu` (nieuw) — dropdown in chat-card-header met
  conversatie-lijst + "+ Nieuw gesprek" + active-marker
- `lib/api.ts` uitgebreid: `fetchChatConversations` + `fetchChatConversation`
  + `createChatConversation`. `sendChatMessage` parst nu de NL-error
  message uit response body voor cap-detection.
- `FillyChat` orchestrator: `messageCount`-state + `capReached`-derived
  + `switchConversation` + `startNewConversation` handlers
- Indicator "Bericht X / 20" in card-subtitle vanaf 10 berichten
  (oranje vanaf 15, rood-zone gevoel)
- Bij cap-bereikt: input verbergt, vervangen door brand-soft CTA-block
  met "Filly onthoudt wat 'ie heeft geleerd"-tekst + nieuw-gesprek-knop

**Cost analysis** voor memory-systeem:
- Haiku 4.5 summary call: ~€0.001 per chat-cap-event
- Actieve klant met 1-2 cap-events/dag = ~€0.06/maand aan memory-kosten
- Memory in system-prompt = +200-500 tokens, cacheable
- Veel goedkoper dan vector DB (geen embedding-kosten + geen retrieval-tuning)

**Wat NOG niet gedaan** (voor later):
- Expliciete UI op account-pagina ("Verboden woorden", "Style notes")
- Vector DB (pas relevant bij 100+ memories per klant)
- Streaming chat (P3 backlog)

### 2026-04-30 — Design-system: tokens + 8 base-components + sweep-migraties

Grote UI-investeringssessie verspreid over 8 commits. Doel: van
"inline styling overal + 3 button-patterns + 5 inline empty-state-
patterns" naar één design-tokens-laag + composable component-library.

**Foundation** (commit `2492c15`):
- ✅ `apps/web/src/app/tokens.css` als single source-of-truth voor
  kleuren, spacing (8px-grid: --space-1 t/m --space-8), radii,
  shadows, typography. Oude korte aliases (--ts/--bl/--blue/--r/etc)
  blijven werken.
- ✅ `globals.css` + `dashboard.css` :root-blokken weg (waren duplicaten).
  Brand-update is nu één file.
- ✅ Eerste 3 base-components: `<Button>` (4 variants × 2 sizes +
  loading-spinner + iconLeft/iconRight), `<Badge>` (6 variants +
  optionele dot), `<Card>` + sub-components.
- ✅ `/dashboard/design-system` reference-pagina met live demos.

**Sweep-migraties** (commits `f8be354`/`06ea968`/`c29fc2f`):
- ✅ 35 dashboard-knoppen `.btn-primary-dash` / `.btn-secondary-dash`
  → `<Button>` (12 files).
- ✅ Lucide-iconen voor functionele controls: chat-send (↑→Send),
  modal-close (✕→X), photo-replace (↻→RefreshCw). Topbar later mee.
- ✅ Spacing-pas naar tokens: dashboard-home + page-full + form-section/
  grid/field + alert-bar. KPI-row gap 14→16, card-padding 20→24.

**Alignment-fixes + 3 nieuwe components** (commit `5da5a85`):
- ✅ `<PageHeader>` — vervangt 9 inconsistente page-header-row patterns
  (sommige met page-header-row wrapper, anderen stacked). Alle
  dashboard-pagina's nu uniform.
- ✅ `<EmptyState>` — 10 inline empty-state-instances → 1 component.
  Variërende margin-overrides verdwenen; topGap-prop voor expliciete
  intentie.
- ✅ `<ButtonLink>` — Button-stijl op Next.js Link. 2 plekken
  gemigreerd (account menu-link + account-verwijderd home-link).

**Topbar Lucide + 2 nieuwe components** (commit `6964503`):
- ✅ Topbar burger ☰→Menu, 🔔→Bell, 🔍→Search. <div>→<button> voor
  semantiek + aria-labels.
- ✅ `<Tabs items active onChange>` met optionele count-badge.
  5 tab-migraties: campagnes / reviews / reserveringen /
  suggesties / taken.
- ✅ `<Input>` + `<Textarea>` met label/hint/error en a11y-koppeling
  (htmlFor + id auto). Component paste-klaar voor account-pagina.

**Chips + account-pagina input-migratie** (commit `6daef9e`):
- ✅ `<Chips items active onChange>` voor pill-stijl filter (campagnes
  type-filter mail/social/whatsapp).
- ✅ Account-pagina: 25 form-velden gemigreerd naar `<Input>` /
  `<Textarea>`. Hint-tekst zit nu in een prop, label krijgt
  automatische htmlFor + id.
- Bewust niet gemigreerd: selects (4), custom chip-pickers (talen,
  terras-zon), color-pickers, openingstijden-grid, sluitingsdata-
  chips, logo-upload, delete-modal-confirm — die hebben eigen UI.

**Eindstaat na deze sessie** (`apps/web/src/components/ui/`):
- button.tsx + button-link.tsx
- badge.tsx
- card.tsx
- page-header.tsx
- empty-state.tsx
- tabs.tsx
- chips.tsx
- input.tsx (Input + Textarea)
- ui.css (alle component-stijlen op één plek)

**Wat er voor de volgende UI-sessie open staat**:
- Select-component (4 plekken in account-pagina, drempelwaarde net niet)
- Sidebar CSS-tokenisering (lage impact)
- Alert-bar als Card-variant (lage prio)
- Echte Storybook (later wanneer component-library groeit)

### 2026-04-30 — Audit-log compleet (Fase A van P1-#2)

Alle service-mutaties die een eindgebruiker via het dashboard kan
triggeren schrijven nu naar `audit_log` mét echte `userId`. Drie
soorten werk:

**A1 — userId doorgereikt in 5 bestaande audit-calls** (waar voorheen
`userId: null` stond):
- ✅ `RestaurantService.update` — controller `@Patch('me')` reikt
  `@CurrentUser` door; service-signature heeft nu `userId: string`.
- ✅ `ReservationsService.setAttribution` — `@Patch(':id/attribution')`
  reikt user door zodat Filly-ROI-attributie traceerbaar is.
- ✅ `CampaignsService.create` / `updateStatus` / `remove` — alle 3
  controllers + de SuggestionsService.approve-flow geven userId mee.
  `campaigns.create(restaurantId, input, userId: string)` is nu
  strict (geen optionele null meer).
- ✅ `SuggestionsController.approve` reikt user door naar
  `SuggestionsService.approve(restaurantId, suggestionId, userId)` →
  `CampaignsService.create(...)` zodat ook chat-approve-flow audit
  heeft.

**A2 — audit-writes toegevoegd op 4 ontbrekende plekken**:
- ✅ `MenuService.create/update/remove` → `menu_item_created/updated/deleted`.
  Update logt alleen `fields_changed` (keys), delete pakt `name` mee
  voor support, create pakt `name + category + is_signature` mee.
- ✅ `MenuService.importCard` → `menu_card_imported` met
  `kind + file_name + items_imported + confidence`. Eén import kan
  50+ gerechten in één klap toevoegen.
- ✅ `MenuService.removeCard` → `menu_card_removed` met `items_deleted`
  zodat we cascade-impact kunnen herleiden.
- ✅ `ReviewsService.updateResponse` → `review_response_updated`. Logt
  `source + rating + response_length` (niet de tekst zelf — voorkomt
  klant-namen in audit-log; tekst zit nog in de DB-rij zelf).
- ✅ `OnboardingService.completeOnboarding` → `onboarding_completed`
  met `type + had_website + menu_items_imported + drink_items_imported`.
  Markeer-moment voor "klant-since"-metrics.

**Module-imports**: `MenuModule`, `ReviewsModule`, `OnboardingModule`
importeren nu `AuditLogModule` (was alleen Restaurant + Reservations +
Campaigns).

**Wat is NIET gedaan deze sessie**:
- Per-request Supabase-client met user-JWT (Fase B). Bewust uitgesteld
  omdat dat een echte test-pas met RLS-validatie nodig heeft —
  vergeten policy = klant uit eigen data gesloten. Volgt in eigen sessie.

### 2026-04-30 — AVG, drankkaart, on-demand suggesties, tool-use, mobile-responsive

Grote sessie met ~20 commits. Hoofdpunten:

**AVG & legal**:
- ✅ `apps/web/src/config/company.ts` als centrale plek voor Get-Filly's eigen bedrijfsgegevens; `<LegalField>`-component op `/privacy` en `/voorwaarden`. Banner + placeholders verdwijnen automatisch zodra `legalName + kvk` ingevuld.
- ✅ AVG art. 17 (right to be forgotten): `DELETE /restaurant/me/account` met "VERWIJDER"-bevestiging. UI op account-pagina sectie "Data & privacy". Cascade-delete van auth.users + alle owner-restaurants. Bewijs-rij in nieuwe `account_deletions`-tabel.
- ✅ Migratie 0023: `campaign_benchmarks` + `account_deletions`. Anonimisering bij `campaign.status → afgerond` schrijft GDPR Recital 26-conforme rij (cuisine + region=provincie + capacity-bucket + month + theme + result-metrics, géén body, géén FK). Filly's leerschat groeit zonder PII-lekken.

**Tool-use migratie (alle Filly-flows)**:
- ✅ `AiService.generateStructured<T>` + `generateStructuredFromFile<T>` als centrale wrappers met Anthropic tool-use. Vision-calls gebruiken streaming-API zodat 24k-cap niet de 10-min-pre-flight raakt.
- ✅ Gemigreerd: website-analyzer, menu-importer, campagne-refine (3 varianten + minItems=3 maxItems=3), suggestion-refine, reviews-refine, schedule-suggestion. Geen JSON.parse-fouten meer mogelijk.
- ✅ Diagnostic: `max_tokens bereikt`-warning in logs zodat we caps tijdig kunnen ophogen.

**Drankkaart-flow**:
- ✅ Migratie 0024 (`menu_items.subcategory`) + 0025 (`menu_uploads.kind`). Drank-tool-schema dwingt subcategory-enum af (wijn-rood/wit/rose/mousserend, bier, cocktail, sterke-drank, koffie-thee, fris). Cap 24k voor drank, 16k voor menu — drank heeft langere description (druif/regio/jaargang).
- ✅ UI: 2 aparte upload-knoppen (📄 Menu / 🍷 Drank), 2 banners onder elkaar, klik op bestandsnaam opent signed URL.
- ✅ Onboarding-wizard heeft 2e file-input naast menu.
- ✅ `RestaurantContextService.buildMenuBlock` heeft nu aparte `MENU` en `DRANKKAART` secties zodat Filly wijnen niet door gerechten haalt.

**Suggesties-flow productie-waardig**:
- ✅ `getMockProposal()` weg. `SuggestionsService.getProposalDetails()` levert mainDish/sides/timing/bundle-prijs/heroImage via Claude tool-use, gecachet in `suggested_campaign.proposal_details`.
- ✅ "✨ Vraag Filly om voorstellen"-knop op /campagnes. `generateOnDemand()` → 3-5 suggesties met trigger_type-enum.
- ✅ Lage-bezetting-detect-and-generate: alert-bar bovenaan dashboard heeft actieknop. Window 2-14 dagen, drempel <50%, per-dag Claude-call met dag-context (weekdag, weer, segment-counts). Skip-regel: dagen met al pending suggestie worden overgeslagen.

**Variant-flow + schedule-cyclen**:
- ✅ Migratie 0026: `campaigns.variant_applied_at` + `scheduling_history`. Refine-sectie verbergt na variant-keuze; chat-varianten worden seed voor `filly_variants` (geen dubbele 3+3 generatie). Schedule-suggestie-knop cyclet door history na 4 unieke alternatieven (geen Claude-calls bij cycle).
- ✅ "📅 Inplannen" + "▶ Plaats nu / Activeer"-knoppen op detail-pagina header.

**Demo-account opgezet**:
- ✅ Radical-reset SQL voor schoon DB. Demo-account `floriskoevermans@outlook.com` (restaurant_id `a462cf39-ef9b-49cb-bd8e-a84a10a3f888`) gevuld met 18 gasten, 30 reserveringen, 31 occupancy-dagen, 10 reviews (mix Google/TripAdvisor/IENS), 5 campagnes (1 concept, 1 ingepland, 1 actief, 2 afgerond), 3 pending AI-suggesties met realistische triggers + 6 reservations gekoppeld aan afgeronde campagnes voor Filly-ROI.

**Onboarding-checklist**:
- ✅ `OnboardingChecklist`-component op account-pagina (NIET dashboard, want daar duwde 'ie KPI's weg). 6 items + progress-bar + ✕-dismiss (localStorage).

**Mobile-responsive (volledig)**:
- ✅ Fase 1: sidebar wordt offcanvas onder 1024px (☰-burger in topbar, backdrop, klik-buiten-sluit).
- ✅ Fase 2: dashboard-pagina — KPI-row 5→2→1 cols, weather auto-fit, dash-body 1-kolom op tablet.
- ✅ Fase 3: lijst-paginas — tabellen horizontaal scrollbaar, filter-tabs zijwaarts scrollen.
- ✅ Fase 4: detail-paginas + modals — form-grid 2→1 col, save-bar sticky bottom, modals full-screen onder 768px.
- ✅ Fase 5: publieke site — navbar/login/legal-tables responsive.
- ✅ Breakpoints: 1024 (tablet), 768 (telefoon), 480 (klein).

**KPI's & UX-tweaks**:
- ✅ KPI-row "via Filly"-regel altijd zichtbaar (ook bij 0).
- ✅ Menu-categorieën: 6e tab "Tussengerechten" toegevoegd, normalize-mapper voor ~20 alias-strings (zodat Vision niet kan ontsnappen aan de 6 UI-keys).
- ✅ WeatherForecast: nette empty-state ipv 7 lege dag-vakjes.

### 2026-04-29 — Gasten-attributie + Audit-log + Data-export (AVG)
- ✅ **Gasten Filly-attributie**: backend selecteert `acquired_via_campaign_id`, `setReservationAttribution` zet automatisch dezelfde campagne op de gast als nog niet gevuld. Frontend toont "Via Filly"-stat-card + kolom met badge. Cijfer matcht het écht-aantal (geen mock).
- ✅ **`AuditLogService`** (common/audit-log.service.ts + module): centrale schrijver voor de audit_log-tabel. Fail-soft: caller-actie blijft slagen ook als log mislukt.
- ✅ Audit-writes geïntegreerd: `CampaignsService` (created/status_changed/deleted), `RestaurantService` (updated met fields_changed-keys + website_analyzed), `ReservationsService` (attribution_set). userId=null voor nu — controllers reiken nog niet door.
- ✅ **`DataExportService` + `GET /restaurant/me/export`**: AVG art. 20 — eigenaar download alle business-data als één JSON-blob (alle directe + indirecte tabellen op restaurant-id). Knop op account-pagina.
- ✅ Privacy-eigenschap van payload-velden: `restaurant_updated` logt alleen de keys die wijzigden, geen waardes — voorkomt dat namen/emails/KvK in de audit-log belanden.

### 2026-04-29 — Echte Filly-attributie + GitHub Actions CI
- ✅ **Migratie 0022**: `reservations.via_campaign_id` + `guests.acquired_via_campaign_id` FKs (on delete set null) + indexes voor KPI-aggregaties.
- ✅ **Backend KpiService** uitgebreid: `getKpis` levert nu `month_filly_reservations / guests / share_pct / revenue_cents`. Twee nieuwe endpoints: `/kpi/filly-attribution` (per-campagne aggregaties) + `/kpi/filly-roi-6m` (6-maanden bucket-grafiek).
- ✅ **Backend `setReservationAttribution`** + `PATCH /reservations/:id/attribution`: handmatig koppelen aan campagne met tenant-isolatie + campagne-bestaan-check.
- ✅ **Reserveringen-pagina** heeft nu de `FillyAttributionControl`-component: dropdown waarmee eigenaar reservering aan campagne koppelt; gekoppeld toont groene badge met campagnenaam + "×"-knop. Optimistisch updaten met rollback bij fout.
- ✅ **Dashboard KpiRow** toont nu "+N gasten via Filly" + "X% via Filly" + "+€Y via Filly" — gebaseerd op échte FK-data, niet op mock.
- ✅ **Rapportages-pagina** Filly-ROI-sectie weer actief: 3 totaalcijfers + 6-maanden bar-grafiek + per-campagne tabel. Toont eerlijke empty-state als nog geen koppelingen.
- ✅ **GitHub Actions CI** (`.github/workflows/ci.yml`): typecheck + build per PR. pnpm-cache + concurrency-cancel.

### 2026-04-29 — Mock-data eruit + Storage-policies + Cookie-banner
- ✅ **`FILLY_MOCK` uit kpi-row** verwijderd. Geen "+2 reserveringen door Filly"-fake meer op het dashboard. Cards tonen alleen de echte cijfers tot de send-engine attributie levert.
- ✅ **`isFromFilly()` weggehaald** in gasten (kolom + stat-card weg), in reserveringen vervangen door check op echt `source`-veld. Geen hash-mock meer.
- ✅ **`FILLY_ROI_6M` + `FILLY_BY_TYPE` uit rapportages** verwijderd. Hele Filly-ROI-sectie vervangen door eerlijke "nog niet meetbaar — wacht op send-engine"-empty-state.
- ✅ **Migratie 0021**: storage-bucket `restaurant-assets` policies aangescherpt — `anon insert/update/delete` weg, alleen `authenticated`-rol mag nog schrijven. Lek dichtgezet.
- ✅ **Cookie-banner** (`apps/web/src/components/cookie-banner.tsx`) in root-layout. Eerste bezoek → keuze accepteer/weiger, opgeslagen in localStorage. Klaar voor analytics-integratie.

### 2026-04-29 — CTO-taken: prompt-caching + graceful degradation + setup-docs
- ✅ **Prompt-caching live** — `AiService.generateText` accepteert nu `cacheSystem: true`. Wordt gebruikt door chat (elke bericht), campaign-refine (regenerate), reviews-refine (regenerate). Anthropic prompt-caching geeft ~90% korting op input-tokens bij recurring calls binnen 5 min TTL. `ai_usage` logt nu ook `cache_creation_input_tokens` correct.
- ✅ **Graceful Claude-downtime** — nieuwe `toNlException`-helper in `AiService` vangt `APIConnectionError` / `RateLimitError` / `AuthenticationError` / 5xx / 4xx specifiek af en gooit een NL-vriendelijke `ServiceUnavailable` ("Filly is even druk", "Filly is niet bereikbaar") i.p.v. raw 500.
- ✅ **DB-schema-documentatie**: [docs/database-schema.md](docs/database-schema.md) met alle tabellen + relaties + storage-buckets + migratie-overzicht + open DB-punten.
- ✅ **Setup-guides geschreven** voor de CTO-taken die externe accounts vereisen:
  - [docs/database-migrations.md](docs/database-migrations.md) — Supabase CLI workflow
  - [docs/sentry-setup.md](docs/sentry-setup.md) — error-tracking setup
  - [docs/anthropic-cost-alerts.md](docs/anthropic-cost-alerts.md) — cost-control + budget-alerts
  - [docs/staging-setup.md](docs/staging-setup.md) — 2e Supabase + Railway + Vercel preview
  - [docs/scaling-roadmap.md](docs/scaling-roadmap.md) — multi-instance scaling per groei-fase

### 2026-04-29 — Empty-states-sweep afgerond
- ✅ KpiRow: rode "Fout bij laden KPI's" → "Cijfers nog niet beschikbaar — zodra reserveringen en campagnes binnenkomen verschijnen ze hier."
- ✅ WeatherForecast: rode "Fout: …" → "Nog niet beschikbaar — vul je adres aan op de account-pagina."
- ✅ Suggesties-pagina: rode "Fout: {error}" → empty-state-card met info over herladen.
- ✅ Campagne-detail-pagina: rode tekst bij niet-bestaande campagne → mooie empty-state met "Campagne niet gevonden"-uitleg.
- ✅ Account-pagina: rode "Fout bij laden:" → empty-state met "Account-gegevens niet geladen — probeer herladen of opnieuw inloggen."
- ✅ Rapportages-pagina: nieuwe klant zonder data zag overal "0%" → volledige empty-state ("Nog geen data om te rapporteren"), pas zichtbaar als alle 3 datasets (guests/campaigns/occupancy) leeg zijn.
- ✅ Reviews-pagina: nieuwe klant zonder reviews → empty-state die naar koppelingen-pagina verwijst voor Google Business / TripAdvisor-import.
- ✅ Form-validation-fouten (reservering aanmaken, review-reply genereren) blijven bewust rood — passend bij user-action-fouten (≠ page-load).

### 2026-04-29 — Account-pagina volledig werkend (alle profiel-velden bewerkbaar)
- ✅ Migratie 0018: 7 nieuwe kolommen op `restaurants` voor bedrijfsgegevens (legal_name, kvk_number, vat_number, contact_email, contact_phone) + e-mailinstellingen (email_from_name, email_reply_to).
- ✅ Backend `RestaurantService.update`: forbidden-field filter (id/created_at/plan/lat-long), validatie (KvK 8-cijfers, BTW NL-format, e-mail regex, telefoon min 8 cijfers), automatische geocoding-trigger via PDOK bij adres-wijziging. Forbidden lat/long → reset bij geen geocode-match.
- ✅ Backend `RestaurantService.analyzeWebsite` + endpoint `POST /restaurant/me/analyze-website`: handmatige Claude-call die tagline/sfeer/USPs/socials/etc invult (alleen non-empty velden zodat bestaande data niet stuk gaat).
- ✅ Frontend Restaurant-type uitgebreid: 7 bedrijfs-velden + logo_url + brand_colors.
- ✅ Account-pagina herschreven: 14 secties — Restaurant / Identiteit / Website (analyze-knop nu actief) / Locatie / **Openingstijden** (NIEUW: per-dag editor met Open-toggle + tijden) / **Sluitingsdata** (NIEUW: chip-list, add via date-picker) / Capaciteit / **Talen** (NIEUW: chips multi-select) / Branding (logo upload via restaurant-assets bucket + brand_colors color-pickers + brand_tone) / **Social media** (Instagram + Facebook + TikTok + LinkedIn) / **Bedrijfsgegevens** (NIEUW: legal_name, KvK, BTW, contact-email, contact-telefoon) / **E-mailinstellingen** (NIEUW: afzender-naam + reply-to) / Menukaart (vervangen door link naar /dashboard/menu) / Abonnement.
- ✅ Globale save-bar werkt voor alle secties tegelijk; Filly krijgt nieuwe/aangepaste velden direct bij volgende prompt-call.

### 2026-04-29 — Rijke context naar campagne-refine + schedule + reviews-reply
- ✅ **CampaignsService.refine** (3 alternatieven genereren): system-prompt krijgt nu `buildProfileBlock` + `buildMenuBlock`. Filly kan in varianten verwijzen naar échte gerechten met prijzen, USPs, doelgroep en sfeer i.p.v. generieke marketingtaal. Anti-hallucinatie regel: "refereer ALLEEN aan menu-items die letterlijk in MENU staan".
- ✅ **CampaignsService.suggestSchedule** (tijdstip-voorstel): losse `restaurants`-query weg, vervangen door `buildProfileBlock` + `buildLiveBlock`. Filly houdt nu rekening met openingstijden, special events, en actuele bezetting bij het kiezen van een verzendmoment.
- ✅ **ReviewsService.generateReplySuggestion + refineVariants**: zelfde `buildProfileBlock` integratie. `buildReviewReplySystemPrompt` accepteert nu een profile-string i.p.v. los object. Filly kan in z'n review-antwoord refereren aan signature dishes, sfeer of USPs als de review er over gaat.
- ✅ Geen DB-wijzigingen nodig — alle data zat al in `restaurants` + `menu_items`.

### 2026-04-29 — Menukaart-upload werkt echt + Filly kent recent toegevoegde items
- ✅ **A — Recent-toegevoegd-sectie in MENU-blok**: `buildMenuBlock` neemt nu `created_at` mee, voegt onderaan een lijst toe met de 8 nieuwste items (laatste 30 dagen) gesorteerd op datum. Filly kan zo letterlijk antwoorden op "wat is jullie nieuwste signature?".
- ✅ **B — Menukaart-upload écht werkend**: `MenuService.importCard` uploadt naar `menu-uploads` bucket, maakt `menu_uploads`-rij, draait `MenuImporterService` (Claude Vision) en schrijft alle gerechten weg als `menu_items` met `menu_upload_id` FK. Bij Vision/insert-fouten: `processing_error` op upload-rij + bestand blijft staan voor audit.
- ✅ Backend endpoints: `POST /api/menu/import-card` (multipart), `GET /api/menu/active-card`, `DELETE /api/menu/cards/:uploadId`. Eerste in MenuModule waar AiModule wordt geïmporteerd.
- ✅ Frontend: `importMenuCard` / `fetchActiveMenuCard` / `deleteMenuCard` in `lib/api.ts`. Menu-pagina haalt actieve kaart bij mount op zodat banner ook na F5 zichtbaar is.
- ✅ `UploadMenuModal` rewrite: echte file-upload via FormData + 3 cosmetische stages tijdens 5-15s wachttijd ("Uploaden → Filly leest → Toevoegen"). Bij success: lijst met geïmporteerde items + Filly's notes. Bij fout: error-stage met message. Modal-sluiten geblokkeerd tijdens upload.
- ✅ "Verwijder menu-kaart"-knop doet echte API-call (cascade-delete: items met `menu_upload_id` verdwijnen, handmatige items blijven). State-banner refresh't via `fetchActiveMenuCard`.

### 2026-04-29 — Menu-pagina écht aangesloten op DB
- ✅ Backend `MenuService.create / update / remove` met validatie (NL-foutmeldingen op naam-leeg, prijs-negatief, ongeldig seizoen, te veel dieet-tags). Tenant-isolatie via dubbel `eq(restaurant_id)` bovenop de RestaurantAccessGuard.
- ✅ Endpoints `POST /api/menu`, `PATCH /api/menu/:id`, `DELETE /api/menu/:id`.
- ✅ Frontend `lib/api.ts`: `createMenuItem` / `updateMenuItem` / `deleteMenuItem` met `readErrorMessage`-helper voor nette NL-fouten in alerts.
- ✅ Menu-pagina `saveItem` / `deleteItem` zijn async, doen API-call + verse `fetchMenu`-refetch zodat lokale state altijd matcht met DB. `saving`-state disablet modal-knoppen tijdens roundtrip + toont "Toevoegen…/Opslaan…/Verwijderen…".
- ✅ **Resultaat**: nieuwe gerechten en wijzigingen verschijnen direct in Filly's volgende prompt (`buildMenuBlock` leest live uit dezelfde `menu_items`-tabel).

### 2026-04-29 — Filly weet nu profiel + menu (rijke context in chat)
- ✅ `RestaurantContextService` opgesplitst in 3 builders:
  - `buildProfileBlock()` — type/cuisine, tagline, sfeer, doelgroep, USPs, signature dishes, locatie, prijsklasse, capaciteit, faciliteiten, openingstijden (compacte formattering met dag-groepering), talen, socials, website, brand_tone.
  - `buildMenuBlock()` — gerechten gegroepeerd per categorie, naam + €-prijs + [signature]-marker, top 60 items, dieet-overzicht onderaan (8× vegan, 12× vegetarian, etc).
  - `buildLiveBlock()` — voorheen `buildContextBlock`: weer/bezetting/reserveringen.
- ✅ `buildFullContext()` plakt alle 3 blokken samen voor features die volledige context nodig hebben (chat, suggesties, refine).
- ✅ `buildContextBlock` blijft als alias voor backwards-compat (geeft alleen live-block).
- ✅ Chat `buildSystemPrompt` gebruikt nu `buildFullContext` + extra anti-hallucinatie regels ("refereer alleen aan menu-items die letterlijk in MENU staan").
- ✅ Helpers: `formatOpeningHours` (groepeert aaneengesloten dagen: "ma-vr 11:00-23:00 · za-zo 10:00-23:00"), `formatPrice` (NL-locale €-format), `shorten` (knipt op spatie).

Open: prompt-caching activeren op profiel+menu (P2 in BACKLOG). Campagne-services (`refine`, `suggestSchedule`) en reviews-reply nog naar dezelfde context laten luisteren.

### 2026-04-29 — Campagne-actieknoppen vereenvoudigd (lineaire flow)
- ✅ Migratie 0017: bestaande `gearchiveerd`-rijen → `afgerond` + CHECK-constraint vernauwd tot 4 statussen (`concept`, `ingepland`, `actief`, `afgerond`).
- ✅ `CampaignStatus`-type opgeschoond, badge-stijl `.gearchiveerd` uit dashboard.css.
- ✅ Lineaire status-flow zonder zijpaden:
  - `concept` → ✓ Inplannen + ✕ Verwijder
  - `ingepland` → ▶ Activeer + ✕ Verwijder
  - `actief` → ⏹ Stop (= afgerond)
  - `afgerond` → eindstaat, geen actie-knop
- ✅ Backend `updateStatus`-allowed-map: alleen voorwaartse transities (geen "↶ Concept", geen "Opnieuw inplannen").
- ✅ Backend `remove`: toegestaan voor concept én ingepland (nog niet uitgegaan, geen audit-impact). Actief/afgerond blijven onaantastbaar in DB.

### 2026-04-25 — WhatsApp-foto in eigen card + Filly-tijdstipsuggestie
- ✅ WhatsApp-detail-layout: foto-slot uit de bubbel-preview verplaatst naar een eigen "Foto"-card direct onder Inhoud. Social-layout blijft ongewijzigd (foto in Instagram-preview is visueel correct daar).
- ✅ Migratie 0016: `campaigns.suggested_scheduled_for` + `suggested_scheduled_reasoning` voor Filly's caching van tijd-voorstel.
- ✅ Backend: `suggestSchedule(restaurantId, id, force?)` — Claude-call met type/restaurant-context, returnt datetime + reasoning. Cachet in DB; force=true overschrijft. `setSchedule(restaurantId, id, datetime)` — handmatige set met validatie. `findById` levert nu beide velden mee.
- ✅ Endpoints: `POST /:id/suggest-schedule` + `PATCH /:id/scheduled`.
- ✅ Frontend `CampaignSchedulePanel`: auto-bootstrap bij eerste open van concept zonder voorstel; toont "Filly stelt voor: [datetime]" met reasoning + "Accepteer / Wijzig zelf / Andere suggestie"-knoppen. Bij scheduled_for gezet: definitieve tijd + Wijzig-knop. Native datetime-local input voor handmatige override.

Open: AI-foto genereren via fal.ai/Replicate/OpenAI (provider-keuze ligt bij Floris).

### 2026-04-25 — Foto-upload op concept-campagnes (social + whatsapp)
- ✅ Migratie 0015: `campaign-media` Storage-bucket (private) met RLS-policies — zelfde patroon als menu-uploads, eerste path-segment is restaurant_id voor tenant-check via `user_has_restaurant_access`.
- ✅ CampaignsService: `uploadMedia` (validate + upload + cleanup oude file + save path), `deleteMedia` (storage rmdir + clear DB-veld), `signMediaPath` (1-uur signed URL). `findById` levert nu signed URLs voor preview i.p.v. ruwe paden.
- ✅ Backend endpoints: `POST /api/campaigns/:id/media` (multipart, 10MB cap, JPG/PNG/WebP/GIF) + `DELETE /api/campaigns/:id/media`. Beide alleen op concept-status; mail-type weigert (header-image is later werk).
- ✅ Nieuwe `CampaignMediaSlot`-component: drop-zone bij geen foto, `<img>`-preview bij wel foto met overlay-knoppen "↻ Vervang" / "✕". Drag-and-drop ondersteund. Geïntegreerd in social-preview én whatsapp-preview.
- ✅ Path-conventie `<restaurant_id>/<campaign_id>/<timestamp>-<safeName>` zodat we per campagne kunnen wissen + filenames sanitizen tegen path-traversal.

Open: AI-foto genereren via fal.ai/Replicate/OpenAI (provider-keuze ligt bij Floris).

### 2026-04-25 — Filly-varianten-cache + 1× regenerate (campagnes + reviews)
- ✅ Migratie 0014: `campaigns.filly_variants jsonb` + `filly_variants_regen_count int` (idem voor reviews). Cachet 3-of-6 alternatieven server-side zodat her-bezoek geen Claude-calls triggert.
- ✅ CampaignsService: `getVariants` (read cache) + `refine` met count-logic (count=0→3, count=1→3 extra, count≥2→BadRequest). PATCH /campaigns/:id wist cache + reset count bij body-wijziging zodat alternatieven matchen met de nieuwe inhoud.
- ✅ ReviewsService: zelfde patroon — `getVariants` + `refineVariants` met 3-tegelijk JSON-prompt.
- ✅ CampaignRefinePanel rewrite: bootstrap fetcht cache, auto-genereert 3 als leeg. "Genereer 3 nieuwe"-knop bij `can_regenerate`. Daarna disabled met copy "Maximum bereikt".
- ✅ Reviews-modal: variants-grid altijd zichtbaar (auto-fit minmax 180px). Knop "↻ Genereer 3 nieuwe" verschijnt bij can_regenerate; verdwijnt bij count=2.

### 2026-04-25 — Quick-actions + TasksStrip-filter + 3-varianten-flow
- ✅ **Quick-actions in campagnes-tabel**: nieuwe kolom "Actie" rechts naast Status. Per status andere knoppen: concept → Inplannen / Verwijderen, ingepland → Activeren / Concept / Archiveer, actief → Stop, afgerond → Archiveer, gearchiveerd → Verwijderen. `PATCH /api/campaigns/:id/status` met allowed-transitions-map; `DELETE /api/campaigns/:id` alleen op concept of gearchiveerd (audit-veiligheid).
- ✅ **TasksStrip filter + scroll**: tabs "Actie vereist (N)" / "Alle (N)" — eerste filtert op high+medium prio. Lijst krijgt `max-height: 320px` met scroll zodat lange takenlijsten de pagina niet uitrekken.
- ✅ **3 varianten per chat-proposal**: prompt updated zodat Filly altijd 3 alternatieven naast elkaar genereert (warm/zakelijk/speels). Parser ondersteunt zowel variants[] als legacy single-body. SuggestionDetailModal rendert klikbare grid; selectie via `POST /api/suggestions/:id/select-variant`. Refine herschrijft alleen geselecteerde variant. Approve maakt campagne uit geselecteerde variant.

### 2026-04-24 — Concept-campagne bewerken + chat-refine op suggesties + empty-state-sweep
- ✅ `PATCH /api/campaigns/:id` — updaten van concept-campagnes (name, subject_line, body). Backend weigert als status ≠ concept zodat verzonden/ingeplande campagnes immutable blijven.
- ✅ Frontend: "✎ Bewerken"-knop op concept-campagne-detail → inline edit-form voor naam + onderwerp + inhoud. "Opslaan"/"Annuleren". Refetch na save zodat previews meteen kloppen.
- ✅ `POST /api/suggestions/:id/refine` — Filly past suggestie aan op basis van een instructie ("maak huiselijker", "korter", "andere foto"). Claude krijgt huidige campagne + instructie → returns nieuwe volledige versie → update `ai_suggestions.suggested_campaign`. Blijft pending.
- ✅ `SuggestionDetailModal` op /campagnes: 2-kolommenview (inhoud + side-chat). Vanaf "Details"-knop op elk suggestie-kaartje. Praat-met-Filly-chat + Goedkeuren/Afwijzen-acties onderaan.
- ✅ Empty-state-sweep: rode "Fout: HTTP 403/500"-banners vervangen door rustige empty-states met "niet geladen"-copy bij fout. Gasten, menu, reserveringen, campagnes zijn nu helder en eenduidig.

### 2026-04-24 — Reserveringen: handmatige invoer + filter + zoek
- ✅ Backend: `ReservationsService.create()` + `POST /api/reservations` voor handmatige boekingen. Required: naam, datum, tijd, groep. Optioneel: telefoon, mail, bijzonderheden, notes. Auto-status='bevestigd', source='handmatig'.
- ✅ Frontend: "＋ Nieuwe reservering"-knop rechtsboven (page-header-row), opent modal met form (Escape/klik-buiten = dicht).
- ✅ Filter-tabs: Alle / Bevestigd / Ingecheckt / Voltooid / No-show / Geannuleerd.
- ✅ Zoekveld: matcht op naam, telefoon, mail — realistische usecase voor telefoon-gesprek ("familie Jansen" of laatste paar cijfers van een nummer).
- ✅ Via Filly-badge: groene "✓ Via Filly"-pill in aparte kolom consistent met gasten-pagina. Pill naast naam weggehaald om dubbele info te voorkomen.
- ✅ Empty-state onderscheidt "niks gevonden met filters" van "nog helemaal geen reserveringen" (met "Nieuwe reservering"-CTA).

### 2026-04-24 — Gasten: Via Filly als eerste kolom
- ✅ Nieuwe eerste kolom (90px breed) met groene "✓ Ja"-badge of streepje.
- ✅ Pill naast naam weggehaald om dubbele info te voorkomen.

### 2026-04-24 — Campagnes + suggesties samengevoegd onder /campagnes
- ✅ Structurele refactor: Filly's voorstellen (auto-gegenereerd + uit chat) en campagnes leven samen op `/dashboard/campagnes`. Suggesties-strip bovenaan, campagne-tabel daaronder. Geen dubbelop-gevoel meer.
- ✅ Backend: `SuggestionsService.approve()` maakt campagne aan uit `suggested_campaign` JSON + zet `ai_suggestions.status='approved'` + `approved_campaign_id` FK. Wordt aangeroepen via nieuwe `POST /api/suggestions/:id/approve`.
- ✅ Backend: `SuggestionsService.createFromChat()` + ChatService maakt nu een ai_suggestion bij elk chat-voorstel (`trigger_type='chat'`), koppelt aan `chat_messages.ai_suggestion_id`, vult `message_card.suggestion_id`. Chat-voorstellen lopen daardoor door dezelfde goedkeur-flow als auto-gegenereerde suggesties.
- ✅ Frontend: `/campagnes` pagina fetcht beide + rendert suggesties-strip met `SuggestionCard`-componenten (inline styling: bron-label, type-badge, urgentie, body-preview, 3 acties). Goedkeuren → direct naar nieuwe campagne.
- ✅ Sidebar: "Suggesties" verwijderd als apart menu-item (route `/dashboard/suggesties` blijft voorlopig bestaan voor detail-views totdat blok 3 de chat-edit-modal levert).
- ✅ Module-imports bijgewerkt: CampaignsModule exporteert CampaignsService, SuggestionsModule importeert CampaignsModule + exporteert zichzelf, ChatModule importeert SuggestionsModule.

### 2026-04-24 — Filly-chat → campagne-actie
- ✅ System-prompt uitgebreid met `<<FILLY_PROPOSE_CAMPAIGN>>` formaat zodat Filly zelf aangeeft wanneer hij een concrete campagne voorstelt (alleen bij actionable, niet bij brainstorm)
- ✅ `extractCampaignProposal()` parser: strip het machine-blok uit de prozatekst en valideer JSON (type/name/body). User ziet alleen nette tekst, message_card bevat de proposal.
- ✅ `chat_messages.message_card` (bestond al sinds migratie 0001) wordt nu daadwerkelijk gevuld — geen nieuwe migratie nodig
- ✅ `CampaignsService.create()` + `POST /api/campaigns` — insert in campaigns + type-specifieke content-tabel, rollback bij content-fout
- ✅ Frontend `ProposalCard`-component onder Filly-bericht: type-badge + titel + onderwerp + "Ja, maak aan / Nee, bedankt". Na accept → link naar `/dashboard/campagnes/[id]`. Per-message status-state (pending/creating/created/dismissed/error).
- ✅ Nieuwe campagnes landen met status `concept` en `meta: "Voorgesteld door Filly"` zodat ze herkenbaar zijn in overzicht.

### 2026-04-24 — Menu-items-insert bug fix
- ✅ **Root-cause**: `menu_items.insert()` probeerde te schrijven naar kolom `allergens` die niet bestond (schema had alleen `dietary_tags`). Alle Vision-extracties faalden silent door `console.warn` zonder rollback, terwijl onboarding-response 'succesvol' teruggaf.
- ✅ Migratie 0013: `menu_items.allergens text[]` toegevoegd (EU 1169/2011 allergeen-info, semantisch gescheiden van dietary_tags)
- ✅ OnboardingService: `console.warn` → `console.error` + `menuImport: { attempted, inserted, error }` in response zodat frontend de fout kan tonen
- ✅ Onboarding-frontend: `alert()` bij `menuImport.error` zodat user niet stil menu-items verliest
- ✅ Geverifieerd: nieuw test-account kreeg 54 menu-items correct geïmporteerd

### 2026-04-24 — Auth + onboarding
- ✅ Password-reset flow: `/forgot-password` + `/reset-password` + Supabase email-template (commit `335f5a1`)
- ✅ Supabase Management API-script `pnpm supabase:apply-templates` voor alle 4 email-templates (commit `2775f08`)
- ✅ `<PasswordStrength>`-component met live 4-checks (8+, letter, cijfer, speciaal) + confirm-veld op signup én reset-password (commit `15fe843`)
- ✅ `/onboarding` 3-stappen wizard + POST `/api/onboarding/restaurant` + dashboard-redirect-middleware (commit `5d888c9`)
- ✅ Migratie 0010: `restaurants.website_url` + `onboarded_at`
- ✅ `WebsiteAnalyzerService` — cheerio-crawl + Claude-analyse, vult alle profiel-velden (tagline, atmosphere, target_audience, USPs, signature_dishes, cuisine_style, website_summary, social_media) (commit `b29f317`)
- ✅ `MenuImporterService` — Claude Opus 4.7 Vision op PDF/image, extraheert gerechten + prijzen + categorieën + allergenen (commit `b29f317`)
- ✅ `AiService.generateFromFile` — Vision- en document-support
- ✅ Migratie 0011: `menu_uploads`-tabel + `menu-uploads` Storage-bucket met RLS
- ✅ Migratie 0012: `ai_usage.restaurant_id` nullable voor pre-onboarding logging
- ✅ FillyChat wacht op RestaurantContext → eliminatie 400-race bij eerste dashboard-render (commit `b29f317`)
- ✅ Polish-fixes: fetch-timeout 5s → 12s (Cloudflare/Wix), userId weglaten bij pre-onboarding analyses om FK-violations te vermijden (commit `d909c65`)

### 2026-04-23 — Filly AI-laag
- ✅ `0009_ai_usage.sql` — migratie voor Claude-call tracking
- ✅ `AiService` centrale wrapper + `AiCallMeta`-type dwingt tracking af
- ✅ `AiRateLimitGuard` — 100 calls/uur/restaurant
- ✅ Review-reply-suggesties via Claude (toon B, geen handtekening)
- ✅ 3-varianten-kiezer in reviews-modal met page-level persistence
- ✅ Filly-chat met persistente `chat_messages`-historie
- ✅ `RestaurantContextService` — herbruikbaar context-blok voor alle Filly-prompts
- ✅ Chat v2: live weer + bezetting + reserveringen in system-prompt
- ✅ `CLAUDE.md` bijgewerkt
- ✅ `docs/supabase-manual-setup.md` — alles wat niet in migraties staat
- ✅ `apps/api/supabase/seeds/test_restaurants.sql`
