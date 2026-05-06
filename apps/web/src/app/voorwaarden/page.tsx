// ============================================================
// Algemene voorwaarden — /voorwaarden
// ============================================================
// Publieke pagina met onze algemene voorwaarden voor gebruik van
// het Get-Filly SaaS-platform door zakelijke klanten (B2B).
//
// Dit is een CONCEPT v1, zoals privacy.tsx — gele draft-banner
// verdwijnt automatisch zodra `legalName` + `kvk` zijn gevuld in
// `apps/web/src/config/company.ts`. Lege velden tonen tot dan
// een "[NOG IN TE VULLEN: ...]"-placeholder via <LegalField/>.
//
// Uitgangspunten van deze voorwaarden:
//   - B2B — klanten zijn horeca/wellness/hotel-ondernemers
//   - SaaS-model — maandelijks/jaarlijks abonnement via Mollie
//   - Data-eigendom blijft bij de klant
//   - Wij zijn verwerker van gasten-data (AVG art. 28)
//   - Nederlands recht + bevoegde rechter Amsterdam
//
// Aandachtspunten die een jurist moet checken vóór launch:
//   - Aansprakelijkheidslimiet (nu: 12 maanden abonnement)
//   - SLA-toezegging (nu: "streven naar 99%" — geen harde claim)
//   - IP-constructie voor AI-output (klant krijgt output, wij
//     behouden de techniek)
//   - Prijswijzigings-clausule
//   - Opzegtermijn
// ============================================================

import type { Metadata } from "next";
import {
  COMPANY,
  formatLegalIdentifier,
  isLegalDataComplete,
} from "@/config/company";
import { LegalField } from "@/components/legal-field";

export const metadata: Metadata = {
  title: "Algemene voorwaarden — Get-Filly",
  description:
    "De voorwaarden waaronder je Get-Filly kunt gebruiken, inclusief abonnement, aansprakelijkheid en opzegging.",
};

const LAST_UPDATED = "24 april 2026";
const VERSION = "v1 (concept)";

export default function VoorwaardenPage() {
  // Zelfde logica als op /privacy: zolang KvK + legal_name in
  // de centrale config leeg zijn blijft de gele draft-banner staan.
  const showDraftBanner = !isLegalDataComplete();
  const legalIdentifier = formatLegalIdentifier();

  return (
    <section className="legal-page">
      <div className="legal-container">
        {showDraftBanner && (
          <div className="legal-draft-banner">
            <strong>Concept — nog niet juridisch gereviewd.</strong> Deze
            tekst is een eerste versie. Vóór we klanten accepteren laten
            we 'm controleren door een advocaat en vullen we de ontbrekende
            bedrijfsgegevens in. Tot die tijd gelden deze voorwaarden niet
            als bindende overeenkomst.
          </div>
        )}

        <p className="legal-meta">
          Laatst bijgewerkt: {LAST_UPDATED} · {VERSION}
        </p>
        <h1 className="legal-title">Algemene voorwaarden</h1>
        <p className="legal-lead">
          Deze algemene voorwaarden gelden voor elk gebruik van het
          Get-Filly-platform en alle diensten die wij daaromheen
          aanbieden. Lees ze zorgvuldig door voordat je een account
          aanmaakt of een abonnement afsluit. Door akkoord te gaan met
          deze voorwaarden sluit je een overeenkomst met ons.
        </p>

        <nav className="legal-toc" aria-label="Inhoudsopgave">
          <div className="legal-toc-title">Inhoud</div>
          <ol>
            <li><a href="#definities">Definities</a></li>
            <li><a href="#toepasselijkheid">Toepasselijkheid</a></li>
            <li><a href="#overeenkomst">Aanbod en overeenkomst</a></li>
            <li><a href="#dienst">Onze dienst</a></li>
            <li><a href="#account">Account en verantwoordelijkheden</a></li>
            <li><a href="#prijzen">Abonnement, prijzen en betaling</a></li>
            <li><a href="#duur">Duur en opzegging</a></li>
            <li><a href="#data">Data-eigendom en verwerking</a></li>
            <li><a href="#ip">Intellectueel eigendom</a></li>
            <li><a href="#aansprakelijkheid">Aansprakelijkheid</a></li>
            <li><a href="#geheimhouding">Geheimhouding</a></li>
            <li><a href="#overmacht">Overmacht</a></li>
            <li><a href="#wijzigingen">Wijzigingen</a></li>
            <li><a href="#recht">Toepasselijk recht en geschillen</a></li>
          </ol>
        </nav>

        <div id="definities" className="legal-section">
          <h2>1. Definities</h2>
          <p>In deze voorwaarden wordt verstaan onder:</p>
          <ul>
            <li>
              <strong>Get-Filly / wij / ons</strong> —{" "}
              <LegalField
                value={legalIdentifier}
                placeholder="volledige bedrijfsnaam + KvK-nummer"
              />
              , gevestigd te{" "}
              <LegalField
                value={COMPANY.addressCity}
                placeholder="vestigingsplaats"
              />
              .
            </li>
            <li>
              <strong>Klant / jij / je</strong> — de natuurlijke persoon
              of rechtspersoon die met Get-Filly een overeenkomst sluit
              voor het gebruik van het platform, handelend in de
              uitoefening van beroep of bedrijf.
            </li>
            <li>
              <strong>Platform</strong> — de website, applicatie en
              bijbehorende diensten van Get-Filly, bereikbaar via
              get-filly.com en app.get-filly.com.
            </li>
            <li>
              <strong>Filly</strong> — de AI-marketingassistent binnen het
              platform, die gebruik maakt van large language models van
              onze sub-verwerker Anthropic.
            </li>
            <li>
              <strong>Account</strong> — het persoonlijke toegangsprofiel
              van een gebruiker tot het platform.
            </li>
            <li>
              <strong>Abonnement</strong> — de door de klant gekozen
              betaalde dienstverlening met bijbehorende periode en prijs.
            </li>
            <li>
              <strong>Gastgegevens</strong> — persoonsgegevens van derden
              (eindgasten van de klant) die de klant via het platform
              verwerkt.
            </li>
          </ul>
        </div>

        <div id="toepasselijkheid" className="legal-section">
          <h2>2. Toepasselijkheid</h2>
          <p>
            Deze voorwaarden zijn van toepassing op alle aanbiedingen van
            en overeenkomsten met Get-Filly, en op elk gebruik van het
            platform — ongeacht of je een betaald abonnement hebt of niet.
          </p>
          <p>
            Afwijkingen van deze voorwaarden zijn alleen geldig als wij
            die schriftelijk met je hebben bevestigd. Jouw eigen algemene
            inkoopvoorwaarden wijzen wij uitdrukkelijk van de hand.
          </p>
          <p>
            Deze voorwaarden zijn bedoeld voor zakelijk gebruik (B2B).
            Consumenten zijn geen doelgroep van ons aanbod.
          </p>
        </div>

        <div id="overeenkomst" className="legal-section">
          <h2>3. Aanbod en totstandkoming van de overeenkomst</h2>
          <p>
            Alle aanbiedingen op onze website zijn vrijblijvend tenzij
            anders aangegeven. De overeenkomst komt tot stand op het
            moment dat je een account aanmaakt, een abonnement kiest en
            akkoord gaat met deze voorwaarden, of op het moment dat wij
            een schriftelijk voorstel door jou laten ondertekenen.
          </p>
          <p>
            Voor zover een aanbieding een fout of kennelijke vergissing
            bevat, zijn wij daaraan niet gebonden.
          </p>
        </div>

        <div id="dienst" className="legal-section">
          <h2>4. Onze dienst</h2>
          <p>
            Get-Filly biedt een SaaS-platform waarmee horeca-, wellness-
            en hotelondernemers hun marketing kunnen automatiseren met
            behulp van AI. De dienst omvat onder andere:
          </p>
          <ul>
            <li>Een dashboard met inzicht in reserveringen, bezetting en gasten</li>
            <li>AI-gegenereerde reviews-antwoorden, campagne-suggesties en chat</li>
            <li>Menu-analyse via beeldherkenning</li>
            <li>Koppelingen met externe marketing- en reserveringssystemen</li>
          </ul>
          <p>
            <strong>Beschikbaarheid.</strong> We streven naar een
            beschikbaarheid van 99% per kalendermaand, maar geven geen
            harde SLA-garantie. Geplande onderhoudswerkzaamheden melden we
            zo mogelijk tevoren.
          </p>
          <p>
            <strong>AI-output.</strong> De uitkomsten van Filly (teksten,
            suggesties, analyses) zijn adviesmatig. Ze kunnen fouten
            bevatten of onvolledig zijn. De klant beoordeelt zelf of een
            AI-output passend is vóór publicatie of gebruik richting
            derden. Get-Filly is niet verantwoordelijk voor gevolgen van
            het ongecontroleerd overnemen van AI-output.
          </p>
        </div>

        <div id="account" className="legal-section">
          <h2>5. Account en verantwoordelijkheden van de klant</h2>
          <p>
            Je bent verantwoordelijk voor het veilig bewaren van je
            inloggegevens en voor al het gebruik dat via jouw account
            plaatsvindt. Als je vermoedt dat een onbevoegde toegang heeft
            gehad tot jouw account, stel ons dan direct op de hoogte.
          </p>
          <p>Je garandeert dat je:</p>
          <ul>
            <li>Juiste en actuele gegevens over jouw onderneming opgeeft</li>
            <li>Alleen content uploadt waar jij de rechten op hebt (menukaarten, foto's, teksten)</li>
            <li>Het platform niet gebruikt voor onrechtmatige of misleidende communicatie</li>
            <li>Geen pogingen doet om het platform, onze beveiliging of onze AI-systemen te misbruiken</li>
            <li>Voldoet aan wetgeving bij het verwerken van gastgegevens — met name AVG, ePrivacy en ondernemingsspecifieke regels (horeca, alcohol, kansspelen waar van toepassing)</li>
          </ul>
          <p>
            Bij oneigenlijk gebruik kunnen we het account (tijdelijk)
            blokkeren en — bij een ernstige schending — de overeenkomst
            per direct beëindigen zonder recht op restitutie.
          </p>
        </div>

        <div id="prijzen" className="legal-section">
          <h2>6. Abonnement, prijzen en betaling</h2>
          <p>
            De actuele prijzen van onze abonnementen staan op{" "}
            <a href="/pricing">get-filly.com/pricing</a>. Alle prijzen
            zijn in euro's, exclusief btw tenzij anders vermeld.
          </p>
          <h3>6.1 Betaling</h3>
          <p>
            Betaling verloopt via onze betaalpartner Mollie B.V. (iDEAL,
            creditcard, SEPA-incasso). Het abonnementsbedrag wordt
            vooruit per periode afgeschreven — maandelijks of jaarlijks,
            afhankelijk van de door jou gekozen termijn.
          </p>
          <h3>6.2 Bij niet-betaling</h3>
          <p>
            Als een betaling mislukt, proberen we de incasso nog twee keer.
            Blijft de betaling uit, dan kunnen we de toegang tot het
            platform opschorten tot betaling is ontvangen. Bij langer dan
            30 dagen openstaande betaling hebben we het recht de
            overeenkomst te beëindigen en de openstaande bedragen ter
            incasso uit handen te geven; buitengerechtelijke incassokosten
            komen voor jouw rekening conform de Wet Incassokosten.
          </p>
          <h3>6.3 Prijswijzigingen</h3>
          <p>
            Wij kunnen de prijzen jaarlijks per 1 januari aanpassen,
            bijvoorbeeld op basis van inflatie (CBS consumentenprijsindex)
            of wijzigingen in onze kosten voor AI-verwerking. We kondigen
            een prijswijziging tenminste één maand van tevoren aan. Ben
            je het oneens met de nieuwe prijs, dan kun je je abonnement
            opzeggen tegen de ingangsdatum van de wijziging.
          </p>
        </div>

        <div id="duur" className="legal-section">
          <h2>7. Duur en opzegging</h2>
          <p>
            Een abonnement gaat in op de dag van activatie en loopt voor
            de door jou gekozen periode (1 maand of 1 jaar). Daarna wordt
            het abonnement stilzwijgend verlengd voor dezelfde periode,
            tenzij je tenminste één maand vóór het einde van de lopende
            periode opzegt via het dashboard of via{" "}
            <a href="mailto:hi@get-filly.com">hi@get-filly.com</a>.
          </p>
          <p>
            Na opzegging blijft het platform beschikbaar tot het einde van
            de reeds betaalde periode. Daarna wordt het account
            gedeactiveerd en worden persoonsgegevens volgens onze
            privacyverklaring verwijderd of geanonimiseerd.
          </p>
          <p>
            <strong>Ontbinding.</strong> Beide partijen kunnen de
            overeenkomst buitengerechtelijk ontbinden als de andere partij
            ernstig tekortschiet en die tekortkoming niet binnen 30 dagen
            na schriftelijke ingebrekestelling herstelt. In geval van
            faillissement, surseance of staken van de onderneming is
            ontbinding onmiddellijk mogelijk.
          </p>
        </div>

        <div id="data" className="legal-section">
          <h2>8. Data-eigendom en verwerking</h2>
          <p>
            Alle gegevens die jij in het platform invoert of uploadt
            blijven jouw eigendom. Wij krijgen uitsluitend het recht om
            die gegevens te gebruiken voor zover nodig om de dienst aan
            jou te leveren en te verbeteren.
          </p>
          <p>
            Voor zover je via het platform persoonsgegevens van jouw
            gasten of klanten verwerkt, ben jij de
            verwerkingsverantwoordelijke en zijn wij de verwerker in de
            zin van artikel 28 AVG. De afspraken over die verwerking
            leggen we vast in een verwerkersovereenkomst die onlosmakelijk
            deel uitmaakt van deze voorwaarden; een exemplaar is op
            aanvraag beschikbaar.
          </p>
          <p>
            <strong>Export bij vertrek.</strong> Bij beëindiging van de
            overeenkomst kun je tot 30 dagen na afloop je data exporteren
            in een gangbaar formaat. Daarna behouden we anonieme,
            geaggregeerde data (zonder naar jou of je gasten herleidbare
            informatie) voor product-verbetering.
          </p>
          <p>
            Meer over hoe we met persoonsgegevens omgaan vind je in onze{" "}
            <a href="/privacy">privacyverklaring</a>.
          </p>
        </div>

        <div id="ip" className="legal-section">
          <h2>9. Intellectueel eigendom</h2>
          <p>
            Alle intellectuele eigendomsrechten op het platform — de
            software, het ontwerp, de teksten, de Filly-merknaam en
            bijbehorende logo's — berusten bij Get-Filly of haar
            licentiegevers. Niets in deze voorwaarden draagt enig
            eigendom aan jou over.
          </p>
          <p>
            <strong>Wat krijg jij?</strong> Voor de duur van je abonnement
            krijg je een niet-exclusief, niet-overdraagbaar recht om het
            platform te gebruiken voor je eigen onderneming.
          </p>
          <p>
            <strong>AI-output.</strong> Teksten, afbeeldingen en andere
            inhoud die Filly op basis van jouw invoer genereert (de
            "output") mag je vrij gebruiken binnen jouw onderneming —
            zowel tijdens als na het abonnement. Houd er rekening mee dat
            AI-output in uitzonderlijke gevallen overeenkomsten kan
            vertonen met bestaand werk van derden. Jij beoordeelt vóór
            publicatie zelf of verder eigen creatieve bewerking nodig is.
          </p>
        </div>

        <div id="aansprakelijkheid" className="legal-section">
          <h2>10. Aansprakelijkheid</h2>
          <p>
            Onze dienst wordt uitgevoerd op basis van een
            inspanningsverplichting, niet een resultaatsverplichting. We
            doen ons uiterste best voor een stabiel, veilig en nuttig
            platform, maar geven geen garantie dat elke suggestie van
            Filly zal leiden tot méér reserveringen of omzet.
          </p>
          <p>
            <strong>Beperking.</strong> Onze totale aansprakelijkheid
            jegens jou per gebeurtenis of reeks samenhangende
            gebeurtenissen is beperkt tot het bedrag dat je in de
            voorafgaande twaalf maanden aan abonnementskosten aan ons hebt
            betaald, met een absolute maximum van{" "}
            <LegalField
              value={COMPANY.liabilityCap}
              placeholder="bedrag, bv. € 25.000"
            />
            {" "}per kalenderjaar.
          </p>
          <p>
            <strong>Uitgesloten schade.</strong> Wij zijn niet aansprakelijk
            voor indirecte schade, waaronder in elk geval begrepen:
            gederfde winst, gemiste besparingen, reputatieschade,
            verminking van data, of schade door bedrijfsstilstand.
          </p>
          <p>
            <strong>Wanneer gelden deze beperkingen niet?</strong> Bij
            opzet of bewuste roekeloosheid van Get-Filly zelf gelden deze
            aansprakelijkheids-beperkingen niet.
          </p>
          <p>
            Je vrijwaart ons voor aanspraken van derden — waaronder
            gastgegevens-betrokkenen — die voortkomen uit jouw gebruik van
            het platform in strijd met de wet of deze voorwaarden.
          </p>
        </div>

        <div id="geheimhouding" className="legal-section">
          <h2>11. Geheimhouding</h2>
          <p>
            Beide partijen houden vertrouwelijke informatie die ze van de
            ander ontvangen — zoals prijzen, roadmap-informatie,
            zakelijke gegevens en gastenlijsten — geheim, tenzij
            openbaarmaking wettelijk verplicht is of schriftelijk
            toestemming is gegeven.
          </p>
          <p>
            De geheimhouding blijft gelden tot drie jaar na afloop van de
            overeenkomst.
          </p>
        </div>

        <div id="overmacht" className="legal-section">
          <h2>12. Overmacht</h2>
          <p>
            Onder overmacht verstaan we elke niet aan ons toerekenbare
            omstandigheid die nakoming verhindert. Daaronder valt in elk
            geval: storingen bij onze sub-verwerkers (Supabase, Anthropic,
            Resend, Vercel, Mollie), langdurige internetstoringen,
            overheidsmaatregelen, en cyberaanvallen buiten onze redelijke
            controle.
          </p>
          <p>
            In overmacht-situaties is nakoming opgeschort zolang de
            overmacht voortduurt. Als deze langer dan 30 dagen duurt, kan
            elke partij de overeenkomst zonder rechterlijke tussenkomst
            ontbinden zonder tot schadevergoeding gehouden te zijn.
          </p>
        </div>

        <div id="wijzigingen" className="legal-section">
          <h2>13. Wijzigingen in deze voorwaarden</h2>
          <p>
            Wij mogen deze voorwaarden van tijd tot tijd wijzigen. Wij
            informeren je tenminste één maand vóór inwerkingtreding via
            e-mail of in het dashboard. Ga je niet akkoord met de
            wijziging? Dan kun je jouw abonnement opzeggen tegen de datum
            waarop de wijziging ingaat.
          </p>
          <p>
            Wijzigingen die noodzakelijk zijn om te voldoen aan een
            wettelijke verplichting, een uitspraak van een rechter of een
            besluit van een toezichthouder kunnen zonder die
            opzegtermijn ingaan.
          </p>
        </div>

        <div id="recht" className="legal-section">
          <h2>14. Toepasselijk recht en geschillen</h2>
          <p>
            Op deze overeenkomst is uitsluitend Nederlands recht van
            toepassing.
          </p>
          <p>
            Voordat een geschil aan de rechter wordt voorgelegd, zullen
            partijen in overleg treden om tot een oplossing te komen.
            Lukt dat niet, dan is de rechter van de rechtbank{" "}
            <LegalField
              value={COMPANY.court}
              placeholder="rechtbank, bv. Amsterdam"
            />
            {" "}bij uitsluiting bevoegd om kennis te nemen van het geschil,
            tenzij dwingend recht een andere rechter aanwijst.
          </p>
        </div>

        {/* Afsluitende contact-alinea zonder nummer — voor als een klant
            niet weet waar hij moet beginnen. Belangrijk voor bereikbaar-
            heid; klanten lezen deze pagina vaak pas wanneer er iets is. */}
        <div className="legal-section">
          <p>
            <strong>Vragen?</strong> Stuur een mail naar{" "}
            <a href="mailto:hi@get-filly.com">hi@get-filly.com</a> — we
            nemen contact op binnen één werkdag.
          </p>
        </div>
      </div>
    </section>
  );
}
