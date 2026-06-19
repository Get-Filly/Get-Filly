// ============================================================
// Privacy-verklaring, /privacy
// ============================================================
// Publieke pagina (AVG art. 13/14). De volledige tekst is per
// 2026-05-30 vervangen door de aangeleverde, uitgebreide
// conceptversie (afgestemd op AVG, Google OAuth Verification,
// Meta App Review, Stripe, bunq en Anthropic/Claude).
//
// Bedrijfsgegevens komen uit `apps/web/src/config/company.ts`
// (KvK, adres, telefoon). De draft-banner verdwijnt automatisch
// nu legalName + KvK zijn ingevuld; het document blijft formeel
// een conceptversie tot een jurist 'm heeft gereviewd.
// ============================================================

import type { Metadata } from "next";
import { COMPANY, formatFullAddress } from "@/config/company";

export const metadata: Metadata = {
  // Korte titel; de root-template maakt er "Privacyverklaring · Get-Filly" van.
  title: "Privacyverklaring",
  description:
    "Hoe Get-Filly jouw persoonsgegevens verwerkt, met wie we die delen en welke rechten je hebt.",
  alternates: { canonical: "/privacy" },
};

const LAST_UPDATED = "18 juni 2026";
const VERSION = "v1.1";

// Lichte, herbruikbare tabel-styling zodat de overzichtstabellen
// netjes ogen zonder van een mogelijk-ontbrekende CSS-class af te
// hangen.
const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  margin: "12px 0",
  fontSize: 14,
};
const thtd: React.CSSProperties = {
  border: "1px solid var(--border, #E5DFD0)",
  padding: "8px 10px",
  textAlign: "left",
  verticalAlign: "top",
};

export default function PrivacyPage() {
  const fullAddress = formatFullAddress();

  return (
    <section className="legal-page">
      <div className="legal-container">
        <p className="legal-meta">
          Laatst bijgewerkt: {LAST_UPDATED} · {VERSION}
        </p>
        <h1 className="legal-title">Privacyverklaring</h1>
        <p className="legal-lead">
          Get-Filly helpt horecaondernemers slimmer te vullen met
          AI-marketing, automatisering, analyses en online
          zichtbaarheid. Om onze diensten te kunnen leveren, verwerken
          wij persoonsgegevens van gebruikers, ondernemers en in sommige
          gevallen ook van gasten van onze klanten. In deze
          privacyverklaring leggen wij uit welke gegevens wij verwerken,
          waarom wij dat doen, met wie wij gegevens delen, hoe lang wij
          gegevens bewaren en welke rechten betrokkenen hebben.
        </p>

        <nav className="legal-toc" aria-label="Inhoudsopgave">
          <div className="legal-toc-title">Inhoud</div>
          <ol>
            <li><a href="#wie">Wie zijn wij?</a></li>
            <li><a href="#gegevens">Welke gegevens verwerken wij?</a></li>
            <li><a href="#waarom">Waarom verwerken wij deze gegevens?</a></li>
            <li><a href="#analyses">Geautomatiseerde analyses, Health Scores en profilering</a></li>
            <li><a href="#integraties">Gebruik van externe integraties</a></li>
            <li><a href="#google">Gebruik van Google Business Profile-gegevens</a></li>
            <li><a href="#meta">Gebruik van Meta-, Facebook- en Instagram-gegevens</a></li>
            <li><a href="#ai">Gebruik van AI-systemen, Claude Code en Anthropic</a></li>
            <li><a href="#delen">Met wie delen wij gegevens?</a></li>
            <li><a href="#buitenland">Doorgifte buiten de Europese Economische Ruimte</a></li>
            <li><a href="#bewaartermijn">Hoe lang bewaren wij gegevens?</a></li>
            <li><a href="#beveiliging">Hoe beveiligen wij gegevens?</a></li>
            <li><a href="#cookies">Cookies en meetinstrumenten</a></li>
            <li><a href="#rechten">Jouw rechten</a></li>
            <li><a href="#intrekken">Intrekken van toestemming en verwijderen van gegevens</a></li>
            <li><a href="#eigendom">Eigendom van klantgegevens</a></li>
            <li><a href="#minderjarigen">Minderjarigen</a></li>
            <li><a href="#datalekken">Datalekken en beveiligingsmeldingen</a></li>
            <li><a href="#wijzigingen">Wijzigingen in deze verklaring</a></li>
            <li><a href="#contact">Contact en klachten</a></li>
          </ol>
        </nav>

        {/* 1 */}
        <div id="wie" className="legal-section">
          <h2>1. Wie zijn wij?</h2>
          <p>
            Verwerkingsverantwoordelijke in de zin van de Algemene
            Verordening Gegevensbescherming, hierna: AVG, is:
          </p>
          <table style={tableStyle}>
            <tbody>
              <tr>
                <th style={thtd}>Verwerkingsverantwoordelijke</th>
                <td style={thtd}>
                  {COMPANY.legalName}, ingeschreven onder KvK-nummer{" "}
                  {COMPANY.kvk}
                </td>
              </tr>
              <tr>
                <th style={thtd}>Adres</th>
                <td style={thtd}>{fullAddress}</td>
              </tr>
              <tr>
                <th style={thtd}>E-mail</th>
                <td style={thtd}>
                  <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
                </td>
              </tr>
              <tr>
                <th style={thtd}>Telefoon</th>
                <td style={thtd}>{COMPANY.phone}</td>
              </tr>
              <tr>
                <th style={thtd}>Toezichthouder</th>
                <td style={thtd}>Autoriteit Persoonsgegevens</td>
              </tr>
            </tbody>
          </table>
          <p>
            In deze privacyverklaring verwijzen &quot;Get-Filly&quot;,
            &quot;wij&quot;, &quot;ons&quot; en &quot;onze&quot; naar
            Get-Filly. Wij zijn gevestigd in Nederland en vallen onder
            Nederlands recht en toezicht van de Autoriteit
            Persoonsgegevens.
          </p>
        </div>

        {/* 2 */}
        <div id="gegevens" className="legal-section">
          <h2>2. Welke gegevens verwerken wij?</h2>
          <p>
            Wij verwerken verschillende categorieën gegevens, afhankelijk
            van de manier waarop je Get-Filly gebruikt.
          </p>

          <h3>2.1 Gegevens over jou als gebruiker</h3>
          <p>
            Wanneer je een account aanmaakt, inlogt of gebruikmaakt van
            ons platform, verwerken wij onder meer:
          </p>
          <ul>
            <li>naam</li>
            <li>e-mailadres</li>
            <li>telefoonnummer, indien je dit zelf invult</li>
            <li>wachtwoord, versleuteld en gehasht opgeslagen</li>
            <li>rol binnen de onderneming, bijvoorbeeld eigenaar, manager of medewerker</li>
            <li>accountinstellingen</li>
            <li>tijdstippen van inloggen</li>
            <li>gebruiksgegevens binnen het platform</li>
            <li>communicatie met ons support- of salesteam</li>
          </ul>
          <p>
            Wij gebruiken deze gegevens onder meer om je account aan te
            maken, toegang tot het platform te geven, ondersteuning te
            bieden en onze dienstverlening veilig te houden.
          </p>

          <h3>2.2 Gegevens over jouw onderneming</h3>
          <p>
            Om Get-Filly goed te laten werken, verwerken wij gegevens over
            jouw onderneming. Dit kunnen onder meer zijn:
          </p>
          <ul>
            <li>naam van de onderneming</li>
            <li>type onderneming, bijvoorbeeld restaurant, hotel, lunchroom, wellnesslocatie of andere horecagelegenheid</li>
            <li>adres, vestigingsplaats en contactgegevens</li>
            <li>openingstijden</li>
            <li>website en publiek toegankelijke website-inhoud</li>
            <li>menukaart, keukenstijl, signatuurgerechten en prijsindicaties</li>
            <li>reserveringsmogelijkheden</li>
            <li>reserveringen, bezetting en bezoekmomenten, voor zover gekoppeld of ingevoerd</li>
            <li>reviewgegevens, ratings, foto&apos;s en teksten die zichtbaar zijn op eigen of externe kanalen</li>
            <li>online zichtbaarheid, vindbaarheid en aanwezigheid op externe platformen</li>
            <li>socialmediaprofielen en openbare socialmediacontent</li>
            <li>gekoppelde tools en integraties, uitsluitend wanneer je deze zelf activeert</li>
          </ul>

          <h3>2.3 Gegevens over jouw gasten</h3>
          <p>
            Wanneer je een reserveringssysteem koppelt, gastenlijsten
            importeert of marketingfunctionaliteiten binnen Get-Filly
            gebruikt, kunnen wij persoonsgegevens van jouw gasten
            verwerken.
          </p>
          <p>
            In die situatie ben jij als ondernemer in beginsel de
            verwerkingsverantwoordelijke in de zin van de AVG. Jij bepaalt
            welke persoonsgegevens van jouw gasten worden verzameld, voor
            welke doeleinden deze worden gebruikt en hoe lang deze worden
            bewaard.
          </p>
          <p>
            Get-Filly treedt hierbij op als verwerker. Wij verwerken
            persoonsgegevens van gasten uitsluitend in opdracht van jou
            als klant en volgens jouw instructies.
          </p>
          <p>
            Met klanten waarvoor wij persoonsgegevens van gasten
            verwerken, sluiten wij waar wettelijk vereist een
            verwerkersovereenkomst conform artikel 28 AVG.
          </p>
          <p>Persoonsgegevens van gasten kunnen onder meer bestaan uit:</p>
          <ul>
            <li>naam</li>
            <li>e-mailadres</li>
            <li>telefoonnummer</li>
            <li>reserveringshistorie</li>
            <li>bezoekfrequentie</li>
            <li>datum en tijdstip van reserveringen</li>
            <li>voorkeuren die door de ondernemer zijn vastgelegd, zoals dieetwensen, allergieën, favoriete tafel of speciale opmerkingen</li>
            <li>marketingvoorkeuren, indien van toepassing</li>
          </ul>
          <p>
            De ondernemer blijft verantwoordelijk voor het hebben van een
            geldige wettelijke grondslag voor deze verwerking en voor het
            informeren van gasten over het gebruik van hun
            persoonsgegevens. Get-Filly gebruikt persoonsgegevens van
            gasten niet voor eigen advertentiedoeleinden en verkoopt deze
            gegevens niet aan derden.
          </p>

          <h3>2.4 AI-gebruiksgegevens</h3>
          <p>
            Wanneer je AI-functionaliteiten van Get-Filly gebruikt,
            verwerken wij gegevens die nodig zijn om deze
            functionaliteiten uit te voeren, te beveiligen en te
            verbeteren. Dit kan onder meer bestaan uit:
          </p>
          <ul>
            <li>type AI-actie, bijvoorbeeld review-antwoord, campagnevoorstel, menu-analyse, website-analyse, chat of rapportage</li>
            <li>ingevoerde prompts, vragen, bestanden of context</li>
            <li>gegenereerde antwoorden</li>
            <li>gebruikte AI-modellen</li>
            <li>tokengebruik</li>
            <li>tijdstip van de aanvraag</li>
            <li>gekoppelde onderneming</li>
            <li>foutmeldingen en technische metadata</li>
          </ul>
          <p>
            Voor zover mogelijk beperken wij de hoeveelheid
            persoonsgegevens die naar AI-systemen wordt gestuurd.
          </p>

          <h3>2.5 Technische gegevens</h3>
          <p>
            Wanneer je onze website of ons platform gebruikt, verwerken
            wij automatisch bepaalde technische gegevens, zoals:
          </p>
          <ul>
            <li>IP-adres</li>
            <li>browser- en apparaattype</li>
            <li>besturingssysteem</li>
            <li>bezochte pagina&apos;s</li>
            <li>klikgedrag binnen het platform</li>
            <li>sessiegegevens</li>
            <li>foutmeldingen</li>
            <li>logbestanden</li>
            <li>beveiligingsgebeurtenissen</li>
          </ul>
          <p>
            Wij gebruiken deze gegevens voor beveiliging, foutopsporing,
            prestatieverbetering en misbruikpreventie.
          </p>

          <h3>2.6 Analyse van openbare bedrijfsinformatie</h3>
          <p>
            Get-Filly kan publiek toegankelijke bedrijfsinformatie
            analyseren om inzichten, scores en aanbevelingen te genereren.
            Dit kan onder meer betrekking hebben op:
          </p>
          <ul>
            <li>publiek toegankelijke websites</li>
            <li>technische websitegegevens, zoals title-tags, meta descriptions, laadsnelheid en structured data</li>
            <li>openbare reviews</li>
            <li>openbare bedrijfsvermeldingen</li>
            <li>openbare socialmediaprofielen</li>
            <li>openbare foto&apos;s en teksten</li>
            <li>zoekmachineresultaten</li>
            <li>platformvermeldingen zoals Google, TripAdvisor, TheFork, OpenTable of vergelijkbare diensten</li>
          </ul>
          <p>
            Deze analyses vinden plaats op basis van gegevens die publiek
            toegankelijk zijn of gegevens waarvoor de gebruiker
            toestemming heeft gegeven via een koppeling of integratie.
          </p>

          <h3>2.7 Betaal-, facturatie- en bankgegevens</h3>
          <p>
            Voor betalingen, facturatie en administratie verwerken wij
            gegevens die nodig zijn om abonnementen, facturen en
            betalingen af te handelen. Dit kan onder meer bestaan uit:
          </p>
          <ul>
            <li>factuurgegevens</li>
            <li>bedrijfsnaam en factuuradres</li>
            <li>betaalstatus</li>
            <li>transactie-ID&apos;s</li>
            <li>abonnementsgegevens</li>
            <li>laatste vier cijfers of beperkte betaalmethode-informatie wanneer beschikbaar via de betaalprovider</li>
            <li>banktransactiegegevens en betalingsreferenties voor administratie en reconciliatie</li>
          </ul>
          <p>
            Voor online betalingen maken wij gebruik van Stripe. Voor
            bankdiensten en zakelijke bankadministratie kunnen wij
            gebruikmaken van bunq B.V. Stripe en bunq kunnen voor bepaalde
            verwerkingen zelfstandig verwerkingsverantwoordelijke zijn,
            bijvoorbeeld voor wettelijke verplichtingen, fraudepreventie,
            beveiliging, betalingsverwerking en eigen administratieve
            verplichtingen.
          </p>
        </div>

        {/* 3 */}
        <div id="waarom" className="legal-section">
          <h2>3. Waarom verwerken wij deze gegevens?</h2>
          <p>
            Wij verwerken persoonsgegevens alleen wanneer daarvoor een
            wettelijke grondslag bestaat onder de AVG. Wanneer wij ons
            beroepen op gerechtvaardigd belang, wegen wij ons belang af
            tegen de privacybelangen van betrokkenen.
          </p>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thtd}>Doel</th>
                <th style={thtd}>Voorbeelden</th>
                <th style={thtd}>Rechtsgrond</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style={thtd}>Account aanmaken en beheren</td><td style={thtd}>login, gebruikersprofiel, rollen</td><td style={thtd}>uitvoering van de overeenkomst</td></tr>
              <tr><td style={thtd}>Dienstverlening leveren</td><td style={thtd}>AI-suggesties, campagnes, analyses, dashboards</td><td style={thtd}>uitvoering van de overeenkomst</td></tr>
              <tr><td style={thtd}>Health Scores en benchmarkrapportages</td><td style={thtd}>online zichtbaarheid, reviews, website-analyse</td><td style={thtd}>uitvoering van de overeenkomst en gerechtvaardigd belang</td></tr>
              <tr><td style={thtd}>Integraties koppelen</td><td style={thtd}>Google, Meta, reserveringssystemen, CRM</td><td style={thtd}>uitvoering van de overeenkomst en waar vereist toestemming</td></tr>
              <tr><td style={thtd}>Gastgegevens verwerken namens klant</td><td style={thtd}>reserveringsdata, gastenlijsten, marketingacties</td><td style={thtd}>verwerkersrol; klant bepaalt grondslag</td></tr>
              <tr><td style={thtd}>Betaling en facturatie</td><td style={thtd}>abonnementen, facturen, betaalstatus</td><td style={thtd}>uitvoering overeenkomst en wettelijke verplichting</td></tr>
              <tr><td style={thtd}>Bank- en administratieverwerking</td><td style={thtd}>banktransacties, reconciliatie, boekhouding</td><td style={thtd}>wettelijke verplichting en gerechtvaardigd belang</td></tr>
              <tr><td style={thtd}>Beveiliging en fraudepreventie</td><td style={thtd}>logs, IP-adres, misbruikdetectie</td><td style={thtd}>gerechtvaardigd belang</td></tr>
              <tr><td style={thtd}>Productverbetering</td><td style={thtd}>geaggregeerde of geanonimiseerde analyses</td><td style={thtd}>gerechtvaardigd belang</td></tr>
              <tr><td style={thtd}>Marketing naar gebruikers</td><td style={thtd}>nieuwsbrieven, productupdates</td><td style={thtd}>toestemming of gerechtvaardigd belang, afhankelijk van context</td></tr>
              <tr><td style={thtd}>Wettelijke administratie</td><td style={thtd}>fiscale bewaarplicht</td><td style={thtd}>wettelijke verplichting</td></tr>
            </tbody>
          </table>
        </div>

        {/* 4 */}
        <div id="analyses" className="legal-section">
          <h2>4. Geautomatiseerde analyses, Health Scores en profilering</h2>
          <p>
            Get-Filly analyseert gegevens over ondernemingen, online
            zichtbaarheid, reviews, websites, reserveringen,
            marketingactiviteiten en andere relevante signalen om
            inzichten en aanbevelingen te genereren. Hierbij kunnen
            automatisch berekende scores worden gebruikt, waaronder:
          </p>
          <ul>
            <li>Restaurant Health Scores</li>
            <li>Potentie Scores</li>
            <li>Opportunity Scores</li>
            <li>benchmarkrapportages</li>
            <li>zichtbaarheidsscores</li>
            <li>marketingaanbevelingen</li>
            <li>omzet- en bezettingsinzichten</li>
          </ul>
          <p>
            Deze scores zijn bedoeld om ondernemers inzicht te geven in
            hun digitale aanwezigheid, marketingpotentie en
            verbeterkansen. De scores zijn adviserend van aard. Zij leiden
            niet automatisch tot juridische, financiële of vergelijkbare
            significante gevolgen voor individuele personen.
          </p>
          <p>
            Get-Filly gebruikt deze scores niet om individuele gasten te
            beoordelen, te rangschikken of besluiten over hen te nemen.
            Gebruikers kunnen altijd aanvullende uitleg vragen over de
            manier waarop analyses en aanbevelingen tot stand komen.
          </p>
        </div>

        {/* 5 */}
        <div id="integraties" className="legal-section">
          <h2>5. Gebruik van externe integraties</h2>
          <p>
            Get-Filly kan worden gekoppeld aan externe diensten, waaronder
            onder meer: Google Business Profile, Google Analytics, Google
            Ads, Meta, Facebook, Instagram, TikTok, reserveringssystemen,
            CRM-systemen, e-mailmarketingplatformen, betaalsystemen en
            boekhoud- en bankdiensten.
          </p>
          <p>
            Wij verkrijgen uitsluitend toegang tot gegevens waarvoor de
            gebruiker toestemming heeft gegeven of die noodzakelijk zijn
            voor de door de gebruiker geactiveerde functionaliteit. Per
            integratie wordt binnen het platform waar mogelijk duidelijk
            aangegeven:
          </p>
          <ul>
            <li>welke gegevens worden opgehaald</li>
            <li>voor welk doel deze gegevens worden gebruikt</li>
            <li>welke rechten of permissions worden gevraagd</li>
            <li>hoe de koppeling kan worden ingetrokken</li>
          </ul>
          <p>
            Wij vragen geen toegang tot gegevens die niet nodig zijn voor
            de functionaliteit die wij aanbieden.
          </p>
        </div>

        {/* 6 */}
        <div id="google" className="legal-section">
          <h2>6. Gebruik van Google Business Profile-gegevens</h2>
          <p>
            Wanneer je ervoor kiest om jouw Google Business Profile te
            koppelen aan Get-Filly, verkrijgen wij via officiële Google
            API&apos;s toegang tot bepaalde gegevens uit jouw
            bedrijfsprofiel. Afhankelijk van de door jou verleende
            toestemming kunnen wij onder meer de volgende gegevens
            ophalen:
          </p>
          <ul>
            <li>bedrijfsnaam</li>
            <li>profielinformatie</li>
            <li>adres- en contactgegevens</li>
            <li>openingstijden</li>
            <li>categorieën en kenmerken van de onderneming</li>
            <li>reviews en beoordelingen</li>
            <li>foto&apos;s en mediabestanden</li>
            <li>locatiegegevens</li>
            <li>prestatie- en zichtbaarheidsgegevens, voor zover beschikbaar via de betreffende API</li>
          </ul>
          <p>
            Wij gebruiken Google Business Profile-gegevens uitsluitend
            voor het leveren, beheren en verbeteren van de
            functionaliteiten van Get-Filly waarvoor jij toestemming hebt
            gegeven. Dit kan onder meer bestaan uit:
          </p>
          <ul>
            <li>het berekenen van Health Scores, Potentie Scores en benchmarkrapportages;</li>
            <li>het analyseren van online zichtbaarheid, vindbaarheid, reviews, ratings, foto&apos;s, bedrijfsinformatie en profielactiviteit;</li>
            <li>het tonen van verbeteradviezen en optimalisatievoorstellen;</li>
            <li>het inzichtelijk maken van trends, historische ontwikkelingen en prestaties van jouw Google Business Profile;</li>
            <li>het voorbereiden en uitvoeren van optimalisaties aan jouw Google Business Profile, voor zover jij daarvoor expliciet toestemming geeft;</li>
            <li>het beantwoorden van reviews, handmatig of automatisch, indien deze functionaliteit door jou is geactiveerd;</li>
            <li>het opstellen, plannen of publiceren van Google Posts, aanbiedingen, updates of andere bedrijfscommunicatie, indien deze functionaliteit door jou is geactiveerd;</li>
            <li>het aanvullen, corrigeren of uniformeren van bedrijfsgegevens, zoals bedrijfsnaam, categorieën, openingstijden, contactgegevens, website, menu-informatie, diensten, attributen en beschrijvingen;</li>
            <li>het toevoegen, beheren of optimaliseren van foto&apos;s, menu-informatie, producten, diensten of andere profielonderdelen;</li>
            <li>het signaleren van ontbrekende, inconsistente of verouderde informatie in jouw bedrijfsprofiel;</li>
            <li>het monitoren van nieuwe reviews, wijzigingen, prestaties en andere relevante gebeurtenissen binnen jouw Google Business Profile;</li>
            <li>het vergelijken van jouw prestaties met vergelijkbare ondernemingen, uitsluitend op basis van geaggregeerde en geanonimiseerde gegevens die niet herleidbaar zijn tot een individuele andere onderneming.</li>
          </ul>
          <h3>6.1 Opslag en beveiliging van Google-gegevens</h3>
          <p>
            Gegevens die wij via de Google API&apos;s ophalen, worden
            versleuteld opgeslagen (zowel tijdens overdracht als in rust).
            Toegang tot deze gegevens is beperkt tot geautoriseerd personeel
            dat de gegevens nodig heeft voor het leveren van onze dienst.
            Get-Filly hanteert een multi-tenant architectuur waarbij de
            gegevens en toegangstokens van elke klant logisch gescheiden en
            geïsoleerd worden opgeslagen, zodat de gegevens van de ene
            onderneming nooit toegankelijk zijn voor een andere.
            Toegangstokens worden versleuteld bewaard en uitsluitend gebruikt
            voor de specifieke koppeling waarvoor jij toestemming hebt
            verleend.
          </p>

          <h3>6.2 Bewaartermijn</h3>
          <p>
            Wij bewaren de via Google opgehaalde gegevens niet langer dan
            noodzakelijk voor de hierboven beschreven doeleinden. Wanneer je
            een gekoppeld Google Business Profile ontkoppelt, worden de
            bijbehorende toegangstokens direct ingetrokken en worden de
            opgeslagen Google Business Profile-gegevens binnen 30 dagen uit
            onze systemen verwijderd, behoudens gegevens die wij wettelijk
            verplicht zijn langer te bewaren.
          </p>

          <h3>6.3 Verklaringen over het gebruik van Google-gegevens</h3>
          <ul>
            <li>Wij verkopen Google-gegevens niet aan derden.</li>
            <li>Wij gebruiken Google-gegevens niet voor advertentiedoeleinden van derden.</li>
            <li>Wij gebruiken Google-gegevens niet voor het trainen van publieke AI-modellen.</li>
            <li>Wij delen Google-gegevens niet met advertentienetwerken of databrokers.</li>
            <li>Wij wijzigen geen gegevens binnen jouw Google Business Profile zonder een expliciete handeling, goedkeuring, instelling of opdracht vanuit jou als gebruiker.</li>
          </ul>
          <p>
            Het gebruik en de overdracht van informatie die Get-Filly
            ontvangt via Google API&apos;s voldoet aan het Google API
            Services User Data Policy, inclusief de Limited Use-vereisten.
          </p>
          <p>
            <em>
              Get-Filly&apos;s use and transfer of information received from
              Google APIs adheres to the Google API Services User Data
              Policy, including the Limited Use requirements.
            </em>
          </p>
          <p>
            Voor functionaliteiten waarbij Get-Filly automatisch handelingen
            kan uitvoeren, zoals het beantwoorden van reviews, het publiceren
            van posts of het aanpassen van profielgegevens, geldt dat deze
            alleen worden uitgevoerd wanneer jij deze functionaliteit bewust
            activeert of daarvoor vooraf toestemming geeft.
          </p>

          <h3>6.4 Google-toegang intrekken</h3>
          <p>
            Je kunt een gekoppeld Google Business Profile op ieder moment
            ontkoppelen via het Get-Filly-dashboard of via jouw
            Google-account. Na ontkoppeling halen wij geen nieuwe gegevens
            meer op via die koppeling en worden gekoppelde tokens ingetrokken
            of verwijderd zoals hierboven beschreven.
          </p>
          <p>
            Daarnaast kun je de verleende toestemming rechtstreeks beheren of
            intrekken via jouw Google-account:{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
            >
              myaccount.google.com/permissions
            </a>
            . Het intrekken van toestemming heeft geen invloed op gegevens
            die reeds rechtmatig zijn verwerkt voor het moment van
            intrekking.
          </p>
        </div>

        {/* 7 */}
        <div id="meta" className="legal-section">
          <h2>7. Gebruik van Meta-, Facebook- en Instagram-gegevens</h2>
          <p>
            Wanneer je ervoor kiest om jouw Meta-, Facebook- of
            Instagram-account te koppelen aan Get-Filly, verkrijgen wij
            uitsluitend toegang tot gegevens en functionaliteiten waarvoor
            jij toestemming hebt gegeven via de officiële Meta API&apos;s.
          </p>
          <p>
            Afhankelijk van de gekoppelde integratie kunnen wij onder meer
            toegang krijgen tot:
          </p>
          <ul>
            <li>accountnaam en profielinformatie;</li>
            <li>bedrijfsinformatie van gekoppelde Facebook- of Instagram-pagina&apos;s;</li>
            <li>gekoppelde pagina&apos;s, Instagram Business-accounts en bedrijfsassets waarvoor jij beheerrechten hebt;</li>
            <li>openbare berichten, posts, stories, reels, foto&apos;s en video&apos;s;</li>
            <li>concepten, geplande content of gepubliceerde content, voor zover beschikbaar via de betreffende API;</li>
            <li>reacties, opmerkingen, likes, shares en andere engagementgegevens;</li>
            <li>volgers-, bereik- en prestatiestatistieken;</li>
            <li>campagne-, content- en doelgroepinzichten, voor zover beschikbaar via de betreffende API;</li>
            <li>berichten, reacties of andere interacties, indien jij daarvoor expliciet toestemming geeft en deze functionaliteit door Get-Filly wordt ondersteund;</li>
            <li>technische metadata die nodig is om de koppeling veilig en correct te laten werken.</li>
          </ul>
          <p>
            Wij gebruiken deze gegevens en functionaliteiten uitsluitend
            voor het leveren, beheren en verbeteren van de
            Get-Filly-functionaliteiten waarvoor jij toestemming hebt
            gegeven. Dit kan onder meer bestaan uit:
          </p>
          <ul>
            <li>het berekenen van Health Scores, Potentie Scores en benchmarkrapportages;</li>
            <li>het inzichtelijk maken van socialmediaprestaties, bereik, engagement, contentactiviteit en groeikansen;</li>
            <li>het analyseren van online zichtbaarheid, contentkwaliteit, postfrequentie en doelgroepinteractie;</li>
            <li>het tonen van marketinginzichten, verbeteradviezen en optimalisatievoorstellen;</li>
            <li>het voorbereiden, genereren en verbeteren van socialmedia-content met behulp van AI;</li>
            <li>het opstellen, plannen en publiceren van Facebook- en Instagram-posts, stories, reels, updates of andere content namens jouw onderneming, indien jij deze functionaliteit activeert;</li>
            <li>het aanpassen, aanvullen of verwijderen van concepten, geplande posts of content, uitsluitend wanneer jij daarvoor opdracht geeft;</li>
            <li>het beantwoorden, modereren of beheren van reacties of interacties, indien jij deze functionaliteit activeert;</li>
            <li>het monitoren van prestaties van gepubliceerde content;</li>
            <li>het vergelijken van jouw socialmediaprestaties met vergelijkbare ondernemingen, voor zover dit gebeurt op basis van toegestane, geaggregeerde of rechtmatig verkregen gegevens;</li>
            <li>het signaleren van ontbrekende, inconsistente of verouderde informatie op gekoppelde Facebook- of Instagram-profielen.</li>
          </ul>
          <p>Wij verkopen Meta-, Facebook- of Instagram-gegevens niet aan derden.</p>
          <p>Wij gebruiken deze gegevens niet voor advertentiedoeleinden van derden.</p>
          <p>Wij gebruiken deze gegevens niet voor het trainen van publieke AI-modellen.</p>
          <p>Wij delen deze gegevens niet met advertentienetwerken of databrokers.</p>
          <p>
            Wij publiceren, wijzigen, plannen, beantwoorden, modereren of
            verwijderen geen content op jouw Meta-, Facebook- of
            Instagram-account zonder een expliciete handeling, goedkeuring,
            instelling of opdracht vanuit jou als gebruiker.
          </p>
          <p>
            Voor functionaliteiten waarbij Get-Filly automatisch
            handelingen kan uitvoeren, zoals het publiceren van vooraf
            goedgekeurde posts, het plannen van content of het beantwoorden
            van reacties, geldt dat deze alleen worden uitgevoerd wanneer
            jij deze functionaliteit bewust activeert of daarvoor vooraf
            toestemming geeft.
          </p>
          <p>
            Wanneer content via Get-Filly op Facebook, Instagram of andere
            Meta-platformen wordt gepubliceerd, gebeurt dit namens de
            gekoppelde onderneming of het gekoppelde account van de klant.
            De klant blijft verantwoordelijk voor de inhoud, juistheid,
            timing, rechtmatigheid en gevolgen van gepubliceerde content.
          </p>
          <p>
            Je kunt een gekoppelde Meta-, Facebook- of Instagram-integratie
            op ieder moment verwijderen via het Get-Filly-dashboard of via
            de instellingen van jouw Meta-, Facebook- of Instagram-account.
            Na ontkoppeling halen wij geen nieuwe gegevens meer op via die
            koppeling en worden gekoppelde tokens ingetrokken of verwijderd
            volgens ons bewaarbeleid.
          </p>
          <p>
            Wanneer Meta een verzoek tot gegevensverwijdering aan
            Get-Filly doorgeeft, of wanneer jij ons zelf verzoekt om
            verwijdering, verwijderen wij de aan de betreffende
            Meta-integratie gekoppelde gegevens, tenzij wij wettelijk
            verplicht zijn bepaalde gegevens langer te bewaren.
          </p>
        </div>

        {/* 8 */}
        <div id="ai" className="legal-section">
          <h2>8. Gebruik van AI-systemen, Claude Code en Anthropic</h2>
          <p>
            Get-Filly maakt gebruik van AI-systemen om functionaliteiten
            mogelijk te maken zoals: antwoordgeneratie binnen het
            Filly-model, campagnevoorstellen, review-antwoorden,
            menu-analyses, website-analyses, rapportages,
            chatfunctionaliteiten, interne kwaliteitscontrole en code- en
            ontwikkelondersteuning.
          </p>
          <p>
            Voor deze functionaliteiten kunnen wij gebruikmaken van
            diensten van Anthropic, PBC, waaronder Claude, Claude Code
            en/of de Anthropic API.
          </p>
          <p>
            Wanneer je AI-functionaliteiten gebruikt, kunnen de inhoud van
            jouw vraag, relevante bedrijfscontext, bestanden, prompts,
            instructies, gegenereerde antwoorden en technische metadata
            worden verstuurd naar en verwerkt in systemen van Anthropic.
            Dit betekent dat gegevens die nodig zijn voor antwoordgeneratie
            technisch terecht kunnen komen in de systemen, opslagomgevingen
            of databases van Anthropic, voor zover noodzakelijk om de
            AI-dienst te leveren, beveiliging te waarborgen, misbruik te
            detecteren of te voldoen aan toepasselijke voorwaarden en
            wettelijke verplichtingen.
          </p>
          <p>
            Voor zover wij Claude Code gebruiken voor antwoordgeneratie,
            analyse of ontwikkelondersteuning binnen het Filly-model,
            geldt dezelfde beperking: wij verstrekken alleen gegevens die
            redelijkerwijs noodzakelijk zijn voor de betreffende
            functionaliteit en proberen persoonsgegevens zoveel mogelijk te
            beperken of te pseudonimiseren.
          </p>

          <h3>8.1 Geen training van publieke AI-modellen</h3>
          <p>
            Get-Filly gebruikt klantgegevens niet om publieke AI-modellen
            te trainen. Voor zover wij externe AI-leveranciers gebruiken,
            doen wij dat uitsluitend onder voorwaarden die passen bij
            zakelijke dienstverlening en gegevensbescherming. Wij staan
            niet toe dat klantgegevens worden gebruikt voor het trainen van
            publieke AI-modellen, tenzij een klant daar afzonderlijk,
            vooraf en uitdrukkelijk mee instemt.
          </p>

          <h3>8.2 Menselijke controle</h3>
          <p>
            AI-output kan fouten bevatten, onvolledig zijn of gebaseerd
            zijn op onjuiste context. Gebruikers blijven zelf
            verantwoordelijk voor het controleren van AI-output voordat zij
            deze gebruiken voor:
          </p>
          <ul>
            <li>marketingcampagnes</li>
            <li>communicatie met gasten</li>
            <li>publicatie op websites of socialmediakanalen</li>
            <li>zakelijke beslissingen</li>
            <li>prijs-, menu- of operationele keuzes</li>
          </ul>
          <p>
            Get-Filly garandeert niet dat AI-output altijd volledig,
            accuraat, actueel of geschikt is voor een specifiek doel.
          </p>
        </div>

        {/* 9 */}
        <div id="delen" className="legal-section">
          <h2>9. Met wie delen wij gegevens?</h2>
          <p>
            Wij delen persoonsgegevens alleen met partijen wanneer dat
            noodzakelijk is voor het leveren van onze diensten, wanneer jij
            een integratie activeert, of wanneer wij daartoe wettelijk
            verplicht zijn.
          </p>

          <h3>9.1 Subverwerkers en dienstverleners</h3>
          <p>
            Met partijen die als verwerker optreden, sluiten wij waar
            vereist een verwerkersovereenkomst. Sommige partijen, zoals
            Stripe, bunq, Google en Meta, kunnen voor bepaalde verwerkingen
            ook als zelfstandig verwerkingsverantwoordelijke optreden,
            bijvoorbeeld voor wettelijke verplichtingen, fraudecontrole,
            beveiliging, betalingstransacties, platformbeheer of eigen
            dienstverlening. In dat geval is ook hun eigen privacybeleid
            van toepassing.
          </p>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thtd}>Partij</th>
                <th style={thtd}>Functie</th>
                <th style={thtd}>Locatie / doorgifte</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style={thtd}>Supabase, Inc.</td><td style={thtd}>Database, authenticatie en bestandsopslag</td><td style={thtd}>EU-regio waar mogelijk</td></tr>
              <tr><td style={thtd}>Anthropic, PBC</td><td style={thtd}>AI-modellen, Claude, Claude Code, antwoordgeneratie en analyse</td><td style={thtd}>Verenigde Staten / internationaal, met passende waarborgen</td></tr>
              <tr><td style={thtd}>Resend, Inc.</td><td style={thtd}>Transactionele en marketing-e-mails</td><td style={thtd}>EU/Verenigde Staten, afhankelijk van configuratie</td></tr>
              <tr><td style={thtd}>Vercel, Inc.</td><td style={thtd}>Hosting van website en dashboard</td><td style={thtd}>EU-regio waar mogelijk / internationaal</td></tr>
              <tr><td style={thtd}>Stripe</td><td style={thtd}>Betalingen, betaalstatussen, abonnementen en facturatie</td><td style={thtd}>EU/Verenigde Staten / internationaal</td></tr>
              <tr><td style={thtd}>bunq B.V.</td><td style={thtd}>Bankdiensten, zakelijke rekening, betalingsadministratie</td><td style={thtd}>Nederland/EU</td></tr>
              <tr><td style={thtd}>Google</td><td style={thtd}>Alleen wanneer gebruiker Google-integratie activeert</td><td style={thtd}>Afhankelijk van Google-diensten en instellingen</td></tr>
              <tr><td style={thtd}>Meta Platforms</td><td style={thtd}>Alleen wanneer gebruiker Meta-, Facebook- of Instagram-integratie activeert</td><td style={thtd}>Afhankelijk van Meta-diensten en instellingen</td></tr>
            </tbody>
          </table>
          <p>
            Wij verkopen geen persoonsgegevens. Wij delen geen
            persoonsgegevens met advertentienetwerken van derden voor
            eigen advertentiedoeleinden.
          </p>
        </div>

        {/* 10 */}
        <div id="buitenland" className="legal-section">
          <h2>10. Doorgifte buiten de Europese Economische Ruimte</h2>
          <p>
            Sommige dienstverleners of platforms die wij gebruiken zijn
            gevestigd buiten de Europese Economische Ruimte, bijvoorbeeld
            in de Verenigde Staten. Wanneer persoonsgegevens buiten de
            Europese Economische Ruimte worden doorgegeven, zorgen wij voor
            een passend doorgiftemechanisme. Afhankelijk van de situatie
            kan dit zijn:
          </p>
          <ul>
            <li>een adequaatheidsbesluit van de Europese Commissie</li>
            <li>certificering onder het EU-U.S. Data Privacy Framework</li>
            <li>EU-standaardcontractbepalingen</li>
            <li>aanvullende technische en organisatorische maatregelen</li>
            <li>een andere geldige grondslag onder de AVG</li>
          </ul>
          <p>
            Wij beoordelen per leverancier welke waarborgen van toepassing
            zijn en leggen deze waar nodig contractueel vast.
          </p>
        </div>

        {/* 11 */}
        <div id="bewaartermijn" className="legal-section">
          <h2>11. Hoe lang bewaren wij gegevens?</h2>
          <p>
            Wij bewaren persoonsgegevens niet langer dan noodzakelijk voor
            de doeleinden waarvoor zij zijn verzameld, tenzij wij wettelijk
            verplicht zijn gegevens langer te bewaren. Na afloop van de
            bewaartermijnen verwijderen of anonimiseren wij gegevens.
            Geaggregeerde en anonieme statistieken, die niet herleidbaar
            zijn tot individuele personen of klanten, kunnen langer worden
            bewaard voor productverbetering, benchmarking en trendanalyse.
          </p>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thtd}>Soort gegevens</th>
                <th style={thtd}>Bewaartermijn</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style={thtd}>Accountgegevens</td><td style={thtd}>duur van het abonnement + maximaal 1 jaar na beëindiging</td></tr>
              <tr><td style={thtd}>Gasten-gegevens van klanten</td><td style={thtd}>volgens instellingen van de klant; standaard maximaal 2 jaar na laatste bezoek</td></tr>
              <tr><td style={thtd}>Reserverings-, review- en campagneresultaten</td><td style={thtd}>duur van het abonnement + maximaal 1 jaar</td></tr>
              <tr><td style={thtd}>Health Score- en benchmarkgegevens</td><td style={thtd}>duur van het abonnement + maximaal 1 jaar</td></tr>
              <tr><td style={thtd}>OAuth-tokens en integratiegegevens</td><td style={thtd}>zolang de integratie actief is; na ontkoppeling worden tokens ingetrokken of verwijderd</td></tr>
              <tr><td style={thtd}>Google- en Meta-integratiegegevens</td><td style={thtd}>zolang noodzakelijk voor de gekoppelde functionaliteit of tot verwijdering/ontkoppeling</td></tr>
              <tr><td style={thtd}>AI-gebruikslogs</td><td style={thtd}>maximaal 24 maanden voor kostenbeheersing, beveiliging en foutopsporing</td></tr>
              <tr><td style={thtd}>AI-inhoud bij externe AI-leveranciers</td><td style={thtd}>volgens de contractuele voorwaarden en bewaartermijnen van de betreffende leverancier</td></tr>
              <tr><td style={thtd}>Facturen en betaaladministratie</td><td style={thtd}>7 jaar vanwege fiscale bewaarplicht</td></tr>
              <tr><td style={thtd}>Bank- en betalingsgegevens</td><td style={thtd}>zolang nodig voor administratie, reconciliatie en wettelijke verplichtingen</td></tr>
              <tr><td style={thtd}>Beveiligingslogs en foutmeldingen</td><td style={thtd}>maximaal 12 maanden, tenzij langer nodig voor onderzoek</td></tr>
              <tr><td style={thtd}>Marketingvoorkeuren</td><td style={thtd}>totdat je je uitschrijft, plus registratie van intrekking waar nodig</td></tr>
            </tbody>
          </table>
        </div>

        {/* 12 */}
        <div id="beveiliging" className="legal-section">
          <h2>12. Hoe beveiligen wij gegevens?</h2>
          <p>
            Wij nemen passende technische en organisatorische maatregelen
            om persoonsgegevens te beschermen tegen verlies, misbruik,
            onbevoegde toegang, openbaarmaking, wijziging of vernietiging.
            Onze maatregelen omvatten onder meer:
          </p>
          <ul>
            <li>versleuteling onderweg via TLS</li>
            <li>versleuteling van gevoelige gegevens waar passend</li>
            <li>hashing van wachtwoorden</li>
            <li>toegangscontrole op basis van rollen</li>
            <li>row-level-security of vergelijkbare scheiding tussen klantomgevingen</li>
            <li>logging van belangrijke acties</li>
            <li>beperking van toegang tot productieomgevingen</li>
            <li>beveiligde opslag van API-sleutels, OAuth-tokens en secrets</li>
            <li>periodieke back-ups</li>
            <li>beveiligingsmonitoring</li>
            <li>interne procedures voor incidenten en datalekken</li>
            <li>verwerkersovereenkomsten met relevante leveranciers</li>
          </ul>
          <p>
            OAuth-tokens en API-sleutels worden beveiligd opgeslagen en
            zijn alleen toegankelijk voor systemen en medewerkers die deze
            nodig hebben voor de uitvoering van de dienstverlening.
          </p>
        </div>

        {/* 13 */}
        <div id="cookies" className="legal-section">
          <h2>13. Cookies en meetinstrumenten</h2>
          <p>
            Wij gebruiken functionele cookies die noodzakelijk zijn om onze
            website en het platform goed te laten werken, bijvoorbeeld voor
            login, sessiebeheer en beveiliging.
          </p>
          <p>
            Voor niet-noodzakelijke cookies, zoals analytische cookies of
            marketingcookies, vragen wij toestemming waar dat wettelijk
            vereist is. Wanneer wij in de toekomst tools gebruiken zoals
            Google Analytics, Meta Pixel, TikTok Pixel of vergelijkbare
            trackingtechnologieën, zullen wij dit duidelijk melden in onze
            cookieverklaring en waar nodig vooraf toestemming vragen.
          </p>
          <p>
            Wij plaatsen geen trackingcookies van derden voor
            advertentiedoeleinden zonder geldige toestemming.
          </p>
        </div>

        {/* 14 */}
        <div id="rechten" className="legal-section">
          <h2>14. Jouw rechten</h2>
          <p>
            Onder de AVG heb je verschillende rechten met betrekking tot
            jouw persoonsgegevens. Je hebt onder meer recht op:
          </p>
          <ul>
            <li>inzage in de persoonsgegevens die wij van jou verwerken</li>
            <li>correctie van onjuiste of onvolledige gegevens</li>
            <li>verwijdering van gegevens</li>
            <li>beperking van de verwerking</li>
            <li>overdraagbaarheid van gegevens</li>
            <li>bezwaar tegen verwerking op basis van gerechtvaardigd belang</li>
            <li>intrekking van eerder gegeven toestemming</li>
            <li>menselijke tussenkomst wanneer sprake zou zijn van uitsluitend geautomatiseerde besluitvorming met juridische of vergelijkbare significante gevolgen</li>
          </ul>
          <p>
            Je kunt een verzoek indienen via:{" "}
            <a href={`mailto:${COMPANY.privacyEmail}`}>
              {COMPANY.privacyEmail}
            </a>
            . Wij reageren in beginsel binnen 30 dagen.
          </p>
          <p>
            Wanneer een verzoek betrekking heeft op persoonsgegevens van
            gasten die wij namens een klant verwerken, kunnen wij het
            verzoek doorsturen naar de betreffende klant of in overleg met
            de klant behandelen, omdat de klant in die situatie
            verwerkingsverantwoordelijke is.
          </p>
        </div>

        {/* 15 */}
        <div id="intrekken" className="legal-section">
          <h2>15. Intrekken van toestemming en verwijderen van gegevens</h2>
          <p>
            Je kunt toestemming voor integraties of gegevensverwerking
            intrekken door:
          </p>
          <ul>
            <li>een integratie te verwijderen in het Get-Filly-dashboard</li>
            <li>toegang in te trekken via het externe platform, zoals Google, Meta, Facebook of Instagram</li>
            <li>
              contact met ons op te nemen via{" "}
              <a href={`mailto:${COMPANY.privacyEmail}`}>
                {COMPANY.privacyEmail}
              </a>
            </li>
          </ul>
          <p>
            Na intrekking van een integratie halen wij geen nieuwe gegevens
            meer op via die koppeling. Reeds verwerkte gegevens verwijderen
            wij wanneer daar een geldig verzoek voor wordt ingediend,
            tenzij wij deze gegevens nog moeten bewaren vanwege wettelijke
            verplichtingen, contractuele verplichtingen, beveiliging,
            geschillen of legitieme administratieve redenen.
          </p>
        </div>

        {/* 16 */}
        <div id="eigendom" className="legal-section">
          <h2>16. Eigendom van klantgegevens</h2>
          <p>
            Gegevens die door klanten worden aangeleverd of via koppelingen
            namens klanten worden verwerkt, blijven eigendom van de
            betreffende klant of rechthebbende partij. Get-Filly verkrijgt
            uitsluitend de gebruiksrechten die nodig zijn om de
            overeengekomen dienstverlening uit te voeren. Get-Filly claimt
            geen eigendom over:
          </p>
          <ul>
            <li>reserveringsgegevens</li>
            <li>gastgegevens</li>
            <li>klantlijsten</li>
            <li>marketingcampagnes</li>
            <li>foto&apos;s</li>
            <li>reviews</li>
            <li>rapportages</li>
            <li>bedrijfsgegevens</li>
            <li>gekoppelde platformgegevens</li>
          </ul>
        </div>

        {/* 17 */}
        <div id="minderjarigen" className="legal-section">
          <h2>17. Minderjarigen</h2>
          <p>
            Onze diensten zijn gericht op zakelijke gebruikers en niet
            bedoeld voor personen jonger dan 16 jaar. Wij verzamelen niet
            bewust persoonsgegevens van minderjarigen als directe
            gebruikers van ons platform. Wanneer gegevens van minderjarigen
            voorkomen in gastgegevens van een klant, verwerkt Get-Filly
            deze uitsluitend als verwerker in opdracht van de betreffende
            klant.
          </p>
        </div>

        {/* 18 */}
        <div id="datalekken" className="legal-section">
          <h2>18. Datalekken en beveiligingsmeldingen</h2>
          <p>
            Wanneer zich een beveiligingsincident voordoet dat gevolgen kan
            hebben voor persoonsgegevens, handelen wij conform onze interne
            datalekprocedure en de toepasselijke wettelijke meldplichten.
            Indien nodig melden wij een datalek bij de Autoriteit
            Persoonsgegevens en/of informeren wij betrokkenen.
          </p>
          <p>
            Ontdek je een kwetsbaarheid of beveiligingsprobleem? Meld dit
            dan via{" "}
            <a href={`mailto:${COMPANY.securityEmail}`}>
              {COMPANY.securityEmail}
            </a>{" "}
            met als onderwerp &quot;Beveiligingsmelding&quot;. Wij nemen
            beveiligingsmeldingen serieus en onderzoeken meldingen zo
            spoedig mogelijk.
          </p>
        </div>

        {/* 19 */}
        <div id="wijzigingen" className="legal-section">
          <h2>19. Wijzigingen in deze verklaring</h2>
          <p>
            Wij kunnen deze privacyverklaring van tijd tot tijd wijzigen,
            bijvoorbeeld wanneer wij nieuwe functionaliteiten toevoegen,
            nieuwe integraties aanbieden, andere leveranciers gebruiken of
            wanneer wet- en regelgeving verandert. Bij materiële
            wijzigingen informeren wij bestaande klanten via e-mail, het
            dashboard of een andere passende manier. De datum bovenaan deze
            verklaring geeft aan wanneer de verklaring voor het laatst is
            bijgewerkt.
          </p>
        </div>

        {/* 20 */}
        <div id="contact" className="legal-section">
          <h2>20. Contact en klachten</h2>
          <p>
            Voor vragen over deze privacyverklaring, privacyverzoeken of
            zorgen over de verwerking van persoonsgegevens kun je contact
            opnemen met:
          </p>
          <ul>
            <li>{COMPANY.legalName}</li>
            <li>Adres: {fullAddress}</li>
            <li>
              E-mail:{" "}
              <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
            </li>
            <li>Telefoon: {COMPANY.phone}</li>
            <li>KvK: {COMPANY.kvk}</li>
          </ul>
          <p>
            Ben je het niet eens met hoe wij jouw persoonsgegevens
            verwerken en komen we er samen niet uit? Dan heb je het recht
            om een klacht in te dienen bij de Autoriteit Persoonsgegevens:{" "}
            <a
              href="https://autoriteitpersoonsgegevens.nl"
              target="_blank"
              rel="noopener noreferrer"
            >
              autoriteitpersoonsgegevens.nl
            </a>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
