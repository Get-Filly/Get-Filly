# Google Business Profile — setup-guide

Dit document beschrijft de externe setup die nodig is voor de
Google-Business-Profile-integratie van Get Filly. Het is opgedeeld
in twee fases:

- **Fase B (deze guide)** — Google Cloud project + Places API. Geen
  per-klant-actie nodig, geen Google approval-wachttijd. Hiermee
  draaien profiel-audit, concurrent-benchmark en Filly-posts.
- **Fase C+D (later)** — Google Business Profile API approval-aanvraag
  + OAuth-flow voor klanten. Wachttijd 2-6 weken. Hiermee draaien
  reviews-sync, profiel-edits, foto-sync en inzichten.

---

## Fase B — Google Cloud + Places API

Tijd: ~15 minuten. Eenmalig.

### 1. Google Cloud project aanmaken

1. Log in op [console.cloud.google.com](https://console.cloud.google.com/)
   met je Get-Filly-Google-account (mag een persoonlijk account zijn,
   maar maak op termijn een zakelijk account aan zodra de KvK-
   inschrijving rond is).
2. Klik bovenaan op de project-dropdown → **Nieuw project**.
3. Naam: `Get Filly Production`. Organization: laat leeg als je geen
   GSuite hebt. Locatie: laat default.
4. Klik **Maken**. Wacht ~10 seconden tot het project actief is en
   selecteer het in de dropdown.

### 2. Billing-account koppelen

Places API heeft een **gratis tier van $200/maand** aan credits, maar
je MOET een billing-account koppelen voordat je een API-key kunt maken.

1. Hamburger-menu links → **Billing**.
2. Als je nog geen billing-account hebt: **Create billing account**.
   Vul creditcard in (Google chargeert pas iets als je $200 overschrijdt
   — bij verwacht gebruik <1000 klanten gebeurt dat niet).
3. Klik **Link a billing account** en koppel het aan dit project.

### 3. Places API enablen

Er zijn twee Places-API-versies. Wij gebruiken de **nieuwe** (Places
API New, sinds 2023):

1. Hamburger → **APIs & Services** → **Library**.
2. Zoek naar **"Places API (New)"**. Klik erop.
3. Klik **Enable**.
4. Optioneel: enable ook **Maps JavaScript API** als je later embed-
   maps wilt tonen op de hub.

### 4. API-key aanmaken + restrictions

1. Hamburger → **APIs & Services** → **Credentials**.
2. **Create credentials** → **API key**.
3. De key verschijnt — kopieer hem direct (`AIza...`-prefix).
4. Klik op de key in de lijst om hem te bewerken:
   - **Name**: `getfilly-places-server`
   - **Application restrictions**: **IP addresses** (server-side
     gebruik). Voor lokaal dev: laat leeg of zet je eigen IP. Voor
     productie: zet het Railway-IP-bereik. **Geen** "HTTP referrer"
     — dat is voor browser-keys.
   - **API restrictions**: **Restrict key** → vink alleen **Places
     API (New)** aan. Zo voorkom je dat een gelekte key alle Google-
     APIs leeg kan trekken.
5. Klik **Save**. Wacht ~1 minuut tot de restrictions actief zijn.

### 5. Env-var toevoegen

Voeg de key toe aan `apps/api/.env`:

```bash
# Google Places API (New) — server-side key voor place-lookup,
# nearby-search en place-details. Restrictie: IP + Places-API-only.
# Setup-guide: docs/google-business-setup.md
GOOGLE_PLACES_API_KEY=AIzaSy...
```

En in productie ook in Railway → environment variables.

### 6. Test of de key werkt

Quick smoke-test vanuit terminal:

```bash
curl -X POST 'https://places.googleapis.com/v1/places:searchText' \
  -H 'Content-Type: application/json' \
  -H "X-Goog-Api-Key: $GOOGLE_PLACES_API_KEY" \
  -H 'X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress' \
  -d '{"textQuery":"De Kas Amsterdam"}'
```

Verwacht: JSON met `places: [{id, displayName, formattedAddress}]`.
Als je `403` of `INVALID_API_KEY` krijgt: check restrictions + wacht
nog 1-2 minuten.

---

## Kosten-monitoring

Places API New kost ~$0.005-0.017 per call afhankelijk van veld-
mask. Met 1000 klanten en gemiddeld 10 calls/maand komt dat op
~$50-170/maand — ruim binnen de $200-credit.

Stel een **billing alert** in op $50:

1. **Billing** → **Budgets & alerts** → **Create budget**.
2. Naam: `Get Filly Places API`. Scope: dit project.
3. Amount: `$50`. Threshold: `50%, 90%, 100%`.
4. Email-alerts naar jouw adres.

---

## Fase C+D — Google Business Profile API + OAuth (later)

Komt aan bod in een aparte sessie wanneer fase B live is. Vereist:

1. Apart Google-form invullen ("Business Profile APIs access form")
2. 2-6 weken wachttijd op Google's review
3. OAuth consent screen configureren (nu nog niet relevant)
4. OAuth client ID aanmaken (web application type)

Pas dan kunnen klanten via OAuth hun eigen profiel koppelen voor
reviews-sync, profiel-edits, foto-sync en inzichten.
