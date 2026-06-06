// ============================================================
// Gegevens verwijderen, /delete-data
// ============================================================
// Publieke pagina die Meta App Review vereist als "Data Deletion
// Instructions URL": uitleg hoe een gebruiker zijn account/gegevens
// en de Facebook/Instagram-koppeling laat verwijderen.
//
// Verwijst naar de bestaande in-app account-verwijdering
// (Dashboard → Account → "Account permanent verwijderen", die
// `deleteAccount()` aanroept) + het intrekken van de koppeling aan
// Meta-zijde + een handmatig verzoek per e-mail.
//
// Bedrijfsgegevens (contactadres) komen uit `config/company.ts`.
// ============================================================

import type { Metadata } from "next";
import { COMPANY } from "@/config/company";

export const metadata: Metadata = {
  title: "Gegevens verwijderen",
  description:
    "Hoe je je Get-Filly-account, je gegevens en je Facebook/Instagram-koppeling verwijdert of laat verwijderen.",
  alternates: { canonical: "/delete-data" },
};

const LAST_UPDATED = "6 juni 2026";

export default function DeleteDataPage() {
  return (
    <section className="legal-page">
      <div className="legal-container">
        <p className="legal-meta">Laatst bijgewerkt: {LAST_UPDATED}</p>
        <h1 className="legal-title">Gegevens verwijderen</h1>
        <p className="legal-lead">
          Je houdt zelf de controle over je gegevens. Op deze pagina lees
          je hoe je je {COMPANY.tradeName}-account en de daaraan gekoppelde
          gegevens verwijdert, hoe je een gekoppeld Facebook- of
          Instagram-account weer loskoppelt, en hoe je een
          verwijderverzoek kunt indienen als je liever niet zelf in het
          dashboard werkt. Voor het volledige overzicht van welke gegevens
          wij verwerken en hoe lang, zie onze{" "}
          <a href="/privacy">privacyverklaring</a>.
        </p>

        <h2 id="account">1. Je account en gegevens verwijderen</h2>
        <p>
          De snelste manier is via het dashboard. Log in en ga naar{" "}
          <strong>Account</strong>; onderaan vind je de knop{" "}
          <strong>“Account permanent verwijderen”</strong>. Ter bevestiging
          typ je het woord <em>VERWIJDER</em>. Hiermee verwijderen we je
          account en de bijbehorende gegevens, inclusief eventuele tokens
          van gekoppelde diensten (zoals Facebook en Instagram).
        </p>

        <h2 id="meta">2. De Facebook-/Instagram-koppeling intrekken</h2>
        <p>
          Wil je alleen de koppeling met Facebook of Instagram weghalen
          (en je {COMPANY.tradeName}-account behouden), dan kan dat aan
          beide kanten:
        </p>
        <ul>
          <li>
            <strong>Bij Meta:</strong> ga in Facebook naar{" "}
            <strong>
              Instellingen &amp; privacy → Instellingen → Apps en websites
            </strong>{" "}
            (voor Business-assets: <strong>Bedrijfsintegraties</strong>),
            zoek {COMPANY.tradeName} en kies <strong>Verwijderen</strong>.
            Daarmee trek je onze toegang per direct in. Zodra Meta ons
            hiervan op de hoogte stelt, verwijderen wij de via Meta
            verkregen gegevens.
          </li>
          <li>
            <strong>Bij {COMPANY.tradeName}:</strong> wil je dat wij de bij
            ons opgeslagen toegangstoken wissen, verwijder dan je account
            (stap 1) of dien een verzoek in (stap 4). Wij wissen de token
            dan binnen de genoemde termijn.
          </li>
        </ul>

        <h2 id="welke-gegevens">3. Welke gegevens en binnen welke termijn</h2>
        <p>
          Bij een account- of koppelingsverwijdering wissen wij de
          gegevens die wij voor die functionaliteit bewaren — waaronder
          toegangstokens, gekoppelde pagina-/accountverwijzingen en
          daaruit opgehaalde inhoud. Wij verwerken een verzoek{" "}
          <strong>binnen 30 dagen</strong>. Een beperkt deel van de
          gegevens kunnen wij langer bewaren wanneer dat wettelijk
          verplicht is (bijvoorbeeld voor de fiscale administratie); zie
          de bewaartermijnen in de <a href="/privacy">privacyverklaring</a>.
        </p>

        <h2 id="verzoek">4. Een verwijderverzoek indienen</h2>
        <p>
          Liever niet zelf in het dashboard? Stuur dan een e-mail naar{" "}
          <a href={`mailto:${COMPANY.privacyEmail}`}>
            {COMPANY.privacyEmail}
          </a>{" "}
          vanaf het e-mailadres van je account, met als onderwerp
          “Verwijderverzoek”. Vermeld of je je hele account wilt
          verwijderen of alleen de Facebook-/Instagram-koppeling. Wij
          bevestigen de afhandeling per e-mail.
        </p>
      </div>
    </section>
  );
}
