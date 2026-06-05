// ============================================================
// /account-verwijderd, bevestigingspagina na AVG-delete
// ============================================================
// Landingspagina nadat een gebruiker via de account-pagina zijn
// account permanent heeft laten verwijderen. Bewust publiek (geen
// auth-gate) want na de delete is de gebruiker uitgelogd én bestaat
// het auth-account niet meer, dashboard is onbereikbaar.
//
// Doel:
//   1. Bevestigen dat de actie is uitgevoerd
//   2. Transparant zijn over wat is gewist en wat (geanonimiseerd)
//      bewaard blijft, zodat de gebruiker weet dat we AVG-conform
//      handelen (Recital 26 voor de leerschat, art. 17 voor de PII)
//   3. Vriendelijk afscheid + uitnodiging om later terug te komen
// ============================================================

import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "../../components/ui/button-link";
import { COMPANY } from "@/config/company";

export const metadata: Metadata = {
  title: "Account verwijderd",
  description: "Je Get-Filly-account en alle bijbehorende data zijn verwijderd.",
  // Bevestigingspagina na verwijdering: niet relevant voor de zoekindex.
  robots: { index: false, follow: false },
};

export default function AccountVerwijderdPage() {
  return (
    <section className="legal-page">
      <div className="legal-container">
        <h1 className="legal-title">Je account is verwijderd</h1>
        <p className="legal-lead">
          Bedankt dat je Get-Filly hebt geprobeerd. Je account en alle
          bijbehorende business-data zijn permanent gewist conform jouw
          verzoek (AVG art. 17, recht op vergetelheid).
        </p>

        <div className="legal-section">
          <h2>Wat is gewist?</h2>
          <ul>
            <li>
              Je restaurant-profiel inclusief naam, adres, contact en
              KvK-gegevens
            </li>
            <li>
              Alle gasten, reserveringen, menu-items en uploads
            </li>
            <li>
              Campagnes, reviews-historie, chat met Filly en audit-log
            </li>
            <li>
              Je inlog-account (e-mailadres en versleuteld wachtwoord)
            </li>
            <li>
              Eventueel geüploade foto&apos;s in onze opslag
            </li>
          </ul>
        </div>

        <div className="legal-section">
          <h2>Wat blijft bewaard (en waarom mag dat)?</h2>
          <p>
            We bewaren een sterk geanonimiseerde leerschat zodat Filly
            voor andere ondernemers betere voorstellen kan blijven doen.
            Onder Recital 26 van de AVG/GDPR vallen{" "}
            <em>volledig anonieme</em> gegevens niet langer onder de
            verordening, we doen ons uiterste best om dat hier zo te
            houden:
          </p>
          <ul>
            <li>
              Geen restaurant-naam, adres, eigenaar-naam of e-mailadres
            </li>
            <li>
              Wel: cuisine-stijl ("italiaans"), regio op provincie-niveau,
              capaciteit-categorie en maand van het jaar
            </li>
            <li>
              Wel: type campagne (mail / social / whatsapp), thema en,
              indien beschikbaar, het succes-signaal (extra reserveringen,
              omzet-impact)
            </li>
            <li>
              Geen vrije tekst, geen fotos, geen identificeerbare relatie
              terug naar jou of jouw onderneming
            </li>
          </ul>
          <p>
            Daarnaast houden we een anonieme bewijsregel bij, alleen
            datum + tellers, zodat we kunnen aantonen dat we je
            verwijderverzoek hebben uitgevoerd (AVG art. 30
            verantwoordingsplicht). Geen persoonsgegevens.
          </p>
        </div>

        <div className="legal-section">
          <h2>Vragen of bedenkingen?</h2>
          <p>
            Heb je nog vragen over deze verwijdering, of wil je iets met
            ons delen over wat beter had gekund? Mail ons gerust op{" "}
            <a href={`mailto:${COMPANY.privacyEmail}`}>{COMPANY.privacyEmail}</a>.
          </p>
          <p>
            Wil je later terugkomen? Een nieuw account aanmaken kan
            altijd via{" "}
            <Link href="/signup">get-filly.com/signup</Link>.
          </p>
        </div>

        <div
          className="legal-section"
          style={{ display: "flex", gap: 12, marginTop: 32 }}
        >
          <ButtonLink href="/">Terug naar de homepage</ButtonLink>
        </div>
      </div>
    </section>
  );
}
