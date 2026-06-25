# Get Filly — Backlog

Centraal overzicht van openstaande punten. **Werk deze lijst bij** zodra
iets klaar is, of wanneer je iets nieuws tegenkomt dat later aandacht
nodig heeft. Dit is dé referentie voor elke werksessie — zowel voor
jou als voor Claude in nieuwe chats.

## Prioriteiten

- **P0** — Blokkerend voor eerste klant live
- **P1** — Productie-hygiëne (moet vóór publieke launch)
- **P2** — Feature-werk (mock → echt)
- **P3** — UX-verfijningen / nice-to-have

Status-markers: `[ ]` = todo · `[~]` = in progress · `[x]` = done

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
- [ ] **Lost-update op `variants[]`-jsonb (geen locking)** — read→muteer→schrijf-hele-array in `editVariant` (`campaigns.service.ts:1760`), `generateMoreVariants` (`:1847`), `selectVariant` (`:1676`), `mutateChannel`. Twee tabs of "✨ Met Filly bewerken" + handmatige edit → laatste write wint stil. Idem `suggested_campaign`-jsonb (`suggestions.service.ts:2013`). Fix: `version`-kolom + `.eq('version', expected)` + retry (mini-migratie).
- [ ] **Ongevalideerde cast op Claude tool-output (root-cause stille corruptie)** — `ai.service.ts:375,474` doet `toolBlock.input as T`; Anthropic dwingt het input-schema NIET af → ontbrekende/afgekapte velden stromen naar DB-inserts (website-profiel, menu-import, suggesties). Hangt samen met `suggested_campaign`- en `meta`-jsonb-casts (`meta.service.ts:262`). Fix: één zod-validatie op `toolBlock.input` + `parseSuggestedCampaign()` bij read-vóór-write.

### 🔴 Security
- [x] ~~**SSRF in website-analyzer**~~ (✅ 2026-06-25, `8605644`) — `website-analyzer.service.ts` volgt redirects nu handmatig (`redirect:'manual'`) en checkt elke hop via `assertPublicUrl`: DNS-resolve → weiger loopback/private/link-local/metadata (169.254.169.254)/CGNAT/multicast + IPv4-mapped IPv6. IP-literals direct gecheckt.
- [x] ~~**Cross-tenant unsubscribe**~~ (✅ 2026-06-25, `8605644`) — `mail.service.ts` scopet de `campaign_sends`-update nu via de campagne-id's van het restaurant (`campaign_sends` heeft geen `restaurant_id`-kolom). Geen cross-tenant reporting-vervuiling meer.
- [x] ~~**Resend-webhook fail-open**~~ (✅ 2026-06-25, `8605644`) — `mail.controller.ts` is nu fail-closed: 401 zonder secret/rawBody/geldige signature. ⚠️ Vereist `RESEND_WEBHOOK_SECRET` in de API-env, anders worden ALLE webhook-events geweigerd.
- [x] ~~**Open-redirect op /login**~~ (✅ 2026-06-25, `8605644`) — `login/page.tsx` valideert `?next=` via `safeNextPath` (alleen interne paden, geen `//`/scheme).
- [ ] **Geen IP-rate-limiting** — nergens `ThrottlerGuard`. `/public/contact` heeft alleen een honeypot → bot kan ongelimiteerd mails pompen (Resend-kosten). Pre-onboarding AI-limiet is in-memory `Map` (per serverless-instance → triviaal te omzeilen). Fix: globale throttle per IP + pre-onboarding-limiet naar DB/Redis. *(overlapt P1 "pre-onboarding rate-limit naar Redis")*

### 🟡 Robuustheid & flows
- [ ] **Ingeplande mail wordt nooit automatisch verstuurd** — cron `runScheduledSocial` (`campaigns.service.ts:445`) selecteert alleen `type='social'`. Een "ingeplande" mail blijft liggen tot handmatig "Activeer nu" → dead-end in de lifecycle. Fix: mail-cron toevoegen, óf UI duidelijk maken dat "ingepland" voor mail alleen een herinnering is.
- [ ] **Geleide-flow verliest state bij on-ramp→active wissel** — `filly-chat-message-list.tsx:151-291`: bij het eerste bericht rendert een nieuwe `FillyGuidedFlow`-instantie (andere `key`) → gekozen hoek/aangevinkte context weg; `active_action` herstelt alleen datum/topic/kanalen/step. *(bekend pijnpunt, nog open; hangt aan de grotere flow-refactor)*
- [x] ~~**Ontbrekende sequence-guards (stale-data races)**~~ (✅ 2026-06-25, `ee404d7`) — `cancelled`-flag toegevoegd op reserveringen, bezetting, dashboard-kalender + unmount-guard op kpi-row.
- [ ] **Stille fout = lege empty-state** — `reserveringen`, `gasten`, `campagnes/history`, `suggesties`: 403/500 niet te onderscheiden van "geen data" → vrolijk leeg scherm terwijl het stuk is. Fix: aparte foutstaat met "Probeer opnieuw".
- [ ] **restaurant-context slikt query-fouten** — `restaurant-context.service.ts:82,291` + callers met extra `.catch(() => '')`: transient Supabase-fout → leeg context-blok → Filly genereert generiek/gehallucineerd en "slaagt". Fix: query-error onderscheiden van "geen data" en netjes afbreken.
- [ ] **Auth-edge-cases:**
  - [ ] Account-delete + handmatige user-delete laten **wees-restaurants** achter (geen FK/trigger) — `account-deletion.service.ts:72`. Fix: DB-trigger op laatste-owner-verwijdering. *(overlapt COO P0 "Test-account FK-cascade")*
  - [ ] Invite-`upsert` kan een **owner stil downgraden** naar staff — `team.service.ts:484`. Fix: niet downgraden bij bestaande hogere rol.
  - [ ] Uitgenodigd teamlid met gefaalde accept belandt in de **onboarding-wizard** en maakt een eigen restaurant — `middleware.ts:130`. Fix: pending-invite detecteren → banner i.p.v. wizard.
  - [ ] 3 van 4 wachtwoord-flows tonen **rauwe Engelse Supabase-fouten** (forgot/reset/welkom); alleen login gebruikt `authErrorKey`. Fix: alle vier door `authErrorKey` + `t()`.
  - [ ] **State-conflicten als 500 i.p.v. 4xx** + rauwe Postgres-message lekt naar client — `suggestions.service.ts:2007,2500`; `throw new InternalServerErrorException(error.message)` verspreid (`campaigns.service.ts:248,263,691`; `mail.service.ts:126,262`). Fix: 4xx voor state-conflicten; rauwe message loggen, generieke NL teruggeven (zoals `ai.service.ts toNlException`).

### 🟡 UX — werk-verlies & onduidelijkheid
- [x] ~~**Review-reply concept verdwijnt**~~ (✅ 2026-06-25, `ee404d7`) — backdrop/×/Esc/Annuleren vragen nu bevestiging bij een nog niet verzonden antwoord (`closeReply` + `discardConfirm`).
- [x] ~~**`originalIdxRef` reset niet**~~ (✅ 2026-06-25, `ee404d7`) — reset nu in een effect gekeyd op `sectionId`; ✕ revert niet meer naar de variant van de vorige campagne.
- [ ] **Geen succes-feedback** na review-antwoord versturen (`reviews/page.tsx:402`); **gefaald chat-bericht** blijft als wees-bubble zonder retry (`filly-chat.tsx:339`). Fix: toast/retry. *(AccessGuard-flash ✅ 2026-06-25 `ee404d7`: placeholder tijdens context-load i.p.v. content laten flitsen.)*
- [ ] **Geen onopgeslagen-wijzigingen-waarschuwing** op account (`account/page.tsx:107`) + identiteit (`identiteit/page.tsx:836`). Fix: dirty-flag + `beforeunload`.
- [ ] **Dubbele-submit + eeuwig "submitting"** op choice/date-cards — `filly-chat.tsx:273,421`: `sending` is stale-closure-guard (geen echte lock), de `catch` draait nooit. Fix: `sendingRef` als synchrone lock.
- [ ] **Filly-chat instance-switch reset niet alle card-states** — `switchConversation`/`startNewConversation` resetten alleen `proposalStatus`, niet `bundleStatus`/`choiceState`/`dateChoiceState` (`filly-chat.tsx:496`). Fix: alle resetten.
- [ ] **Mock-data als echt gepresenteerd** — uur-heatmap + YoY-deltas + cohort-tabel op `bezetting/page.tsx:59-71,200`; jaarview-heatmap (`chart-card.tsx:50`, `calendar-card.tsx:224,388`). Fix: "voorbeeld/schatting"-badge of echte data.
- [ ] **Modals zonder `aria-labelledby`/focus-trap/Escape** — builder/media/delete/invite/media-picker/reviews. `google-connect-modal.tsx:125` doet het wél goed → kopieer dat patroon.
- [ ] **Responsive-gaten** — uur-heatmap, brede tabellen (gasten/bezetting), `aspecten-tabel.tsx:134` (5 koloms nowrap op ~380px), `missende-aspecten-card.tsx:325` (`marginLeft:126` off-canvas), chat-choice-cards `repeat(2,1fr)`, identiteit-savebar `left:220` (hardcoded sidebar-breedte).

### 🟢 Dode / verweesde flows + opruimen
- [x] ~~**Orphaned routes `taken` + `suggesties` verwijderd**~~ (✅ 2026-06-25) — beide routes + hun `PATH_MODULE_MAP`/`titleKeyFor`/`MODULE_KEYS`-entries + de `taken`/`suggesties`-modules uit `packages/shared/permissions.ts` (rol-defaults + Module-type) weg. `resolvePermissions` filtert oude opgeslagen rechten met die namen automatisch weg → geen breuk. `marketing` (hub + IG/FB/mail/TikTok) BEWUST behouden: daar loopt echte Meta-data en Rapportages linkt ernaar. Restje (onschadelijk): ongebruikte i18n-keys `dash_taken_page`/`dash_suggesties_page` in `messages/{nl,en}.json` + 2 historische comments in `sidebar.tsx`.
- [ ] **Pending/accept/dismiss-flow vrijwel dood** — proposals worden sinds 24-06 bij aanmaak al goedgekeurd; `acceptProposal`/`acceptBundle` + de "Nee bedankt"-knop (die niets persisteert, `filly-chat.tsx:629`) lopen niet meer. Fix: bevestig of historische pending-kaarten voorkomen; zo niet opruimen.
- [x] ~~**`step==="done"`-blok + ongebruikte `result`-state**~~ (✅ 2026-06-25, dead-code-ronde) — onbereikbaar dood blok verwijderd, inclusief `result`/`setResult`, de `restart`-helper, de `CHANNEL_LABEL`-map en het ongebruikte `AiSuggestion`-type-import. ~85 regels weg. (i18n-keys `done.*`/`result.viewEdit` nu ongebruikt maar onschadelijk; `result.fallbackName` blijft elders in gebruik.)
- [ ] **Legacy FORMAAT-parsers** (`chat.service.ts:1547`) draaien elke chat-beurt als "vangnet". *(BEWUST NIET verwijderd 2026-06-25: de parse-tak draait nog elke beurt; verwijderen vereist eerst verifiëren dat geen enkele render-/historie-pad op de oude kaarten leunt. Net als bij `approveMultiChannel` — dat "dood" leek maar via `approve()` wordt aangeroepen — eerst zorgvuldig narekenen. Aparte stap.)*
- [x] ~~**Frontend cap-detectie matcht op stale string**~~ (✅ 2026-06-25, `d115721`) — stale `"grens van 20"` weg; matcht nu op de stabiele `"nieuw gesprek"`-formulering. (HTTP-status/error-code blijft de nettere vervolgstap.)
- [x] ~~**`/dashboard/design-system`** voor elke ingelogde klant opvraagbaar~~ (✅ 2026-06-25, `d115721`) — achter env-flag `NEXT_PUBLIC_DESIGN_SYSTEM` (default uit); klant ziet "Niet beschikbaar".
- [ ] **`findBundle` N+1** (`campaigns.service.ts:674`) + serial N+1 in `channelCampaignsInGroup` (`:1230`). *(al P1; bevestigd)* Fix: content + reasoning batchen met `in(...)`.
- [x] ~~**Dode tweede `mapAuthError`**~~ (✅ 2026-06-25, `d115721`) — module-niveau variant verwijderd; de lokale i18n-variant blijft.
- [ ] **Doc-drift opruimen** — middleware-comment + CLAUDE.md zeggen "/signup → /contact redirect" (is nu een echte uitlegpagina); CLAUDE.md zegt ten onrechte dat `suggested_scheduled_*` dood is sinds mig 0060. Corrigeren.

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
- [ ] Instagram vereist een afbeelding/video (Meta-API-eis); FB/Google Business mogen tekst-only. Al afgedwongen via `PHOTO_REQUIRED` + de blokkade hierboven.

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
- [ ] 🟡 **SSRF in website-analyzer** — interne IP's/cloud-metadata bereikbaar; blocklist toevoegen. *(Beveiliging)*

### 🎨 Frontend

**Publieke site — UI**
- [x] ~~🔴 `:focus-visible` ontbreekt volledig (0 regels)~~ (✅ 2026-06-22) — één gedeelde a11y-baseline in `globals.css` (geldt publiek + dashboard): `a/button/input/select/textarea/summary/[tabindex]/[role]` krijgen `outline: 2px solid var(--color-brand)` + offset. Zelfde stijl als de losse `.ui-btn`/`.blog-card`-regels; componenten met eigen focus-stijl overschrijven het.
- [ ] 🔴 Typografieronde ~12% af: 130 hardcoded px font-sizes vs 18 token-uses in `landing.css` (hero 74, `.pillars-cta-title` 32, `.pricing-price` 38, `.diff-card-title` 24…) → koppen op `--fs-*`, nieuwe `--fs-hero`-token.
- [ ] 🟡 Drie/vier verschillende "primaire groene knop"-implementaties (`.btn-primary`/`.nav-demo`/`.cta-btn`/`.pricing-btn`); `ui.css` Button nergens hergebruikt → één `.btn`/`<Button>`.
- [ ] 🟡 Dode/dubbele CSS: `.features::before` 2×, `.about-hero-grid` 3×, `.about-mv` 2× → opruimen.
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
- [ ] 🟡 Contact-formulier: geen verwachting ("binnen 1 werkdag, vrijblijvend") + "bericht" verplicht → toevoegen + bericht optioneel maken.
- [ ] 🟡 Inconsistente CTA-labels ("Vraag een demo aan"/"Plan een gratis kennismaking"/"Plan kennismaking") → één label site-breed.
- [x] ~~🟡 `/signup` stille redirect → korte uitleg-pagina~~ (✅ 2026-06-22) — `/signup` toont nu een "Op uitnodiging"-uitleg + CTA "Vraag een demo aan" → `/contact` + link naar inloggen, in dezelfde auth-stijl (`.login-box`). NL/EN via `auth.signup.*`. Geverifieerd: HTTP 200 (geen redirect), beide talen.
- [ ] 🟡 Disabled knoppen ogen klikbaar + vage labels ("Selecteer een optie", "Volgende stap", "Geen kiezen") in de guided flow → instructie + context-labels.
- [ ] 🟡 Legacy-routes (`taken/`, `suggesties/`, `marketing/`) zonder terug-pad → banner of 308-redirect zoals `reviews`.
- [ ] 🟡 Modals missen `aria-labelledby`; klikbare kaarten geen focus-ring.
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
- [ ] 🟢 `findBundle` N+1 (per kanaal `findById`) — **(bevestigd, al P1)** → batch-`IN`-query.
- [x] ~~🟢 Doc/comment 301 vs 308 bij apex→www~~ (✅ 2026-06-22) — CLAUDE.md (2×) + `config/seo.ts`-comment gelijkgetrokken op 308 + verduidelijkt dat het in code via `next.config.ts` `redirects()` gebeurt (niet in Vercel Domains).

### 🔒 Beveiligingen
- [x] ~~🔴 **AuthGuard niet globaal (allow-by-default)**~~ (✅ 2026-06-18) — nu APP_GUARD deny-by-default; 5 publieke controllers @Public(), lokaal geverifieerd.
- [x] ~~🔴 **Cron-secret-check niet constant-time**~~ (✅ 2026-06-18) — `timingSafeBearer` (sha256 + timingSafeEqual) in alle 3 cron-controllers.
- [x] ~~🔴 **Server-only keys in `get-filly-web`** (9 vars, incl. service_role)~~ — ✅ verwijderd (2026-06-18); enkel publieke `NEXT_PUBLIC_*` + OAuth-app/client-id's resteren.
- [x] ~~🔴 **Resend-webhook zonder signature-validatie**~~ (✅ 2026-06-18) — Svix-verificatie via rawBody; ⚠️ zet **`RESEND_WEBHOOK_SECRET`** (get-filly-api) om handhaving te activeren.
- [ ] 🟡 **SSRF in website-analyzer** (`ai/website-analyzer.service.ts`) — geen blocklist voor 127.0.0.1/169.254.169.254/10.x/192.168.x/localhost → ranges blokkeren (DNS→IP-check) + redirects pinnen op publieke IP's.
- [ ] 🟡 Publieke `/public/contact` + `/public/unsubscribe` zonder rate-limit/CAPTCHA → IP-rate-limit (Vercel WAF) op `/public/*`.
- [ ] 🟡 Storage-bucket `restaurant-assets` mist per-tenant path-RLS (tenant A kan in B's pad schrijven) → pad-prefix-RLS op `(storage.foldername(name))[1]`.
- [ ] 🟡 Pre-onboarding rate-limit in-memory (niet multi-instance-veilig) — **(bevestigd, al P1)** → gedeelde store (Supabase-tabel/Redis).
- [ ] 🟡 Enkele cron-/bundle-queries scopen alleen op `group_id`/`campaign_id` zonder `restaurant_id` (defense-in-depth, admin-client omzeilt RLS) → `.eq('restaurant_id')` overal toevoegen.
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

## P0 — Blokkerend voor eerste klant

### Auth & onboarding
- [ ] ⚠️ **Email-confirmation weer aanzetten** — tijdelijk UIT gezet tijdens dev (Supabase Dashboard → Authentication → Providers → Email → "Confirm email"). **Aanzetten vóór productie-launch** anders accepteert de app fake-signups. Los op met Resend SMTP (hieronder) zodat je niet meer tegen rate-limits aanloopt en je dit weer aan kunt hebben in dev. **Update 2026-06-02**: minder kritiek geworden — self-service signup staat nu volledig UIT in Supabase (zie hieronder), dus publieke fake-signups zijn sowieso onmogelijk. Blijft nice-to-have voor (uitgenodigde) users.
- [x] ~~**Self-service signup dichtgezet (invite-only)**~~ (2026-06-02) — concurrenten kunnen zich niet meer zelf registreren. Supabase "Allow new users to sign up" = UIT (de échte lock, blokkeert óók directe API-calls met de anon-key). Login toont nu "Vraag een demo aan" → `/contact` i.p.v. registratielink; `/signup`-route redirect naar `/contact`; `/signup` uit de auth-paden in middleware. Nieuwe klant: Floris maakt 'm aan via Supabase (Authentication → Users → Add user, "Auto Confirm User" aan) → klant logt in → middleware stuurt naar `/onboarding` (geen `restaurant_users`-rij) → eigen zaak. Zie changelog 2026-06-02.
- [x] ~~**Team-invite landde op /onboarding i.p.v. dashboard**~~ (2026-06-08, fix `78248d3`) — `team.controller` las `process.env.FRONTEND_URL` (nooit gezet) → invite-accept-URL viel terug op `http://localhost:3000` → `/auth/confirm` weigerde die cross-origin `next` (open-redirect-bescherming) → fallback `/dashboard` → middleware → `/onboarding`. Fix: leest nu `WEB_URL`. **Config gezet (2026-06-08):** `WEB_URL=https://www.get-filly.com` in `get-filly-api` ✅ + Supabase Site URL & Redirect URLs op `https://www.get-filly.com` ✅ (loste óók de data-deletion-status-URL + mail-unsubscribe-links op). **Resteert alleen nog:** teamlid-invite end-to-end testen (moet in dashboard landen mét permissies).
- [~] **CRM-klantuitnodiging + `/welkom` + onboarding — code af, nog niet live** (2026-06-03) — nieuwe klanten worden via het CRM uitgenodigd → activeren op `/welkom` (wachtwoord instellen) → middleware → onboarding. **Code staat klaar maar is nog NIET gedeployed/geconfigureerd**: `apps/web/src/app/welkom/page.tsx`, `apps/api/src/integrations/*` (POST `/api/integrations/crm/invite`, beveiligd met `CRM_INTEGRATION_API_KEY` + constant-time check), invite-mailtemplate met onboarding-tips (`scripts/supabase-email-templates.mjs`), briefje in [docs/crm-integration.md](docs/crm-integration.md). **Nog te doen om live te gaan:**
  - [ ] `CRM_INTEGRATION_API_KEY` zetten in Vercel `get-filly-api` (Production + Preview) + `apps/api/.env`; veilig delen met de CRM-collega.
  - [ ] Supabase → Authentication → URL Configuration → Redirect URLs: `<WEB_URL>/welkom` toevoegen (bv. `https://get-filly.com/welkom`).
  - [x] ~~Code committen + pushen~~ (2026-06-03) — gecommit + gepusht; deployt **inert** (endpoint geeft 401 tot de sleutel staat, `/welkom` is nergens gelinkt, mailtemplate gaat pas live met `apply-templates`).
  - [ ] Mailtemplate uitrollen: `pnpm supabase:apply-templates`.
  - [ ] End-to-end test: `curl`-invite (zie briefje) → mail → `/welkom` → onboarding.
  - [ ] CRM-kant: collega laten aansluiten op het endpoint (server-side, sleutel in header). Zie briefje.
  - [ ] 🟡 (aanrader) Vast api-domein i.p.v. `get-filly-api-three.vercel.app` — bv. `api.get-filly.com` als custom domain op het get-filly-api-project, zodat de CRM-URL én `NEXT_PUBLIC_API_URL` stabiel blijven als het vercel.app-domein ooit verschuift (het `-three`-suffix verraadt dat het al eens veranderd is).
- [~] **Geocoding bij adres-invoer** — GeocodingService via PDOK Locatieserver (gratis, EU, officiële NL-bron) live sinds 2026-04-24. Onboarding haalt nu lat/long op direct na restaurant-insert. **Nog te doen**: (1) eenmalig backfill-script voor bestaande restaurants zonder coords, (2) geocode opnieuw triggeren bij adres-wijziging op account-pagina (zodra die bestaat).
- [x] ~~Empty-states-sweep dashboard~~ (2026-04-29) — alle dashboard-pagina's tonen nu rustige empty-states i.p.v. rode HTTP-banners. Geraakt: KpiRow, WeatherForecast, suggesties, campagnes-detail, account, rapportages (volledige empty-state voor nieuwe klanten zonder data), reviews (verwijst naar koppelingen-pagina). Form-validation rood-kaders (reserveringen-modal, review-reply-modal) blijven rood — passend voor user-action-fouten.
- [x] ~~Signup → auto-restaurant-creatie~~ — `/onboarding`-wizard live (2026-04-24, commit `5d888c9`)
- [x] ~~Password-reset flow~~ — `/forgot-password` + `/reset-password` live (2026-04-24, commit `335f5a1`)
- [x] ~~Wachtwoord-eisen + confirmatie-veld~~ — signup en reset-password gebruiken herbruikbaar `<PasswordStrength>` component met live checklist (8+ tekens, letter, cijfer, speciaal teken). Submit disabled tot groen (2026-04-24, commit `15fe843`).
- [x] ~~Supabase email-templates geautomatiseerd~~ — `pnpm supabase:apply-templates` PATCHt alle 4 templates (invite, magic-link, recovery, confirmation) via Management API. Geen handwerk meer in dashboard. (2026-04-24, commit `2775f08`)
- [x] ~~Onboarding met Filly-auto-invul~~ — URL + menukaart → Filly vult hele profiel in (description, tagline, atmosphere, target_audience, USPs, events, signature_dishes, cuisine_style, adres, toon) + menu-items via Opus Vision. Wizard: bronnen → review → bevestig (2026-04-24, commits `b29f317` + `d909c65`).

### Legal & compliance (AVG/NL)
- [x] ~~**Privacy-verklaring**~~ (2026-05-30) — `/privacy` volledig vervangen door de uitgebreide aangeleverde tekst (20 secties + 4 overzichtstabellen: doel/rechtsgrond, subverwerkers, bewaartermijnen). Afgestemd op AVG + Google OAuth Verification + Meta App Review + Stripe + bunq + Anthropic/Claude. Bedrijfsgegevens ingevuld in `config/company.ts` (KvK 42068177, Saxen Weimarlaan 44-2 Amsterdam, +31 6 57737372). Concept-banner verdwenen. **Blijft formeel concept tot jurist-review.**
- [x] ~~**Algemene voorwaarden**~~ (2026-05-30) — `/voorwaarden` volledig vervangen door aangeleverde tekst (18 secties + definitietabel). Aansprakelijkheidsmax (€ 25.000) + rechtbank (Amsterdam) ingevuld in `config/company.ts`. Verwijst naar Verwerkersovereenkomst (art. 28 AVG) die nog opgesteld moet worden (zie DPA-item). **Blijft formeel concept tot jurist-review.**
- [ ] **Jurist-review legal-teksten** — laten reviewen door privacy/SaaS-jurist vóór eerste klant. Met name: aansprakelijkheidslimiet (€ 25.000), SLA-claim (99%), IP-clausule AI-output, prijswijzigings-clausule, Stripe/bunq als verwerkers. De live-teksten zijn de aangeleverde conceptversie (30 mei 2026).
- [x] ~~**`/delete-data`-pagina (Meta data deletion)**~~ (2026-06-06) — publieke pagina `apps/web/src/app/delete-data/page.tsx` (legal-stijl, in sitemap). Uitleg: account verwijderen via Account → "Account permanent verwijderen", Meta-koppeling intrekken (Meta-zijde: Apps en websites), welke gegevens + 30-dagen-termijn, contact via `COMPANY.privacyEmail`. **Restje**: zin "wij wissen de opgeslagen token" klopt pas écht zodra token-opslag (stap 3) + een in-app loskoppel-knop bestaan; tekst is nu bewust naar account-delete/e-mail-verzoek geschreven om geen niet-bestaande knop te beloven.
- [x] ~~**Cookie-banner**~~ (2026-04-29) — `<CookieBanner />` in root-layout, accept/reject in localStorage. Klaar voor wanneer Plausible/PostHog erbij komt (analytics-init achter consent-check).
- [x] ~~**AVG-endpoints** — data-export~~ (2026-04-29) + ~~right-to-be-forgotten (account-delete)~~ (2026-04-30). Account-delete via `DELETE /restaurant/me/account` met `{ confirmation: "VERWIJDER" }`-body. UI-knop op account-pagina sectie "Data & privacy". Verwijdert auth.users + alle owner-restaurants → cascade business-data; blokkeert als andere team-members bestaan. Bewijs-rij in `account_deletions`-tabel (geen PII).
- [~] **Data-classificatie + anonimisering-bij-delete** — fase 1 live per 2026-04-30: continue benchmark-anonymisering bij `campaign.status → afgerond` schrijft een rij in `campaign_benchmarks` (cuisine + region=provincie + capacity-bucket + month + theme + result-metrics, géén body, géén FK, GDPR Recital 26). Laatste-vangnet bij delete via `AnonymizationService.benchmarkAllCompletedFor()`. **Fase 2 nog open**: (1) body-templates extraheren met LLM-stripping van eigennamen, (2) menu-pattern-aggregatie, (3) `docs/data-classification.md` met per-tabel-categorie, (4) Filly's prompts verrijken met benchmark-queries.

### Hosting-deploy (2026-05-08 → 2026-05-21 compleet)
- [x] ~~**Frontend live op `get-filly-web.vercel.app`**~~ — gedeployed 2026-05-08, beschermd met basic-auth middleware via env-vars `DEMO_AUTH_USERNAME` + `DEMO_AUTH_PASSWORD`. Vercel Hobby (geen native password-protection). URL kan privé gedeeld worden, browser-popup voor login.
- [x] ~~**API live op Railway** `api-production-9682.up.railway.app/api`~~ (2026-05-21, commits `d9d61f6` + `881fac1` + `15a5e7b` + `551177c`). Vercel-route afgeschreven (Nest = persistent server, niet serverless). Railway-config: `railway.json` in repo root met `pnpm install --filter "api..."` + `pnpm --filter api build` + `start:prod`. **Node 22.x verplicht** (engines + .nvmrc) — jose@6 is ESM-only en `require(esm)` is pas default vanaf Node 22. CORS in `apps/api/src/main.ts` leest `WEB_URL` + `CORS_ORIGINS` uit env. Watch Paths leeg = redeploy bij elke main-push. Env-vars 1-op-1 uit lokale `.env` overgezet, behalve `WEB_URL` (lokaal localhost:3000 → prod Vercel-URL). Bewezen werking: `curl /api/hello` → 200, login + dashboard zonder Geen-toegang-melding.
- [x] ~~**CI Suspense-fix**~~ (2026-05-21, commit `28bdfe2`) — Next.js 15+ vereist `<Suspense>`-wrapper rond `useSearchParams()` voor prerender. Account-page + google-business/reviews waren broken; refactor: inner-component houdt hooks, default-export wikkelt 'm in `<Suspense fallback={null}>`. Vercel-build was groen sindsdien.
- [x] ~~**Web-deploy werd stil overgeslagen (ignore-build-step)**~~ (2026-06-02, commit `1fd6271`) — Vercel's "Skip unaffected projects" keek alleen naar de láátste commit van een push; eindigde die op een docs/api-commit, dan annuleerde Vercel de web-build ("Canceled by Ignored Build Step") terwijl een eerdere commit wél `apps/web` raakte → productie bleef op oude code. Fix: eigen `apps/web/vercel.json` (`ignoreCommand: bash scripts/vercel-ignore-build.sh`) die `git diff` doet tussen `VERCEL_GIT_PREVIOUS_SHA` (laatste geslaagde deploy) en `VERCEL_GIT_COMMIT_SHA` over `apps/web` + `packages/shared` + `pnpm-lock.yaml` + `package.json`. Exit 0 = overslaan, !=0 = bouwen; faalt bewust naar bouwen. Zie changelog 2026-06-02.
- [x] ~~🟡 **`get-filly-api` heeft dezelfde latente deploy-skip**~~ (2026-06-11) — `apps/api/scripts/vercel-ignore-build.sh` (spiegel van de web-variant) + `ignoreCommand` in `apps/api/vercel.json`. Diff't over `apps/api` + `packages/shared` + `pnpm-lock.yaml` + `package.json` tussen laatste geslaagde deploy en huidige commit; faalt bewust naar bouwen. Lost beide kanten op: een echte api-wijziging wordt nooit meer overgeslagen, én docs-only pushes (bv. BACKLOG-commits) triggeren geen overbodige api-redeploy meer. Gedrag getest in scratch-repo (docs-only → skip, api-wijziging → bouwen, geen previous SHA → bouwen). NB: de éérste deploy ná deze wijziging bouwt sowieso — `VERCEL_GIT_PREVIOUS_SHA` wordt pas gevuld zodra de ignore-step bestaat.
- [ ] **Bundle '+ Kanaal toevoegen' (fase 4b)** — op `/campagnes/bundle/[id]` staat de knop nu disabled. Implementatie: POST `/campaigns/bundle/:groupId/channels` met `{platform, body, subject_line?, scheduled_for?}` → maakt nieuwe campagne onder dezelfde group_id. UI: platform-keuze-modal of toggle-pillen zoals voorstel-pagina. Optioneel Filly-tekst-generate voor het nieuwe kanaal.

### Autonome detectie + push-meldingen (concept-flow, 2026-05-08)
Eigenaar's vision: Filly checkt dagelijks (event-driven via reserveringsplatform), spot rustige dagen op basis van threshold, push-melding naar eigenaar → klik → genereer voorstel → bundle ontstaat in /campagnes.
- [x] ~~**Low-occupancy threshold per restaurant**~~ (2026-06-11) — kolom `low_occupancy_threshold` (mig 0037) + slider op account-pagina + dashboard waren al live; laatste restje gefixt: `detectAndGenerateLowOccupancy` leest nu óók de kolom per restaurant (`suggestions.service.ts`, stap 1b), de constante 50 is alleen nog fallback voor restaurants zonder eigen waarde. Drempel staat ook in de Claude-prompt per dag.
- [ ] **Autonome detectie** — bij data-event vanuit reserveringsplatform (Zenchef etc.) automatisch `detectAndGenerateLowOccupancy` triggeren (i.p.v. handmatige knop). NB: per memory géén interne cron, alléén event-driven.
- [ ] **Push-meldingen** — opties: (a) Email-interim via Resend (snel, 2-3u), (b) Web Push via PWA (10-12u, werkt cross-platform), (c) Mobile app + native push (weken, App Store). Sprint-keuze: start met (a), later (b).
- [ ] ⚠️ **Bezetting in de dag-keuze is nu seeded nep-data** (gevonden 2026-06-12) — `buildWindowOccupancy` (`apps/web/src/lib/occupancy-window.ts`) valt voor elke dag zónder rij in `occupancy_days` terug op `seededOccupancy` (demo-formule: ma/di/wo 40-69%, do 55-79%, vr/za/zo 78-99%). Voor een echt restaurant zónder bezettingsdata (`occupancy_days` leeg + 0 reserveringen, geverifieerd voor Bar Barolo `71ecad93`) zijn de "rustige dagen" in zowel de geleide chat-flow als het dashboard-blok (`useActionableDays`) dus volledig **verzonnen**. Symptoom dat Floris vond: Filly zegt in proza "alle dagen rustig" (leest reserveringen) maar de dag-picker toont maar 1 dag (`di 23 jun` = toevallig seeded 42%). De seeded-fallback was bedoeld als demo-scaffolding voor het demo-account, niet voor echte tenants.
  **Afwegingen / opties (beslissing volgt — Floris):**
  - **A (eerlijk, aanbevolen):** flow + hook gebruiken alleen ECHTE `occupancy_days`; ontbreekt die, toon de komende OPEN dagen als klikbare keuze (+ speciale dagen) i.p.v. nep-percentages. Raakt ook het dashboard-blok (gedeelde `useActionableDays`-hook) → toont dan eerlijk "geen rustige dagen". Geen capaciteitsmodel nodig. Nadeel: zonder data geen "deze dag heeft écht een actie nodig"-signaal meer.
  - **B (echt, grootste klus):** `occupancy_pct` echt berekenen (reserveringen ÷ capaciteit) en `occupancy_days` vullen via een pipeline. Vereist een capaciteits-/coversmodel + event-driven trigger — hangt aan de reserveringskoppeling (Zenchef, zie "Autonome detectie" hierboven). Beste resultaat; lost meteen ook de autonome-detectie op.
  - **C (splitsen):** alleen de chat-flow laat seeded los; dashboard houdt seeded tot B. Kleinste blast-radius, maar dashboard tijdelijk inconsistent.

### Billing
> ⚠️ **Betaalprovider-wijziging (2026-05-30)**: de aangeleverde legal-teksten
> (privacy + voorwaarden) noemen **Stripe** (betalingen) + **bunq** (zakelijke
> bank/administratie) — NIET Mollie. De privacy/voorwaarden zijn hierop al
> live. Billing-implementatie hieronder dus op Stripe baseren, niet Mollie.
- [ ] **Stripe-integratie** — SDK installeren, checkout-flow op pricing-pagina (creditcard/SEPA/iDEAL). Verwerkersrol + privacy al beschreven in de legal-teksten.
- [ ] **Migratie `subscriptions`-tabel** — plan + status + stripe_customer_id + stripe_subscription_id
- [ ] **Plan-enforcement** — limieten per plan (AI-calls, campagnes, teamleden) afdwingen in backend
- [ ] **Stripe webhook** — status-changes opvangen (trial → active → past_due → cancelled)
- [ ] **bunq-koppeling** (later) — zakelijke bankadministratie/reconciliatie. Genoemd in legal als verwerker; implementatie pas relevant als de boekhoud-flow er is.

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

## P1 — Productie-hygiëne

### Infrastructuur & deploy
- [x] ~~**Vercel + GitHub consolideren naar het Developer-account**~~ (✅ AFGEROND 2026-06-01) — alles draait nu op **één** Vercel-account (Developer, scope `get-fillys-projects`) + **één** repo (`Get-Filly/Get-Filly`): get-filly.com + www + api live daar, web→`get-filly-api-three.vercel.app/api`, `CORS_ORIGINS` gezet (plain), personal-duplicaten verwijderd, oude repo `Florisbwkoevermans/get-filly` gearchiveerd, `oldrepo`-remote weg. **Eén push naar Get-Filly/Get-Filly deployt nu alles** (geen `git push oldrepo` meer). Details + gotcha's in auto-memory "Stand 2026-06-01". Restje: Pro+Fluid Compute bij launch; `WEB_URL` op api leeg. _Oorspronkelijke context hieronder:_ de LIVE projecten `get-filly-api` + `get-filly-web` draaien nu in het **persoonlijke** Vercel-account (`florisbwkoevermans-projects`) en hangen aan de **OUDE** repo `Florisbwkoevermans/get-filly`. In het Developer-account (`developer@get-filly.com`) staan duplicaten gekoppeld aan de nieuwe repo `Get-Filly/Get-Filly`. **Doel: alles naar één opzet — Developer-account + repo `Get-Filly/Get-Filly`.** Stappen: (1) live projecten naar het Developer-team transferren (of opnieuw importeren) + domeinen get-filly.com/www meeverhuizen; (2) Git-koppeling op `Get-Filly/Get-Filly` zetten zodat een push naar de nieuwe repo de live site deployt (**nu nog `git push oldrepo main` nodig**); (3) **`florisbwkoevermans` volledig loskoppelen van Vercel** (persoonlijke projecten verwijderen, account eruit); (4) oude repo `Florisbwkoevermans/get-filly` archiveren. Tot dat klaar is: bij elke deploy óók naar de oude repo pushen, anders raakt de wijziging de live site niet.
- [x] ~~**Backend-migratie naar Vercel (Nest → all-Vercel)**~~ (2026-05-28/29) — gekozen route: **Optie A**, Nest as-is op Vercel serverless via custom handler. Setup: `apps/api/api/index.ts` wrapt de Nest-app als Express-instance, `apps/api/vercel.json` met catch-all rewrite `/api/(.*) → /api/index` + region `fra1` + 10s maxDuration (Hobby). Aparte Vercel-project `get-filly-api` aangemaakt, rootDir = `apps/api`, Framework Preset = `Other`, "Include files outside root in Build Step" aan. Alle 9 env-vars geïmporteerd uit apps/api/.env. Frontend `NEXT_PUBLIC_API_URL` op `https://get-filly-api.vercel.app/api` voor Production + Preview. Railway-service "api" succesvol verwijderd na werkende smoke-test (login, dashboard, reserveringen, gasten, reviews, campagnes, mail-send). **Bekende limieten op huidige Hobby-plan**: Filly-chat + Vision-imports timeouten op 10s; menukaart-uploads >4.5MB falen (workaround = Supabase Storage signed URLs, P2 backlog). Resend-webhook URL nog niet ingesteld (bestond niet bij Railway, blijft op P1 backlog). Server-side keys cleanup `get-filly-web` op P1 backlog gezet (security). **Correctie 2026-06-03**: het werkende api-domein is `https://get-filly-api-three.vercel.app/api` — `get-filly-api.vercel.app` geeft `DEPLOYMENT_NOT_FOUND` (Vercel kende dat domein niet (meer) toe). Controleer of `NEXT_PUBLIC_API_URL` in het get-filly-web Vercel-project op het `-three`-domein staat, anders kan het live dashboard de api niet bereiken.
- [x] ~~**vercel.json voor web** — deploy-config~~ (afgevinkt 2026-06-11) — bestond al sinds de deploy-skip-fix van 2026-06-02 (`1fd6271`): `apps/web/vercel.json` met `ignoreCommand`. Dit losse regeltje was nooit bijgewerkt.
- [x] ~~**Railway/Render config voor api**~~ — vervallen 2026-05-29: Railway-service verwijderd na geslaagde Vercel-migratie.
- [ ] **Password-protected preview-deploy** op `app.get-filly.com` — eerste live URL waar we Meta-OAuth + echte tests kunnen doen
- [ ] **Staging-Supabase** — aparte DB voor tests/Meta-review zonder productie-risico
- [ ] **GitHub Actions CI** — type-check + lint + build op elke PR

### Monitoring & analytics
- [ ] **Sentry** — error-tracking backend + frontend
- [ ] **Plausible** (of PostHog) — analytics op publieke site + dashboard
- [ ] **Cost-alerts Anthropic** — mail als daglimiet overschreden

### Security hardening (multi-tenant, 1000+ klanten)
- [x] ~~**Per-request Supabase-client met user-JWT**~~ (2026-05-01) — `RequestSupabaseService` (Scope.REQUEST) bouwt per HTTP-call een Supabase-client met het user-JWT uit de Authorization-header. RLS-policies pakken het via `auth.uid()`. AuthGuard zet `req.accessToken` na verify. 13 services gemigreerd: Menu/Reviews/Guests/Reservations/Occupancy/Kpi/Campaigns/Suggestions/Chat/ChatMemory/Restaurant/DataExport/Weather/RestaurantContext. **Bewust op service_role gebleven**: AuditLog (audit-integriteit), Anonymization (background), AccountDeletion (raakt auth.users), Onboarding (restaurant_users-link bestaat nog niet), AiService (alleen ai_usage-logging), TeamService (gebruikt auth.admin.inviteUser/generateLink). RLS-tests bewezen op DB-niveau: cross-tenant SELECT → `[]`, cross-tenant INSERT → HTTP 403 + `new row violates row-level security policy`.
- [ ] **`@RequireModule`-decorator** — backend enforced per-module permissies (nu alleen frontend-filter op sidebar)
- [x] ~~**Audit-log vullen**~~ (2026-04-30) — alle 6 service-domeinen schrijven nu naar `audit_log` met echte `userId`. Zie Data Analyst-sectie voor exhaustief overzicht.
- [ ] **Email-change flow** — account-pagina
- [ ] **2FA setup** — `users.two_factor_enabled` kolom bestaat, geen UI
- [ ] **Pre-onboarding rate-limit naar Redis** — nu in-memory Map in `OnboardingController`. Overleeft geen multi-instance deploy; vervangen door Redis/Upstash zodra api op Railway schaalt.
- [x] ✅ **Server-side keys verwijderd uit `get-filly-web` Vercel-env-vars** (2026-06-18 door Floris; geverifieerd: alleen `NEXT_PUBLIC_*` + publieke OAuth-id's resteren). _Oorspronkelijke context:_ (gespot 2026-05-28 tijdens Vercel-migratie). Frontend-project heeft 9 server-only vars die er niet horen: `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (⚠️ service-role, kritiek), `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `GOOGLE_PLACES_API_KEY`, `WEB_URL`. Risico: als een per-ongeluk-gebakken Next.js-bundle ze lekt → full DB-access (SUPABASE_SECRET_KEY = bypass RLS) + open AI/mail-quota's. Mag BLIJVEN: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Stappen: dashboard → get-filly-web → Settings → Env-vars → 9× delete → redeploy zonder cache → testen.
- [x] ~~**Demo basic-auth-popup verwijderd**~~ (2026-05-29) — de `DEMO_AUTH_USERNAME/PASSWORD`-popup is uit `middleware.ts` gehaald zodat Google's reviewers de publieke pagina's + OAuth-flow kunnen bereiken (vereist voor GBP OAuth-verificatie). Dashboard blijft beschermd via de Supabase-auth-gates. **Restje**: `DEMO_AUTH_*`-env-vars staan nog in Vercel `get-filly-web` en kunnen verwijderd worden (code leest ze niet meer).

### Email & campagnes (gepromoveerd van P2 → P1)
- [ ] **Resend als SMTP-provider voor Supabase Auth** — configureer Resend onder Supabase Auth → SMTP Settings. Lost de 3-4/uur rate-limit op Supabase default SMTP en maakt confirmation-email weer bruikbaar in dev. Onze custom templates blijven werken; Supabase stuurt ze via Resend i.p.v. eigen SMTP.

### Campagne-flow cleanup (post-unification, 2026-05-13)
Sinds [main 61d26ed](https://github.com/Florisbwkoevermans/get-filly/commit/61d26ed) heeft `/campagnes/[id]` één gedeelde detail-view (status-aware) die identiek is aan `/voorstel/[id]`. Mig 0041 + 0042 zijn live, smart-detect op bundle-API werkt, 5 gedeelde componenten in `_components/campaign-detail/`. Hieronder de openstaande punten uit de data-analyst-review.

**Bugs (urgent):**
- [x] ~~**"Activeer nu" stuurt mail niet daadwerkelijk**~~ (2026-05-28) — `handleStatusChange('actief')` op `/campagnes/[id]` roept nu `sendCampaign(channelId, 'all_opted_in')` aan voor elke mail-channel met `sent_count=0`, dáárna pas de status-flip. Volgorde send-first → status-flip zorgt dat status op concept/ingepland blijft als de send faalt (geen 'actief zonder mail'-toestand). `sent_count>0` = defensief skip tegen dubbele bezorging. Confirm-tekst aangepast aan single/multi/no-mail-bundle.
- [ ] **InhoudCard `originalIdxRef` reset niet** bij client-side nav tussen 2 verschillende campagnes (zelfde route, ander `[id]`) → ✕-knop wijst naar de oude origineel. Fix in `apps/web/src/app/dashboard/_components/campaign-detail/inhoud-card.tsx:80`: reset op `sectionId`-of-`variants`-prop-change. **Check 2026-06-11:** er staat inmiddels een `useEffect` (regel 98-105), maar die initialiseert de ref alleen éénmalig (als-ie nog null is) — de beschreven reset bij campagne-wissel ontbreekt nog. Mogelijk in de praktijk een non-issue (App Router remount bij ander `[id]`); eerst reproduceren, anders alsnog de reset toevoegen.
- [ ] **Multi-channel status-overgang heeft geen rollback** — `Promise.all(updateCampaignStatus)` over kanalen. Bij partial failure: halfgeplaatste bundle. **Fix**: nieuw endpoint `PATCH /campaigns/bundle/:id/status` met transactionele update over alle siblings.

**Dead code (na refactor niemand importeert het meer):**
- [x] ~~**4 components slopen**~~ (✅ 2026-06-22) — alle 4 verwijderd (~57 KB): `campaign-refine-panel.tsx`, `campaign-schedule-panel.tsx`, `campaign-media-slot.tsx` (vervangen door `campaign-detail/foto-card.tsx`; alleen comment-refs restten) + `campaign-send-modal.tsx` (de "Activeer-stuurt-mail"-fix is af; alleen comment-refs in google-connect-modal). Geverifieerd: nergens geïmporteerd. Typecheck schoon.
- [x] ~~**Dode API-functies in `apps/web/src/lib/api.ts` schrappen**~~ (✅ 2026-06-22) — `fetchCampaignVariants`, `generateCampaignVariants`, `updateCampaign`, `suggestCampaignSchedule` + de enkel-daar-gebruikte `CampaignVariantsState`-type verwijderd. Werden alleen door de net-gesloopte panels aangeroepen. `setCampaignSchedule`/`generateMoreCampaignVariants`/`updateCampaignStatus` (live) bewust behouden.
- [x] ~~**Dode backend-endpoints + service-methodes schrappen**~~ (✅ 2026-06-22) — `GET /campaigns/:id/variants`, `POST /:id/refine`, `PATCH /:id`, `POST /:id/suggest-schedule` uit de controller + `getVariants`/`refine`/`update`/`suggestSchedule` uit de service (~635 regels). Geverifieerd: enkel door hun eigen dode routes aangeroepen, geen gedeelde helpers (`retractFromChannel`/`syncContentFromVariant` blijven, live). Stale comments opgeschoond; `tsc` schoon. NB: `refine` was de laatste write-path naar `filly_variants` → zet mig-0043-cleanup een stap verder (zie hieronder).
- [x] ~~**Oude `/campagnes/bundle/[id]/page.tsx` slopen**~~ (2026-06-11) — redirect-stub + `bundle/`-map verwijderd; oude bookmarks worden nu server-side afgevangen via `redirects()` in `apps/web/next.config.ts` (307 naar `/dashboard/campagnes/:id`, bewust niet permanent gecached).
- [x] ~~**Mig 0043 → 0060: DB-schema cleanup**~~ (✅ 2026-06-22, code-stap) — laatste write-paden naar `campaigns.filly_variants`/`_regen_count`/`variant_applied_at` verwijderd (de create-seed + de hele `seed_variants`-keten in `campaigns.service`/`suggestions.service`) + de twee `variant_applied_at`-typevelden (api + web). Niets leest/schrijft de kolommen nog (`reviews.*`-kolommen blijven, andere tabel). Drop-migratie `0060_drop_campaign_filly_variants.sql` klaargezet. ⚠️ **Volgorde**: eerst deze code live, dán de DROP-SQL draaien (expand/contract).

**Polish (nice-to-have):**
- [x] ~~**Approve-redirects consistent**~~ (✅ al gedaan, bevestigd 2026-06-22) — de approve-handlers in `campagnes/page.tsx` (regels ~636/687) én de single-channel approve in `voorstel/[id]` (567) redirecten al naar `/dashboard/campagnes/${campaignId}`. Alleen reject/delete + multi-channel-bundle gaan bewust naar de kanban (bij een bundle is er geen één-correct detail-page).
- [x] ~~**"Wanneer plaatsen"-card: verzendmoment-uitleg herbedraden**~~ (✅ 2026-06-22, optie a+) — bij approve schrijven we nu het door het brein gekozen moment + reden (`sc.scheduled_for`/`scheduled_reasoning`, per kanaal in de bundel) in de bestaande `suggested_scheduled_for`/`_reasoning`-kolommen (`campaigns.service.create` + beide approve-paden in `suggestions.service`). De card (`wanneer-card.tsx`) rendert die al ("Filly stelt voor: … omdat …" + afwijking-banner + terug-naar-Filly) — geen card- of adapter-wijziging nodig. Geen migratie (kolommen bestonden al). De `approveBundleSuggestion`/chat-bundle-flow heeft geen per-kanaal-timing en blijft ongemoeid.
- [ ] **Variant-delete knop** — eigenaar kan via "Genereer 3 nieuwe" tot 6 versies opbouwen, daarna zit-ie vast. Voeg ✕-knop op alternatief-blokken (alleen op concept) toe → `DELETE /campaigns/:id/variants/:idx`.
- [ ] **`findBundle` N+1 → batch** — per content-tabel 1 SELECT met `IN (campaign_ids)` ipv `findById` per kanaal. Geen blocker voor 1-5 kanalen, wel voor toekomstige >10-kanaal-bundles. **Check 2026-06-11:** draait inmiddels parallel via `Promise.all` (scheelt wall-clock), maar nog steeds `findById` per kanaal — de batch-`IN`-query blijft de echte fix.
- [ ] **KanalenCard add/remove voor concept-bundles** — staat nu `canEdit=false` omdat de backend geen "add channel to bundle"-endpoint heeft. Vereist nieuw `POST /campaigns/bundle/:id/channels` dat een nieuwe campaign in dezelfde group_id aanmaakt.

### Site-fundamenten (publieke site)
- [x] ~~**Contact/waitlist-formulier**~~ (2026-05-30) — `/contact`-pagina (demo-aanvraag: naam/restaurant/e-mail/telefoon-optioneel/bericht + honeypot anti-spam). Publiek endpoint `POST /api/public/contact` (@Public) → `MailService.sendContactRequest` mailt naar **info@get-filly.com** (from `social@get-filly.com`, reply-to = bezoeker). Alle 5 demo/kennismaking-CTA's (navbar, homepage-hero, homepage-pijler, product, pricing) linken nu naar `/contact`. Serverside-validatie + lengte-grenzen.
- [x] ~~**404-pagina**~~ (2026-06-05) — `apps/web/src/app/not-found.tsx`, on-brand met links terug de site in
- [x] ~~**sitemap.xml**~~ (2026-06-05) — `apps/web/src/app/sitemap.ts`, live op `/sitemap.xml`
- [x] ~~**robots.txt**~~ (2026-06-05) — `apps/web/src/app/robots.ts`, blokkeert dashboard/auth/besloten routes
- [x] ~~**OG-image + per-pagina SEO-metadata**~~ (2026-06-05) — metadataBase + title-template + per-pagina title/description/canonical via `apps/web/src/config/seo.ts`; site-brede OG-deelafbeelding (alleen logo) via `app/opengraph-image.tsx`; JSON-LD (Organization/WebSite/SoftwareApplication) via `components/structured-data.tsx`. Canoniek domein **www.get-filly.com**.
- [x] ~~**Apex → www redirect**~~ (2026-06-06) — opgelost **in code** via `apps/web/next.config.ts` `redirects()` met host-match (`get-filly.com` → `https://www.get-filly.com`, 308). Heft de duplicate-content op én zorgt dat OAuth-redirect_uri's altijd op www staan (1 origin in Meta i.p.v. apex+www). Exact-host-match, dus app.get-filly.com + Vercel-previews vallen erbuiten. Optioneel nog: dezelfde redirect op Vercel → Domains zetten (gebeurt dan op edge, vóór de functie) — niet nodig, code dekt het.
- [ ] **Google Search Console** (open, Floris-actie + kleine code-stap) — property op `https://www.get-filly.com` aanmaken + `sitemap.xml` indienen. Verificatie via DNS-TXT óf meta-tag; bij meta-tag levert Floris de code aan → toevoegen als `verification: { google: "<code>" }` in de root-metadata (`apps/web/src/app/layout.tsx`).
- [ ] **Bing Webmaster Tools** (open, Floris-actie) — property op `www.get-filly.com` + dezelfde `sitemap.xml` indienen; voedt ook andere zoek-/AI-engines.
- [ ] **Beeldoptimalisatie afronden** — resterende plain `<img>` (**nog 10×** per telling 2026-06-11, o.a. navbar, footer, landing-visuals, product, foto-card) → `next/image` (WebP/AVIF + srcset + lazy-load), `logo.png` (**nog 511KB**) verkleinen, Lighthouse-audit o.b.v. Speed Insights-data. Claude in code.
- [x] ~~**FAQPage-schema op /pricing**~~ (2026-06-05) — JSON-LD uit de `faqs`-array → kans op uitklapbare rich results in Google.
- [~] **Analytics + Speed Insights** (2026-06-05) — code staat live in de root-layout (cookieloos/AVG-vriendelijk). **Speed Insights is actief** (script 200). **Web Analytics nog aanzetten**: Vercel → project → tab **Analytics** → *Enable* (script geeft nu 404 = uit). Daarna stroomt bezoekersdata binnen.
- [ ] **Social-profielen in JSON-LD `sameAs`** — ⏳ **wacht alleen op de URL's van Floris** (Instagram/LinkedIn + evt. Facebook/TikTok/X). Daarna ~5-min ingreep: invullen in de nu lege `sameAs:[]` in `components/structured-data.tsx` → sterkere entiteitskoppeling voor Google + AI-zoekmachines. (Bevestigd 2026-06-08: `sameAs` staat live nog leeg.)
- [x] ~~**About-pagina invullen**~~ (afgevinkt 2026-06-11) — `/about` is volledig gevuld (missie "Van idee naar impact" + 3 pijlers + roadmap 2026-2029) en live geverifieerd op www.get-filly.com/about.
- [x] ~~**Footer invullen**~~ (afgevinkt 2026-06-11) — `components/footer.tsx` heeft 3 kolommen (Product/Bedrijf/Juridisch) + logo + copyright; live geverifieerd.

### Content & blog (grootste SEO/GEO-hefboom)
- [x] ~~**Blog-/content-infrastructuur bouwen**~~ (2026-06-08) — `/blog` (index) + `/blog/[slug]` (detail, SSG, `dynamicParams=false`) live. Posts = markdown in `apps/web/content/blog/*.md` met front-matter (title/description/date/author); content-laag `src/lib/blog.ts` (parser + `marked`). Per artikel: SEO-metadata via `pageMetadata` + `BlogPosting` JSON-LD; automatische opname in `sitemap.ts`. Lege staat: `/blog` toont "binnenkort" + `noindex` zolang er geen posts zijn (en blijft dan uit de sitemap). Sjabloon: `content/blog/_template.md` (bestanden met `_`/`.` worden genegeerd). **Posten = `.md`-bestand droppen.** Nav-link "Blog" staat in de header (2026-06-08, op verzoek) — tot de eerste post toont `/blog` een "binnenkort"-staat + `noindex`. **Update 2026-06-17**: de lege staat is nu een volwaardige kennishub-layout **"De marketing cocktail"** (uitgelicht pijler-artikel + 6 kernpunt-kaarten + "Meest recent"), `app/blog.css` + `app/blog/blog-index.tsx`. Kaarten tonen een "binnenkort online"-toast en worden vanzelf echte links zodra een artikel met die `slug` bestaat. Eerste te schrijven slugs: `seo-tips-restaurant` (pijler), `vindbaarheid-geen-toeval`, `consistente-gegevens`, `compleet-profiel`, `fotos-meer-bezoek`, `recente-reviews`, `structureel-posten`.
- [x] ~~**Interne linking — lichte pass**~~ (2026-06-08) — contextlinks toegevoegd in de paginatekst: Over ons → Oplossing ("onze oplossing voor restaurants") + Prijzen; Oplossing → Prijzen; Prijzen → Oplossing; Home → Prijzen; en **Blog** toegevoegd aan de footer. (Footer dekte de sitebrede links al goed.) **De echte hefboom — 3-5 contextlinks/pagina in topic-clusters — volgt met blogcontent**, niet forceren op de marketingpagina's.
- [ ] **Eerste artikel-onderwerpen** (aangeleverd door Floris, 2026-06-05):
  - "Hoe krijg ik meer reserveringen in een rustige periode?"
  - "Google Bedrijfsprofiel optimaliseren voor je restaurant"
  - "Reviews beantwoorden als horecaondernemer"
  - "Restaurantmarketing zonder bureau"

### Off-site autoriteit & GEO (AI-vindbaarheid)
- [ ] **Off-site autoriteit / backlinks** (Floris/marketing, doorlopend) — Google Bedrijfsprofiel voor Get-Filly zélf, vermeldingen in horeca-/SaaS-directories + NL-startuplijsten, gastblogs/partnerships/persaandacht.
- [~] **GEO — eigen site voor AI-zoekmachines** — `llms.txt` ✅ gebouwd (2026-06-08, `public/llms.txt`: samenvatting + kernpagina's voor ChatGPT/Claude/Gemini/Perplexity); robots.txt laat AI-crawlers al toe via `userAgent:*`. **Nog te doen**: heldere feitelijke 'Wat is Get-Filly'-/vergelijkingscontent (sluit aan op blog-infra), evt. `/llms-full.txt`, en de `sameAs`-profielen (zie hierboven).
- [x] ~~**Wekelijkse interne AI-vindbaarheid-mail (Filly → Get-Filly over get-filly.com)**~~ (2026-06-08, gebouwd) — `apps/api/src/seo-report`: Vercel Cron (`apps/api/vercel.json` → `crons`, `0 5 * * 1` = ma 07:00 Amsterdam in de zomer / 06:00 in de winter — Vercel-cron kent geen DST) → `GET /api/seo-report/run` (publiek, beveiligd met `CRON_SECRET` via `Authorization: Bearer`) → audit over **4 pijlers**: AI-zoekmachines, klassieke SEO (per pagina title/description/H1/canonical/og:image/JSON-LD + /llms.txt /robots.txt /sitemap.xml), **eigen Google Business** (rating + #reviews via Places API v1, env-gated op `GETFILLY_PLACE_ID` + `GOOGLE_PLACES_API_KEY`) en algehele internetvindbaarheid → korte Claude-analyse (Haiku, feature `seo_weekly_audit`, restaurantId null) met score + kansen per pijler + top-3 acties → HTML+text-mail via `MailService.sendSeoReport` naar info@get-filly.com. Fail-soft. Lean i.v.m. 10s-functielimiet. **⚠️ Vereist (Floris-actie):** `CRON_SECRET` in Vercel `get-filly-api` (`openssl rand -hex 32`) + redeploy. **Optioneel:** `GETFILLY_PLACE_ID` voor de Google-Business-sectie (anders "niet gekoppeld").
- [ ] **Per-klant vindbaarheid-mail/-check** (later, op verzoek) — zelfde idee maar per restaurant naar de eigenaar (Google Business + eigen site). Bouwt voort op de bestaande Health-score-runner (`/dashboard/google-business/audit`). Eerst de interne mail af, dan dit per-tenant uitrollen.

---

## P2 — Mock-features naar echt

### Campagne-concept-UX (ideeën vanuit Floris-ronde 2026-04-24)
- [~] **3 varianten genereren per suggestie** — gedaan 2026-04-25. Filly genereert 3 versies per chat-proposal, modal toont ze naast elkaar met selectie + refine + goedkeuren. Approve gebruikt geselecteerde variant.
- [x] ~~**Media-upload op concept-campagne**~~ (afgevinkt 2026-06-11) — bestaat al: FotoCard op de unified detail-pagina + `MediaLibraryPicker` (eigen foto uploaden óf kiezen uit eerdere afbeeldingen, drag-and-drop). Precies wat dit item vroeg.
- [ ] **Bewerken-knop onder variant i.p.v. rechtsboven** — intuïtiever als de actie visueel bij de gekozen variant hoort.

### Filly AI-features (backend + prompts)
- [x] ~~Review-reply-suggesties via Claude~~ (2026-04-23, commits `bd03246` + `21314d9`)
- [x] ~~Filly-chat v1 met persistente historie~~ (2026-04-23, commit `53db975`)
- [x] ~~Filly-chat v2 met live restaurant-context~~ (2026-04-23, commit `0f0e1b3`)
- [x] ~~Website-analyzer (crawl + Claude) voor profiel-extractie~~ (2026-04-24, commit `b29f317`)
- [x] ~~Menu-importer met Claude Opus 4.7 Vision~~ (2026-04-24, commit `b29f317`) — verwerkt PDF/JPG/PNG/WebP, max 10MB
- [x] ~~Menu-uploads tabel + Storage-bucket met RLS~~ (migratie 0011, 2026-04-24). **NB**: onboarding-uploads gaan direct naar Vision zonder Storage-stop; pas bij heropen via menu-pagina (nog te bouwen) gebruiken we de bucket echt.
- [x] ~~**Suggesties-generator** — `getMockProposal()`~~ (2026-04-30) — vervangen door echte Claude-call via tool-use. `SuggestionsService.getProposalDetails()` levert mainDish/sides/timing/bundle-prijs/heroImage op basis van profile + menu, gecachet in `suggested_campaign.proposal_details`. Frontend laadt via `GET /api/suggestions/:id/proposal-details` met loading-skeleton.
- [x] ~~**On-demand suggesties-generator** — "Vraag Filly om voorstellen"-knop op /campagnes~~ (2026-04-30) — `SuggestionsService.generateOnDemand()` bouwt context (profile + menu + live-block) → Claude tool-use → 3-5 nieuwe ai_suggestions met trigger_type-enum (low_occupancy/weather/seasonal/retention/birthday/general). Werkt vanaf seconde 1 na onboarding zolang ≥3 menu-items. Vervangt het cron-vraagstuk: eigenaar drukt knop wanneer hij wil ipv passief wachten op auto-trigger.
- [x] ~~Menu CRUD endpoints~~ (2026-04-29) — POST/PATCH/DELETE op `/api/menu` live + menu-pagina aangesloten. Filly ziet nieuwe gerechten direct in z'n volgende prompt. **Nog open**: opnieuw uploaden menukaart via menu-pagina (mock-flow blijft alleen lokaal).
- [x] ~~**Prompt caching activeren**~~ (2026-04-29) — `cache_control: ephemeral` actief in `AiService` op chat + campaign-refine + reviews-refine. Plus per-2026-04-30: ook gebruikt voor proposal-details + on-demand suggesties + low-occupancy detect.
- [x] ~~**Auto-title-generation voor chat-conversations**~~ (2026-04-30) — `ChatService.maybeGenerateTitle` fire-and-forget na elke user-msg. Drempel: ≥3 user-messages + title is null. Tool-use Claude-call (Haiku 4.5, ~€0,001/call) genereert NL-titel ≤60 tekens. Race-safe schrijven via `.is('title', null)`. Conditioneel logger.warn bij falen — chat-response gaat altijd door.
- [x] ~~**Tool-use migratie voor alle Filly-flows**~~ (2026-04-30) — alle 5 plekken die voorheen `JSON.parse(claude.text)` deden gemigreerd naar Anthropic tool-use met expliciete JSON-schema's. Geen "Kon Filly's antwoord niet lezen"-fouten meer mogelijk. Geraakt: website-analyzer, menu-importer, campagne-refine (3 varianten), suggestion-refine, reviews-refine, schedule-suggestion. `AiService.generateStructured<T>` + `generateStructuredFromFile<T>` als centrale wrappers. Vision-calls gebruiken streaming-API (`messages.stream().finalMessage()`) zodat 24k-cap-bij-Opus geen 10-min-pre-flight-blokkade veroorzaakt.
- [x] ~~**Drankkaart-upload via Vision**~~ (2026-04-30) — aparte flow naast menukaart. `MenuImporterService.analyze(file, meta, kind)` met `kind='menu'|'drinks'`. Drank-tool-schema dwingt subcategory-enum af (wijn-rood/wit/rose/mousserend, bier, cocktail, sterke-drank, koffie-thee, fris). UI: 2 banners + signed-URL-link op bestandsnaam. Migraties 0024 (`menu_items.subcategory`) + 0025 (`menu_uploads.kind`).
- [x] ~~**Lage-bezetting-detect-and-generate**~~ (2026-04-30) — alert-bar bovenaan dashboard heeft nu actie-knop. `SuggestionsService.detectAndGenerateLowOccupancy()` window 2-14 dagen, drempel <50%, per-dag Claude-call met dag-context (weekdag, weer, segment-counts). Skip-regel: dagen met al pending suggestie worden overgeslagen. POST `/api/suggestions/detect-low-occupancy`.
- [x] ~~**Variant-flow + schedule-cyclen**~~ (2026-04-30) — migratie 0026: `campaigns.variant_applied_at` + `scheduling_history`. Suggestion-detail-modal gebruikt echte Claude-call voor proposal_details (geen mock meer). Approve-flow geeft chat-varianten door als seed naar campaigns.filly_variants zodat detail-pagina geen tweede generation triggert (3+3=6 max). Schedule-suggestie-knop cyclet door history na 4 unieke alternatieven. Inplannen + Plaats nu/Activeer-knoppen op detail-pagina header.
- [ ] **Platform-specifieke output per social-media-post** — bepalen wat voor output Filly per kanaal moet leveren, zo compleet mogelijk: per platform (Instagram feed, Instagram Reels, Instagram Stories, Facebook post, TikTok, LinkedIn) de juiste **caption-lengte** (IG ~125 tekens optimum, FB tot 80 woorden, TikTok 100-150, LinkedIn 150-300), **hashtag-strategie** (IG 3-5 mix branded+niche, TikTok 3-5 trending+specific, FB minimaal/geen, LinkedIn 3 max professioneel), **foto-/video-formaten** (IG 1:1 of 4:5, Reels 9:16, Stories 9:16, FB 1.91:1, TikTok 9:16, LinkedIn 1.91:1 of 1:1), **tone** (IG visueel-persoonlijk, FB community-conversational, TikTok energiek-trending, LinkedIn professioneel-storytelling), **call-to-action stijl** (IG "link in bio", FB direct link, TikTok "swipe up" of "comment", LinkedIn discussie-vraag), **emoji-density**, **mention-/tag-strategie**, **alt-text-vereisten**, **publicatie-tijdstip per platform** (zit deels al in suggestSchedule maar moet platform-specifiek). Resultaat: tool-schema + system-prompt per `campaign_type` + nieuw veld `social_platform` (instagram/facebook/tiktok/linkedin) zodat Filly weet voor welk kanaal hij genereert. Eigenaar kiest platform tijdens campagne-aanmaak; UI gebruikt verschillende preview-rendering per platform.

### Health-score v1 live (2026-05-23) — V2-roadmap
- [x] ~~**v1 live**~~ (2026-05-23) — `/dashboard/google-business/audit` (route hergebruikt, was Profiel-audit). 4 runners (SEO/GBP/Reviews/GEO) + CompetitorCollector in 500m straal. Gewichten: GBP 30 / SEO 25 / Reviews 25 / GEO 20. Score 0-100 met sub-scores, acties-lijst gesorteerd op pointsLost, concurrent-tabel, trend-grafiek, tabs-UI met deep-dive per categorie. POST /health/run + GET /health/latest + /health/history. Migratie 0045. Volledige analyse-uitleg in `docs/health-score-analyse.docx` (12 hoofdstukken, kritische bedenkingen per categorie). Geen extra API-key nodig: hergebruikt `GOOGLE_PLACES_API_KEY` + Claude `ANTHROPIC_API_KEY` + PageSpeed werkt gratis tot 25k/dag/IP.
- [ ] **SEO-keyword-suggesties via Claude** — extra Claude-call in SeoRunner die op basis van current title/meta/H1 + restaurant-info verbeterde versies suggereert. "Welkom" → "Bistro X — Frans-Hollandse keuken in Utrecht Centrum". UI: deep-dive in SEO-tab. ~€0,002 extra per audit.
- [ ] **GBP volledige Place-velden-checklist** — alle Place-data (telefoon, adres, openingstijden, categorie) tonen met huidige waarde + status, naast de bestaande 8 checks. Data is al beschikbaar in `GoogleProfileService.getMine()`; alleen runner + UI uitbreiden.
- [ ] **Reviews sentiment-analyse** — Claude-call op review-tekst om top-3 onderwerpen (positief/negatief) te extraheren. **Wacht op**: GBP-API met OAuth (Places API New geeft geen review-lijst meer). Of vooralsnog op handmatig in Filly ingevoerde reviews.
- [ ] **Recency-check op reviews** — laatste review jonger dan 60 dagen. Wacht op zelfde OAuth-flow als sentiment.
- [ ] **Antwoord-ratio op reviews** — % reviews dat eigenaar beantwoord heeft. Wacht op GBP-API.
- [ ] **GEO-bronnen uitbreiden** — Perplexity API (~€5/maand bij ons volume, gebruikt web-search), OpenAI GPT-search, Google AI Overviews-detectie. Diversificeert van alleen-Claude naar drie engines. Gewichten herzien naar 1/3 elk.
- [ ] **Keyword-ranking via DataForSEO/SerpAPI** — echte SERP-posities voor 5-10 zoekwoorden per restaurant. ~€20-50/maand per klant. Pas activeren als klanten erom vragen.
- [ ] **PageSpeed gemiddelde over laatste 3 runs** — PSI is flakey (zelfde site krijgt soms 65, soms 78). Tonen we nu pure last-run; v2 gemiddelde voor stabielere score. UI alleen, geen backend-werk.
- [ ] **Configureerbare concurrent-straal** — slider 250m-1km op de health-score-pagina. Default 500m. Backend `CompetitorCollector.collect()` parametriseren.
- [ ] **runner_version-overgang in trend-chart** — verticale lijn waar versie wisselde, zodat historische score-sprongen geen mysterieuze "wat gebeurde er?"-vraag worden.

### Filly's denkmethodiek — investor-document
- [x] ~~**Writing-styles & beslissingsraamwerk uitschrijven (Word-document)**~~ (2026-05-24) — `docs/filly-brein.docx` v1 live met 24 hoofdstukken: input-signalen + redeneer-flow + 6 kanaal-secties (mail/IG/FB/TikTok/WA/GBP) met lengte/tone/hashtags/timing/CTA/visueel + critic-stem + bronnen (Sprout Social, Hootsuite, HubSpot, Later, Litmus, BrightLocal, Whitespark) + urgentie-vs-optimum-framework + anti-repetitie-mechanisme + performance-tracking-leerloop + funnel/lifecycle + segmentatie/targeting + content-types/UGC + brand-stem-archetype + AI-risico's + operationele rails + complete website-implementatie-checklist. Investor-ready in dezelfde stijl als health-score-analyse.docx.

### Filly-brein v2 → code-vertaling + website-implementatie (van filly-brein.docx)
**Het document `docs/filly-brein.docx` is de bron-van-waarheid voor onderstaande taken. Open dat eerst.**

#### Filly-brain config + prompts (geen externe afhankelijkheden)
- [x] ~~**filly-brain.config.ts**~~ (2026-05-24) — typed `CHANNEL_RULES` voor 8 kanalen met copyLength/hashtags/bestTimes/leadTime/frequency/visual/tone/cta + `CHANNEL_MIX_PER_THEME` + `FUNNEL_STAGE_TO_CHANNELS` + `PERSUASION_EXAMPLES` (Cialdini 6) + `DEFAULT_RATE_LIMITS` + `SUCCESS_SCORE_THRESHOLDS` + `ANTI_REPETITION_THRESHOLDS`. Helpers `buildAllChannelsBlock` + `classifyLeadTime` + `planChannelPlacement` + `buildAnchorKeywords`. `CHANNEL_RULES_VERSION = 'v1'`.
- [x] ~~**System-prompts migreren naar config**~~ (2026-05-24) — chat.service.ts + suggestions.service.ts injecteren `buildAllChannelsBlock()` vóór CONTEXT-sectie; "VARIATIE OVER 3 VARIANTEN"-regels dwingen 3 verschillende tone-signatures af. Bestaande FORMAAT 1/2-templates blijven (centrale regels leidend bij conflict). Tool-schema-uitbreiding met `funnel_stage`/`tone_signature`/`length_target` nog open (vereist Anthropic tool-use migratie van bestaande text-blokken).
- [x] ~~**suggestSchedule met timing uit config**~~ (2026-05-24) — `mapCampaignTypeToChannel` + `formatTimingForPrompt` brengen bestDays/bestHours + lead-time + urgentie-regel uit filly-brain.config in de scheduling-prompt. Rustige dag = doel-datum, mag afwijken van sweet-spot bij dichtbije deadline. `planChannelPlacement()`-helper bestaat voor de volledige tijd_tot_doel-berekening zodra er een expliciete doel-datum-input is.
- [x] ~~**campaign_style_fingerprints-tabel**~~ (2026-05-24, mig 0048) — opening_pattern / hashtag_set / cta_template (enum) / theme / primary_dish_mentioned / tone_signature (enum) per kanaal. RLS via user_has_restaurant_access + restaurant_id-denormalize.
- [x] ~~**Anti-repetitie-context loader**~~ (2026-05-24) — `CampaignFingerprintService.buildLearningContextBlock()` laadt top-3 winners + top-3 underperformers per kanaal via JOIN met campaign_performance, plakt 'm in chat + suggestions-prompts als "SUCCESSFUL/AVOID PATTERNS". Anker-keywords-helper aanwezig in filly-brain.config maar nog niet actief gebruikt in similarity-check (komt bij anti-repetitie post-generation v2).
- [x] ~~**Post-generatie anti-repetitie-validatie**~~ (2026-05-24, hfst 8.6) — `CampaignFingerprintService.checkRepetition` + `checkForCampaign`: opening-overlap >60%, hashtag-Jaccard >70% (excl. anker), cta 2× op rij. GET /campaigns/:id/repetition-check + "Variatie-tip"-banner op detail-page. Geen auto-regenerate.
- [x] ~~**tone_signature per variant gevalideerd**~~ (2026-05-24, hfst 8.4) — `ProposalVariant.tone_signature` (enum), FORMAAT 1-prompt verplicht 3 verschillende, sanitizeVariant valideert, observability-warning bij niet-uniek. Filly labelt tone nu zelf.
- [x] ~~**Fingerprint v2: tone_signature + theme via Claude**~~ (2026-05-24, hfst 9.5) — `classifyToneAndTheme` Haiku-call bij approve, fail-soft → blijft v1 (null). Wordt fallback nu Filly de tone zelf labelt.
- [x] ~~**Brein-dekking-fix: alle generatie-prompts krijgen kanaalregels**~~ (2026-06-11) — audit wees uit dat het brein op meerdere plekken níet in de prompt zat of door eigen hardgecodeerde regels werd tegengesproken. Gefixt: (1) campagne-refine + generateMoreVariants injecteren nu `formatChannelRulesForPrompt` op het echte kanaal (social → platform uit campaign_social_content); (2) chat-prompt: 3× eigen woordaantallen weg + dubbele FORMAAT 1-header weg + bug "variant 3 ~130% van max-lengte" (instrueerde Claude óver het maximum) gefixt; (3) suggesties: hardgecodeerde verzendtijden vervangen door nieuw `buildAllTimingBlock()` (BestTimes+lead-time per kanaal), lage-bezetting/speciale-dag/refine-prompts hadden helemaal géén brein en hebben dat nu wel. Commits `c0dd738` + `14ad635` + `c90e9e7`.
- [x] ~~**Lengte-validatie in code (post-generation)**~~ (2026-06-11, commit `70afd79`) — `checkCopyLength()` in filly-brain.config + nieuw `ai/copy-length.guard.ts`: `enforceCopyLength()` doet max 1 gerichte herschrijf met exacte teken-aantallen ("variant 2 was 1500 tekens, maximum is 700") en accepteert daarna het beste resultaat + warning-log (blokkeert nooit; retry hergebruikt de prompt-cache → ~10% input-tarief). Aangesloten op 5 routes: campagne-refine, generateMoreVariants, suggestion-refine, low-occupancy en speciale-dag (kanaal post-hoc uit Filly's gekozen type, type vastgehouden bij herschrijf). **Restje:** chat-flow heeft de guard bewust nog niet (latency-gevoelig) — log-only variant kan later.
- [x] ~~**Social-posting-brein (v1.1) → config-vertaling**~~ (2026-06-11, commit `b4f2e02`) — bestTimes/notes van alle 8 kanalen vervangen door de onderzoeksgedreven waarden uit het social-posting-brein-document (heette eerst "Timing Brein" / `Get-Filly-Posting-Tijden-v1_1.docx`; staat nu in de repo als `docs/social-posting-brein.docx`. Buffer 9.6M posts, Sprout 307K profielen, MailerLite 2.1M campagnes, Dash Social, Toast). GBP-frequentie 2→3/wk. CHANNEL_RULES_VERSION v1→v2. **Bewust geskipt:** nieuwe kanalen TheFork/Zenchef/OpenTable (integraties bestaan nog niet; toevoegen zodra die koppelingen er zijn) en SEO/GEO (onderhoudsritme, geen posts).
- [x] ~~**Externe timing-factoren als deterministische code**~~ (2026-06-11, commit `d0dc8c6`) — nieuw `ai/timing-factors.ts`: NL-feestdagen (Pasen-afgeleiden via Meeus-algoritme, Koningsdag-zondagregel, Moederdag/Vaderdag) met Rabobank-omzetimpact + promo-lead-times (Kerst verschijnt al 8 wkn vooraf), loondag-vensters (25e+/1-5/vakantiegeld/13e maand), seizoens-context en weer-interpretatieregels. `buildExternalFactorsBlock()` geïnjecteerd in suggestie-prompts + verzendmoment-suggestie. Runtime-getest op 2026-data. **Restje:** evenementen-factor (hfst 4.3) — zie het plan hieronder.
- [x] ~~**Evenementen.nl-sync + staffel-matching gebouwd**~~ (2026-06-11, commit `f73b306`) — mig 0053 (events + event_places geocode-cache), wekelijkse sitemap-sync (Vercel Cron di 04:00, 6 XML-requests/run), plaats-resolutie via PDOK woonplaats-filter met exact-match-eerst + fuzzy-fallback, staffel-matching op afstand (kermis/markt 2 km, concert/sport/event 5 km, festival 10 km) en EVENEMENTEN IN DE BUURT-blok met framing-regels in de suggestie- + schedule-prompts. **Om live te zetten:** (1) mig 0053 draaien in Supabase SQL Editor, (2) pushen (cron registreert automatisch; CRON_SECRET bestaat al voor seo-report), (3) eerste runs handmatig triggeren (`curl -H "Authorization: Bearer $CRON_SECRET" <api>/api/events/sync`) — de plaats-resolutie is incrementeel (200 PDOK-lookups/run), na ±5 runs is de hele kalender resolved. ⚠️ maxDuration api-functie 10→60s in vercel.json.
- [x] ~~**Events-voorkeuren per restaurant (account-pagina)**~~ (2026-06-12, commit `e10b544`) — mig 0054: `event_categories` (checkboxes per type; null = alle, [] = events uit) + `event_max_distance_km` (2-25 km vast, of null = slimme staffel per type). EventsService filtert erop. ⚠️ **Mig 0054 éérst draaien in Supabase SQL Editor, dán pas deployen** — de account-pagina stuurt het hele form-object, dus zonder kolommen breekt opslaan voor iedereen.
- [ ] **Evenementen — vervolgstappen** (social-posting-brein hfst 4.3) — uit het oorspronkelijke plan van 2026-06-11:
  - **Fase 0 — schoolvakanties als code (quick win, geen data nodig):** Rijksoverheid publiceert de vakanties per regio (Noord/Midden/Zuid) per schooljaar; statisch genoeg om net als feestdagen in `timing-factors.ts` te zetten. Restaurant-regio afleiden uit provincie/lat-long. Familie-restaurants +8% in regio-vakanties (Rabobank).
  - **Fase 1 — events-tabel + handmatige invoer:** migratie `events` (name, type enum: festival/concert/sport/beurs/kermis/nationaal, starts_on/ends_on, lat+lng of pc4, city, expected_visitors?, source). Matching: restaurants hebben al lat/long (PDOK) → haversine-afstand → events <2km binnen 21 dagen → extra sectie in `buildExternalFactorsBlock()` met de lead-times uit het doc (concert/festival 5-10 dgn vooraf, sport 2-3 dgn, beurs 14-21 dgn naar zakelijk segment). Eigenaar kan eigen lokale events invoeren (kermis, braderie) via een klein UI-lijstje — die kent z'n buurt zelf het best.
  - **Fase 2 — bestaande Get-Filly evenementen-database importeren:** het doc noemt een interne database (189 lokale events per PC4 + 64 nationale, 455 plaatsen). ⚠️ **Die staat NIET in deze repo** — eerst met Floris bepalen waar die leeft (CRM? spreadsheet?) en als seed/import in de events-tabel laden.
  - **Fase 3 — automatische feeds via scheduled job:** Eredivisie/KNVB-speelschema (publiek, +15% lokale F&B <2km bij thuiswedstrijd), F1-kalender, beurskalenders RAI/Jaarbeurs/MECC, gemeentelijke open-data/evenementenkalenders (grote steden hebben feeds; dekking varieert). Dagelijkse sync, dedupe op (name, starts_on, city).
  - **Evenementen.nl als hoofdbron — verkend 2026-06-11:** ~13.000 NL-events in 6 categorieën (festivals 4.1k, markten 3.8k, events 2k, sport 1.3k, concerten/theater 1.2k, kermis 0.8k). Geen publieke API; wél een open sitemap-index (`/sitemap-events/*.xml`, robots.txt staat crawlen toe — alleen zoekpagina's verboden) en de **slugs bevatten al naam+plaats+datum** (`1-ander-festival-schijndel-2026-06-13`). Detail-pagina's zijn server-side gerenderd met venue-link (geen schema.org/Event JSON-LD). Plan:
    1. **Route 1 (eerst, parallel):** contact opnemen voor datafeed/licentie of partnership (site is gebouwd door komma.nl; er is een "Evenement aanmelden"-functie, geen API). ⚠️ Databankenrecht (NL): substantiële extractie van hun database zonder toestemming is juridisch risicovol — bulk-kopiëren mag niet zomaar, ook al is de data publiek.
    2. **Route 2 (licht + proportioneel tot er een afspraak is):** dagelijkse sync van alleen de 6 sitemap-XML's (6 requests/dag) → slugs parsen (plaats = langste match vóór de datum tegen NL-plaatsnamenlijst) → upsert in events-tabel met source + bron-URL → alléén voor plaatsen met Get-Filly-klanten de detail-pagina ophalen voor venue → PDOK-geocode → 2km-matching. Bronvermelding + link in de suggestie.
    3. Injectie via bestaande `buildExternalFactorsBlock()` met lead-times per type (festival 5-10 dgn, sport 2-3 dgn, beurs 14-21 dgn).
- [x] ~~**Lengte-hoofdstuk in brein-document genereren vanuit code**~~ (2026-06-11, commit `985cf5d`) — `pnpm brein:doc` (scripts/generate-brein-kanalen.mjs) genereert `docs/social-posting-brein-kanalen.md` uit CHANNEL_RULES: overzichtstabel lengte-bandbreedtes + volledige sectie per kanaal. Code wijzigen → script draaien → hoofdstuk is bij; nooit handmatig bewerken.
- [ ] **Volledige tool-use migratie chat-proposals** (robuustheid) — van `<<FILLY_PROPOSE_CAMPAIGN>>`-tekstmarkers naar Anthropic tool-use voor gegarandeerde JSON-structuur. Hard afdwingen i.p.v. valideren. Grotere refactor van de live chat-flow; lagere prioriteit nu de tekst-validatie werkt.
- [ ] **Brand-archetype + do/don't-velden** (hfst 15) — nieuwe kolommen `restaurants.brand_archetype` (enum 12) + `brand_voice_do[]` + `brand_voice_dont[]`. UI in identiteit-tab. Filly krijgt ze als harde constraint in prompt.
- [ ] **B1/B2-taalniveau-instelling** (hfst 15.3) — `restaurants.language_level` enum. Default B1.
- [ ] **Cialdini-power-woorden-bibliotheek** (hfst 13.6) — opt-in lijst per restaurant; Filly verwerkt structureel scarcity/authority/social-proof als toepasselijk.
- [ ] **Filly stop-condities** (hfst 17.1) — checks vóór generation: menu-data aanwezig, tone_of_voice ingevuld, geen conflict met do_not_mention. Bij stop: heldere uitleg + actie-link.
- [ ] **Eigenaar-correctie-feedback-loop** (hfst 17.2) — na 3× zelfde patroon-correctie vraag "wil je dat ik dit voortaan standaard zo doe?". Opslag in brand_voice_do/dont.
- [ ] **Uitlegbaarheid-niveau-keuze** (hfst 17.5) — eigenaar kiest "diep" / "kort"; default kort. Toon herkomst-attributie bij elk voorstel.
- [ ] **Filly-zelfreflectie-score** (hfst 17.6) — na approve: "was dit direct goed?" 1-5 + open feedback. Opslag in ai_suggestions.post_approve_score.
- [ ] **Rate-limits per restaurant per kanaal** (hfst 18.1) — defaults uit doc-tabel, eigenaar mag overrulen. Filly weigert te genereren als limiet bereikt deze maand.

#### Triggered messaging-flows (vereist alleen Resend, geen Meta OAuth)
- [ ] **Welkom-mail-flow** (hfst 11.3) — direct na 1e reservering + reminder 24u vooraf.
- [ ] **Reviewverzoek-mail** — 24-48u na bezoek, QR-code op tafel als alternatief.
- [ ] **Verjaardag-uitnodiging** — 7 dagen vóór `guests.birthday`; mail of WhatsApp (opt-in).
- [ ] **Win-back-flow** — 90 dagen stilte trigger; persoonlijke uitnodiging met signature-gerecht-trigger.
- [ ] **Anniversary 1-jaar** — mooie milestone, geautomatiseerd op `guests.first_visit_at` + 365 dagen.
- [ ] **Lifecycle-classificatie** — auto-update `guests.computed_segment` dagelijks via pg_cron (nieuw / verse gast / terugkeerder / vaste / slapend / verloren).

#### Performance-tracking (deels nu, deels OAuth-afhankelijk)
- [x] ~~**campaign_performance-tabel**~~ (2026-05-24, mig 0046) — alle kanalen-kolommen (mail/social/whatsapp/gbp) nullable, plus reservations_attributed, success_score, classification, outlier-flag, measurement_complete_at. RLS via user_has_restaurant_access.
- [x] ~~**Resend webhooks uitbreiden voor campagne-mail**~~ (2026-05-24) — MailService.handleWebhook aggregeert delivered/opened/clicked/bounced auto in campaign_performance. Test-mails (send_mode='test') uitgesloten via mig 0049.
- [x] ~~**UTM-helper-functie**~~ (2026-05-24) — `apps/api/src/common/utm.ts` met `buildUtmUrl`, `slugify`, `defaultMedium`, `parseUtmFromUrl`, `addUtmToAllLinks` (idempotent). MailService.sendCampaign tagt nu auto alle URLs in body bij send-time.
- [ ] **Reservation-form-UTM-hook** (hfst 14.3) — `/reserveren?utm_*` URL-params doorgeven aan booking-form; bij submit `via_campaign_id` matchen op utm_campaign-slug en auto-zetten. Nu alleen handmatig via UI op /reserveringen.
- [x] ~~**Nightly performance-scoring-job**~~ (2026-05-24, mig 0047) — pg_cron daily 03:17 UTC roept `classify_campaign_performance()` PL/pgSQL-functie aan. Scoort mail-campagnes >14d oud via formule open_rate*30+click_rate*50+conv_rate*20.
- [x] ~~**Classify-drempels op afgeleide industry-baseline**~~ (2026-05-24, mig 0050) — vervangt de arbitraire 80/50-cutoff door een baseline afgeleid uit Mailchimp/Campaign-Monitor benchmarks (open 25% + click 1,8% + conv 1% → score 53), met dezelfde score-formule. winner ≥ 69, underperformer ≤ 37. Geldt voor alle kanalen; social/GBP blijven no_data tot hun OAuth-data + eigen baseline er is.
- [ ] **Per-restaurant-benchmark via shrinkage** (hfst 9.4) — i.p.v. vaste industry-baseline een blend naar eigen historie: `expected = (n × eigen_mediaan + k × industry_baseline) / (n + k)`, voorgesteld k=30. **Floris heeft hier een eigen plan voor — eerst met hem afstemmen vóór implementatie.** Vereist ook per-kanaal-mediaan (niet restaurant-breed mengen) zodra meerdere kanalen data hebben.
- [ ] **Per-kanaal score-formules + baselines** — mail-baseline (53) is afgeleid; social/GBP/WhatsApp hebben eigen genormaliseerde formules nodig (reach-rate = reach/followers, engagement-rate, etc.). Vereist follower-count → Meta/TikTok/GBP OAuth. Tot dan scoren alleen mail-campagnes.
- [x] ~~**Success/underperformer-injectie in prompts**~~ (2026-05-24) — `CampaignFingerprintService.buildLearningContextBlock()` laadt top-3 winners + top-3 underperformers per kanaal via JOIN met campaign_performance, plakt in chat.service + suggestions.service prompts.
- [ ] **Kennis-fasen-display** (hfst 9.6) — UI toont eigenaar in welke leer-fase z'n data zit (1: industry-only, 2: tentative, 3: eigen, 4: cross-restaurant). Logica zit in doc, UI nog niet.
- [x] ~~**Outlier-markering**~~ (2026-05-24) — knop in CampaignPerformanceCard met reden-input. POST/DELETE /campaigns/:id/performance/outlier. Excludeert uit getTopWinners/Underperformers-queries.
- [ ] **Channel-fatigue tracking** (hfst 14.7) — rolling 30-d frequency × engagement; alarm bij stijgende frequentie + dalende engagement.
- [x] ~~**campaign_sends.send_mode**~~ (2026-05-24, mig 0049) — test vs all_opted_in. Test-mails niet meegerekend in sent_count én geskipt in performance-aggregatie.
- [x] ~~**CampaignPerformanceCard UI**~~ (2026-05-24) — op /campagnes/[id] detail-page: score 0-100 + classification-badge + mail-breakdown (delivered/opens-rate/clicks-rate/bounces) + conversie (reservations/gasten) + outlier-markering inline.
- [x] ~~**CampaignSendCard UI**~~ (2026-05-24) — voor mail-campagnes: opt-in count + sample-namen + test-mail-input voorgevuld met restaurant.contact_email + verstuur-naar-alle-opt-in met confirm.
- [x] ~~**ensureRow bij status→actief**~~ (2026-05-24) — CampaignsService.updateStatus roept performance.ensureRow + fingerprint.extractFromCampaign aan.
- [x] ~~**Mail-status-label**~~ (2026-05-24) — getDisplayStatus helper: 'actief'+mail+sent_count=0 → "Klaar voor verzending"; sent_count>0 → "Verstuurd"; andere → bestaande STATUS_LABEL.

#### Website-laag (P0, geen OAuth nodig)
- [ ] **Meta Pixel JS-snippet** (hfst 14.2 + 19.1) — install in Next.js layout. Events: PageView, ViewContent, Lead, Reserve. Pixel-ID per restaurant.
- [ ] **TikTok Pixel JS-snippet** — zelfde events; aparte pixel-ID.
- [ ] **Cookie-banner CMP-mode-v2** — granulaire opt-in voor marketing-cookies vóór pixel fires; consent-mode-signalen naar Google + Meta.
- [ ] **GA4 of Plausible install** — page-tracking + custom events (campaign_click, reserve_intent, reserve_complete).
- [ ] **Schema.org markup site-breed** — Restaurant + Menu + FAQ + Event + Review (al deels in health-score-checks; nu daadwerkelijk implementeren).
- [ ] **E-mail SPF/DKIM/DMARC-records** — DNS configureren voor `send.getfilly.com`. Spam-folder-kans daalt 60%.
- [ ] **Resend IP-warming-protocol** — eerste 2-3 weken throttle in MailService op max 500 mails/dag per IP.
- [ ] **Preference-center pagina** — bestaande /unsubscribe uitbreiden: "alleen aanbiedingen" / "alleen events" / "alle mails" / "uitschrijven".
- [ ] **Reservation-page-UX-pass** — UTM-persist over multi-step, mobile-vriendelijke datepicker, success-page met conversie-pixel.

#### Vereist Meta Business OAuth (al op P1 backlog: Meta + TikTok approval)
- [ ] **Server-side Meta CAPI** (hfst 14.2) — server-side events naast pixel voor iOS 14.5+-accuracy.
- [ ] **Lookalike-audience-export** (hfst 12.4) — top-100 gasten naar Meta Ads API hashed-list.
- [x] ~~**IG/FB Insights-fetcher — fase 1 (live engagement)**~~ (2026-06-18) — `GET /integrations/meta/insights` → FB `published_posts` (likes/reacties/shares) + IG-account (volgers/media-count) + IG-posts (likes/reacties). Getoond via het `<MetaLiveInsights>`-blok bovenaan de IG-/FB-marketingpagina's (de mock-secties blijven als voorbeeld eronder). Werkt met de bestaande scopes (`pages_read_engagement` + `instagram_basic`); fail-soft per kanaal.
- [ ] **IG/FB Insights — fase 1b (volgersgroei over tijd)** — dagelijkse snapshot-tabel (`social_insights_snapshots`: restaurant_id, platform, captured_on, followers_count, media_count) + mini-cron of snapshot-on-fetch → volgersgroei-grafiek op de IG/FB-pagina. Geen nieuwe Meta-review nodig.
- [ ] **IG/FB Insights — fase 2 (volledige insights)** — scopes uitbreiden (`read_insights` + `instagram_manage_insights`) + **nieuwe Meta App Review** → bereik, impressions, profielweergaven, saves, story-stats. Daarna de bestaande IG/FB-mock-secties (reach-/engagement-charts, demografie) wiren naar echte data.
- [ ] **Publiceren naar Reels + Stories (IG + FB)** — nu publiceren we alleen feed-foto's (`meta.service`: FB `/{pageId}/photos`+`/feed`, IG `/{igUserId}/media` met `image_url` → `/media_publish`). Reels én Stories kunnen óók via de Graph API (geverifieerd juni 2026, v25). **App Review waarschijnlijk niet nodig** — IG Reels/Stories vallen onder de al-goedgekeurde `instagram_business_content_publish`, FB onder `pages_manage_posts` (beide al in gebruik); vóór bouwen wel even in het App Dashboard checken. **De drie échte klussen:** (1) video-hosting — Reels/video-stories vereisen een publieke `video_url` (Supabase Storage), FB Reels zelfs resumable/chunked upload; (2) async + polling — container maken, `status_code` pollen tot `FINISHED`, dán pas publiceren (huidige feed-flow is synchroon); (3) mediaspecs (Reels 9:16, 5–90s, H.264/HEVC) + Stories ephemeral (24u). **Endpoints per type:** IG Reels = container `media_type=REELS`+`video_url`; IG Stories = `media_type=STORIES` (foto/video); FB Reels = `/{pageId}/video_reels` (init→upload→publish); FB Stories = `/{pageId}/photo_stories` / `/{pageId}/video_stories`. **Voorgestelde fasering:** IG Stories eerst (kleinste stap, bijna identiek aan huidige IG-code) → IG Reels → FB-varianten. Let op IG-limiet 100 API-posts/24u (gedeeld over alle types). Docs: [content-publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing/), [FB Reels](https://developers.facebook.com/docs/video-api/guides/reels-publishing/), [Page Stories](https://developers.facebook.com/docs/page-stories-api/).
- [ ] **UGC tag-detectie** (hfst 13.4) — Meta API poll naar tags van eigen account. ugc_pending-tabel.
- [ ] **FB Events i.p.v. posts** (hfst 16.4) — Filly maakt FB-event-objecten i.p.v. post-objecten voor events.
- [ ] **Auto-DM-templates voor UGC-toestemming** (hfst 13.4) — Filly stuurt pre-fab DM via Meta API.

#### TikTok OAuth + posten (Login Kit + Content Posting API) — CODE LIVE op main (2026-06-22)
Doel: TikTok-account koppelen + video posten via **Direct Post** (`video.publish`).
**LET OP — gewijzigd 2026-06-22:** Floris wil **Direct Post**, NIET de inbox/
concept-route. De video wordt dus direct op het account gepost (privacy-niveau
bepaalt zichtbaarheid), niet als concept naar de inbox gestuurd.
⚠️ Gevolgen: (1) het **demovideo-script** beschrijft nog de inbox-flow → moet
herschreven worden naar Direct Post. (2) Een **onaudited app kan alleen
`SELF_ONLY` (privé)** posten; publiek pas na app-review. (3) Direct Post is
strenger in review.
Demovideo-script: `~/Downloads/Demovideo TikTok script.docx`.

**Floris — TikTok Developer Portal (developers.tiktok.com):**
- [x] ~~App + Client Key/Secret~~ (keys staan in Vercel).
- [ ] Producten: *Login Kit* + *Content Posting API*. Scopes: `user.info.basic`
  + **`video.publish`** (Direct Post).
- [ ] Redirect URI: `https://www.get-filly.com/oauth/tiktok/callback` (exacte match).
- [ ] Domein-verificatie `get-filly.com` (nodig voor PULL_FROM_URL).
- [ ] Sandbox + testaccount; daarna demovideo (Direct Post-flow!) + app-review.

**Wij — code (mirror Meta):**
- [x] ~~Frontend `oauth/tiktok/{start,callback}/route.ts`~~ (✅ fase 1) — state-cookie + CSRF.
- [x] ~~Api `tiktok/`-module: token-exchange + refresh, opslag in
  `integration_credentials` (provider `tiktok`), `user.info.basic`~~ (✅ fase 1).
- [x] ~~`account-connections.tsx`: TikTok van "binnenkort" → "Verbind"~~ (✅ fase 1).
- [x] ~~**Compliant upload-scherm**~~ (✅) — `TikTokUploadPanel` op
  `dashboard/marketing/tiktok`, met de 3 audit-UX-elementen (creator-info,
  commercial-content-disclosure-toggle, music-usage-consent) + **titel-veld +
  privacy-selector** (Direct Post-vereisten; opties uit `creator_info`,
  onaudited default `SELF_ONLY`). De disclosure-toggles worden meegestuurd
  (`brand_organic_toggle`/`brand_content_toggle`).
- [x] ~~Posten via Content Posting API~~ (✅, **Direct Post** sinds 2026-06-22) —
  `getValidAccessToken` (refresh-on-use) + `creator_info/query` +
  **`post/publish/video/init`** (PULL_FROM_URL) met `post_info`. Endpoints
  `GET creator-info` / `POST upload`.
- [x] ~~**Media via get-filly.com-route (PULL_FROM_URL-glue)**~~ (✅) — Vercel-
  rewrite `/media/r/:path*` → publieke restaurant-media-bucket (transparant,
  geen redirect → domein blijft get-filly.com); MediaLibraryPicker in het
  upload-paneel, gekozen URL gemapt naar `/media/r/<pad>`. Live te valideren
  zodra TikTok-app + domein-verificatie actief zijn.
  ⚠️ Aandachtspunt: `restaurant-media` is een **foto**-bibliotheek; voor de
  video-upload moet er een **video** in staan (mime `video/*`). Eventueel de
  picker filteren op video + video-upload in de media-bibliotheek toestaan.

- [ ] **TikTok Insights-fetcher** — view/watch/share-stats per video (na approval).
- [ ] **TikTok Pixel-CAPI server-side** — zelfde verhaal als Meta CAPI.

#### Vereist Google Business Profile API (al op backlog: GBP fase C-F)
- [ ] **Auto-posting naar GBP** (hfst 16.7/16.8) — Q&A's + foto-cadans + posts pushen via GBP API.
- [ ] **GBP Insights-fetcher** — impressions, clicks per CTA-type, search-impressions.
- [ ] **Review-recency + antwoord-ratio** (hfst 9.10 + health-score V2) — vereist GBP-API voor review-lijst.
- [ ] **GBP-events aanmaken via API** — event-type posts voor evenementen.

#### Vereist WhatsApp Business API (apart van Meta OAuth, ook P1)
- [ ] **WhatsApp Business-template-flow** (hfst 16.6) — Meta-template-aanvraag + status-tracking in UI.
- [ ] **WhatsApp broadcast** via Twilio of Sinch — opt-in respectering verplicht.

#### Vereist CallRail of vergelijkbaar
- [ ] **Call-tracking** (hfst 14 + 19.4) — dynamic phone-numbers gekoppeld aan campaign_id.

#### Vereist POS-koppeling (toekomst)
- [ ] **Per-gast besteding-segment** (hfst 12.1) — gemiddelde check-bedrag per gast voor targeting.

### Email & campagnes
- [x] ~~**Campagne-send engine**~~ (2026-05-04) — `MailService.sendCampaignByMode` met test-modus + all_opted_in. Resend SDK + batches van 100. From=`<restaurant-naam> <social@get-filly.com>` of klant-eigen domein als verified. Reply-to via `restaurant.contact_email`. Pre-flight check op subject_line + body_html/body_plain. Webhook-handler updatet sends-rij bij delivered/bounced/opened/clicked. UI: `CampaignSendModal` met test/echt-toggle + confirm-on-name voor echt versturen.
- [x] ~~**Migratie 0030 (`campaign_sends` + `unsubscribe_tokens` + restaurants.mail_*)**~~ (2026-05-04)
- [x] ~~**Unsubscribe-route**~~ (2026-05-04) — Public `/u/[token]`-pagina + backend `POST/GET /public/unsubscribe/:token`. RFC 8058 List-Unsubscribe headers in elke mail (Gmail/Outlook tonen native unsubscribe-link). Idempotent.
- [x] ~~**Eigen-domein per klant**~~ (2026-05-04) — `MailDomainService` met Resend Domains API (create/verify/get/remove). UI: `<MailDomainSection>` op account-pagina met DNS-records-tabel + copy-knoppen + status-polling. Bij verified: mail komt van klant's eigen `mail_from_address` ipv default. Stay safe naast bestaande mail-providers (DKIM op subdomains).
- [ ] **DNS help-flow voor klanten** — stappenplan + per-registrar uitleg (TransIP / Versio / Hostnet / Namecheap / GoDaddy) + "wat doen die records"-helper voor klanten die DNS niet snappen
- [x] ~~**Resend webhook signature-validatie**~~ (✅ code af, 2026-06-18) — `MailController.receiveWebhook` (`@Post('webhooks/resend')`) verifieert de Svix-headers via `verifySvixSignature` tegen de rawBody (`rawBody: true` in `main.ts`); ongeldige calls → 401. Fail-soft zolang `RESEND_WEBHOOK_SECRET` niet gezet is (laat door + logt) zodat mail-stats niet breken. **Resteert (config, Floris):** (1) `RESEND_WEBHOOK_SECRET` (`whsec_…` uit Resend) in Vercel `get-filly-api` zetten + redeploy; (2) webhook in Resend-dashboard op `https://get-filly-api-three.vercel.app/api/webhooks/resend`.
- [ ] **Legal: DPA-template** — Verwerkersovereenkomst met klant. Resend + Anthropic + Supabase als sub-verwerkers vermelden in privacy-pagina.

### Integraties (OAuth)
- [~] **Facebook/Instagram OAuth** — Meta Graph API, `pages_manage_posts` + `instagram_content_publish` (vereist App Review, 2-8 weken). **Start + callback gebouwd** (2026-06-06): `/oauth/meta/start` (auth-gate + CSRF-state-cookie → Meta-dialog) en `/oauth/meta/callback` (state-check + code→token-exchange) in `apps/web`, gedeelde helper `lib/meta-oauth.ts`. Env: `META_APP_ID` + `META_APP_SECRET` (zie `.env.example`). Redirect_uri = `<origin>/oauth/meta/callback`, van request-origin afgeleid → registreer per Vercel-domein in Meta (nu www.get-filly.com; later app.get-filly.com-test-URL). Geen localhost (draait alles op Vercel). **Verbind-knop gewired** (2026-06-06): Facebook + Instagram in `account-connections.tsx` zijn nu method `oauth` → één klik op "Verbind" navigeert naar `/oauth/meta/start` (geen API-key plakken). Callback keert terug naar `/dashboard/account?tab=koppelingen` met `?meta=connected|denied|error`; `MetaStatusBanner` toont de uitkomst. **Stap 3 — token-opslag gebouwd** (2026-06-06): exchange + opslag verplaatst naar de **Nest-API** (`apps/api/src/meta`): web-callback valideert state en stuurt alleen de `code` naar `POST /api/integrations/meta/connect`; de API doet code→short→long-lived exchange, versleutelt (AES-256-GCM via `common/token-crypto.service.ts`) en upsert in tabel `integration_credentials` (**migratie 0052 — handmatig in SQL Editor draaien**, RLS op restaurant-lidmaatschap). Endpoints: `connect`, `GET status`, `DELETE` (disconnect). Env verplaatst: `META_APP_SECRET` + `INTEGRATIONS_ENCRYPTION_KEY` → **API-env** (web houdt alleen `META_APP_ID`). **Meta-callbacks gebouwd** (2026-06-06): `/oauth/meta/deauthorize` + `/oauth/meta/data-deletion` (web-routes → forwarden naar publieke API-endpoints `MetaWebhookController`, géén guards). API verifieert de `signed_request` (HMAC-SHA256 met App Secret, `meta-signed-request.ts`) en verwijdert via service-role op `meta->>meta_user_id`. Data-deletion geeft `{ url, confirmation_code }` terug; statuspagina `/data-deletion-status?id=` (stateless, noindex). `connect` slaat nu het `meta_user_id` op in `integration_credentials.meta` zodat de callbacks de rij vinden (alleen voor koppelingen ná deze deploy). **Stap 4 — publiceren gebouwd** (2026-06-06): API-endpoints `GET /pages` (lijst via `/me/accounts`), `POST /select-page` (slaat `page_id`/`page_name`/`ig_user_id` op in `meta`), `POST /publish` (FB-feed/-foto via verse page-token + IG 2-staps media→media_publish, vereist afbeelding-URL). Page-token wordt NIET opgeslagen (telkens vers uit `/me/accounts`). UI: `meta-publish-panel.tsx` in de koppelingen-tab — pagina kiezen + testbericht naar FB/IG. Hiermee gebruikt de app de scopes echt (nodig voor App Review-demo). **Getest 2026-06-06**: deauthorize + data-deletion end-to-end geverifieerd (geldige `signed_request` → 200, oude/verkeerde → afgewezen); **App Secret geroteerd** (oud `685ce1c…` bevestigd dood na redeploy); data-deletion-URL nu op canoniek `www.get-filly.com`.
  - ✅ **Code-kant is af en bevestigd werkend** (verbinden, opslaan, callbacks, publiceren).
  - ✅ **App Review GOEDGEKEURD (2026-06-17)** — Meta-kant rond: redirect + deauthorize + data-deletion-URL's gesaved, business-verificatie + Tech Provider gedaan, demovideo + de 6 scope-test-calls (via de Graph API Explorer: `me/businesses`, `me/accounts`, `{page}/published_posts`, `{ig-id}?fields=...`) ingediend en goedgekeurd. Overbodige use-case-permissies verwijderd. App staat live → restaurants kunnen verbinden + publiceren.
  - 🔧 **Code-restjes (vóór live klanten, niet blokkerend)**: long-lived token auto-refresh vóór 60-dagen-verloop; scopes uitlezen via `debug_token`. *(In-app loskoppel-knop = ✅ gedaan. Publiceren-vanuit-campagnes = ✅ gedaan, zie hieronder.)*
  - ✅ **Publiceren vanuit de campagne-sectie (fase A + B, 2026-06-17)** — social-campagnes publiceren naar FB/IG via de goedgekeurde Meta-flow:
    - **Fase A (live op `main`)**: "Activeer nu" plaatst direct (caption + foto + `social_platforms` → FB/IG), idempotent via `published_at`. Migratie **0058** (`published_at`/`published_post_ids`/`publish_error`, gedraaid). Degradeert netjes zonder Meta-koppeling (alleen status-flip, geen harde fout).
    - **B1 terugtrekken** (actief→concept): FB-post wordt écht verwijderd (`DELETE`); **Instagram kan NIET via de Graph API verwijderd worden** → handmatig (stop-confirm vermeldt dit).
    - **B2 cron**: `runScheduledSocial()` + publiek `/api/campaigns/cron/run-scheduled` (CRON_SECRET) publiceert due `ingepland`-campagnes; `useAdmin`-flag voor de context-loze run.
    - ⚠️ **TODO bij overstap Vercel Hobby → Pro**: cron in `apps/api/vercel.json` staat nu dagelijks 08:00 (Hobby-limiet, niet punctueel); bumpen naar `*/10 * * * *` voor on-time posten.
    - Nog open: Google Bedrijfsprofiel-posts via dezelfde campagne-flow zodra die API-toegang rond is; WhatsApp/TikTok publiceren (geen API-koppeling).
  - 👉 **VOLGENDE STAP (volgende sessie)**: redirect-URI in Meta opslaan → Verbind-flow doorlopen → bevestigen dat pagina-ophalen + testpost werkt.
- [ ] **Publiceren vanuit de campagne-sectie** (echte product-UX i.p.v. het losse test-paneel) — de publiceer-backend is al af (`POST /api/integrations/meta/publish` + versleutelde token-opslag); wat ontbreekt is de knop in de campagne die 'm aanroept. Twee niveaus:
  - **"Nu publiceren"** — knop op een social-campagne (`campagnes/[id]`) die de campagnetekst + geüploade foto naar `metaPublish` stuurt (FB en/of IG). Klein; hergebruikt alles wat er is. Daarna kan het losse `meta-publish-panel.tsx` op de koppelingen-tab test-only worden of verdwijnen.
  - **Ingepland automatisch posten** — op de geplande datum/tijd afvuren. Vereist een achtergrond-worker/cron (Vercel Cron) die due social-campagnes oppakt en publiceert. Groter; aparte stap (mail wil dit straks ook).
  - Idem voor Google Bedrijfsprofiel-posts zodra die API-toegang rond is (zelfde campagne-knop, andere provider).
- [~] **Google Business Profile** — multi-fase implementatie (zie sectie hieronder)
- [ ] **Zenchef OAuth** — reserveringen syncen
- [ ] **OpenTable / SevenRooms / Resengo** — volgorde bepalen met klantvraag
- [ ] **TripAdvisor / The Fork / IENS** — reviews importeren
- [ ] **Webhook-receivers** per integratie met rijtests

#### Google Business Profile — fase-overzicht (besluit 2026-05-05)

Reviews-sectie is uitgebreid tot een hub. Reviews zijn een sub-feature
van Google Business Profile (GBP) — naast profiel-audit, posts, foto-sync,
profiel-edits en inzichten. Fase A is af; fase B-F staan open.

- [x] ~~**Fase A — Skelet + rename**~~ (2026-05-05). Sidebar `Reviews` →
  `Google Business`, route `/dashboard/reviews` → `/dashboard/google-business`
  (oude route blijft als 308-redirect-stub). Module-key in
  `@getfilly/shared` van `reviews` naar `google_business`. Migratie 0033
  heeft bestaande `restaurant_users.permissions`-jsonb ook bijgewerkt.
  Nieuwe hub-pagina toont 7 cards: Reviews (live, klikbaar), Profiel-audit,
  Concurrent-benchmark, Filly-posts (copy-paste), Profiel-edits, Foto-sync,
  Inzichten — laatste 6 met "Coming Soon"-badge. Status-banner bovenaan
  toont "niet gekoppeld met Google" (hardcoded tot fase D).

- [x] ~~**Fase B — Places-API laag (geen klant-actie nodig)**~~
  (2026-05-05). Google Cloud project `Get-Filly GBP` onder organisatie
  `get-filly.com`, Places API (New) actief, key in `GOOGLE_PLACES_API_KEY`
  met API-restrictie naar alleen Places (New). Migratie 0034 heeft
  `restaurants.google_place_id` + `google_place_data` jsonb-cache (24u
  TTL) toegevoegd. `GoogleProfileModule` (apps/api/src/google-profile/)
  met 6 endpoints: search/connect/me/refresh/disconnect/audit/competitors.
  Onboarding-wizard auto-detect via place-search na WebsiteAnalyzer met
  "Wijzigen / Sla over"-flow in stap 2. Hub-pagina dynamisch met status-
  banner (gekoppeld vs niet) + connect-modal + ontkoppel-knop voor
  bestaande klanten. Twee feature-pagina's live:
  - **/dashboard/google-business/audit** — 12+ deterministische rules
    (telefoon, website, openingstijden, foto-volume, review-volume,
    rating-coaching, weekend-uren, business-status, categorie). Gratis,
    geen Claude-call. Sortering critical → warning → tip met
    actie-hints per finding.
  - **/dashboard/google-business/benchmark** — buurt-vergelijking met
    radius-selector (250m-3km). 3 KPI-tegels (rating/reviews/foto's
    vs mediaan). Tabel met jouw zaak gehighlight + concurrenten
    gesorteerd op afstand. Mediaan i.p.v. gemiddelde voor robuustheid.
  - ~~Filly-posts (copy-paste)~~ — 2026-05-05 verwijderd na review:
    overlapt met de bestaande Filly-chat (eigenaar kan in chat al
    "schrijf me een Google-post" vragen). Posts verdwijnen na 7 dagen
    in Google + beperkte SEO-impact. **Per 2026-06-02 geïntegreerd** als
    volwaardig kanaal in de chat-bundel-flow naast Mail/IG/FB + WhatsApp
    (zie Recent voltooid 2026-06-02).

- [~] **Fase C — Google Business Profile API approval-aanvraag**.
  Doc-stub klaar: [docs/google-business-approval.md](docs/google-business-approval.md)
  met voorbereidingsstappen + invul-tekst voor het formulier. **Jouw
  actie**: APIs enablen in Cloud Console (5 stuks), OAuth consent screen
  configureren, formulier indienen. Wachttijd 2-6 weken voor approval.

- [~] **Fase D — OAuth-koppeling (business.manage, offline)** — **code-kant af**
  (2026-06-14, branch `feat/active-action-state`, commits `e050733` + `fcaa97e`;
  **nog niet gemerged naar `main`**, dus nog niet op productie). Afwijkend van het
  oorspronkelijke plan (géén nieuwe `oauth_connections`-tabel / generieke
  `OAuthModule`): **hergebruikt het Meta-patroon** — tabel `integration_credentials`
  (mig 0052) + `TokenCryptoService`. **Migratie 0057** voegt `refresh_token_encrypted`
  toe (al in Supabase gedraaid).
  - **web** (`apps/web`): `/oauth/google/start` (auth-gate + getekende state:
    HMAC-SHA256 over `{rid,nonce,iat}` + nonce-cookie, draagt tenant-id, verloopt
    10 min) en `/oauth/google/callback` (state-verify → alleen de `code` naar de
    API). Helper `lib/google-oauth.ts`. `access_type=offline` + `prompt=consent`
    → altijd een refresh-token.
  - **api** (`apps/api/src/google-business`): `GoogleBusinessModule`
    (`/integrations/google-business/*`): `connect` (code→access+refresh,
    versleuteld opslaan, provider `google_business`), `GET status`, `DELETE`
    (revoke bij Google + rij wissen), plus `getAccessToken`/`refreshAccessToken`
    (auto-refresh op (bijna-)expiry).
  - **UI**: één status-gestuurde Google-rij in `account-connections.tsx` achter
    feature-flag `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED` (default uit → "Beheer"; aan +
    niet verbonden → "Verbind"). `googleBusinessStatus()` in `lib/api.ts`,
    status-banner voor `?google=connected|denied|error&reason=`.
  - Foutafhandeling: weigeren, `redirect_uri_mismatch`, verlopen/ongeldige state,
    ontbrekende refresh-token (alle gemapt naar nette `reason`-codes).
  - ⏳ **NOG TE DOEN — Google Cloud-kant (geen code), blokkerend voor de echte test:**
    1. ⚠️ **OAuth-client in het JUISTE account/project.** Client-id in `.env` is
       `167329672884-...` (project-nummer `167329672884`). Uitzoeken of dat het
       **officiële Filly-account** is of per ongeluk Floris' persoonlijke gmail —
       voor productie/verificatie hoort 'ie in het officiële account. **Tim** beheert
       het Bedrijfsprofiel en is mogelijk eigenaar van het Cloud-project.
    2. **Redirect-URI's** exact registreren op díé client: prod
       `https://www.get-filly.com/oauth/google/callback` + lokaal
       `http://localhost:3000/oauth/google/callback`. (2026-06-14: lokale test gaf
       `redirect_uri_mismatch` — waarschijnlijk verkeerd account/project of propagatie.)
    3. **Consent screen**: test-user (Audience), scope `business.manage` (Data
       Access, sensitive → app-verificatie), **publiceren naar Productie** (anders
       verlopen refresh-tokens na 7 dagen in "Testing").
    4. **Env in Vercel**: `GOOGLE_OAUTH_CLIENT_ID`+`GOOGLE_OAUTH_CLIENT_SECRET` (api),
       `GOOGLE_OAUTH_CLIENT_ID`+`OAUTH_STATE_SECRET`+`NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED`
       (web), `INTEGRATIONS_ENCRYPTION_KEY` (api). Lokaal al gezet (zie `.env.example`).
    5. **Fase C** (API-toegang aanvragen, quotum 0) blijft de lange-doorlooptijd-
       blocker vóór écht profielbeheer.
  - 👉 **VOLGENDE STAP**: account/project-eigenaarschap uitzoeken (Floris + Tim) →
    redirect-URI op de juiste client → lokaal Verbind doorlopen → tokens in
    `integration_credentials` verifiëren → daarna pas mergen/deployen.
  - **Verificatie-prep klaar** (2026-06-15): `GET /integrations/google-business/profile`
    (accounts.list via getAccessToken — bewijst scope-gebruik, 403→`api_not_approved`
    tot de API-grant) + `GoogleConnectedPanel` (zichtbaar bewijs in de koppelingen-tab).
    Justificatie-tekst (EN) + demovideo-script + test-checklist + Meta-parallel staan
    in [docs/google-business-oauth-verification.md](docs/google-business-oauth-verification.md).

- [ ] **Fase E — Reviews écht uit Google ophalen** (na approval).
  Sync-job 1× per uur per gekoppelde klant via
  `accounts.locations.reviews.list`. Bestaande reply-engine
  (`ReviewsService.refineVariants` etc — al klaar!) hergebruiken,
  alleen nieuwe push-stap naar Google's `accounts.locations.reviews.reply`.
  Migratie 0036: `reviews.google_review_id` + `responded_to_google_at`.
  Bestaande handmatig-ingevoerde reviews migreren / opruimen.

- [ ] **Fase F — Profiel-edits + foto-sync + Q&A**.
  Edit-queue met twee gates: eigenaar approves in Filly → push naar
  Google → Google's eigen review-queue (sommige velden direct live,
  andere door moderation). Foto-sync: media-library uit migratie 0031
  (al klaar!) + push naar `accounts.locations.media.create`. Q&A
  monitoring + Filly-antwoord-suggesties via
  `accounts.locations.questions.list`.

### Mock-data in frontend (opruimen zodra backend er is)
- [x] ~~**`FILLY_MOCK`** in kpi-row.tsx~~ (2026-04-29) — verwijderd, alleen echte attributie via `reservations.via_campaign_id`-FK.
- [x] ~~**`isFromFilly()`**~~ (2026-04-29) — kolom + stat-card weg uit gasten-pagina; reserveringen-pagina nu op echte `source`-veld.
- [x] ~~**`FILLY_ROI_6M` + `FILLY_BY_TYPE`** in rapportages~~ (2026-04-29) — vervangen door echte 6-mnd grafiek + per-campagne tabel.
- [x] ~~`buildFillyReply()` in reviews~~ — vervangen door echte Claude-call (2026-04-23)
- [x] ~~`MOCK_RECOGNIZED` in menu-pagina~~ — vervangen door echte Vision-analyse tijdens onboarding.
- [x] ~~`getMockProposal()` in suggesties-detail-modal~~ (2026-04-30) — vervangen door echte Claude-call via tool-use op `/api/suggestions/:id/proposal-details`.
- [ ] **`cardItemIds`-set in memory** in menu-pagina — UI-state voor net-toegevoegde items, hoort uit DB-flow te komen.
- [x] ~~**Statische koppelingen-lijst** zonder OAuth-flow~~ (2026-06-11) — de mock is opgeruimd: de nep-API-key-flow (eindigde in een `alert("Storage komt binnenkort")`) is weg uit `account-connections.tsx`. Nu eerlijke statussen: Meta = echte OAuth-verbindknop, Google Business = "Beheer"-link naar de Vindbaarheid-hub (waar de echte koppel-flow leeft), mail + weer = "✓ Actief", al het overige (Zenchef/OpenTable/SevenRooms/Resengo/TikTok/WhatsApp/TripAdvisor/The Fork/Lightspeed) = rustige "Binnenkort"-pill. SendGrid-rij verwijderd (mail loopt via het platform; loze belofte). De échte integraties blijven gewoon op de "Integraties (OAuth)"-backlog hieronder staan.
- [x] ~~**Koppelingen-sectie status-aware + opgeschoond**~~ (2026-06-15) — `account-connections.tsx` herbouwd: koppelingsstatus 1× op sectie-niveau opgehaald (Meta + Google) en doorgegeven aan de rijen. OAuth-rijen tonen nu de échte staat — niet verbonden → "Verbind", verbonden → "✓ Verbonden" + Beheer (Google-hub) + Ontkoppel — i.p.v. altijd "Verbind". Facebook + Instagram delen de Meta-status (één koppeling). Disconnect-helpers `metaDisconnect` + `googleBusinessDisconnect` in `lib/api.ts`. Verouderde duplicaat-pagina `/dashboard/koppelingen` (nog "SendGrid" + hardcoded statussen) vervangen door een redirect naar `/dashboard/account?tab=koppelingen`. Dode `connected`-field verwijderd; `reason`-param per banner gescheiden (Meta vs Google).

### Database-migraties nog te maken
- [x] ~~0049: campaign_sends.send_mode (test vs all_opted_in)~~ (2026-05-24) — test-mails tellen niet in sent_count en worden geskipt in campaign_performance-aggregatie. Index op (campaign_id, send_mode) voor snelle count-by-mode-query.
- [x] ~~0048: campaign_style_fingerprints (anti-repetitie + leerloop)~~ (2026-05-24) — opening_pattern / hashtag_set / cta_template (enum) / theme / primary_dish_mentioned / tone_signature (enum) per kanaal. UNIQUE op campaign_id voor idempotente upserts. RLS via user_has_restaurant_access.
- [x] ~~0047: classify_campaign_performance() PL/pgSQL + pg_cron 03:17 UTC~~ (2026-05-24) — nightly scoring van campagnes >14d oud via open_rate*30+click_rate*50+conv_rate*20. Set classification = winner/average/underperformer/no_data + success_score + measurement_complete_at. Idempotent: skipt rijen met classification al gezet of marked_outlier=true.
- [x] ~~0046: campaign_performance-tabel~~ (2026-05-24) — alle kanalen-kolommen (mail/social/whatsapp/gbp) nullable + reservations_attributed + guests_attributed + revenue_attributed_cents + success_score + classification + outlier-flag + measurement_complete_at. RLS via user_has_restaurant_access; trigger op updated_at.
- [x] ~~0045: health_scores + health_findings + health_competitors (vindbaarheid-health-score v1)~~ (2026-05-23) — drie tabellen voor de Health-score op `/dashboard/google-business/audit`. Snapshots per audit-run + alle findings + top-10 concurrenten in 500m straal. RLS via `user_has_restaurant_access`. SQL was al in-Studio gerund door Floris vóór file-commit; file is voor productie-environments.
- [x] ~~0044: identiteit-uitbreiding (8 nieuwe kolommen op restaurants)~~ (2026-05-21) — `location_description`, `keywords`, `default_hashtags`, `tone_of_voice`, `do_not_mention`, `brand_story`, `awards`, `target_audience_segments`. Voedt Filly's posts vanuit `/dashboard/vindbaarheid/identiteit`. Geen RLS-wijziging.
- [x] ~~0043: pg_cron auto-archive verstreken campagnes~~ (2026-05-21) — dagelijks om 03:17 UTC zet status='afgerond' op campagnes met scheduled_for in het verleden. Frontend filtert óók read-time als safety-net.
- [x] ~~0042: backfill `campaigns.ai_suggestion_id`~~ (2026-05-21) — historische campagnes hadden alleen `ai_suggestions.approved_campaign_id` ingevuld, niet de FK terug. Twee UPDATE-passes (anker + bundle-siblings via group_id) vullen het netjes in.
- [x] ~~0041: `campaigns.variants` + `selected_variant_index`~~ (2026-05-21) — bron-van-waarheid voor versies-grid op unified detail-page. Backfill voor mail/social/whatsapp: huidige content = Versie 1, oude `filly_variants` worden Versie 2..N. Was niet eerder gedraaid → fix voor "selected_variant_index column not found"-error in Filly-chat goedkeuren-flow.
- [x] ~~0040: `campaigns.deleted_at` (soft-delete)~~ (2026-05-12, commit `1df6037`) — `× Verwijderen` op concept-cards doet nu UPDATE deleted_at=NOW(); verwijderde campagnes komen terug in `/campagnes/history` onder de tab Verwijderd. Partial index op deleted_at IS NOT NULL.
- [x] ~~0026: `campaigns.variant_applied_at` + `scheduling_history`~~ (2026-04-30) — verbergt refine-sectie na variant-keuze; cyclen door schedule-history zonder Claude-calls.
- [x] ~~0025: `menu_uploads.kind` ('menu' \| 'drinks')~~ (2026-04-30) — onderscheid menu-kaart vs drankkaart in UI-banners.
- [x] ~~0024: `menu_items.subcategory`~~ (2026-04-30) — drank-detail (wijn-rood, bier, cocktail, etc.) voor visuele groepering binnen drank-tab.
- [x] ~~0023: `campaign_benchmarks` + `account_deletions` (anonymisering + AVG art. 17)~~ (2026-04-30)
- [x] ~~`reservations.via_campaign_id` + `guests.acquired_via_campaign_id`~~ (migratie 0022, 2026-04-29)
- [x] ~~`menu_uploads` + Storage-bucket + FK menu_items.menu_upload_id~~ (migratie 0011, 2026-04-24)
- [x] ~~ai_usage.restaurant_id nullable (pre-onboarding logging)~~ (migratie 0012, 2026-04-24)
- [x] ~~restaurants.website_url + onboarded_at~~ (migratie 0010, 2026-04-24)
- [ ] **`campaigns.metrics` uitbreiding** — extra_reservations/revenue/retention als typed columns ipv result_stats jsonb (handiger voor analytics).
- [ ] **`subscriptions`** (billing)
- [x] ~~**`campaign_sends`** (email-history)~~ (afgevinkt 2026-06-11) — bestond al: aangemaakt in migratie `0030_mail_flow.sql`, uitgebreid in 0049 (`send_mode`). Dit regeltje was een verouderde dubbeling.
- [ ] **`guest_segments`** (doelgroep-segmentatie)

---

## P3 — UX-verfijningen

### Chat
- [x] ~~**Eén flow: getypt verzoek → geleide flow**~~ (2026-06-12) — campagne-verzoeken via typen lopen nu door dezelfde geleide flow als de lege-chat-staat. Chat-prompt emit `<<FILLY_START_GUIDED>>{date?}` (relatieve datums → ISO); guided_start-kaart rendert FillyGuidedFlow inline met `initialDate` (slaat dag-stap over). Oude FORMAAT 0/1/2-campagne-creatie + de "Vraag Filly om voorstellen"-knop verwijderd; legacy-parsers blijven als vangnet. ⚠️ **Live verifiëren:** relatieve datums (zondag/morgen/volgende week zondag/Vaderdag) + dat de inline-flow soepel naar context/kanalen springt.
- [x] ~~**Geleide on-ramp in lege chat (fase 1)**~~ (2026-06-12, commit `5da4658`) — i.p.v. een leeg vlak begint Filly met een vraag + aanklikbare dag-antwoorden (rustige dagen onder drempel + speciale dagen). Eén tik → `generate-for-dates` → /campagnes. Nieuw `lib/use-actionable-days.ts` + `filly-guided-flow.tsx`. Vrije tekst blijft als uitweg.
- [x] ~~**Geleide flow fase 2 — context + kanalen**~~ (2026-06-12, commit `7768167`) — `GET /suggestions/day-context?date=` (events op die dag + weer + kanalen-met-bereik, read-only) voedt stap 2 (event/weer bevestigen, voorgeselecteerd) + stap 3 (kanalen voorgevinkt). `generate-for-dates` accepteert nu `channels[]` + `context[]` per item en stuurt de generatie (campaign_type op primair kanaal, context-hints in dag-context). 3-staps wizard met antwoordspoor + "wijzig". **Restje fase 2b:** true multi-channel/bundle-output per dag — nu produceert een meerkanaals-keuze één voorstel op het primaire kanaal (afgestemd op de rest), geen losse kaart per kanaal.
- [x] ~~**Chat-interactie-polish (fase 3a)**~~ (2026-06-12, commit volgt) — meerregelige textarea-invoer (Enter=versturen, Shift+Enter=regel, auto-grow), slimme auto-scroll + "↓ nieuwe berichten"-pil i.p.v. altijd-yanken, skeleton-laadbubbels, typing-indicator met avatar + aria-live, `.sr-only` utility. Frontend-only.
- [x] ~~**Inline resultaat in de geleide flow**~~ (2026-06-12, commit volgt) — na genereren verschijnt het voorstel als kaart ín het gesprek (naam + kanaal + snippet + "Bekijken & aanpassen →" + "Nog een dag"/"Alle voorstellen") i.p.v. abrupt naar /campagnes te navigeren. Lichte versie: linkt naar de detail-route, géén volledige interactieve approve-kaart in de chat (dat blijft fase 3b).
- [x] ~~**Eén ingang: popover gaat op in de chat**~~ (2026-06-12, commit volgt) — de "Vraag Filly om voorstellen"-knop (dashboard-tile + campagnes) opent niet meer z'n eigen dag-selectie-popover maar de geleide chat-flow (window-event op /dashboard, sessionStorage-vlag + navigatie elders; chat-kaart id=filly-chat). SuggestionsPanel verwijderd (dode code; batch-meerdere-dagen wordt nu sequentieel via "＋ Nog een dag").
- [ ] **Geleide flow — laatste afronding** — resultaat als volledige interactieve approve-kaart in de chat (shape-adapter AiSuggestion → proposal/bundle-card) i.p.v. de huidige link-kaart. **Dedupe-kans:** `use-actionable-days` + UpcomingActionsBlock delen dezelfde rekenlogica los — samenvoegen.
- [x] ~~**Geleide flow fase 2b — true multi-channel**~~ (2026-06-12, commit volgt, **nog niet gepusht — live verifiëren**) — bij 2+ gekozen kanalen genereert `generateForSelectedDates` nu één voorstel per kanaal (eigen tekst + lengte-guard) in dezelfde channels[]-shape als generateOnDemand, zodat voorstellen-strip + bundel-approve 'm ongewijzigd aankunnen. Fail-soft per kanaal. ⚠️ **Te checken vóór/na push:** dat de bundel-approve op deze via-generate-for-dates gemaakte suggesties werkt (shape is identiek aan generateOnDemand, dus zou moeten — maar niet end-to-end getest vanaf dev).
- [x] ~~**Nieuw-gesprek-knop** in filly-chat + seed-cleanup~~ (2026-05-01) — `+ Nieuw gesprek` in dropdown + automatische CTA bij cap-bereikt. Seed-cleanup via migratie 0028 (`delete from chat_conversations where created_at < '2026-01-01'`).
- [x] ~~**Chat-geschiedenis overzicht**~~ (2026-05-01) — `FillyChatHistoryMenu` dropdown in chat-card-header. Toont titels (uit auto-title), `message_count/20`, switch-flow met optimistic state-replace. Endpoint `GET /chat/conversations`. Optimaal voor de nieuwe 20-berichten-cap (kostenbescherming).
- [ ] **Streaming** — woord-voor-woord antwoorden (SSE)

### Dashboard algemeen
- [ ] **Command palette** (Cmd+K)
- [ ] **Notifications-bell** werkend
- [ ] **Keyboard shortcuts** overzicht
- [x] ~~**Export CSV/PDF** per pagina (gasten, reserveringen, rapportages)~~ (2026-06-11) — gedeelde helper `lib/csv-export.ts` (BOM + quote-escaping). Per pagina: **gasten** = klanten-CSV (volgt filter+zoekterm; verhuisd van de reserveringen-pagina waar 'ie gek genoeg woonde), **reserveringen** = reserveringen-CSV (datum/tijd/naam/personen/status/bron/via-campagne/notities, volgt filters), **rapportages** = kanaal-overzicht-CSV. **PDF** op alle drie via 🖨-knop → browser-printdialoog ("Bewaar als PDF"); `@media print`-regels in dashboard.css verbergen sidebar/topbar/knoppen en heffen de fixed-viewport-scroll op. Bewust geen PDF-library (bundle-gewicht).
- [x] ~~**Mobile responsive pass**~~ (2026-04-30) — alle 5 fasen afgerond. Sidebar wordt offcanvas onder 1024px (☰-burger in topbar), dash-body 1-kolom op tablet, KPI-row 5→2→1 cols, weather-row auto-fit (geen doormidden gesneden dagen meer), tabellen horizontaal scrollbaar binnen container, modals full-screen onder 768px, save-bar sticky bottom op mobile, publieke site (navbar/login/legal) ook mee. Breakpoints: 1024 / 768 / 480. **Aanvulling 2026-06-02**: vervolg-sweep fixte resterende gaten die deze pass miste — échte hamburger-navbar < 880px, dashboard scrollt op mobiel (kalender werd 0px hoog), kalenderkop-toggle wrapt, half-scherm 2-koloms, social-waaier/hero-mockup/tijdlijn/legal+rauwe tabellen. Zie changelog 2026-06-02.
- [ ] **i18n (EN)** — engels voor internationale klanten later

### Onboarding nieuwe klant
- [x] ~~3-stappen wizard met Filly-auto-invul~~ (2026-04-24)
- [x] ~~**Sample-data via SQL voor demo-account**~~ (2026-04-30) — geen UI-toggle (bewust om Filly's promise schoon te houden); aparte SQL-snippet in chat die het demo-account `floriskoevermans@outlook.com` (restaurant_id `a462cf39-...`) vult met 18 gasten, 30 reserveringen, 31 occupancy-dagen, 10 reviews, 5 campagnes (mix statussen), 3 pending suggesties. Voor échte klanten: "✨ Vraag Filly om voorstellen"-knop op /campagnes geeft direct waarde zonder fake data.
- [x] ~~**Setup-checklist** op account-pagina~~ (2026-04-30) — `OnboardingChecklist`-component met 6 items + progress-bar + ✕-dismiss (localStorage). Bewust op account-pagina, niet dashboard (waar het andere KPI's zou wegduwen).

---

## Test-data & seeds

- [x] ~~`apps/api/supabase/seeds/test_restaurants.sql`~~ — exacte inhoud uit Supabase gekopieerd (commit `699c84b`).
- [x] ~~Demo-account voor klant-demos~~ (2026-04-30) — `floriskoevermans@outlook.com` / restaurant_id `a462cf39-ef9b-49cb-bd8e-a84a10a3f888` gevuld via SQL-snippet (in chat-historie); 18 gasten, 30 reserveringen, 31 occupancy-dagen, 10 reviews, 5 campagnes, 3 pending suggesties. Snippet niet in repo — bewust ad-hoc voor jouw demo, geen UI-toggle voor klanten.
- [x] ~~**Mock-chat-berichten uit 0001-seed opruimen**~~ (2026-05-01) — onderdeel van migratie 0028: `delete from chat_conversations where created_at < '2026-01-01'`. Cascade verwijdert ook gekoppelde chat_messages.
- [x] ~~`test_campaigns.sql`~~ — niet nodig (bleek duplicaat van migratie 0005).

---

## Bekende kleine bugs / TODO-markers in code

Grep periodiek op `TODO`, `FIXME`, `MOCK`, `mock` in `apps/` om bij te
werken. Laatste audit: 2026-04-30.

- [x] ~~`/apps/web/src/app/dashboard/_components/filly-chat.tsx` — 635 regels~~ (2026-04-30) — gesplitst in 5 files: orchestrator (`filly-chat.tsx` 331r), `filly-chat-message-list`, `filly-chat-input`, `filly-chat-proposal-card`, `filly-chat-error-banner`, `filly-chat-types`. Geen file meer >350 regels. Logica letterlijk verplaatst, geen gedrag-wijziging.
- [x] ~~`/apps/web/src/app/dashboard/account/page.tsx` — bevat nog "Komt beschikbaar zodra de Claude API gekoppeld is"-melding~~ (afgevinkt 2026-06-11) — de string bestaat nergens meer in de codebase.
- [ ] Next.js warning `"middleware" file convention is deprecated; use "proxy" instead` — cosmetisch, te fixen door file te hernoemen naar `proxy.ts` bij een volgende pass.
- [x] ~~[kpi.service.ts](apps/api/src/kpi/kpi.service.ts) — `weekday_avg_pct = 68` hard-coded~~ (2026-04-30, zie Data Analyst-audit voor cascade-details).

---

## Hoe deze lijst te gebruiken

1. **Bij elke werksessie** open je eerst deze file — bepaal samen met
   Claude de volgende stap.
2. **Nieuwe bevinding?** Schrijf 'm hier meteen op, ook al heb je geen
   tijd om 'm nu op te lossen. Vergeten = weer opnieuw ontdekken.
3. **Iets klaar?** Zet op `[x]` + voeg commit-hash toe tussen `~~tildes~~`
   voor zichtbare voortgang. Verplaats naar "Recent voltooid" als de
   sectie te vol wordt.
4. **Prioriteit verandert?** Verplaats naar juiste P0/P1/P2/P3-sectie.
5. **Commit deze file mee** bij elke wijziging — geen aparte PR.

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
