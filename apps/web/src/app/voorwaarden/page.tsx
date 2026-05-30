// ============================================================
// Algemene voorwaarden, /voorwaarden
// ============================================================
// Publieke pagina met de algemene voorwaarden (B2B). De volledige
// tekst is per 2026-05-30 vervangen door de aangeleverde
// conceptversie (afgestemd op SaaS, OAuth-koppelingen, Google/Meta,
// Stripe, bunq en Anthropic/Claude).
//
// Bedrijfsgegevens + aansprakelijkheidslimiet + bevoegde rechtbank
// komen uit `apps/web/src/config/company.ts`.
// ============================================================

import type { Metadata } from "next";
import { COMPANY, formatFullAddress } from "@/config/company";

export const metadata: Metadata = {
  title: "Algemene voorwaarden, Get-Filly",
  description:
    "De algemene voorwaarden voor het gebruik van het Get-Filly-platform.",
};

const LAST_UPDATED = "30 mei 2026";

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

export default function VoorwaardenPage() {
  const fullAddress = formatFullAddress();

  return (
    <section className="legal-page">
      <div className="legal-container">
        <p className="legal-meta">Laatst bijgewerkt: {LAST_UPDATED}</p>
        <h1 className="legal-title">Algemene voorwaarden Get-Filly</h1>

        <nav className="legal-toc" aria-label="Inhoudsopgave">
          <div className="legal-toc-title">Inhoud</div>
          <ol>
            <li><a href="#definities">Definities</a></li>
            <li><a href="#toepasselijkheid">Toepasselijkheid</a></li>
            <li><a href="#totstandkoming">Aanbod en totstandkoming van de overeenkomst</a></li>
            <li><a href="#dienst">Onze dienst</a></li>
            <li><a href="#account">Account en verantwoordelijkheden van de klant</a></li>
            <li><a href="#platformen">Externe platformen en OAuth-koppelingen</a></li>
            <li><a href="#google">Google Business Profile en Google API&apos;s</a></li>
            <li><a href="#meta">Meta, Facebook en Instagram</a></li>
            <li><a href="#betaling">Abonnement, prijzen en betaling</a></li>
            <li><a href="#duur">Duur, opzegging en verwijdering van integratiegegevens</a></li>
            <li><a href="#data">Data-eigendom en verwerking</a></li>
            <li><a href="#ip">Intellectueel eigendom</a></li>
            <li><a href="#rangorde">Rangorde van documenten</a></li>
            <li><a href="#aansprakelijkheid">Aansprakelijkheid</a></li>
            <li><a href="#geheimhouding">Geheimhouding</a></li>
            <li><a href="#overmacht">Overmacht</a></li>
            <li><a href="#wijzigingen">Wijzigingen in deze voorwaarden</a></li>
            <li><a href="#recht">Toepasselijk recht en geschillen</a></li>
          </ol>
        </nav>

        {/* 1 */}
        <div id="definities" className="legal-section">
          <h2>1. Definities</h2>
          <p>In deze algemene voorwaarden wordt verstaan onder:</p>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thtd}>Begrip</th>
                <th style={thtd}>Betekenis</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={thtd}>Get-Filly / wij / ons</td>
                <td style={thtd}>
                  {COMPANY.legalName}, ingeschreven bij de Kamer van
                  Koophandel onder nummer {COMPANY.kvk}, gevestigd aan de{" "}
                  {fullAddress}, bereikbaar via{" "}
                  <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>{" "}
                  en {COMPANY.phone}.
                </td>
              </tr>
              <tr><td style={thtd}>Klant / jij / je</td><td style={thtd}>De natuurlijke persoon of rechtspersoon die met Get-Filly een overeenkomst sluit voor het gebruik van het Platform, handelend in de uitoefening van beroep of bedrijf.</td></tr>
              <tr><td style={thtd}>Gebruiker</td><td style={thtd}>Een persoon die door of namens de Klant toegang krijgt tot het Platform.</td></tr>
              <tr><td style={thtd}>Platform</td><td style={thtd}>De website, applicatie, dashboardomgeving, API-koppelingen en bijbehorende diensten van Get-Filly, bereikbaar via get-filly.com en app.get-filly.com.</td></tr>
              <tr><td style={thtd}>Filly</td><td style={thtd}>De AI-assistent binnen het Platform, die gebruik kan maken van AI-modellen en AI-diensten van derden, waaronder Anthropic, Claude, Claude Code en/of de Anthropic API.</td></tr>
              <tr><td style={thtd}>Account</td><td style={thtd}>Het persoonlijke toegangsprofiel van een Gebruiker tot het Platform.</td></tr>
              <tr><td style={thtd}>Abonnement</td><td style={thtd}>De door de Klant gekozen betaalde dienstverlening met bijbehorende periode, prijs en functionaliteiten.</td></tr>
              <tr><td style={thtd}>Gastgegevens</td><td style={thtd}>Persoonsgegevens van gasten, klanten of eindgebruikers van de Klant die via het Platform worden verwerkt.</td></tr>
              <tr><td style={thtd}>Externe Platformen</td><td style={thtd}>Diensten van derden waarmee het Platform kan worden gekoppeld, waaronder Google, Google Business Profile, Meta, Facebook, Instagram, TikTok, reserveringssystemen, CRM-systemen, e-mailmarketingplatformen, betaalproviders, bankdiensten en andere softwarediensten van derden.</td></tr>
              <tr><td style={thtd}>OAuth-koppeling</td><td style={thtd}>Een door de Klant of Gebruiker geautoriseerde technische koppeling waarbij Get-Filly via een externe aanbieder, zoals Google of Meta, toegang krijgt tot bepaalde gegevens of functionaliteiten zonder dat de Klant zijn wachtwoord aan Get-Filly verstrekt.</td></tr>
              <tr><td style={thtd}>Integratiegegevens</td><td style={thtd}>Gegevens die via een Extern Platform worden opgehaald of verwerkt, waaronder profielgegevens, bedrijfsgegevens, reviews, ratings, foto&apos;s, socialmedia-statistieken, pagina-informatie, content, engagementgegevens, reserveringsgegevens, tokens, API-responses en technische metadata.</td></tr>
              <tr><td style={thtd}>Platformvoorwaarden van derden</td><td style={thtd}>De voorwaarden, policies, developer policies, API-voorwaarden en andere regels van Externe Platformen die van toepassing zijn op het gebruik van hun diensten, waaronder de Google API Services User Data Policy, Google OAuth 2.0 Policies, Meta Platform Terms en Meta Developer Policies.</td></tr>
              <tr><td style={thtd}>Verwerkersovereenkomst</td><td style={thtd}>De overeenkomst als bedoeld in artikel 28 AVG waarin afspraken worden gemaakt over de verwerking van persoonsgegevens door Get-Filly als verwerker namens de Klant.</td></tr>
            </tbody>
          </table>
        </div>

        {/* 2 */}
        <div id="toepasselijkheid" className="legal-section">
          <h2>2. Toepasselijkheid</h2>
          <p>
            Deze voorwaarden zijn van toepassing op alle aanbiedingen van
            en overeenkomsten met Get-Filly en op ieder gebruik van het
            Platform, ongeacht of de Klant een betaald abonnement heeft.
          </p>
          <p>
            Afwijkingen van deze voorwaarden zijn alleen geldig als wij die
            schriftelijk met de Klant hebben bevestigd. Algemene
            inkoopvoorwaarden of andere voorwaarden van de Klant worden
            uitdrukkelijk van de hand gewezen.
          </p>
          <p>
            De dienstverlening van Get-Filly is uitsluitend bedoeld voor
            zakelijk gebruik (B2B). Consumenten zijn geen doelgroep van ons
            aanbod.
          </p>
          <p>
            Voor zover voor specifieke functionaliteiten aanvullende
            voorwaarden gelden, bijvoorbeeld voorwaarden van Externe
            Platformen, blijven die aanvullende voorwaarden naast deze
            algemene voorwaarden van toepassing.
          </p>
        </div>

        {/* 3 */}
        <div id="totstandkoming" className="legal-section">
          <h2>3. Aanbod en totstandkoming van de overeenkomst</h2>
          <p>
            Alle aanbiedingen op onze website zijn vrijblijvend, tenzij
            uitdrukkelijk anders is vermeld.
          </p>
          <p>
            De overeenkomst komt tot stand op het moment dat de Klant een
            account aanmaakt, een abonnement kiest en akkoord gaat met deze
            voorwaarden, of op het moment dat wij een schriftelijk voorstel
            door de Klant laten ondertekenen of bevestigen.
          </p>
          <p>
            Voor zover een aanbieding, prijsopgave, websitevermelding of
            voorstel een kennelijke fout of vergissing bevat, zijn wij
            daaraan niet gebonden.
          </p>
          <p>
            Get-Filly mag een aanvraag weigeren, bijvoorbeeld wanneer
            sprake is van misbruik, strijd met wet- of regelgeving, een
            verhoogd compliance-risico of een eerdere schending van deze
            voorwaarden.
          </p>
        </div>

        {/* 4 */}
        <div id="dienst" className="legal-section">
          <h2>4. Onze dienst</h2>
          <p>
            Get-Filly biedt een SaaS-platform waarmee horeca-, wellness- en
            hotelondernemers hun marketing, online zichtbaarheid, bezetting
            en klantactivatie kunnen analyseren en verbeteren met behulp
            van AI, automatisering en data-analyse. De dienst kan onder
            meer bestaan uit:
          </p>
          <ul>
            <li>een dashboard met inzicht in reserveringen, bezetting, gasten en marketingactiviteiten;</li>
            <li>AI-gegenereerde review-antwoorden, campagnesuggesties, teksten en chatfunctionaliteiten;</li>
            <li>menu-analyse via beeldherkenning en AI;</li>
            <li>website-, SEO-, Google Business Profile- en socialmedia-analyses;</li>
            <li>Health Scores, Potentie Scores, Opportunity Scores en benchmarkrapportages;</li>
            <li>koppelingen met externe marketing-, socialmedia-, betaal-, bank-, CRM- en reserveringssystemen.</li>
          </ul>

          <h3>Beschikbaarheid</h3>
          <p>
            Wij streven naar een beschikbaarheid van 99% per kalendermaand,
            maar geven geen harde SLA-garantie, tenzij schriftelijk anders
            overeengekomen. Gepland onderhoud melden wij zo mogelijk
            vooraf.
          </p>

          <h3>AI-functionaliteiten</h3>
          <p>
            Filly maakt gebruik van AI-modellen en AI-diensten van derden,
            waaronder diensten van Anthropic, zoals Claude, Claude Code
            en/of de Anthropic API. De AI-functionaliteiten binnen het
            Platform kunnen worden gebruikt voor onder meer
            antwoordgeneratie, review-antwoorden, campagnevoorstellen,
            menu-analyse, website-analyse, rapportages,
            chatfunctionaliteiten, code-ondersteuning en interne
            kwaliteitsverbetering.
          </p>
          <p>
            Wanneer de Klant AI-functionaliteiten gebruikt, kunnen prompts,
            ingevoerde gegevens, bestanden, context, gegenereerde output en
            technische metadata worden verwerkt door Anthropic of andere
            door Get-Filly ingeschakelde AI-dienstverleners, voor zover
            noodzakelijk om de functionaliteit te leveren, te beveiligen,
            te verbeteren of misbruik te voorkomen.
          </p>
          <p>
            AI-output is adviserend van aard. AI-output kan fouten
            bevatten, onvolledig zijn of gebaseerd zijn op onjuiste of
            verouderde informatie. De Klant blijft verantwoordelijk voor
            controle van AI-output vóór publicatie, verzending of zakelijk
            gebruik.
          </p>
        </div>

        {/* 5 */}
        <div id="account" className="legal-section">
          <h2>5. Account en verantwoordelijkheden van de klant</h2>
          <p>
            De Klant is verantwoordelijk voor het veilig bewaren van
            inloggegevens en voor al het gebruik dat via zijn Account
            plaatsvindt. Wanneer de Klant vermoedt dat onbevoegde toegang
            heeft plaatsgevonden, moet hij Get-Filly direct informeren.
          </p>
          <p>
            De Klant zorgt ervoor dat alleen bevoegde Gebruikers toegang
            krijgen tot het Platform en dat Gebruikers deze voorwaarden
            naleven. De Klant garandeert dat hij:
          </p>
          <ul>
            <li>juiste en actuele gegevens over zijn onderneming opgeeft;</li>
            <li>alleen content uploadt of koppelt waarop hij voldoende rechten heeft, waaronder menukaarten, foto&apos;s, teksten, logo&apos;s, reviews en bedrijfsinformatie;</li>
            <li>het Platform niet gebruikt voor onrechtmatige, misleidende, discriminerende, spamachtige of anderszins ongeoorloofde communicatie;</li>
            <li>geen pogingen doet om het Platform, de beveiliging, API&apos;s, integraties of AI-systemen te misbruiken, te verstoren of te reverse-engineeren;</li>
            <li>voldoet aan toepasselijke wet- en regelgeving, waaronder AVG, ePrivacy, consumentenrecht, reclameregels en sectorspecifieke regels voor horeca, alcohol, kansspelen of vergelijkbare activiteiten waar van toepassing;</li>
            <li>geen wachtwoorden van Externe Platformen, zoals Google, Facebook, Instagram of andere diensten van derden, aan Get-Filly verstrekt.</li>
          </ul>
          <p>
            Koppelingen met Externe Platformen verlopen uitsluitend via de
            daarvoor bedoelde autorisatiemethoden, zoals OAuth,
            API-koppelingen of andere veilige integratiemethoden.
          </p>
          <p>
            Bij oneigenlijk gebruik, beveiligingsrisico of ernstige
            schending van deze voorwaarden mogen wij het Account tijdelijk
            blokkeren of de overeenkomst per direct beëindigen zonder recht
            op restitutie, voor zover wettelijk toegestaan.
          </p>
        </div>

        {/* 6 */}
        <div id="platformen" className="legal-section">
          <h2>6. Externe platformen en OAuth-koppelingen</h2>

          <h3>6.1 Koppelingen door de Klant</h3>
          <p>
            De Klant kan binnen het Platform koppelingen activeren met
            Externe Platformen, waaronder Google Business Profile, Meta,
            Facebook, Instagram, TikTok, reserveringssystemen,
            CRM-systemen, e-mailmarketingdiensten en andere softwarediensten
            van derden. Een koppeling wordt alleen tot stand gebracht
            wanneer de Klant of een bevoegde Gebruiker daar expliciet
            toestemming voor geeft, bijvoorbeeld via een OAuth-flow,
            API-koppeling of vergelijkbare autorisatiemethode.
          </p>

          <h3>6.2 Bevoegdheid tot koppelen</h3>
          <p>
            De Klant garandeert dat hij bevoegd is om het betreffende
            Externe Platform te koppelen en dat hij beschikt over de
            vereiste rechten, rollen of beheerbevoegdheden, bijvoorbeeld als
            eigenaar, beheerder of gemachtigde van een Google Business
            Profile, Facebookpagina, Instagram Business-account of ander
            gekoppeld account. De Klant vrijwaart Get-Filly voor aanspraken
            van derden die voortvloeien uit het onbevoegd koppelen van
            accounts, pagina&apos;s, bedrijfsprofielen of databronnen.
          </p>

          <h3>6.3 Gebruik van Integratiegegevens</h3>
          <p>
            Get-Filly gebruikt Integratiegegevens uitsluitend voor zover
            noodzakelijk voor het leveren, onderhouden en verbeteren van de
            overeengekomen dienstverlening, waaronder analyses, dashboards,
            Health Scores, benchmarkrapportages, AI-suggesties,
            marketinginzichten en optimalisatievoorstellen. Get-Filly
            verkoopt Integratiegegevens niet aan derden en gebruikt
            Integratiegegevens niet voor advertentiedoeleinden van derden.
          </p>

          <h3>6.4 Geen automatische wijzigingen zonder opdracht</h3>
          <p>
            Get-Filly zal geen content publiceren, berichten plaatsen,
            reviews beantwoorden, bedrijfsprofielen wijzigen, advertenties
            aanpassen of andere handelingen uitvoeren binnen een Extern
            Platform zonder een expliciete handeling, goedkeuring of
            opdracht van de Klant. Voor zover het Platform functionaliteiten
            biedt waarmee de Klant wijzigingen kan aanbrengen op Externe
            Platformen, blijft de Klant verantwoordelijk voor de inhoud,
            juistheid en rechtmatigheid van die wijzigingen.
          </p>

          <h3>6.5 Handelingen namens de Klant</h3>
          <p>
            Wanneer de Klant via het Platform opdracht geeft om een
            handeling uit te voeren op een Extern Platform, zoals het
            beantwoorden van een review, publiceren van content, aanpassen
            van profielinformatie of ophalen van rapportages, geldt die
            handeling als een opdracht van de Klant aan Get-Filly. De Klant
            is verantwoordelijk voor de inhoud, rechtmatigheid en gevolgen
            van dergelijke handelingen, tenzij schade het gevolg is van
            opzet of bewuste roekeloosheid van Get-Filly.
          </p>

          <h3>6.6 Platformvoorwaarden van derden</h3>
          <p>
            De Klant erkent dat het gebruik van Externe Platformen mede
            wordt beheerst door de Platformvoorwaarden van derden. De Klant
            is verantwoordelijk voor naleving van deze voorwaarden voor
            zover deze op hem of zijn gebruik van toepassing zijn. Get-Filly
            is niet verantwoordelijk voor wijzigingen in voorwaarden,
            policies, API&apos;s, permissions, tarieven, beschikbaarheid,
            reviewprocessen, rate limits of functionaliteiten van Externe
            Platformen.
          </p>

          <h3>6.7 Wijzigingen, beperkingen en beëindiging door derden</h3>
          <p>
            Externe Platformen kunnen hun diensten, API&apos;s,
            permissions, scopes, voorwaarden of toegangsmogelijkheden
            wijzigen, beperken, opschorten of beëindigen. Get-Filly is niet
            aansprakelijk voor schade of verminderde functionaliteit die
            hierdoor ontstaat, tenzij sprake is van opzet of bewuste
            roekeloosheid aan de zijde van Get-Filly. Indien een Extern
            Platform aanvullende verificatie, app review, business
            verification, security assessment of toestemming vereist, kan
            Get-Filly de betreffende functionaliteit tijdelijk beperken
            totdat aan die vereisten is voldaan.
          </p>

          <h3>6.8 Intrekken van koppelingen</h3>
          <p>
            De Klant kan een OAuth-koppeling of andere integratie op ieder
            moment verwijderen via het Platform of via het betreffende
            Externe Platform. Na ontkoppeling zal Get-Filly geen nieuwe
            gegevens meer ophalen via die integratie. Get-Filly kan
            technische toegang, tokens of API-sleutels intrekken of
            verwijderen wanneer een koppeling wordt beëindigd, wanneer
            toegang niet langer noodzakelijk is, of wanneer dit vereist is
            op grond van wetgeving, beveiliging of Platformvoorwaarden van
            derden.
          </p>
        </div>

        {/* 7 */}
        <div id="google" className="legal-section">
          <h2>7. Google Business Profile en Google API&apos;s</h2>
          <p>
            Wanneer de Klant een Google-integratie activeert, waaronder
            Google Business Profile, verleent de Klant Get-Filly toestemming
            om de gegevens en functionaliteiten te gebruiken waarvoor de
            Klant via Google expliciet toestemming heeft gegeven.
          </p>
          <p>
            Get-Filly gebruikt Google-gegevens uitsluitend voor het
            leveren, onderhouden en verbeteren van de functionaliteiten
            waarvoor de Klant toestemming heeft gegeven, waaronder het
            berekenen van Health Scores, het tonen van verbeterpunten, het
            analyseren van reviews, ratings, foto&apos;s,
            bedrijfsprofielinformatie en online zichtbaarheid.
          </p>
          <p>
            Get-Filly zal Google-gegevens niet verkopen, niet overdragen aan
            advertentienetwerken, niet gebruiken voor retargeting of
            gepersonaliseerde advertenties van derden en niet gebruiken voor
            doeleinden die niet zijn beschreven in de privacyverklaring of
            in de relevante in-product toelichting.
          </p>
          <p>
            Het gebruik en de overdracht van gegevens die Get-Filly ontvangt
            via Google API&apos;s vindt plaats in overeenstemming met de
            Google API Services User Data Policy, inclusief de Limited Use
            requirements.
          </p>
          <p>
            De Klant begrijpt dat Google bepaalde scopes, permissions of
            API-toegang kan weigeren, beperken, controleren of intrekken.
            Get-Filly is niet aansprakelijk voor het niet beschikbaar zijn
            van Google-functionaliteiten als gevolg van besluiten,
            storingen, wijzigingen of beperkingen van Google, tenzij sprake
            is van opzet of bewuste roekeloosheid van Get-Filly.
          </p>
        </div>

        {/* 8 */}
        <div id="meta" className="legal-section">
          <h2>8. Meta, Facebook en Instagram</h2>
          <p>
            Wanneer de Klant een Meta-, Facebook- of Instagram-integratie
            activeert, verleent de Klant Get-Filly toestemming om de
            gegevens en functionaliteiten te gebruiken waarvoor de Klant via
            Meta expliciet toestemming heeft gegeven.
          </p>
          <p>
            Afhankelijk van de door de Klant geactiveerde functionaliteit
            kan Get-Filly gegevens verwerken zoals pagina-informatie,
            accountinformatie, profielinformatie, openbare content,
            foto&apos;s, video&apos;s, statistieken, bereik,
            engagementgegevens, reacties, berichten en andere gegevens die
            via de Meta API&apos;s beschikbaar worden gesteld.
          </p>
          <p>
            Get-Filly gebruikt deze gegevens uitsluitend voor het leveren
            van de overeengekomen dienstverlening, waaronder
            socialmedia-analyses, Health Scores, benchmarkrapportages,
            contentinzichten, marketingaanbevelingen en
            prestatie-overzichten. Get-Filly verkoopt Meta-, Facebook- of
            Instagram-gegevens niet aan derden en gebruikt deze gegevens
            niet voor advertentiedoeleinden van derden. Get-Filly zal geen
            content publiceren, verwijderen of wijzigen op Meta-, Facebook-
            of Instagram-accounts zonder expliciete handeling of opdracht
            van de Klant.
          </p>
          <p>
            De Klant kan een Meta-, Facebook- of Instagram-koppeling
            verwijderen via het Platform of via de instellingen van het
            betreffende Meta-account. Na ontkoppeling zal Get-Filly geen
            nieuwe gegevens meer ophalen via die koppeling. Voor verzoeken
            tot verwijdering van gegevens die via Meta, Facebook of
            Instagram zijn verkregen, biedt Get-Filly instructies via een
            publieke data deletion-pagina. Get-Filly verwijdert gegevens
            wanneer daartoe een geldig verzoek wordt ontvangen, tenzij
            wettelijke verplichtingen of gerechtvaardigde administratieve
            redenen verdere bewaring vereisen.
          </p>
        </div>

        {/* 9 */}
        <div id="betaling" className="legal-section">
          <h2>9. Abonnement, prijzen en betaling</h2>
          <p>
            De actuele prijzen van onze abonnementen staan op{" "}
            <a href="/pricing">get-filly.com/pricing</a>. Alle prijzen zijn
            in euro&apos;s, exclusief btw tenzij anders vermeld.
          </p>

          <h3>9.1 Betaling via Stripe</h3>
          <p>
            Betaling verloopt via onze betaalpartner Stripe. Afhankelijk van
            de gekozen betaalmethode kan betaling plaatsvinden via
            creditcard, SEPA-incasso, iDEAL of andere door Stripe
            ondersteunde betaalmethoden. Het abonnementsbedrag wordt vooruit
            per periode in rekening gebracht, maandelijks of jaarlijks,
            afhankelijk van de door de Klant gekozen abonnementsvorm.
          </p>
          <p>
            Stripe kan voor bepaalde verwerkingen optreden als zelfstandig
            verwerkingsverantwoordelijke, bijvoorbeeld voor
            betalingsverwerking, fraudepreventie, wettelijke verplichtingen
            en naleving van financiële regelgeving. Op de verwerking door
            Stripe zijn mede de voorwaarden en privacyverklaring van Stripe
            van toepassing.
          </p>

          <h3>9.2 Bij niet-betaling</h3>
          <p>
            Als een betaling mislukt, mogen wij de betaling opnieuw
            aanbieden of de Klant verzoeken om een andere betaalmethode te
            gebruiken. Blijft betaling uit, dan kunnen wij de toegang tot
            het Platform opschorten totdat betaling is ontvangen. Bij langer
            dan 30 dagen openstaande betaling hebben wij het recht de
            overeenkomst te beëindigen en de openstaande bedragen ter
            incasso uit handen te geven. Buitengerechtelijke incassokosten
            komen voor rekening van de Klant conform de Wet Incassokosten,
            voor zover van toepassing.
          </p>

          <h3>9.3 Prijswijzigingen</h3>
          <p>
            Wij kunnen prijzen jaarlijks per 1 januari aanpassen,
            bijvoorbeeld op basis van inflatie, CBS consumentenprijsindex,
            wijzigingen in onze kosten voor AI-verwerking, API-kosten,
            hostingkosten of kosten van Externe Platformen. Wij kondigen een
            prijswijziging ten minste één maand van tevoren aan. Is de Klant
            het oneens met een prijswijziging, dan kan hij het abonnement
            opzeggen tegen de datum waarop de wijziging ingaat.
          </p>

          <h3>9.4 Bank- en administratieverwerking via bunq</h3>
          <p>
            Get-Filly kan gebruikmaken van bunq B.V. voor zakelijke
            bankdiensten, betalingsadministratie, reconciliatie en
            financiële administratie. Voor zover bunq persoonsgegevens of
            transactiegegevens verwerkt in het kader van haar eigen
            wettelijke verplichtingen, compliance, fraudepreventie of
            bancaire dienstverlening, kan bunq optreden als zelfstandig
            verwerkingsverantwoordelijke.
          </p>
        </div>

        {/* 10 */}
        <div id="duur" className="legal-section">
          <h2>10. Duur, opzegging en verwijdering van integratiegegevens</h2>
          <p>
            Een abonnement gaat in op de dag van activatie en loopt voor de
            door de Klant gekozen periode, bijvoorbeeld 1 maand of 1 jaar.
            Daarna wordt het abonnement stilzwijgend verlengd voor dezelfde
            periode, tenzij de Klant ten minste één maand vóór het einde van
            de lopende periode opzegt via het dashboard. Na opzegging blijft
            het Platform beschikbaar tot het einde van de reeds betaalde
            periode. Daarna wordt het Account gedeactiveerd en worden
            persoonsgegevens verwerkt overeenkomstig de privacyverklaring en
            de Verwerkersovereenkomst.
          </p>

          <h3>10.1 Ontbinding</h3>
          <p>
            Beide partijen kunnen de overeenkomst buitengerechtelijk
            ontbinden als de andere partij ernstig tekortschiet en die
            tekortkoming niet binnen 30 dagen na schriftelijke
            ingebrekestelling herstelt. In geval van faillissement,
            surseance van betaling, staking van de onderneming of
            vergelijkbare situatie is ontbinding onmiddellijk mogelijk.
          </p>

          <h3>10.2 Verwijdering van integratiegegevens</h3>
          <p>
            Wanneer de Klant een integratie verwijdert of zijn account
            beëindigt, zal Get-Filly de bijbehorende OAuth-tokens en
            technische toegang intrekken of verwijderen, tenzij bewaring
            tijdelijk noodzakelijk is voor beveiliging, geschillen,
            wettelijke verplichtingen of administratieve afwikkeling.
            Verzoeken tot verwijdering van gegevens kunnen worden ingediend
            via het dashboard of via{" "}
            <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>. Voor
            gegevens afkomstig uit Meta-, Facebook- of Instagram-integraties
            publiceert Get-Filly daarnaast een data deletion-pagina met
            instructies voor gebruikers.
          </p>
        </div>

        {/* 11 */}
        <div id="data" className="legal-section">
          <h2>11. Data-eigendom en verwerking</h2>
          <p>
            Alle gegevens die de Klant in het Platform invoert, uploadt of
            koppelt, blijven eigendom van de Klant of de oorspronkelijke
            rechthebbende. Get-Filly verkrijgt uitsluitend het recht om die
            gegevens te gebruiken voor zover nodig om de dienstverlening te
            leveren, te beveiligen, te onderhouden en te verbeteren
            overeenkomstig deze voorwaarden en de privacyverklaring.
          </p>
          <p>
            Voor zover de Klant via het Platform persoonsgegevens van gasten
            of klanten verwerkt, is de Klant verwerkingsverantwoordelijke en
            is Get-Filly verwerker in de zin van artikel 28 AVG. De
            afspraken over die verwerking worden vastgelegd in een
            Verwerkersovereenkomst die deel uitmaakt van de contractuele
            relatie tussen partijen. De Klant is verantwoordelijk voor het
            hebben van een geldige grondslag voor de verwerking van
            Gastgegevens, het informeren van betrokkenen en het naleven van
            toepasselijke privacy- en marketingwetgeving.
          </p>

          <h3>11.1 Export bij vertrek</h3>
          <p>
            Bij beëindiging van de overeenkomst kan de Klant tot 30 dagen na
            afloop zijn data exporteren in een gangbaar formaat, voor zover
            technisch beschikbaar. Daarna mogen wij gegevens verwijderen of
            anonimiseren overeenkomstig de privacyverklaring en de
            Verwerkersovereenkomst. Get-Filly mag anonieme en geaggregeerde
            data, die niet herleidbaar is tot de Klant, Gebruikers of
            gasten, blijven gebruiken voor productverbetering, benchmarking,
            statistiek en trendanalyse.
          </p>
        </div>

        {/* 12 */}
        <div id="ip" className="legal-section">
          <h2>12. Intellectueel eigendom</h2>
          <p>
            Alle intellectuele eigendomsrechten op het Platform, de
            software, de databasestructuur, het ontwerp, teksten, modellen,
            methodieken, scores, de Filly-merknaam en bijbehorende
            logo&apos;s berusten bij Get-Filly of haar licentiegevers.
            Niets in deze voorwaarden draagt enig eigendomsrecht over aan de
            Klant. Voor de duur van het abonnement krijgt de Klant een
            niet-exclusief, niet-overdraagbaar en niet-sublicentieerbaar
            recht om het Platform te gebruiken voor zijn eigen onderneming
            en uitsluitend overeenkomstig deze voorwaarden.
          </p>

          <h3>12.1 AI-output</h3>
          <p>
            Voor zover wettelijk toegestaan, mag de Klant AI-output die door
            Filly op basis van zijn invoer wordt gegenereerd gebruiken
            binnen zijn eigen onderneming, zowel tijdens als na het
            abonnement. Get-Filly geeft geen garantie dat AI-output uniek
            is, geen rechten van derden raakt of geschikt is voor een
            specifiek doel. De Klant blijft verantwoordelijk voor controle,
            redactie en rechtmatig gebruik van AI-output.
          </p>
        </div>

        {/* 13 */}
        <div id="rangorde" className="legal-section">
          <h2>13. Rangorde van documenten</h2>
          <p>
            Indien sprake is van strijdigheid tussen documenten, geldt de
            volgende rangorde, tenzij schriftelijk anders overeengekomen:
          </p>
          <ol>
            <li>een afzonderlijk ondertekende overeenkomst of offerte;</li>
            <li>de Verwerkersovereenkomst, voor zover het gaat om verwerking van persoonsgegevens namens de Klant;</li>
            <li>deze algemene voorwaarden;</li>
            <li>de privacyverklaring;</li>
            <li>overige beleidsdocumenten, productdocumentatie of informatiepagina&apos;s.</li>
          </ol>
          <p>
            Voor het gebruik van Externe Platformen blijven daarnaast de
            toepasselijke Platformvoorwaarden van derden gelden.
          </p>
        </div>

        {/* 14 */}
        <div id="aansprakelijkheid" className="legal-section">
          <h2>14. Aansprakelijkheid</h2>
          <p>
            Onze dienstverlening wordt uitgevoerd op basis van een
            inspanningsverplichting, niet een resultaatsverplichting. Wij
            doen ons uiterste best voor een stabiel, veilig en nuttig
            Platform, maar geven geen garantie dat suggesties, campagnes,
            Health Scores of AI-output leiden tot meer reserveringen, omzet,
            bereik of winst.
          </p>

          <h3>14.1 Beperking</h3>
          <p>
            Onze totale aansprakelijkheid jegens de Klant per gebeurtenis of
            reeks samenhangende gebeurtenissen is beperkt tot het bedrag dat
            de Klant in de voorafgaande twaalf maanden aan abonnementskosten
            aan ons heeft betaald, met een absoluut maximum van{" "}
            {COMPANY.liabilityCap} per kalenderjaar.
          </p>

          <h3>14.2 Uitgesloten schade</h3>
          <p>
            Wij zijn niet aansprakelijk voor indirecte schade, waaronder in
            elk geval wordt begrepen: gederfde winst, gemiste besparingen,
            reputatieschade, verminking of verlies van data, schade door
            bedrijfsstilstand, gemiste reserveringen, gemiste omzet, verlies
            van goodwill of schade door claims van gasten of derden.
          </p>

          <h3>14.3 Geen garantie op externe platformfunctionaliteit</h3>
          <p>
            Get-Filly garandeert niet dat koppelingen met Externe Platformen
            altijd beschikbaar blijven of ongewijzigd blijven functioneren.
            Functionaliteiten kunnen afhankelijk zijn van toestemming, app
            review, business verification, API-limieten, platformbeleid,
            technische wijzigingen of besluiten van derden zoals Google,
            Meta, Stripe, bunq of andere aanbieders. Get-Filly is niet
            aansprakelijk voor schade die ontstaat doordat een Extern
            Platform zijn dienstverlening wijzigt, beperkt, opschort of
            beëindigt, tenzij sprake is van opzet of bewuste roekeloosheid
            van Get-Filly.
          </p>

          <h3>14.4 Uitzonderingen</h3>
          <p>
            De aansprakelijkheidsbeperkingen gelden niet voor zover schade
            het gevolg is van opzet of bewuste roekeloosheid van Get-Filly
            zelf, of voor zover beperking van aansprakelijkheid wettelijk
            niet is toegestaan.
          </p>

          <h3>14.5 Vrijwaring</h3>
          <p>
            De Klant vrijwaart Get-Filly voor aanspraken van derden,
            waaronder gasten, betrokkenen, rechthebbenden, Externe
            Platformen en toezichthouders, voor zover deze voortkomen uit
            het gebruik van het Platform door de Klant in strijd met
            wetgeving, rechten van derden, Platformvoorwaarden van derden of
            deze voorwaarden.
          </p>
        </div>

        {/* 15 */}
        <div id="geheimhouding" className="legal-section">
          <h2>15. Geheimhouding</h2>
          <p>
            Beide partijen houden vertrouwelijke informatie die zij van de
            andere partij ontvangen geheim, waaronder prijzen, offertes,
            roadmap-informatie, technische informatie, zakelijke gegevens,
            gastenlijsten, API-sleutels, integratiegegevens en niet-openbare
            productinformatie.
          </p>
          <p>
            Vertrouwelijke informatie mag alleen worden gebruikt voor de
            uitvoering van de overeenkomst. Openbaarmaking is alleen
            toegestaan wanneer dit wettelijk verplicht is, noodzakelijk is
            voor uitvoering van de overeenkomst door ingeschakelde
            dienstverleners onder passende geheimhouding, of wanneer de
            andere partij schriftelijk toestemming heeft gegeven. De
            geheimhoudingsverplichting blijft gelden tot drie jaar na afloop
            van de overeenkomst. Voor bedrijfsgeheimen en persoonsgegevens
            geldt de verplichting zolang de informatie naar haar aard
            vertrouwelijk is of bescherming vereist.
          </p>
        </div>

        {/* 16 */}
        <div id="overmacht" className="legal-section">
          <h2>16. Overmacht</h2>
          <p>
            Onder overmacht verstaan wij iedere niet aan Get-Filly
            toerekenbare omstandigheid die nakoming tijdelijk of blijvend
            verhindert. Daaronder valt in elk geval: storingen bij onze
            subverwerkers of dienstverleners, waaronder Supabase, Anthropic,
            Resend, Vercel, Stripe, bunq, Google, Meta of andere Externe
            Platformen, langdurige internetstoringen, stroomstoringen,
            overheidsmaatregelen, cyberaanvallen buiten onze redelijke
            controle, API-storingen, rate limits, app review-beperkingen,
            platformwijzigingen en het tijdelijk of definitief intrekken van
            toegang door een Extern Platform.
          </p>
          <p>
            In overmachtssituaties is nakoming opgeschort zolang de
            overmacht voortduurt. Als de overmacht langer dan 30 dagen
            duurt, kan iedere partij de overeenkomst zonder rechterlijke
            tussenkomst ontbinden zonder schadevergoeding verschuldigd te
            zijn.
          </p>
        </div>

        {/* 17 */}
        <div id="wijzigingen" className="legal-section">
          <h2>17. Wijzigingen in deze voorwaarden</h2>
          <p>
            Wij mogen deze voorwaarden van tijd tot tijd wijzigen. Wij
            informeren de Klant ten minste één maand vóór inwerkingtreding
            via e-mail of in het dashboard. Gaat de Klant niet akkoord met
            een wijziging, dan kan hij het abonnement opzeggen tegen de
            datum waarop de wijziging ingaat.
          </p>
          <p>
            Wijzigingen die noodzakelijk zijn om te voldoen aan wetgeving,
            een uitspraak van een rechter, een besluit van een
            toezichthouder, beveiligingsvereisten of Platformvoorwaarden van
            derden kunnen zonder voorafgaande opzegtermijn ingaan, voor
            zover redelijkerwijs noodzakelijk.
          </p>
        </div>

        {/* 18 */}
        <div id="recht" className="legal-section">
          <h2>18. Toepasselijk recht en geschillen</h2>
          <p>
            Op deze overeenkomst en alle rechtsverhoudingen tussen Get-Filly
            en de Klant is uitsluitend Nederlands recht van toepassing.
          </p>
          <p>
            Voordat een geschil aan de rechter wordt voorgelegd, zullen
            partijen in overleg treden om tot een oplossing te komen. Lukt
            dat niet, dan is de bevoegde rechter van de {COMPANY.court} bij
            uitsluiting bevoegd om kennis te nemen van het geschil, tenzij
            dwingend recht een andere rechter aanwijst.
          </p>
        </div>
      </div>
    </section>
  );
}
