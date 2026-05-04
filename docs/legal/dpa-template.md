# Verwerkersovereenkomst (Data Processing Agreement)

**Template — versie 0.1 · 2026-05-04**

> ⚠️ **Disclaimer**: dit is een template als startpunt, opgesteld door Get Filly. Het is **geen juridisch eindproduct** — laat dit document reviewen door een privacy-jurist (gespecialiseerd in SaaS + AVG/GDPR) vóór gebruik in productie. Geldigheid is mede afhankelijk van de actuele AVG-uitvoering, jurisprudentie en wijzigingen bij sub-verwerkers.

---

## 1. Partijen

**De Verwerkingsverantwoordelijke** (hierna: "Klant"):

- Naam onderneming: ____________________
- KvK-nummer: ____________________
- Adres: ____________________
- Vertegenwoordigd door: ____________________
- Functie: ____________________
- E-mailadres voor privacy-zaken: ____________________

**De Verwerker** (hierna: "Get Filly"):

- Naam onderneming: _Get Filly_ (handelsnaam, in te vullen na KvK-inschrijving)
- KvK-nummer: ____________________
- Adres: ____________________
- Vertegenwoordigd door: ____________________
- Functie: ____________________
- E-mailadres voor privacy-zaken: privacy@get-filly.com

Hierna gezamenlijk: "Partijen".

---

## 2. Achtergrond en doel

Klant heeft een hoofdovereenkomst (de "Hoofdovereenkomst") gesloten met Get Filly voor het gebruik van het Get Filly-platform: een SaaS-applicatie die marketing, reserveringen, gasten-administratie en AI-gestuurde communicatie ondersteunt voor horeca-ondernemingen.

In het kader van die Hoofdovereenkomst verwerkt Get Filly persoonsgegevens namens Klant. Deze Verwerkersovereenkomst legt de wederzijdse rechten en plichten daaromtrent vast, conform artikel 28 AVG.

In geval van strijdigheid tussen de Hoofdovereenkomst en deze Verwerkersovereenkomst, prevaleert deze Verwerkersovereenkomst voor zover het de verwerking van persoonsgegevens betreft.

---

## 3. Definities

- **AVG**: Verordening (EU) 2016/679 (Algemene Verordening Gegevensbescherming).
- **Persoonsgegevens**: alle informatie over een geïdentificeerde of identificeerbare natuurlijke persoon, zoals omschreven in de AVG.
- **Verwerking**: elke handeling of geheel van handelingen met betrekking tot persoonsgegevens, zoals omschreven in de AVG.
- **Betrokkene**: de natuurlijke persoon op wie de persoonsgegevens betrekking hebben (in praktijk: gasten, leden van het personeel van Klant, en gebruikers van Klants account).
- **Datalek**: een inbreuk in verband met persoonsgegevens, zoals bedoeld in artikel 4 lid 12 AVG.
- **Sub-verwerker**: een door Get Filly ingeschakelde derde partij die in opdracht van Get Filly persoonsgegevens verwerkt.

---

## 4. Onderwerp, aard, duur en doeleinden

### 4.1 Onderwerp
Get Filly verwerkt persoonsgegevens uitsluitend ten behoeve van het door Klant geleverde Get Filly-platform en de aan Klant geleverde diensten.

### 4.2 Aard van de verwerking
- Opslag, raadpleging, wijziging en verwijdering van gasten-, reserverings- en personeelsdata
- Versturen van marketing-mails namens Klant op basis van Klants instructies
- Geautomatiseerde tekst- en beeldanalyse via AI-modellen voor het opstellen van marketing-content, menu-suggesties en review-antwoorden
- Logging en monitoring voor security en troubleshooting

### 4.3 Duur
Deze Verwerkersovereenkomst is van kracht zolang de Hoofdovereenkomst loopt. Bij beëindiging van de Hoofdovereenkomst geldt artikel 13 (Einde overeenkomst).

### 4.4 Doeleinden
De verwerking dient uitsluitend voor:
- Het beheren van Klants restaurantgegevens, menu, reserveringen en gastenlijst
- Het opstellen, plannen en versturen van marketing-uitingen aan gasten van Klant
- Het ondersteunen van Klant met AI-gegenereerde content en analyses
- Het naleven van wettelijke verplichtingen (bv. AVG-rechten van betrokkenen)

Get Filly mag de persoonsgegevens **niet** voor andere doeleinden gebruiken, waaronder uitdrukkelijk niet voor eigen marketing, profilering, of verkoop aan derden.

---

## 5. Soorten persoonsgegevens en categorieën betrokkenen

### 5.1 Persoonsgegevens
Get Filly verwerkt onder andere de volgende soorten persoonsgegevens:

- **Identificerend**: naam, achternaam, aanhef, e-mailadres, telefoonnummer, postadres
- **Reservering & gastenhistorie**: reserveringsdatum, partygrootte, dieetwensen, voorkeuren, bezoek-frequentie
- **Marketing-toestemming**: opt-in-status voor mail, datum + bron van toestemming, opt-out-historie
- **Communicatie**: chat-berichten met de AI-assistent, gegenereerde campagne-content, review-antwoorden
- **Account-gegevens** (van Klant): inloggegevens, rol binnen het restaurant, audit-log van handelingen

### 5.2 Geen bijzondere persoonsgegevens
Klant verklaart geen bijzondere persoonsgegevens (zoals gezondheids- of religieuze informatie) via Get Filly te verwerken, tenzij vooraf schriftelijk anders overeengekomen. Dieetwensen worden in beginsel niet als gezondheidsgegeven aangemerkt zolang ze niet medisch geclassificeerd zijn.

### 5.3 Categorieën betrokkenen
- Gasten van Klant (huidige en potentiële)
- Personeelsleden / accountgebruikers van Klant
- Reviewers op platforms (Google, TripAdvisor, etc.) voor zover Klant hun review-data importeert

---

## 6. Verplichtingen Get Filly

### 6.1 Instructies van Klant
Get Filly verwerkt persoonsgegevens uitsluitend op basis van schriftelijke instructies van Klant, behoudens afwijkende wettelijke verplichtingen.

### 6.2 Vertrouwelijkheid
Get Filly waarborgt dat haar personeel en ingeschakelde partijen die toegang hebben tot persoonsgegevens een geheimhoudingsplicht hebben, hetzij contractueel, hetzij wettelijk.

### 6.3 Beveiliging
Get Filly treft passende technische en organisatorische maatregelen om persoonsgegevens te beschermen tegen verlies, onbevoegde toegang en andere onrechtmatige verwerking. Onder andere:

- Versleutelde verbindingen (TLS) voor alle dataverkeer
- Versleuteling van data at-rest (Supabase + AWS S3-niveau encryptie)
- Multi-tenant data-isolatie via Row-Level-Security (RLS) op database-niveau
- Toegangscontrole op basis van rollen en authenticatie
- Audit-logging van alle wijzigingen aan klantdata
- Periodieke security-reviews en patch-management
- Backup-strategie (Supabase Point-in-Time-Recovery)

Een actuele lijst van maatregelen is beschikbaar in [docs/security-measures.md](../security-measures.md) (op aanvraag).

### 6.4 Bijstand aan Klant
Get Filly verleent op verzoek redelijke bijstand aan Klant bij:

- Beantwoorden van verzoeken van betrokkenen (artikel 15-22 AVG: inzage, rectificatie, verwijdering, beperking, overdraagbaarheid, bezwaar)
- Het uitvoeren van een Data Protection Impact Assessment (DPIA)
- Voorafgaand overleg met de Autoriteit Persoonsgegevens
- Het naleven van meldplicht datalekken (artikel 33-34 AVG)

### 6.5 Audit-recht
Klant mag, na schriftelijke aankondiging van minimaal 30 dagen, eens per kalenderjaar een audit (laten) uitvoeren bij Get Filly om te toetsen of deze Verwerkersovereenkomst wordt nageleefd. De audit dient redelijk van omvang te zijn en mag de bedrijfsvoering van Get Filly niet onevenredig verstoren. Kosten voor de audit worden gedragen door Klant, tenzij ernstige tekortkomingen worden vastgesteld.

Get Filly mag in plaats daarvan een onafhankelijk auditrapport (bv. ISO 27001, SOC 2) aanleveren als bewijs van naleving zodra die beschikbaar is.

---

## 7. Sub-verwerkers

### 7.1 Algemene toestemming
Klant geeft hierbij algemene toestemming voor het inschakelen van sub-verwerkers door Get Filly, mits Get Filly:

- Met elke sub-verwerker een schriftelijke overeenkomst sluit met minimaal dezelfde verplichtingen als die in deze Verwerkersovereenkomst staan
- Klant minimaal 30 dagen vooraf informeert over het toevoegen of vervangen van een sub-verwerker, zodat Klant bezwaar kan maken
- Onverminderd aansprakelijk blijft voor de naleving van AVG-verplichtingen door sub-verwerkers

### 7.2 Huidige sub-verwerkers (per 2026-05-04)

| Sub-verwerker | Doel | Locatie data |
|---|---|---|
| **Supabase Inc.** | Database (PostgreSQL), authenticatie, file storage | EU (eu-west-1, Ierland) |
| **Resend, Inc.** | Verzending van campagne-mails | EU (eu-west-1, Ierland) |
| **Anthropic PBC** | AI-tekstgeneratie en -analyse (Claude-modellen) | EU + VS — zie 7.3 |
| **Vercel, Inc.** | Hosting van de web-frontend | Globaal (Edge Network) |
| **Railway / Render** | Hosting van de API-backend | EU-region |

Een actueel overzicht is beschikbaar via [https://get-filly.com/sub-verwerkers](https://get-filly.com/sub-verwerkers) (publiceren bij eerste klant).

### 7.3 Doorgifte buiten EER
Anthropic verwerkt mogelijk data in de Verenigde Staten. Daarvoor zijn passende waarborgen op basis van:

- EU-US Data Privacy Framework (DPF) — Anthropic is gecertificeerd
- Standard Contractual Clauses (SCC's) als aanvullende waarborg
- Geminimaliseerde data per AI-call: alleen de minimaal benodigde context wordt meegestuurd; geen ruwe gastenlijsten

### 7.4 Bezwaar
Klant kan binnen 30 dagen na kennisgeving schriftelijk bezwaar maken tegen een nieuwe sub-verwerker. Bij gegrond bezwaar zoeken Partijen naar een passende oplossing; lukt dat niet, dan kan Klant deze Verwerkersovereenkomst (en daarmee de Hoofdovereenkomst voor zover ze niet zonder elkaar kunnen) zonder kosten beëindigen.

---

## 8. Datalekken

### 8.1 Meldtermijn
Get Filly informeert Klant zonder onnodige vertraging — uiterlijk binnen **48 uur** na het ontdekken — over een mogelijk datalek waarbij Klants persoonsgegevens betrokken zijn.

### 8.2 Inhoud van de melding
De melding bevat ten minste:
- Aard van het lek
- Categorieën en (geschat) aantal betrokkenen
- Categorieën en (geschat) aantal persoonsgegevens-records
- Mogelijke gevolgen
- Genomen en voorgenomen maatregelen

### 8.3 Documentatie
Get Filly bewaart een register van alle datalekken (ook degene die niet aan AP gemeld hoeven worden) en stelt dit op verzoek beschikbaar aan Klant.

---

## 9. Verzoeken van betrokkenen

Verzoeken van betrokkenen (inzage, rectificatie, verwijdering, etc.) worden in eerste instantie gericht aan Klant als verwerkingsverantwoordelijke. Get Filly biedt in het platform tools aan waarmee Klant deze verzoeken zelfstandig kan afhandelen:

- Inzage: data-export-functie op de account-pagina (alle business-data als JSON)
- Verwijdering: account-deletion-functie (verwijdert auth-account + alle eigen restaurants + cascade business-data)
- Specifieke gast-verwijdering: handmatig via de gasten-pagina

Indien een betrokkene zich rechtstreeks tot Get Filly wendt, stuurt Get Filly het verzoek zonder onnodige vertraging door naar Klant.

---

## 10. Bewaartermijnen

- **Actieve klantdata**: zolang de Hoofdovereenkomst loopt
- **Audit-log**: 7 jaar (boekhoudkundige bewaarplicht)
- **Mail-send-history (`campaign_sends`)**: 2 jaar voor reporting + bounce-tracking
- **Anonieme campagne-benchmarks**: onbeperkt (geen persoonsgegevens — zie [docs/data-classification.md](../data-classification.md))
- **Backups**: zoals Supabase point-in-time-recovery — 7 dagen voor de huidige snapshot

Na beëindiging van de Hoofdovereenkomst gelden artikel 13.

---

## 11. Aansprakelijkheid

Aansprakelijkheid uit hoofde van of in verband met deze Verwerkersovereenkomst wordt geregeld in de Hoofdovereenkomst. Onverlet de bepalingen aldaar:

- Get Filly is niet aansprakelijk voor schade die het gevolg is van onjuiste of onvolledige instructies van Klant
- Get Filly is niet aansprakelijk voor schade die het gevolg is van handelingen van betrokkenen zelf (bv. zwakke wachtwoorden door eindgebruikers)
- Aansprakelijkheid is in alle gevallen beperkt tot maximaal de in de twaalf voorafgaande maanden door Klant aan Get Filly betaalde abonnementskosten, met een minimum van € ____________________

⚠️ Dit aansprakelijkheidsbedrag dient door een jurist te worden vastgesteld op basis van Get Filly's verzekering en risico-profiel.

---

## 12. Boete bij non-compliance

Indien een Partij verwijtbaar in strijd handelt met deze Verwerkersovereenkomst en daardoor schade veroorzaakt aan de andere Partij of aan een betrokkene, gelden de aansprakelijkheidsregels uit de Hoofdovereenkomst.

Ten aanzien van bestuurlijke boetes opgelegd door de Autoriteit Persoonsgegevens: Partijen dragen ieder de boete die voortvloeit uit eigen verwijtbaar handelen.

---

## 13. Einde van de overeenkomst

### 13.1 Teruggave en vernietiging
Bij beëindiging van de Hoofdovereenkomst — om welke reden dan ook — biedt Get Filly Klant de mogelijkheid binnen **30 dagen** een volledige data-export te maken (JSON-formaat).

Na die 30 dagen worden alle persoonsgegevens van Klant uit de productie-omgeving van Get Filly verwijderd, inclusief bij sub-verwerkers, behoudens:

- Wat wettelijk bewaard moet worden (bv. boekhouding)
- Geanonimiseerde benchmarks die niet herleidbaar zijn (zie [docs/data-classification.md](../data-classification.md))
- Backups: maximaal 7 dagen na de laatste backup-creatie

### 13.2 Bevestiging
Get Filly bevestigt schriftelijk aan Klant zodra de verwijdering voltooid is.

---

## 14. Slotbepalingen

### 14.1 Wijzigingen
Wijzigingen aan deze Verwerkersovereenkomst zijn alleen geldig indien schriftelijk overeengekomen door beide Partijen.

### 14.2 Toepasselijk recht en geschillen
Op deze Verwerkersovereenkomst is **Nederlands recht** van toepassing. Geschillen worden voorgelegd aan de bevoegde rechter in het arrondissement waar Get Filly gevestigd is, tenzij de wet dwingend anders bepaalt.

### 14.3 Voorrang
Indien een bepaling van deze Verwerkersovereenkomst nietig of vernietigbaar blijkt, blijven de overige bepalingen onverminderd van kracht. Partijen zullen de nietige bepaling vervangen door een geldige bepaling die de oorspronkelijke bedoeling zo dicht mogelijk benadert.

---

## 15. Ondertekening

**Klant** (Verwerkingsverantwoordelijke)

Naam: ____________________
Functie: ____________________
Datum: ____________________
Plaats: ____________________
Handtekening: ____________________

**Get Filly** (Verwerker)

Naam: ____________________
Functie: ____________________
Datum: ____________________
Plaats: ____________________
Handtekening: ____________________

---

## Bijlage A — Contactgegevens privacy-coördinatoren

**Klant**
- Naam: ____________________
- E-mail: ____________________
- Telefoon: ____________________

**Get Filly**
- Naam: ____________________
- E-mail: privacy@get-filly.com
- Telefoon: ____________________

---

*Einde document — versie 0.1 · 2026-05-04*
