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

## Stand van zaken (2026-09-29)

Basis is degelijk: typecheck schoon, 220 API-tests groen, auth deny-by-default,
RLS overal aan, geen fouten in de Vercel-logs van de laatste 24 uur. Web en API
draaien allebei op Vercel (`get-filly-web`, `get-filly-api`). De klant-blokkers
zijn vooral configuratie, nepdata op een paar plekken, betaling en Meta-review.

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
      prijzenpagina staat geblurd (`HIDE_PRICING`). *(Floris kiest plannen en
      prijzen en maakt het Stripe-account, Claude bouwt.)*
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
- [ ] **Site-herpositionering** afmaken: home + product NL af; rest, SEO en EN open
      (branch `feat/site-capaciteit-copy`).
- [ ] Off-site autoriteit: backlinks, directories, Google Bedrijfsprofiel voor
      Get-Filly zelf. *(Floris)*

### Campagne-flow robuustheid (Claude)
- [ ] Transactioneel `PATCH /campaigns/bundle/:id/status` (nu deels: per-kanaal-flip
      zonder rollback), `runScheduledSocial` zonder overlap-guard, optimistisch slot
      op `selectVariant` en `suggested_campaign`-jsonb.
- [ ] `restaurant-context` slikt query-fouten (dan genereert Filly generiek);
      zod-validatie op Claude-output; "Nee bedankt" doet niets.
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
- [ ] **Publiceren naar Reels en Stories** (IG eerst, dan FB). *(Claude; compagnon
      checkt het App Dashboard.)*
- [ ] **YouTube als kanaal** (Google-OAuth, review, publish, migratie voor de
      check-constraint). *(Floris aanvraag, Claude bouwt.)*
- [ ] TikTok: video-upload en filter in de mediabibliotheek, TikTok Insights.
- [ ] Google Bedrijfsprofiel: naam, telefoon, website en categorie bewerkbaar maken.
- [ ] Foto-tool ("Beeld-studio"): API-sleutel van de beeldprovider in Vercel en een
      echte end-to-end test. Code staat op main sinds 28-9.
- [ ] Dashboard meetrekken naar sociale media (marketing-hub-statussen, labels).
- [ ] Filly-brein v2: brand-archetype en do/don't-velden, taalniveau, stop-condities,
      correctie-feedbackloop, zelfreflectiescore, rate-limits per kanaal.
- [ ] Prestatiemeting: benchmark per zaak met shrinkage (eerst met Floris
      afstemmen), scoreformules per kanaal, leerfasen-weergave.
- [ ] Website-laag: pixels/CAPI, cookie-consent v2, Plausible/PostHog, preference-center.
- [ ] Meta-extra's: UGC-tagdetectie, FB Events, auto-DM's, CAPI, lookalike-export.
- [ ] Betaalde advertenties (`ads_management`): nieuwe App Review bij Meta én TikTok.
      De site belooft dit al. *(Compagnon voor Meta.)*
- [ ] Integraties: Zenchef, OpenTable/SevenRooms, TripAdvisor/TheFork, call-tracking,
      POS. *(Floris kiest, Claude bouwt.)*
- [ ] Autonome detectie en push-meldingen (eerst e-mail, later web push).
- [ ] Operationeel bij groei: klantenoverzicht/admin-tooling, incident-runbook,
      uptime-monitoring, feature flags, `ai_usage`-dashboard, job-queue voor imports.

## P3: later of nice-to-have

- [ ] Filly-Engels doortrekken naar de rest van de AI-output; hero-mockups op `/en`
      nog Nederlands.
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
- Alle afgevinkte punten (staan in de changelog en in het archief).

## Nog te bevestigen door Floris

- [ ] Nog ongecommit werk in `messages/*.json` en `landing-visuals.tsx` (uit de
      overdracht van 16-9)? Waarschijnlijk via de i18n- en site-branches al weg.
- [ ] Zijn "CRM-uitnodigingsflow", "Resend-webhook" en "`CRON_SECRET`" nog nodig/gedaan?

---

## Hoe deze lijst te gebruiken

1. Pak het bovenste open punt voor jouw rol (Floris / Claude / Compagnon).
2. Klaar? Vink af, verplaats de uitleg naar `docs/CHANGELOG.md`, verwijder de regel hier.
3. Iets nieuws tegengekomen? Zet het bij de juiste prioriteit met een eigenaar.
4. Houd de lijst kort. Details horen in de changelog of in een `docs/`-document.
5. Commit deze file mee bij elke wijziging, geen aparte PR.
