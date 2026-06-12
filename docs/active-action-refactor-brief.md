# Brief — audit-item #8: één `active_action`-state voor de Filly-chat

> **Voor een nieuwe Claude-sessie.** Dit document is zelfstandig: alles
> wat je nodig hebt om audit-item #8 op te pakken staat hieronder.
> Lees ook `BACKLOG.md` → sectie "🔧 Filly-flow developer-audit" (items
> 1–7 zijn af; #8 is de laatste en grootste).

## Opdracht in één zin

Trek de architecturale naad dicht tussen de **geleide flow** (frontend-
kaart-state) en de **chat** (LLM-tekst): introduceer één gedeelde,
gepersisteerde "lopende actie"-state per gesprek waar beide op
lezen/schrijven — óf kies bewust voor één interactiemodel. **Begin met
een ontwerpvoorstel (opties + trade-offs), bouw pas na akkoord.**

## Achtergrond: wat is Filly en hoe werkt de flow nu

Get-Filly is een marketing-dashboard voor NL-horeca. "Filly" is de
AI-assistent. Op het dashboard staat een chat (`FillyChat`) waarmee de
eigenaar campagnes maakt. Sinds een eerdere sessie loopt campagne-maken
via een **geleide flow** (wizard): dag kiezen → context bevestigen
(events/weer) → kanalen voorvinken → genereren.

Er zijn twee manieren om die flow te starten, en daar zit het probleem:

1. **Lege chat** → `FillyGuidedFlow` rendert als empty-state (frontend
   component met eigen state: gekozen dag, day-context, geselecteerde
   context-hints, geselecteerde kanalen).
2. **Getypt verzoek** ("doe iets voor zondag") → de chat-LLM herkent het
   campagne-verzoek en emit een machine-blok `<<FILLY_START_GUIDED>>{...}`;
   de frontend rendert daarvoor óók `FillyGuidedFlow`, inline in de
   thread, voorgevuld met `initialDate` / `initialTopic`.

## Het probleem (de kern van #8)

**De flow-state leeft alleen in de frontend-component; de chat-LLM ziet
alleen tekst.** Ze delen geen bron-van-waarheid. Concreet falend
scenario dat dit blootlegde:

1. Eigenaar kiest in de flow "woensdag 17 jun" (zit nu in React-state
   van `FillyGuidedFlow`, niet in de gespreks-tekst).
2. Eigenaar typt "doe iets voor het menu".
3. Het LLM weet niets van "wo 17" (stond niet in de tekst) → vraagt de
   dag opnieuw / start een verse flow.
4. Eigenaar typt "buratta" → opnieuw dag-keuze, gerecht kwijt.

Dit is deze sessie **3× gepatcht** met workarounds in plaats van een
fundament:
- De gekozen datum/topic wordt als tekst-**annotatie** teruggeplakt in
  de LLM-historie (`chat.service.ts`, in de `historyPrompt`-map:
  `[geleide flow gestart — doel-datum YYYY-MM-DD, thema "..."]`).
- Het LLM moet die annotatie herkennen + de datum hergebruiken.
- Een `topic` werd toegevoegd aan het signaal + de flow.

Die workarounds werken deels maar blijven lekken: de "echte" state
(wat in de flow-kaart gekozen is) en wat het LLM denkt te weten lopen
uit elkaar zodra het gesprek langer wordt.

## Betrokken code (lees deze eerst)

Backend (`apps/api/src/`):
- `chat/chat.service.ts` — de chat-flow. Belangrijk:
  - `MessageCard`-union + `GuidedStartCard` (`kind: 'guided_start'`,
    `date?`, `topic?`).
  - `extractGuidedStart()` — parst `<<FILLY_START_GUIDED>>{day_phrase?|date?, topic?}`;
    rekent `day_phrase` om via `resolveDutchDate`.
  - `sendMessage()` — bouwt de `historyPrompt` (hier zit de
    annotatie-workaround), roept Claude, dispatcht naar `message_card`.
  - `buildSystemPrompt()` — de persona + de FILLY_START_GUIDED-instructie.
  - `getOrCreateActiveConversation()` — **sessie-per-kalenderdag**: een
    gesprek wordt alleen hervat als 't van vandaag (Europe/Amsterdam)
    is, anders vers. Relevant: `active_action` hoort logisch bij een
    conversation, en die reset dagelijks.
  - LEGACY parsers (`extractCampaignProposal`/`Bundle`/`Choice`/
    `DateChoice`) — bewust behouden als historische-render + fallback;
    niet de plek voor nieuwe campagne-creatie.
- `common/dutch-date.ts` — `resolveDutchDate(phrase, today)` (pure,
  getest). Het LLM levert de dag-frase, deze functie rekent 'm om.
- `suggestions/suggestions.service.ts` — `generateForSelectedDates`
  (de generatie; multi-channel parallel) + `getDayContext` (events/weer/
  kanalen voor een dag).

Frontend (`apps/web/src/`):
- `app/dashboard/_components/filly-guided-flow.tsx` — de wizard. State:
  `step` ("day"|"context"|"channels"|"generating"|"done"), `picked`
  (dag), `dayContext`, `selectedContext`, `selectedChannels`,
  `result`. Props `initialDate`/`initialTopic` (voor de inline-modus).
- `app/dashboard/_components/filly-chat.tsx` — orchestrator (laadt
  historie, stuurt berichten, scroll/typing/cap).
- `app/dashboard/_components/filly-chat-message-list.tsx` — rendert
  berichten + kaarten; rendert `FillyGuidedFlow` voor een
  `guided_start`-kaart en in de lege staat.
- `lib/api.ts` — types (`MessageCard`, `GuidedStartCard`,
  `GenerateForDatesItem`, `DayContext`) + fetch-functies.

Data (Supabase, migraties handmatig in `apps/api/supabase/migrations/`,
laatste = `0055`; volgende vrije nummer = `0056`):
- `chat_conversations` (id, restaurant_id, title, updated_at).
- `chat_messages` (conversation_id, role, content, `message_card` jsonb,
  ai_suggestion_id).
- `ai_suggestions` (de gegenereerde voorstellen; `suggested_campaign`
  jsonb, `trigger_context`, status).

## Gewenste richting (te bevestigen in je ontwerp)

**Optie A (aanbevolen): één `active_action`-state per gesprek.**
Eén object (bv. `{ date, topic, channels[], step }`) dat per conversation
gepersisteerd wordt (kolom op `chat_conversations` of een eigen tabel)
en dat zowel de flow-kaart als de chat-LLM-context voedt:
- Flow-kaart schrijft erin bij elke keuze (dag/context/kanalen).
- De chat-prompt leest 'm (i.p.v. de tekst-annotatie-workaround) zodat
  het LLM altijd de actuele lopende actie kent.
- Getypte verfijningen ("buratta") muteren dezelfde state.
Onderzoek: real-time sync flow↔chat (de flow is een React-component,
de chat een aparte; ze delen nu geen state), en wanneer de actie
"afgerond/verlaten" is.

**Optie B (simpeler, overweeg expliciet): commit aan één model.**
Flow puur klik-gestuurd; typen pas ná een gegenereerd voorstel (om te
verfijnen), niet midden in de flow. Dan is er geen flow↔chat-naad meer
om te synchroniseren. Minder flexibel, maar elimineert de bugklasse.

Weeg A vs B af in je ontwerpvoorstel met de trade-offs; laat Floris
kiezen.

## Repo-conventies (BELANGRIJK — houd je hieraan)

- **Taal: Nederlands** (code-commentaar mag uitleggend, Floris leert mee).
- **Stapsgewijs**, kleine stappen, per fase committen (niet opsparen).
- **Typecheck** vóór commit: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
  en idem voor `apps/web`.
- **Tests**: `pnpm --filter api test` (Jest/ts-jest; 55 tests groen nu).
  Pure functies hoor je te testen (zie de bestaande `*.spec.ts`).
- **Commits** eindigen met:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Migraties**: schrijf bij ELKE migratie de **volledige SQL letterlijk
  in de chat uit** (Floris draait 'm handmatig in de Supabase SQL Editor;
  hij verwijst niet naar het bestand). Migraties herhaal-veilig met
  `if not exists`. Eerst SQL draaien, dán pushen wanneer lopende code de
  kolom leest. Bij puur frontend/code: zeg expliciet "geen SQL".
- **NIET pushen zonder expliciete toestemming** — een push naar `main`
  deployt automatisch naar productie (Vercel). Commit lokaal, vraag of
  meld vóór de push.
- **Werk `BACKLOG.md` bij**: vink #8 af zodra klaar.

## Acceptatiecriteria ("klaar" ziet er zo uit)

1. Het falende scenario werkt: wo 17 kiezen → "doe iets voor het menu"
   → "buratta" → een voorstel voor **wo 17 over Burrata**, zónder de dag
   opnieuw te vragen en zonder het gerecht te verliezen.
2. De tekst-annotatie-workaround in `historyPrompt` is vervangen door de
   nieuwe state-bron (of bewust behouden met uitleg).
3. Typecheck + tests groen; nieuwe pure logica is getest.
4. Geen regressie in: lege-chat-flow, getypte start, multi-channel,
   sessie-per-kalenderdag.

## Verificatie / valkuilen

- De flow (React-component) en de chat-orchestrator delen nu geen state
  — een gedeelde store/context of server-state (de conversation-row) is
  de crux. Bedenk hoe een flow-keuze de chat-context bereikt zonder een
  paginareload.
- LLM-gedrag is niet vanaf dev te testen; maak de state deterministisch
  in code en laat het LLM zo min mogelijk "onthouden".
- Bestaande gesprekken (oude `message_card`-kaarten) moeten blijven
  renderen — breek de historische data niet.
- Houd de geleide flow zoals 'ie is voor de eindgebruiker; dit is een
  interne herarchitectuur, geen UX-redesign (tenzij je voor optie B
  kiest — dan is het wél een UX-keuze, stem af).
