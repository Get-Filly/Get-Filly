# Anthropic API — kosten-grenzen + alerts

Claude Opus 4.7 (Vision) kost $15/Mtok input en $75/Mtok output. Eén
foute upload (50-pagina PDF, herhaaldelijk gefaald) kan zomaar een
paar honderd dollar kosten. Met cost-alerts en harde limits voorkom
je dat je een dag later een verrassing in je inbox krijgt.

> **Status**: configuratie-stappen voor de Anthropic Console. Geen
> code-wijziging — Anthropic regelt dit aan hun kant.

---

## Wat je gaat instellen

1. **Workspace spending limit** — harde cap waarboven calls fail'en.
2. **Email-alerts** bij 50% / 75% / 100% van je budget.
3. **Per-key cost-tracking** — aparte API-key voor productie vs dev
   zodat je weet waar de kosten heen gaan.

---

## Stap 1: Inloggen

Ga naar [console.anthropic.com](https://console.anthropic.com) en log
in met je Anthropic-account.

---

## Stap 2: Spending limits instellen

1. Sidebar → **Settings** → **Limits**.
2. Stel een **Monthly spending limit** in.
   - **Voor MVP-fase** (jij + 1-3 testklanten): **$50/maand** is ruim
     genoeg. Chat-gemiddelde ~$0,01-0,03 per bericht; menu-vision
     ~$0,15-0,30 per upload. Bij 50 menu-uploads + 1000 chats/maand
     zit je nog onder $40.
   - **Bij eerste echte klanten** (10-20 betalend): verhoog naar
     **$200-400/maand** afhankelijk van gebruik. Monitor eerst 2 weken.
3. Klik **Save**.

> Boven de limit: API-calls geven `429 quota_exceeded`. Onze backend
> vangt dat op met de graceful-degradation-handler ("Filly is even
> druk, probeer zo opnieuw") — geen 500 voor de eindgebruiker.

---

## Stap 3: Email-alerts

1. Sidebar → **Settings** → **Notifications**.
2. **Cost alerts** aanvinken voor:
   - 50% van limit bereikt
   - 75% van limit bereikt
   - 100% van limit bereikt
3. Email-adres: florisbwkoevermans@gmail.com.
4. Klik **Save**.

Je krijgt een mail zodra een drempel passeert. Bij 75% kan je nog
ingrijpen (nieuwe limit instellen, klant pauseren) vóór de cap raakt.

---

## Stap 4: Aparte API-keys per omgeving

**Doel**: voorkom dat dev-experimenten van je productiebudget eten.

1. Sidebar → **Settings** → **API Keys**.
2. Maak **drie keys** aan:
   - `get-filly-prod` — voor productie Railway/Vercel
   - `get-filly-staging` — voor staging-omgeving (zodra die er is)
   - `get-filly-local` — voor lokale dev op je laptop
3. Kopieer elke key direct naar de juiste `.env` / Railway-secret.
   Anthropic toont de key maar één keer.

**Voordeel**: in Console → **Usage** kun je per key zien hoeveel
$ verbrand wordt. Onmiddellijk duidelijk wie de boosdoener is.

---

## Stap 5: In ons dashboard zelf monitoren (later)

We loggen elke Claude-call al in `ai_usage` met `input_tokens`,
`output_tokens`, `cached_input_tokens`, `model` en `feature`. Dat is
de basis voor een eigen cost-dashboard:

- Per restaurant: hoeveel kost deze klant ons?
- Per feature: chat vs menu-vision vs reviews — waar gaat tijd heen?
- Cache-hit-ratio: hoe goed werkt onze prompt-caching?

Dit komt op de roadmap (admin-tooling, BACKLOG COO-sectie). Tot
die tijd kun je in Supabase Studio een query draaien zoals:

```sql
select
  feature,
  count(*)             as calls,
  sum(input_tokens)    as input_tokens,
  sum(cached_input_tokens) as cached,
  sum(output_tokens)   as output_tokens,
  -- Sonnet-tarief, ruwe schatting (Opus voor menu-vision is duurder):
  round(
    (sum(input_tokens) * 3 + sum(output_tokens) * 15) / 1000000.0
  , 2) as estimated_usd
from ai_usage
where created_at > now() - interval '30 days'
group by feature
order by estimated_usd desc;
```

---

## Daily ritueel (jouw routine)

- **Maandelijks**: check Anthropic Console → Usage. Lijkt het normaal?
  Geen vreemde piek?
- **Bij elke nieuwe klant**: extra ~$5/maand budget toevoegen aan je
  monthly limit. Schaal mee.
- **Bij 75%-alert**: kijk in `ai_usage` welke klant/feature het
  meest verbruikt. Pas zo nodig per-restaurant rate-limits aan
  (nu 100 calls/uur).

---

## Hoe Anthropic je uiteindelijk factureert

- Per maand, in dollars, op je creditcard.
- Geen verrassingen: je betaalt nooit boven de spending limit.
- BTW: nu nog niet inbegrepen voor NL-bedrijven; vraag dit eens na
  bij Anthropic-support of leg het bij je accountant op de stapel
  voor reverse-charge BTW-aangifte.
