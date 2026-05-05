# Google Business Profile API — approval-aanvraag (fase C)

Dit document begeleidt de aanvraag voor toegang tot de **Business
Profile APIs**. Dit is iets anders dan de Places API (die hebben we al
in fase B). Pas met deze approval kunnen we:

- ✅ Reviews lezen en namens de klant beantwoorden
- ✅ Profielinformatie wijzigen (openingstijden, beschrijving)
- ✅ Foto's en posts uploaden naar Google
- ✅ Inzichten ophalen (searches, views, calls)

**Wachttijd**: typisch 2-6 weken. Soms 8 weken bij druk seizoen.

---

## Voorbereiding (vóór je het formulier invult)

### 1. Google Cloud-project staat klaar

✅ Al gedaan in fase B: project `Get-Filly GBP` onder
organisatie `get-filly.com`. Places API (New) is enabled.

### 2. Onderstaande Business Profile APIs activeren

Ga naar Cloud Console → APIs & Services → Library en enable:

- **My Business Account Management API** — accounts/locations beheren
- **My Business Business Information API** — profielinfo lezen/wijzigen
- **My Business Q&A API** — vragen beantwoorden
- **Google Business Profile Performance API** — inzichten/statistieken
- **Google My Business API (legacy)** — reviews lezen/beantwoorden (deze
  oude API is wat reviews-functionaliteit ondersteunt; alleen toegankelijk
  na approval)

Na enable krijg je de mogelijkheid om de approval-aanvraag in te dienen.

### 3. Privacy-policy + Terms of Service publiek beschikbaar

Google checkt of `get-filly.com/privacy` en `get-filly.com/voorwaarden`
toegankelijk zijn en je product-omschrijving bevatten. ✅ Beide zijn
publiek beschikbaar.

### 4. OAuth consent screen configureren

In Cloud Console → APIs & Services → OAuth consent screen:

- **User type**: External (klanten zijn buiten get-filly.com organisatie)
- **App name**: `Get Filly`
- **Support email**: `administratie@get-filly.com`
- **App logo**: Get Filly's logo (192x192 PNG)
- **Application home page**: `https://get-filly.com`
- **Privacy policy**: `https://get-filly.com/privacy`
- **Terms of service**: `https://get-filly.com/voorwaarden`
- **Authorized domains**: `get-filly.com`
- **Developer contact**: `administratie@get-filly.com`

**Scopes** (voeg deze toe als "Sensitive scopes"):
- `https://www.googleapis.com/auth/business.manage` — primaire scope
  voor alle Business Profile-acties

Na toevoegen vraagt Google om verificatie van het domein (TXT-record in
DNS). Doe dat alvast — bespaart een week wachttijd later.

---

## Het approval-formulier

URL: [Business Profile APIs access form](https://docs.google.com/forms/d/e/1FAIpQLSefIyGQs_8VxiHpxiYkpc1Yip4i4qUXPLVMfo3IptVkkOhXzg/viewform)

**Velden om in te vullen**:

### Bedrijfsgegevens

| Veld | Antwoord |
|---|---|
| Project name | Get-Filly GBP |
| Project number | (vind in Cloud Console → Project settings) |
| Company name | (jouw KvK-naam zodra ingeschreven, anders `Get Filly`) |
| Company website | https://get-filly.com |
| Number of locations to manage | 100-1000 (verwacht groei naar 1000+) |
| Country | Netherlands |
| Business model | SaaS for restaurants (B2B) |

### Use-case beschrijving (vrije tekst)

> Get Filly is een Nederlandse SaaS voor horeca-ondernemers. Onze
> klanten zijn restaurants, cafés en bistro's die hun Google Business
> Profile willen beheren via één centraal dashboard naast hun andere
> marketing-tools (mail, social media, reviews).
>
> Specifieke functionaliteit waarvoor wij Business Profile API-toegang
> aanvragen:
>
> 1. **Reviews-beheer** — Klanten zien hun Google-reviews in ons
>    dashboard, onze AI (Claude) genereert antwoord-suggesties die
>    passen bij hun zaak, eigenaar bevestigt en publiceert direct
>    via onze interface. Vermindert reactie-tijd op negatieve reviews
>    significant.
>
> 2. **Profile-audit + edits** — Wij analyseren of het Google-profiel
>    compleet is (foto's, openingstijden, beschrijving, attributen).
>    Met goedkeuring van de eigenaar pushen we wijzigingen door naar
>    Google.
>
> 3. **Foto-sync** — Foto's die de eigenaar in onze foto-bibliotheek
>    uploadt kunnen automatisch ook naar Google's profiel.
>
> 4. **Inzichten** — We tonen searches/views/calls per dag in ons
>    dashboard zodat eigenaar zonder te switchen tussen tools z'n
>    Google-prestaties kan volgen.
>
> Onze klanten geven expliciet OAuth-toestemming voor het beheren
> van hun specifieke Business Profile. Wij bewaren de access-tokens
> encrypted en gebruiken ze uitsluitend voor de bovenstaande functies.
> Klanten kunnen op elk moment de koppeling intrekken via ons dashboard.

### Compliance

- ☑ Ik bevestig dat het product compatibel is met Google's Acceptable
  Use Policy
- ☑ Ik bevestig dat alle wijzigingen aan Business Profiles met
  expliciete toestemming van de eigenaar worden gedaan
- ☑ Ik bevestig dat we OAuth refresh-tokens encrypted opslaan en
  alleen gebruiken voor de aangevraagde functies
- ☑ Ik bevestig dat klanten de koppeling op elk moment kunnen
  intrekken

---

## Na indienen

1. **Bevestiging**: Google stuurt binnen 24 uur een bevestiging-mail
   met een ticket-nummer
2. **Wachttijd**: 2-6 weken (soms 8). Geen tussentijdse status-update
   tenzij ze meer info nodig hebben.
3. **Resultaat**:
   - **Approved** → je krijgt mail met instructies voor het OAuth-
     verification-proces (extra stap, maar relatief snel: 1-2 weken)
   - **Need more info** → ze vragen specifieke vragen, beantwoord
     binnen 14 dagen anders sluit het ticket
   - **Rejected** → meestal vanwege onvolledige use-case beschrijving;
     je mag opnieuw indienen

## Tijdens de wachttijd

We bouwen alvast de OAuth-foundation (fase D in BACKLOG):

- Migratie 0035: `oauth_connections` tabel met encrypted refresh-tokens
- `OAuthService` (generiek, ook bruikbaar voor Meta later)
- `/api/oauth/google-business/authorize` + `/callback` endpoints
- "Koppel met Google"-knop op de hub die echte OAuth start

Zodra approval binnen is: alleen scopes activeren en de hele flow
gaat live.
