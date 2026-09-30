# Get Filly — Backlog

Alles wat nog open staat, van belangrijkst naar minder belangrijk. **Werk deze
lijst bij** zodra iets klaar is, of wanneer je iets nieuws tegenkomt. Dit is dé
referentie voor elke werksessie, voor Floris en voor Claude in nieuwe chats.

> **Alleen open werk.** Zodra iets af is verhuist het naar
> [`docs/CHANGELOG.md`](docs/CHANGELOG.md), samen met het verhaal erachter.
>
> **Opgeschoond op 2026-09-29.** De volledige oude lijst (1161 regels, met alle
> afgevinkte punten en de uitgebreide toelichting per punt) staat in
> [`docs/archief/backlog-2026-09-29-voor-opschoning.md`](docs/archief/backlog-2026-09-29-voor-opschoning.md).
> Staat hieronder een punt zonder details, zoek de titel dan in dat archief.

## Hoe te lezen

Eigenaar per punt:

- **Floris**: eigen actie (dashboard, account, juridisch, keuze).
- **Claude**: bouwwerk.
- **Compagnon**: alles rond Meta, Instagram en Facebook. Niet voor Floris.

Prioriteit: **P0** blokkeert de eerste klant · **P1** vóór publieke launch ·
**P2** uitbreiden · **P3** later of nice-to-have.
Status: `[ ]` todo · `[~]` deels · `[x]` klaar (dan naar de changelog).

## Stand van zaken (2026-09-30)

Basis is degelijk: typecheck schoon, 566 API-tests groen, migraties tot en met 0085 gedraaid, auth deny-by-default,
RLS overal aan, geen fouten in de Vercel-logs van de laatste 24 uur. Web en API
draaien allebei op Vercel (`get-filly-web`, `get-filly-api`). De klant-blokkers
zijn vooral configuratie, nepdata op een paar plekken, betaling en Meta-review.

---

## Eerstvolgend na de sessie van 30-9 (uit de brein-ronde)

- [ ] **Live-checklist doorlopen** op www.get-filly.com: `docs/werking/live-checklist.md`, met vooral
      Nederlandse campagne-generatie (er zat een oneindige lus in `langWriteRules`, opgelost). *(Floris)*
- [ ] **Eerste bron in de kennisbank laden en testen.** Compagnon levert bronnen (wensen in
      `docs/werking/kennisbank-aanlevering.md`), daarna `scripts/kb.js import`, `analyse`, `brief`.
      Schema kan nog bijgesteld worden na de eerste levering. *(Compagnon levert, Claude laadt en test)*
- [ ] **Twee foto- en twee videosuggesties bij elk voorstel** en de plek om ze te tonen: eerst prototype.
      *(Claude prototype, Floris kiest plek)*
- [ ] **Plek om de kennisbank in te zien** voor Floris. *(Claude na overleg met Floris)*
- [ ] **Kleine opruiming:** `campaigns.module.ts` importeert `MailModule` zonder het te gebruiken; het
      `mail`-trefwoord in `CAMPAIGN_INTENT` (chat) mag weg. *(Claude, laag)*
- [ ] **Rustige momenten, na ~60 dagen data:** weer per venster calibreren en "leren in lagen"
      (kanaal, dagdeel, hoek) uit de eigen resultaten. *(Claude)*

## Focus van Floris (aangeleverd 2026-09-29)

Negen punten die Floris zelf als eerstvolgende werk heeft benoemd. De volgorde is nog niet
bepaald. Details van sommige punten staan verderop onder P1/P2 en zijn daar niet dubbel gezet.

- [~] **Website-frontend nalopen op teksten en afbeeldingen.** Gedaan en live op 29-9
      (branch `feat/site-tekstronde`): home, product, over ons, blog, contact. YouTube van de site,
      integratie-tekst zonder kassa en boekingssysteem, opgeknipte zinnen herschreven in NL en EN.
      Op 30-9 ook de product-mock naar horeca (Bistro Get-Filly, Reserveringen, Gasten) en de FAQ
      over onboarding zonder boekingssysteem.
      **Nog open:** prijzen en juridisch (Floris, andere chat), afbeeldingen (zie "Site-assets
      vervangen"), de hero-mockups op `/en`, en het boekingssysteem in het Ultimate-pakket (zie
      "Site en vertrouwen"). *(Floris + Claude)*
- [ ] **Filly-brein doorlopen.** Samen de werking nalopen: `docs/werking/filly-brein.docx`,
      `apps/api/src/ai/filly-brain.config.ts`, horeca-taal (`horeca-taal.ts`). *(Floris + Claude)*
- [ ] **Parameters van het Filly-brein bepalen, en voor het voorstellen van (potentieel) rustige
      dagen.** Onder andere `low_occupancy_threshold`, `UNUSUAL_SPREAD_MULT`, het tempo (mig 0065),
      de kansdrempel per dag en de beleidslaag. *(Floris bepaalt, Claude zet klaar met voorstellen)*
- [ ] **Betaalde-campagneflow bouwen, met de parameters die de prestaties meten** (Meta, TikTok,
      Google). Bevat doelgroep- en buurttargeting; zie "Betaalde advertenties" in P2 en
      "Segmentatie per campagne". *(Claude, Floris kiest KPI's)*
- [ ] **Suggestietekst per type uiting.** Filly zegt welk soort uiting werkt ("maak zo'n filmpje",
      "dit soort foto's scoren"), zodat het voor de klant makkelijker wordt. Bouwt op "Wat werkt
      bij jou" per kanaal (Resultaat). *(Claude)*
- [ ] **Foto-bewerkingstool laten werken:** de "Google studio" afmaken (bevestigd 29-9: de Google-beeldprovider
      met API-sleutel) en de foto-tool mergen. Zie "Foto-tool mergen" in P2. *(Floris + Claude)*
- [ ] **Filly-chat laat Google-bedrijfsgegevens controleren en aanpassen.** Filly stelt voor om te
      checken of de gegevens op het Google Bedrijfsprofiel kloppen, of om ze aan te passen vanwege
      een event. Daarvoor komt een melding; na akkoord van de eigenaar voert Filly de wijziging
      zelf door. Nu schrijft de app al omschrijving, tijden, speciale dagen en reviews; naam,
      telefoon, website en categorie zijn nog alleen lezen. *(Claude)*
- [ ] **Stories plaatsen op Instagram en Facebook.** Zie "Reels en Stories" in P2. *(Claude;
      compagnon controleert het App Dashboard.)*
- [ ] **Duidelijk aangeven dat je altijd ook een event of post kunt plaatsen via het Google
      Bedrijfsprofiel** (in de campagneflow en in Filly's voorstellen). Besluit 29-9: de
      GBP-event-posts komen erbij. *(Claude)*

---

## P0: voor de eerste klant

- [ ] **Flow één keer end-to-end doorlopen op een echt account.** Dashboard →
      geleide flow → concept → detailpagina (staat "waarom juist deze dag" er?)
      → rapportage. Nooit als ingelogde gebruiker gezien. *(Floris logt in,
      Claude kijkt mee.)*
- [ ] **Nepdata als terugval in de dag-keuze weghalen.** `seededOccupancy`
      (demoformule ma/di/wo 40-69%, do 55-79%, vr/za/zo 78-99%) in
      `apps/web/src/lib/occupancy-window.ts` (`seedMissing` staat standaard aan),
      `use-actionable-days.ts` (~regel 173) en
      `dashboard/_lib/calendar-data.ts`. Nieuwe klant zonder data moet een
      eerlijke "nog geen data"-staat zien. *(Claude. Optie A in het archief,
      sectie "Bezetting in de dag-keuze is nu seeded nep-data".)*
- [ ] **E-mailbevestiging aanzetten in Supabase** + Resend als SMTP-provider,
      anders loopt Supabase tegen de mailbeperking (3-4 per uur). Minder kritiek
      zolang aanmelden invite-only is, maar de enige echte blokkade voor open
      aanmelding. *(Floris. Daarna één keer de registratieflow doorlopen.)*
- [ ] **Jurist-review** van privacyverklaring, algemene voorwaarden (aansprakelijkheid
      €25.000, SLA 99%, IP van AI-output, prijswijzigingsclausule, Stripe/bunq)
      en de verwerkersovereenkomst, ook de EN-versies. *(Floris. DPA-template:
      `docs/legal/dpa-template.md`. `/sub-verwerkers` publiceren bij de eerste klant.)*
- [ ] **Betalingen met Stripe.** Checkout op de prijzenpagina, `subscriptions`-tabel,
      limieten per plan, webhook (trial → active → past_due → cancelled). De
      prijzenpagina staat geblurd (`HIDE_PRICING`). Beslissing 29-9: **geen gratis
      proefflow**. *(Floris kiest plannen en prijzen en maakt het Stripe-account,
      Claude bouwt.)*
- [ ] **Foutmonitoring en kostenalarm.** Sentry of alternatief (Floris kiest het
      account, Claude installeert; zie `docs/archief/sentry-setup.md`) en een
      limiet met alerts in de Anthropic Console (`docs/archief/anthropic-cost-alerts.md`).
- [ ] **Koppelingen opnieuw verbinden en testen.** In de hele database staat één
      credential: een verlopen TikTok-token (1 juli). Meta en Google
      Bedrijfsprofiel staan voor geen enkele zaak. *(Floris via de koppelingen-pagina.)*
- [ ] **Teamlid-invite end-to-end testen.** Moet in het dashboard landen mét rechten.
      *(Floris)*

## P0 (Meta): voor de compagnon

Zonder deze punten werken Instagram en Facebook alleen voor mensen met een rol in
de Meta-app.

- [ ] 🔴 **`instagram_manage_contents` beschikbaar maken in het App Dashboard.**
      Meta weigert de scope ("Invalid Scopes", 28-09). Een permissie hangt aan een
      **use case**: Dashboard → de use case → permissies toevoegen. Geen
      codewijziging. **Daarna:** `META_REQUEST_IG_DELETE_SCOPE=true` in de
      web-env van Vercel, dan vraagt de code de scope weer aan zonder deploy.
- [ ] **Meta App Review aanvragen** voor externe klanten (in Development Mode
      werkt alles alleen voor accounts met een rol in de app).
- [ ] **Bestaande Meta-koppelingen van vóór 25 september opnieuw leggen.** Ze
      missen de nieuwe scope; verwijderen faalt met een permissiefout.
- [ ] **`META_GRAPH_VERSION` controleren.** Code-default is v23.0 (`.env.example`
      noemt nog v21.0). Bij "Unknown path components" een versie hoger.
- [ ] **Meta-token automatisch verversen** vóór het 60-dagen-verloop en scopes
      uitlezen via `debug_token`. *(Claude)*
- [ ] **Meta Insights** (volgers, bereik, impressions, saves) bouwen. Fase 1b
      (volgersgroei) heeft geen review nodig, fase 2 wel. Fetcher is nog een TODO in
      `apps/api/src/ai/channel-reach.service.ts` (~regel 110). Compliance: geen
      Meta Platform Data naar Claude. *(Claude, na de scope-stap)*

---

## P1: vóór de publieke launch

### Beveiliging en robuustheid
- [ ] **Vercel Firewall (WAF) aanzetten.** De rem per IP (mig 0076) stopt één bron
      die doorramt, geen gedistribueerde aanval. *(Floris)*
- [ ] **Tests in CI.** `.github/workflows/ci.yml` doet alleen typecheck en build;
      de 220 API-tests draaien niet automatisch en de web-app heeft nul tests.
      *(Claude)*
- [ ] **Kritieke paden testen:** AuthGuard, BusinessAccessGuard, RateLimitGuard,
      Svix-webhook-verificatie, CRM-sleutelcheck, cron-secrets, tenant-isolatie,
      OAuth-callbacks. *(Claude)*
- [ ] **Storage-bucket `restaurant-assets`** mist een pad-beveiliging per klant
      (RLS). *(Claude schrijft de SQL, Floris draait die.)*
- [ ] **`@RequireModule`-decorator.** Rechten per module worden nu alleen in de
      frontend gefilterd. *(Claude)*
- [ ] **Publieke endpoints zonder rem:** unsubscribe-links (`mail.controller.ts`)
      en `GET /api/media/tiktok-video/:campaignId`. Laag risico (UUID). *(Claude)*
- [ ] **Auth-randgevallen:** owner stil downgraden via uitnodiging, uitgenodigd
      teamlid met mislukte accept belandt in onboarding, weesbedrijven bij
      accountverwijdering. *(Claude)*
- [ ] **Demo- en testaccounts opruimen** (na de vorige fix). *(Floris + Claude)*
- [ ] Rate-limit per gebruiker voor AI-endpoints; melding bij misbruik. *(Claude)*
- [ ] `docs/security-measures.md` en `docs/data-classification.md` schrijven; de
      DPA verwijst ernaar. *(Claude, Floris reviewt)*
- [ ] Anonimisering fase 2: body-templates zonder eigennamen, menu-pattern-aggregatie,
      benchmark-queries in Filly's prompts. *(Claude)*

### Configuratie en deploy (Floris)
- [ ] **Ontbrekende API-env in Vercel:** `CRM_INTEGRATION_API_KEY`, `RATE_LIMIT_SALT`,
      `PAGESPEED_API_KEY`, `GETFILLY_PLACE_ID`. Optioneel `AI_HOURLY_LIMIT_PER_RESTAURANT`.
- [ ] **Overbodige `SUPABASE_ACCESS_TOKEN` en `SUPABASE_PROJECT_REF`** uit de Vercel
      API-env halen (de code gebruikt ze niet). Idem oude `DEMO_AUTH_*` uit
      `get-filly-web`, als die er nog staan.
- [ ] **Vast API-domein** (`api.get-filly.com`) in plaats van
      `get-filly-api-three.vercel.app`.
- [ ] **Vercel Web Analytics aanzetten** (tab Analytics → Enable; script geeft nu
      404). Bepaal daarna of `NEXT_PUBLIC_HAS_ANALYTICS` aan moet.
- [ ] **Google Search Console** + sitemap indienen, **Bing Webmaster Tools**.
- [ ] Social-profiel-URL's aanleveren voor `sameAs` in JSON-LD (Claude bouwt daarna
      in 5 minuten).
- [ ] Pro-plan bij launch (Fluid Compute); dan de cron van dagelijks naar elke
      10 minuten voor punctueel posten.
- [ ] Beslissen: staging-omgeving nog nodig? (De aanleiding, de Meta-review, is weg;
      zie `docs/archief/staging-setup.md`.)
- [ ] Beslissen: migraties via Supabase CLI in plaats van handmatig (nu is
      "vergeten te draaien" een stille bug; zie `docs/archief/database-migrations.md`).
- [ ] **CRM-uitnodigingsflow live zetten, of schrappen.** Code staat inert live:
      `CRM_INTEGRATION_API_KEY`, redirect-URL `<WEB_URL>/welkom` in Supabase, mailtemplate
      (`pnpm supabase:apply-templates`), end-to-end test. Zie `docs/setup/crm-koppeling.md`.
- [ ] Vercel-projecten `getfilly-backoffice` en `landing` nakijken: nog in gebruik?

### Kleine controles (Claude)
- [ ] Controleren of de juiste code live staat: 3 production-deploys zijn na 2 seconden
      geannuleerd (waarschijnlijk normaal door de ignore-build-step).
- [ ] `railway.json` en de oude Railway-URL opruimen; de API draait op Vercel.
- [ ] Health-endpoint voor een uptime-monitor (`/hello` in `app.controller.ts` is niet getest).
- [ ] `.env.example` bijwerken: `CORS_ORIGINS`, `RATE_LIMIT_SALT`,
      `AI_HOURLY_LIMIT_PER_RESTAURANT` (API); `TIKTOK_CLIENT_KEY`,
      `META_REQUEST_IG_DELETE_SCOPE` (web); Graph-versie v21.0 → v23.0.
- [ ] Legacy `FRONTEND_URL`-fallback in `team.controller.ts` weghalen.
- [ ] `RESEND_WEBHOOK_SECRET` en `CRON_SECRET` staan als naam in de API-env; controleren
      dat de waarden kloppen (anders lopen mail-statistieken leeg of draait de SEO-mail niet).
- [ ] `busyness_monthly` controleren: `/api/busyness/cron/rollup` aanroepen, tabel
      gevuld? (mig 0075)
- [ ] Geocoding: backfill voor bestaande zaken, opnieuw geocoden bij adreswijziging.
- [ ] Lighthouse-audit na de beeldoptimalisatie (Speed Insights loopt).

### Koppelingen afronden (Floris)
- [ ] **TikTok Developer Portal:** Login Kit + Content Posting, scope `video.publish`,
      redirect-URI `.../oauth/tiktok/callback`, domeinverificatie, sandbox, demovideo
      (Direct Post), app-review. Zonder review kan alleen privé (`SELF_ONLY`) gepost worden.
- [ ] **Google OAuth-verificatie** (gevoelige scope) + demovideo indienen. Enige
      echte restant van Google Bedrijfsprofiel.

### Site en vertrouwen
- [ ] **Vertrouwenssignalen** op de publieke site (reviews, logo's, cijfers). Volgens
      de audit van 18-6 het grootste conversielek. *(Floris levert, Claude plaatst)*
- [ ] **Blog:** eerste artikelen (slugs `seo-tips-restaurant`, `vindbaarheid-geen-toeval`,
      `consistente-gegevens`, `compleet-profiel`, `fotos-meer-bezoek`, `recente-reviews`,
      `structureel-posten` + 4 onderwerpen van Floris), 'Wat is Get-Filly'-content,
      `llms-full.txt`, interne linking.
- [ ] **Site: SEO en Engelse versie nalopen.** Besluit Floris 29-9: **horeca-only**. De
      multi-branche-herpositionering voor de publieke site vervalt; horeca-voorbeelden,
      horeca-beelden en "horeca-AI" blijven staan. Beloftes over betaald bereik, doelgroep en
      segmentatie mogen blijven (worden gebouwd). Cijfers in mocks en blogtitels zijn bewust nep.
      "Realtime" mag blijven. Wijzig de breedte, hoogte en marges van de uitingskaarten niet.
      *(Claude)*
- [ ] **Boekingssysteem in het Ultimate-pakket op de prijzenpagina.** Besluit Floris 30-9: voorlopig
      laten staan. Het gaat om de beschrijving, de feature "Koppeling met je boekings- of
      reserveringssysteem" en de regel "Rapportage over boekingen en omzet per uiting" in `nl.json` en
      `en.json`. Terugkomen op dit punt zodra de koppeling via samenwerkingen concreet wordt.
      *(Floris beslist)*
- [ ] **Prijzen en juridische pagina's nalopen.** *(Floris, in een andere chat)*
- [ ] **Schema.org uitbreiden.** `structured-data.tsx` heeft alleen Organization,
      WebSite en SoftwareApplication; FAQPage en BlogPosting/Article ontbreken. *(Claude)*
- [ ] **Site-assets vervangen** (asset-ronde 2026-08-07): landing-visuals (ingebakken
      ChatGPT/Tripadvisor-logo's, social-foto's (nu 3 na het schrappen van YouTube), thumbnail
      Bereikbaarheid-kaart), product-visual-mock, over-ons-foto's en alt-teksten
      (`about.alt1/2/3`). Horeca-beelden zijn juist de bedoeling. *(Floris levert, Claude plaatst)*
- [ ] **Koppeling boekings- en kassasysteem** via samenwerkingen. Staat sinds 29-9 niet meer
      op de publieke site (product, "Sluit aan op wat je al hebt"); terugzetten zodra er een
      partner is. *(Floris regelt partners, Claude bouwt)*
- [ ] **Blog-menu-item verbergen** (navbar en footer) tot het eerste artikel gepubliceerd is;
      nu staan er alleen "binnenkort online"-kaarten. *(Claude, lage prio)*
- [ ] **Weer-bron: Open-Meteo is gratis alleen voor niet-commercieel gebruik.** Get-Filly is een
      betaald product, dus vóór de eerste klant is een abonnement bij Open-Meteo nodig (Standaard,
      1 miljoen aanroepen per maand; prijs opvragen), of een andere bron (bijvoorbeeld KNMI open
      data). Sinds 30-9 halen we het weer nog maar 4 keer per dag op per locatie (ochtend, lunch,
      middag, diner) plus 2 keer 's nachts voor het dagoverzicht. *(Floris beslist, Claude bouwt)*
- [ ] **Betaalde campagnes: wanneer starten.** Betaald moet eerder starten dan een gewone uiting
      (een advertentie bouwt bereik op): startmoment, looptijd en budget per moment. Beginwaarde als
      aanname 3 dagen voor het moment, bij te stellen met eigen metingen. Bij het bouwen van de
      betaalde-campagneflow (zie "Focus van Floris"). In de campagnes-sectie blijven de statussen
      concept, ingepland en actief; elke campagne krijgt een **label "betaald" of "normaal"**.
      *(Claude bouwt, Floris kiest KPI's en budgetgrenzen)*
- [ ] **Kennisbank "wat werkt" voor campagnevoorstellen.** Intern databestand dat steeds gevuld wordt
      met nieuwe data (eigen ervaring plus externe bronnen) en waarop wij regelmatig analyseren wat nu
      werkt en wat minder. Doel: voorstellen met de meeste kans op traffic naar de reserveringslink.
      Bronnen zoekt de compagnon; data kan schoon of ruw binnenkomen, dat weten we pas na de eerste
      leveringen, dus het schema wordt pas na de eerste bron vastgezet. **Architectuur staat (30-9, mig 0085,
      `apps/api/src/knowledge`, `scripts/kb.js`)**: ruwe import in elke vorm, mapping naar metingen, analyse
      per kanaal, kennisblok in Filly's prompts (leeg zonder data). Aanlever-wensen staan in
      `docs/werking/kennisbank-aanlevering.md`. **Later:** een plek waar Floris de kennisbank kan inzien
      (vorm nog te bepalen). *(Compagnon: bronnen, Claude: bouwen, Floris: inzien-plek kiezen)*
- [ ] **Foto- en video-suggesties bij elk voorstel.** Filly schrijft altijd 2 fotosuggesties en 2
      videosuggesties (wat de eigenaar het best kan maken, gebaseerd op de kennisbank). Nog te bepalen
      waar dit in de app getoond wordt (concept-pagina, geleide flow of beide): eerst een prototype.
      *(Claude prototype, Floris kiest plek)*
- [ ] **AI die foto's maakt, aanpast of verbetert** op basis van de kennisbank. Bewust later, na de
      kennisbank en de suggesties hierboven. *(later)*
- [ ] **Jurist: Meta-data samengevat naar Claude.** Bevestigen dat een geanonimiseerde, samengevatte
      uitkomst (geen bedrijfsnamen, geen losse posts) niet als Meta Platform Data telt, voordat we
      "welk type uiting scoort" met Meta-cijfers laten leren. Ontwerp: `docs/werking/uiting-type-scoort-ontwerp.md`. *(Floris, jurist)*
- [ ] **Maximum uitingen per kanaal.** Voor nu is er geen limiet. Het waarschuwingsscherm in de geleide flow
      is gebouwd (zachte melding, blokkeert niets). Zodra de kosten duidelijk zijn vul je per kanaal een
      grens in bij `CHANNEL_WEEKLY_WARNING_LIMIT` in `filly-brain.config.ts` (nu overal `null`).
      *(Floris beslist zodra de kosten bekend zijn)*
- [ ] **Rapportage per mail naar de klant.** In Rapportages een knop om de gegevens (bezetting,
      campagne-resultaten, "Wat werkt bij jou") naar de eigenaar te mailen. Mail naar onze eigen klanten
      blijft dus bestaan (naast afmelden, nieuwsbrieven en updates); de mailservice, de afmeld-flow en de
      transactionele mail zijn bij het verwijderen van gasten-mail bewust ongemoeid gelaten. *(Claude)*
- [ ] Off-site autoriteit: backlinks, directories, Google Bedrijfsprofiel voor
      Get-Filly zelf. *(Floris)*

### Campagne-flow robuustheid (Claude)
- [ ] Transactioneel `PATCH /campaigns/bundle/:id/status` (nu deels: per-kanaal-flip
      zonder rollback), `runScheduledSocial` zonder overlap-guard, optimistisch slot
      op `selectVariant` en `suggested_campaign`-jsonb.
- [ ] `restaurant-context` slikt query-fouten (dan genereert Filly generiek);
      zod-validatie op Claude-output; "Nee bedankt" doet niets.
- [ ] Lost-update-slot ook op `mutateChannel` en `refine` (nu alleen `editVariant` en
      `generateMoreVariants` zijn geslot), of `jsonb_set` via `rpc()`.
- [ ] **Kanaallijsten op 7 plekken** samenvoegen tot één bron + het
      `google_business`/`campaigns.type`-probleem.
- [ ] **Organisch versus betaald** in de flow (toggle, `budget_cents`).
- [ ] Bundel `+ Kanaal toevoegen` en `KanalenCard` voor concept-bundels: nieuw
      `POST /campaigns/bundle/:id/channels`.

---

## P2: uitbreiden

- [ ] Rapportage-tab "Bezetting" aanzetten (`TOON_BEZETTING` = false) zodra er vertrouwen
      is. *(Floris beslist)*
- [ ] Terugkoppeling (mig 0074) zichtbaar maken: effectiviteit per dagdeel + aantal
      metingen in een rapportageblok.
- [ ] Rustige-momenten-model: anker verschuiven van het Google-patroon naar de eigen
      gemeten historie zodra er weken live-data zijn; vergelijking met vorig jaar
      (kan pas na 12 maanden, op `busyness_monthly`).
- [ ] Bezetting-bron: snapshot-groei begrenzen, onboarding-`service_periods` omzetten
      naar `opening_hours`, controleren of de uurlijkse cron echt varieert.
- [ ] Filly-chat en detectie strakker koppelen aan de grafiek (aparte sessie).
- [ ] **Menukaart- en drankkaart-upload via Supabase Storage signed URLs.** De multipart-upload
      in `menu.controller.ts` stuit op de Vercel-bodylimiet van 4,5 MB (`createSignedUploadUrl`
      komt nergens voor). De oude 10s-timeout is opgelost (`maxDuration` 300).
- [ ] Geleide flow: als geen enkel kanaal gekoppeld is, een nudge "koppel eerst je accounts"
      (nu vinkt `suggestions.service.ts` ~r.1521 stil IG+FB voor). Bereik voor social meet
      alleen koppelstatus, geen volgers (hangt aan Insights).
- [ ] Legacy FORMAAT-parsers (`extractCampaignProposal/Bundle/Choice` in `chat.service.ts`)
      en de pending-kaarten (`acceptProposal`/`acceptBundle`, `onDismiss` in `filly-chat.tsx`)
      opruimen. Eerst narekenen dat geen render- of historiepad op de oude kaarten leunt.
- [ ] **Per-klant vindbaarheidsrapport.** Een gedetailleerd rapport per zaak: hoe je gevonden
      wordt, hoe je uitingen scoren, wat betaalde campagnes opleveren, plus nog te bepalen
      onderdelen. Bouwt voort op de health-score-runner (`/dashboard/google-business/audit`) en
      de interne wekelijkse SEO-mail (`apps/api/src/seo-report`). Deel van de cijfers hangt aan
      Meta Insights en betaalde advertenties (beide P0 Meta / P2). Eerst de inhoud uitwerken.
      *(Floris + Claude)*
- [ ] Events vervolg: schoolvakanties per regio in `timing-factors.ts`, handmatige eigen
      events (kermis, braderie), feeds (Eredivisie, F1, beurzen, gemeenten), licentie
      evenementen.nl (databankenrecht), en waar de interne eventsdatabase leeft.
- [ ] **Publiceren naar Reels en Stories** (IG eerst, dan FB). *(Claude; compagnon
      checkt het App Dashboard.)*
- [ ] TikTok: video-upload en filter in de mediabibliotheek, TikTok Insights.
- [ ] Google Bedrijfsprofiel: naam, telefoon, website en categorie bewerkbaar maken.
- [ ] **Foto-tool ("Beeld-studio") mergen.** De code staat alleen op branch
      `feat/foto-tool-infra` (op origin, nog niet in `main`). Op `main` staan alleen
      migratie 0077 (`image_usage`) en het prototype `/proto-fototool`. Nog nodig: branch
      bijwerken, API-sleutel van de beeldprovider in Vercel, een echte end-to-end test.
      Details: archief, sectie "Foto-tool". *(Claude + Floris)*
- [ ] Dashboard meetrekken naar sociale media (marketing-hub-statussen, labels).
- [ ] Filly-brein v2: brand-archetype en do/don't-velden, taalniveau, stop-condities,
      correctie-feedbackloop, zelfreflectiescore, rate-limits per kanaal.
- [ ] Prestatiemeting: benchmark per zaak met shrinkage (eerst met Floris
      afstemmen), scoreformules per kanaal, leerfasen-weergave.
- [ ] Website-laag: pixels/CAPI, cookie-consent v2, Plausible/PostHog.
- [ ] Meta-extra's: UGC-tagdetectie, FB Events, auto-DM's, CAPI, lookalike-export.
- [ ] Betaalde advertenties (`ads_management`): nieuwe App Review bij Meta én TikTok, plus
      Google Ads. De site belooft dit al. Ontwerp-onderdeel: doelgroep- en buurttargeting
      (straal rond het adres of postcode/plaats; leeftijd en interesses; eigen klantenlijst
      als doelgroep voor "vaste klanten", uitsluiten daarvan voor "nieuwe klanten"). Een
      klantenlijst uploaden raakt AVG (toestemming, verwerkersovereenkomst) en moet eerst met
      de jurist. *(Compagnon voor Meta.)*
- [ ] Integraties: Zenchef, OpenTable/SevenRooms, TripAdvisor/TheFork, call-tracking,
      POS. *(Floris kiest, Claude bouwt.)*
- [ ] Autonome detectie en push-meldingen (eerst e-mail, later web push).
- [ ] Operationeel bij groei: klantenoverzicht/admin-tooling, incident-runbook,
      uptime-monitoring, feature flags, `ai_usage`-dashboard, job-queue voor imports.

## P3: later of nice-to-have

- [ ] Filly-Engels doortrekken naar de rest van de AI-output. Controleren of de hero-mockups op
      `/en` nog Nederlandse tekst in de afbeeldingen zelf hebben (de teksten in `en.json` zijn
      al Engels).
- [ ] Variant-delete-knop en bewerken-knop onder de variant; `findBundle` N+1 batchen
      (pas bij bundels >10 kanalen).
- [ ] Geleide flow: state bij wissel on-ramp → actief; resultaat als interactieve kaart;
      gedeelde rekenlogica samenvoegen (`use-actionable-days`, `UpcomingActionsBlock`).
- [ ] Frontend-hygiëne: focus-trap in modals, responsive-gaten, `<Button>`/tokens
      consolideren, één skeleton, inline styles.
- [ ] Kleine dingen: `middleware` → `proxy` (Next 16), concept-werk verliezen bij
      wegnavigeren, Cmd+K, meldingenbel, dark mode, referralsysteem, 2FA-UI,
      e-mailwijziging.
- [ ] Terugkoppeling: campagnes buiten de voorstelflow meten, controlegroep;
      `UNUSUAL_SPREAD_MULT` ijken op echte data; `events` mist omvang en einddatum.
- [ ] Media-labels bewerkbaar maken (`media-tagger.service.ts`, regel 60).
- [ ] Filly-brein v2, restjes: Cialdini-bibliotheek opt-in per zaak, uitlegbaarheidsniveau
      (diep/kort met herkomst), log-only lengtecheck in de chat-flow, channel-fatigue
      (30-dagen frequentie × engagement met alarm), tool-use in plaats van
      `<<FILLY_PROPOSE_CAMPAIGN>>`-markers.
- [ ] Geleide flow-stappen en resultaat als compacte chatgebeurtenissen vastleggen, zodat
      terugkomen = je gesprek terugzien. Grotere refactor, los plannen.
- [ ] Campagne-detail UX: acties consistent benoemen (`Terugtrekken` naast `Terug naar concept`),
      tijdzone-hint bij het plan-veld, onopgeslagen-markering op de kanaal-tab, succes-toast met
      undo na goedkeuren, duidelijkere disabled-stijl op knoppen in de geleide flow.
- [ ] CSS-consolidatie: breakpoints naar 880/640/480, `font-weight: 800` en losse hex-kleuren
      naar tokens, heatmap-tiers naar `--heat-0..4`, kop-`px` naar `--fs-*`, kaart-radii-tokens.
- [ ] Toegankelijkheid: aria-labels op icoonknoppen, klikbare divs echte `<button>`
      (verifieer of dit na dashboard-v2 nog speelt), naast de focus-trap.
- [ ] ~62 zwakke types in `apps/api` (`any`, `as`, `Record<string,unknown>`) vervangen door
      rij-types of zod bij het inlezen.
- [ ] Weer reikt 7 dagen, detectie kijkt 21 dagen vooruit: dagen 8-21 hebben geen weerdata.
- [ ] **Health-score verder ontwikkelen. Absoluut geen prio (besluit 29-9).** Reviews: recency-check
      (<60 dagen), antwoord-ratio, sentiment-analyse (`health/reviews.runner.ts` doet dit niet).
      Verder: SEO-keyword-suggesties, GBP-veldenchecklist, Perplexity als GEO-bron,
      PageSpeed-gemiddelde van 3 runs, configureerbare concurrentstraal.
- [ ] bunq-koppeling voor bankadministratie en reconciliatie. Wel koppelen, geen prio; pas
      relevant zodra er een boekhoudflow is. Bunq staat nu alleen als verwerker in de
      juridische teksten. *(Floris kiest, Claude bouwt.)*
- [ ] Webhook-receivers per integratie met rijtests (bij de integratie-regel in P2).
- [ ] Dode code: `ChartCard` (ongebruikt), `campaign_templates`, ongebruikte
      constanten in `filly-brain.config.ts`. **Let op:** code voor Meta/Google die
      "ongebruikt" lijkt kan scaffolding zijn en moet blijven.
- [ ] Mail-domeinen (DKIM/SPF/DMARC) alleen nog voor transactionele mail; mail is als
      campagnekanaal vervallen.
- [ ] WhatsApp Business API. Staat niet meer op de site; waarschijnlijk vervallen.

---

## Bewust geschrapt bij de opschoning van 2026-09-29

Niet meer opgenomen omdat ze achterhaald of al opgelost zijn (details in het archief):

- Jaar-heatmap op verzonnen data (`chart-card.tsx`/`calendar-card.tsx`): `ChartCard`
  wordt niet meer gebruikt en `calendar-card.tsx` bestaat niet meer.
- Railway-hosting, de in-memory rate-limit en "Pre-onboarding limiet naar Redis": vervangen
  door Vercel en een databasetelling (mig 0076).
- Mail en WhatsApp als campagnekanaal; kanaalvoorselectie "mail + Instagram".
- "Echte databron via third-party" en Outscraper-punten: sinds 17-7 is Apify de bron.
- Zenchef-event-variant van autonome detectie.
- Chat sneller/goedkoper (streaming, compact menu, prompt-cache): live sinds 30-6.
- Mail-flows (welkom, reviewverzoek, verjaardag, win-back), preference-center, IP-warming, DNS-hulp
  voor klanten: vervallen met mail als campagnekanaal.
- Platform-specifieke output per post: gedaan via `CHANNEL_RULES` in `filly-brain.config.ts`.
- Password-protected preview op `app.get-filly.com`, Railway/Render-config, `WEB_URL` op api leeg:
  vervallen of gedaan.
- GBP fase C-F, GBP Insights-fetcher: gedaan of geschrapt (Q&A- en Performance-API stopgezet).
- Rate-limit op `/public/contact`: aanwezig (bucket `contact`, 5 per 15 min).
- Gratis proefflow ("Probeer gratis") en reserveringsflow (UTM-hook, reserveringspagina-UX):
  besluit Floris 29-9, komt er niet.
- Alle afgevinkte punten (staan in de changelog en in het archief).

## Twijfelgevallen: behouden of schrappen? *(Floris beslist)*

Gevonden bij de volledige controle. Zonder beslissing van jou blijven ze hier staan.

- **Segmentatie per campagne.** De site belooft "Segmentatie op vaste klanten, nieuwe klanten
  en de buurt" (`nl.json`, homepage). In de app bestaat alleen een profielveld
  "Doelgroep-segmenten"; een campagne zelf kan niet aan een doelgroep worden gekoppeld
  (`target_segment_id` wordt nooit gevuld). Voorstel 29-9: dit wordt een onderdeel van de
  betaalde-campagnes-functie (doelgroep en buurt als targeting bij Meta, TikTok en Google).
  De zin op de site is op 29-9 afgezwakt (vaste klanten eruit).
- **Nog te bevestigen:** ongecommit werk in `messages/*.json` en `landing-visuals.tsx`
  (overdracht 16-9), waarschijnlijk al weg via de i18n- en site-branches.

---

## Hoe deze lijst te gebruiken

1. Pak het bovenste open punt voor jouw rol (Floris / Claude / Compagnon).
2. Klaar? Vink af, verplaats de uitleg naar `docs/CHANGELOG.md`, verwijder de regel hier.
3. Iets nieuws tegengekomen? Zet het bij de juiste prioriteit met een eigenaar.
4. Houd de lijst kort. Details horen in de changelog of in een `docs/`-document.
5. Commit deze file mee bij elke wijziging, geen aparte PR.
