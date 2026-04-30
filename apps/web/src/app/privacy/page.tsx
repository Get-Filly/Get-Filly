// ============================================================
// Privacy-verklaring — /privacy
// ============================================================
// Publieke pagina die beschrijft welke persoonsgegevens we
// verwerken, waarom, met wie we ze delen en welke rechten
// betrokkenen hebben (AVG art. 13/14).
//
// Dit is een CONCEPT v1. De gele draft-banner verdwijnt
// automatisch zodra de bedrijfsgegevens (KvK + legalName) in
// `apps/web/src/config/company.ts` zijn ingevuld. Tot die tijd
// vallen ontbrekende velden hieronder netjes terug op een
// "[NOG IN TE VULLEN: ...]"-placeholder via <LegalField/>.
//
// Bronnen van de tekst: AVG (GDPR), Uitvoeringswet AVG (NL),
// Autoriteit Persoonsgegevens "Voorbeeldtekst privacyverklaring"
// richtlijn, en onze eigen data-flows (Supabase EU, Anthropic US,
// Resend EU, Vercel global, Mollie EU).
// ============================================================

import type { Metadata } from "next";
import {
  COMPANY,
  formatFullAddress,
  isLegalDataComplete,
} from "@/config/company";
import { LegalField } from "@/components/legal-field";

export const metadata: Metadata = {
  title: "Privacyverklaring — Get-Filly",
  description:
    "Hoe Get-Filly jouw persoonsgegevens verwerkt, met wie we die delen en welke rechten je hebt.",
};

// Laatste inhoudelijke wijziging van deze pagina. Bij elke materiële
// aanpassing bijwerken — users moeten kunnen zien welke versie gold.
const LAST_UPDATED = "24 april 2026";
const VERSION = "v1 (concept)";

export default function PrivacyPage() {
  // Banner verschijnt zolang KvK + legal_name nog niet centraal in
  // `apps/web/src/config/company.ts` zijn ingevuld. Zodra dat
  // gebeurt verdwijnt de banner automatisch én vallen alle
  // [INVULLEN]-placeholders hieronder terug op de echte waarde.
  const showDraftBanner = !isLegalDataComplete();
  const fullAddress = formatFullAddress();

  return (
    <section className="legal-page">
      <div className="legal-container">
        {showDraftBanner && (
          <div className="legal-draft-banner">
            <strong>Concept — nog niet juridisch gereviewd.</strong> Deze
            tekst is een eerste versie. Vóór we klanten accepteren laten
            we 'm controleren door een privacy-jurist en vullen we de
            ontbrekende bedrijfsgegevens in. Gebruik deze verklaring niet
            als leidraad voor juridische beslissingen.
          </div>
        )}

        <p className="legal-meta">
          Laatst bijgewerkt: {LAST_UPDATED} · {VERSION}
        </p>
        <h1 className="legal-title">Privacyverklaring</h1>
        <p className="legal-lead">
          Get-Filly helpt horeca-, wellness- en hotelondernemers slimmer te
          vullen met AI-marketing. Om dat werk te doen, verwerken we
          persoonsgegevens — van jou als ondernemer en soms ook van jouw
          gasten. Op deze pagina leggen we uit welke gegevens dat zijn,
          waarom we ze gebruiken en wat jouw rechten zijn.
        </p>

        {/* Inhoudsopgave — anchor-links in twee kolommen zodat de
            pagina snel navigeerbaar is bij een concrete vraag. */}
        <nav className="legal-toc" aria-label="Inhoudsopgave">
          <div className="legal-toc-title">Inhoud</div>
          <ol>
            <li><a href="#wie">Wie zijn wij?</a></li>
            <li><a href="#gegevens">Welke gegevens verwerken we?</a></li>
            <li><a href="#doeleinden">Waarom verwerken we ze?</a></li>
            <li><a href="#delen">Met wie delen we gegevens?</a></li>
            <li><a href="#buitenland">Doorgifte buiten de EER</a></li>
            <li><a href="#bewaartermijn">Hoe lang bewaren we ze?</a></li>
            <li><a href="#beveiliging">Hoe beveiligen we ze?</a></li>
            <li><a href="#cookies">Cookies en meetinstrumenten</a></li>
            <li><a href="#rechten">Jouw rechten</a></li>
            <li><a href="#wijzigingen">Wijzigingen</a></li>
            <li><a href="#contact">Contact en klachten</a></li>
          </ol>
        </nav>

        {/* 1. Wie zijn wij — verwerkingsverantwoordelijke. Dit is de
            wettelijke identificatie-sectie; alle placeholders moeten
            vóór launch ingevuld zijn. */}
        <div id="wie" className="legal-section">
          <h2>1. Wie zijn wij?</h2>
          <p>
            Verwerkingsverantwoordelijke in de zin van de Algemene
            Verordening Gegevensbescherming (AVG) is:
          </p>
          <ul>
            <li>
              <strong>
                <LegalField
                  value={COMPANY.legalName}
                  placeholder="volledige bedrijfsnaam"
                />
              </strong>
              {" "}(hierna: "Get-Filly", "wij" of "ons")
            </li>
            <li>
              Bedrijfsvorm:{" "}
              <LegalField
                value={COMPANY.businessForm}
                placeholder="eenmanszaak / VOF / BV"
              />
            </li>
            <li>
              KvK-nummer:{" "}
              <LegalField value={COMPANY.kvk} placeholder="KvK-nummer" />
            </li>
            <li>
              Vestigingsadres:{" "}
              <LegalField
                value={fullAddress}
                placeholder="straat + nummer, postcode, plaats"
              />
            </li>
            <li>
              E-mail voor privacy-vragen:{" "}
              <a href="mailto:privacy@get-filly.com">privacy@get-filly.com</a>
            </li>
          </ul>
          <p>
            We zijn een Nederlands bedrijf, onze hoofdvestiging is in
            Nederland en we vallen onder Nederlands recht en toezicht
            van de Autoriteit Persoonsgegevens.
          </p>
        </div>

        {/* 2. Welke gegevens. Categoriseren per bron helpt de lezer
            begrijpen welke gegevens wanneer worden verzameld. */}
        <div id="gegevens" className="legal-section">
          <h2>2. Welke gegevens verwerken we?</h2>

          <h3>2.1 Gegevens over jou als gebruiker</h3>
          <p>
            Wanneer je een account aanmaakt en gebruik maakt van ons
            platform, verwerken we:
          </p>
          <ul>
            <li>Naam en e-mailadres (om in te loggen en contact te hebben)</li>
            <li>Wachtwoord (versleuteld opgeslagen — wij zien het nooit)</li>
            <li>Rol binnen de zaak (eigenaar, manager, medewerker)</li>
            <li>Telefoonnummer, alleen als je dit zelf invult</li>
            <li>Tijdstippen van inloggen en gebruik (voor beveiliging en foutopsporing)</li>
          </ul>

          <h3>2.2 Gegevens over je zaak</h3>
          <p>
            Om Filly zinvolle suggesties te laten doen hebben we gegevens
            over de zaak zelf nodig:
          </p>
          <ul>
            <li>Naam, type, adres en openingstijden van de zaak</li>
            <li>Website-inhoud (automatisch gelezen tijdens onboarding)</li>
            <li>Menukaart, keuken-stijl, signatuur-gerechten</li>
            <li>Reserveringen, bezetting en weer-data per dag</li>
            <li>Reviews, foto's en teksten die je deelt op jouw kanalen</li>
            <li>Koppelingen met externe tools (reserverings-systeem, social media) — alleen als je die expliciet zelf maakt</li>
          </ul>

          <h3>2.3 Gegevens over jouw gasten</h3>
          <p>
            Als je een reserverings-systeem koppelt of gasten-lijsten
            importeert, verwerken wij persoonsgegevens van jouw gasten.
            <strong> In die verhouding ben jij de verwerkingsverantwoordelijke
            en wij de verwerker</strong> — jij bepaalt wat ermee gebeurt,
            wij voeren dat uit volgens onze verwerkersovereenkomst.
          </p>
          <ul>
            <li>Naam, e-mail en telefoonnummer (alleen als jij die deelt)</li>
            <li>Reservering-historie en bezoekfrequentie</li>
            <li>Voorkeuren die je zelf hebt vastgelegd (allergieën, favoriete tafel)</li>
          </ul>

          <h3>2.4 AI-gebruik-gegevens</h3>
          <p>
            We loggen welke AI-functies je gebruikt om kosten te beheersen,
            misbruik op te sporen en Filly te verbeteren:
          </p>
          <ul>
            <li>Type actie (review-antwoord, campagne-suggestie, chat, menu-scan)</li>
            <li>Aantal tokens per call en gebruikte model</li>
            <li>Tijdstip en gekoppelde zaak</li>
            <li>De inhoud van jouw vraag of bestand, voor zover Claude die nodig heeft voor het antwoord</li>
          </ul>

          <h3>2.5 Technische gegevens (automatisch)</h3>
          <ul>
            <li>IP-adres</li>
            <li>Browser- en apparaattype</li>
            <li>Bezochte pagina's en klikgedrag binnen ons platform</li>
            <li>Foutmeldingen (voor debug-doeleinden)</li>
          </ul>
        </div>

        {/* 3. Doeleinden + rechtsgrond. Iedere verwerking MOET een
            AVG-rechtsgrond hebben (art. 6). We kiezen per doel. */}
        <div id="doeleinden" className="legal-section">
          <h2>3. Waarom verwerken we deze gegevens?</h2>
          <p>
            Onder de AVG moet elke verwerking een wettelijke grondslag
            hebben. Hier is per doel welke grondslag we gebruiken:
          </p>
          <table className="legal-table">
            <thead>
              <tr>
                <th>Doel</th>
                <th>Rechtsgrond</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Account aanmaken en onderhouden</td>
                <td>Uitvoering van de overeenkomst (art. 6 lid 1 sub b AVG)</td>
              </tr>
              <tr>
                <td>AI-suggesties, campagnes en chat</td>
                <td>Uitvoering van de overeenkomst</td>
              </tr>
              <tr>
                <td>Betaling en facturatie</td>
                <td>Uitvoering van de overeenkomst + wettelijke verplichting (bewaarplicht fiscus)</td>
              </tr>
              <tr>
                <td>Beveiliging, fraudebestrijding, foutopsporing</td>
                <td>Gerechtvaardigd belang (art. 6 lid 1 sub f AVG)</td>
              </tr>
              <tr>
                <td>Product-verbetering (op geanonimiseerde data)</td>
                <td>Gerechtvaardigd belang</td>
              </tr>
              <tr>
                <td>Nieuwsbrieven en marketing-mails</td>
                <td>Toestemming (art. 6 lid 1 sub a AVG) — altijd intrekbaar via uitschrijflink</td>
              </tr>
              <tr>
                <td>Verplichte administratie (bv. belastingdienst)</td>
                <td>Wettelijke verplichting (art. 6 lid 1 sub c AVG)</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 4. Sub-verwerkers. Gedetailleerd benoemen is verplicht; bij
            Amerikaanse partijen moet hun juridisch kader expliciet. */}
        <div id="delen" className="legal-section">
          <h2>4. Met wie delen we gegevens?</h2>
          <p>
            We delen jouw gegevens alléén met partijen die nodig zijn om
            de dienst te leveren. Dit zijn onze vaste sub-verwerkers:
          </p>
          <table className="legal-table">
            <thead>
              <tr>
                <th>Partij</th>
                <th>Functie</th>
                <th>Locatie data</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Supabase, Inc.</td>
                <td>Database, authenticatie en bestandsopslag</td>
                <td>EU (Frankfurt)</td>
              </tr>
              <tr>
                <td>Anthropic, PBC</td>
                <td>AI-model (Claude) voor suggesties, chat en menu-analyse</td>
                <td>VS — via EU-standaardcontractbepalingen</td>
              </tr>
              <tr>
                <td>Resend, Inc.</td>
                <td>Versturen van transactionele en marketing-mails</td>
                <td>EU</td>
              </tr>
              <tr>
                <td>Vercel, Inc.</td>
                <td>Hosting van de website en dashboard</td>
                <td>EU-regio waar mogelijk</td>
              </tr>
              <tr>
                <td>Mollie B.V.</td>
                <td>Betaalverwerking (abonnementen)</td>
                <td>EU (Nederland)</td>
              </tr>
            </tbody>
          </table>
          <p>
            Met elke sub-verwerker hebben we een verwerkersovereenkomst
            zoals vereist onder AVG art. 28. We delen nooit meer dan nodig
            is voor hun specifieke taak.
          </p>
          <p>
            Daarnaast delen we gegevens alleen met derde partijen als jij
            dat zelf activeert (bijvoorbeeld door een reserverings-systeem
            of social-media-account te koppelen) of als een wettelijke
            verplichting ons daartoe dwingt.
          </p>
          <p>
            <strong>We verkopen nooit persoonsgegevens</strong> en
            gebruiken ze niet voor advertentie-doeleinden bij derden.
          </p>
        </div>

        {/* 5. Doorgifte buiten EER. Kritiek stuk: Anthropic is een
            Amerikaanse partij. We moeten transparant uitleggen welk
            waarborg-mechanisme we gebruiken (SCC's). */}
        <div id="buitenland" className="legal-section">
          <h2>5. Doorgifte buiten de Europese Economische Ruimte</h2>
          <p>
            Eén van onze sub-verwerkers, Anthropic, is gevestigd in de
            Verenigde Staten. Voor de AI-functies (Claude) worden jouw
            vragen en relevante context tijdelijk naar Anthropic's
            servers in de VS gestuurd om een antwoord te genereren.
          </p>
          <p>
            Omdat de VS geen "adequaatheidsbesluit" van de Europese
            Commissie heeft zoals de EER-landen, hanteren we het volgende
            waarborg-mechanisme:
          </p>
          <ul>
            <li>
              <strong>EU-standaardcontractbepalingen (SCC's)</strong> zoals
              goedgekeurd door de Europese Commissie in 2021, aangevuld met
              aanvullende technische en organisatorische maatregelen.
            </li>
            <li>
              Anthropic gebruikt jouw inhoud <strong>niet voor het trainen
              van haar AI-modellen</strong> in onze zakelijke ("API")-modus,
              zoals contractueel vastgelegd.
            </li>
            <li>
              De gegevens worden tijdens de verwerking versleuteld (TLS) en
              worden door Anthropic niet langer bewaard dan nodig voor de
              verwerking.
            </li>
          </ul>
          <p>
            Als je er bezwaar tegen hebt dat jouw gegevens naar de VS gaan
            voor AI-verwerking, kun je dat aangeven — we onderzoeken dan of
            een EU-alternatief beschikbaar is (op dit moment is dat voor
            het prestatie-niveau van Claude niet het geval).
          </p>
        </div>

        {/* 6. Bewaartermijnen per datatype. Specifiek zijn is wettelijk
            vereist: "zo lang als nodig" is te vaag. */}
        <div id="bewaartermijn" className="legal-section">
          <h2>6. Hoe lang bewaren we de gegevens?</h2>
          <p>
            We bewaren gegevens niet langer dan nodig. Indicatieve termijnen:
          </p>
          <table className="legal-table">
            <thead>
              <tr>
                <th>Soort gegevens</th>
                <th>Bewaartermijn</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Account-gegevens (naam, e-mail, wachtwoord)</td>
                <td>Duur van het abonnement + 1 jaar na beëindiging</td>
              </tr>
              <tr>
                <td>Gasten-gegevens van jouw klanten</td>
                <td>Volgens jouw instellingen; standaard 2 jaar na laatste bezoek</td>
              </tr>
              <tr>
                <td>Reserveringen, reviews, campagne-resultaten</td>
                <td>Duur van het abonnement + 1 jaar</td>
              </tr>
              <tr>
                <td>AI-gebruik-logs (tokens, model, feature)</td>
                <td>24 maanden voor kosten- en misbruikanalyse</td>
              </tr>
              <tr>
                <td>Facturen en betaal-administratie</td>
                <td>7 jaar (wettelijke fiscale bewaarplicht)</td>
              </tr>
              <tr>
                <td>Foutlogs en beveiligingsgebeurtenissen</td>
                <td>12 maanden</td>
              </tr>
              <tr>
                <td>Marketing-voorkeuren (opt-in/opt-out)</td>
                <td>Tot je uitschrijft + registratie van de intrekking</td>
              </tr>
            </tbody>
          </table>
          <p>
            Na afloop van deze termijnen worden gegevens verwijderd of
            geanonimiseerd. Anonieme statistieken en geaggregeerde
            prestatie-data (zonder naar individuele klanten herleidbare
            informatie) kunnen langer bewaard blijven om Filly te
            verbeteren.
          </p>
        </div>

        {/* 7. Beveiliging. Niet te gedetailleerd (is ook security-risico
            als je verraadt hoe de sauce precies werkt), maar wel
            concreet genoeg dat user ziet dat we serieus zijn. */}
        <div id="beveiliging" className="legal-section">
          <h2>7. Hoe beveiligen we de gegevens?</h2>
          <p>
            We nemen passende technische en organisatorische maatregelen
            om jouw gegevens te beschermen:
          </p>
          <ul>
            <li>Versleuteling onderweg (TLS 1.2+) en in rust</li>
            <li>Strikte toegangscontrole via row-level-security op database-niveau — data van verschillende klanten zijn technisch gescheiden</li>
            <li>Wachtwoorden opgeslagen als éénrichtings-hash (bcrypt)</li>
            <li>Tweede authenticatie-factor beschikbaar voor account-eigenaren</li>
            <li>Logging van privilege-acties (wie heeft wat gewijzigd)</li>
            <li>Regelmatige back-ups in een EU-regio</li>
            <li>Toegang tot productie-systemen alleen voor geautoriseerde medewerkers, gelogd en audit-baar</li>
          </ul>
          <p>
            Ontdek je toch een kwetsbaarheid? Laat het ons weten via{" "}
            <a href="mailto:security@get-filly.com">security@get-filly.com</a> —
            we nemen elk signaal serieus.
          </p>
        </div>

        {/* 8. Cookies — kort. Zodra we Plausible/analytics inbouwen
            breiden we dit uit naar een aparte /cookies-pagina. */}
        <div id="cookies" className="legal-section">
          <h2>8. Cookies en meetinstrumenten</h2>
          <p>
            We gebruiken alleen functionele cookies die strikt nodig zijn
            om in te loggen en je sessie op te slaan. Deze mogen zonder
            toestemming volgens de Telecommunicatiewet.
          </p>
          <p>
            Zodra we analyse-cookies toevoegen (bijvoorbeeld Plausible,
            wat privacy-vriendelijker is dan Google Analytics), zie je
            een cookie-banner waarin je kunt kiezen. Tracking-cookies van
            derden voor advertenties plaatsen we niet.
          </p>
        </div>

        {/* 9. Rechten betrokkenen. Letterlijk de AVG art. 15-22 plus
            contactkanaal. Moet duidelijk en compleet zijn. */}
        <div id="rechten" className="legal-section">
          <h2>9. Jouw rechten</h2>
          <p>
            Onder de AVG heb je een aantal rechten ten aanzien van de
            persoonsgegevens die wij over jou verwerken. Je kunt ze
            uitoefenen door een e-mail te sturen naar{" "}
            <a href="mailto:privacy@get-filly.com">privacy@get-filly.com</a>.
            We reageren binnen 30 dagen.
          </p>
          <ul>
            <li>
              <strong>Inzage</strong> — een kopie opvragen van de gegevens
              die we over jou hebben
            </li>
            <li>
              <strong>Rectificatie</strong> — onjuiste of onvolledige
              gegevens laten corrigeren
            </li>
            <li>
              <strong>Verwijdering (vergetelheid)</strong> — vragen om
              verwijdering van jouw gegevens, behalve waar wij een
              wettelijke bewaarplicht hebben
            </li>
            <li>
              <strong>Beperking</strong> — vragen om tijdelijke stopzetting
              van de verwerking (bijvoorbeeld tijdens een geschil)
            </li>
            <li>
              <strong>Overdraagbaarheid</strong> — jouw gegevens ontvangen
              in een gangbaar, machine-leesbaar formaat
            </li>
            <li>
              <strong>Bezwaar</strong> — bezwaar maken tegen verwerking op
              basis van gerechtvaardigd belang
            </li>
            <li>
              <strong>Intrekking toestemming</strong> — eerder gegeven
              toestemming weer intrekken (bijv. voor marketing-mails)
            </li>
            <li>
              <strong>Niet onderworpen aan automatische besluitvorming</strong> —
              je kunt vragen om menselijke tussenkomst bij beslissingen
              die uitsluitend door AI zouden worden genomen
            </li>
          </ul>
        </div>

        {/* 10. Wijzigingen. Standaard-clausule. */}
        <div id="wijzigingen" className="legal-section">
          <h2>10. Wijzigingen in deze verklaring</h2>
          <p>
            We mogen deze privacyverklaring van tijd tot tijd bijwerken,
            bijvoorbeeld als we een nieuwe functie introduceren of als de
            wet verandert. Bij een materiële wijziging informeren we
            bestaande klanten via e-mail of in het dashboard. De datum
            bovenaan deze pagina geeft altijd de laatste versie aan.
          </p>
        </div>

        {/* 11. Contact + AP-klacht. Laatste rij: AP-link is verplicht
            zodat betrokkenen hun klachtweg kennen. */}
        <div id="contact" className="legal-section">
          <h2>11. Contact en klachten</h2>
          <p>
            Vragen over je privacy, een verzoek tot uitoefening van je
            rechten, of zorgen over onze omgang met gegevens? Stuur een
            mail naar{" "}
            <a href="mailto:privacy@get-filly.com">privacy@get-filly.com</a>.
          </p>
          <p>
            Ben je het oneens met hoe wij jouw gegevens verwerken en komen
            we er samen niet uit? Dan heb je altijd het recht een klacht
            in te dienen bij de Autoriteit Persoonsgegevens:{" "}
            <a
              href="https://www.autoriteitpersoonsgegevens.nl/nl/zelf-doen/klacht-indienen-bij-de-ap"
              target="_blank"
              rel="noopener noreferrer"
            >
              autoriteitpersoonsgegevens.nl
            </a>.
          </p>
        </div>
      </div>
    </section>
  );
}
