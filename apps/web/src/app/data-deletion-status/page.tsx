// ============================================================
// Status verwijderverzoek, /data-deletion-status
// ============================================================
// De pagina waarnaar de data-deletion-callback verwijst (de `url` in
// het antwoord aan Meta, met ?id=<confirmation_code>). Hier kan de
// gebruiker bevestigd zien dat z'n verzoek is verwerkt.
//
// Bewust eenvoudig/stateless: de verwijdering gebeurt synchroon in de
// callback, dus de status is altijd "verwerkt". (Een tracking-tabel
// per verzoek kan later, als we async/uitgestelde verwijdering doen.)

import type { Metadata } from "next";
import { COMPANY } from "@/config/company";

export const metadata: Metadata = {
  title: "Status verwijderverzoek",
  description: "Status van je data-verwijderverzoek bij Get-Filly.",
  alternates: { canonical: "/data-deletion-status" },
  // Geen zoekindex: persoonlijke statuspagina met een verzoekcode.
  robots: { index: false, follow: false },
};

export default async function DataDeletionStatusPage({
  searchParams,
}: {
  // Next 15+: searchParams is een Promise in server-componenten.
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;

  return (
    <section className="legal-page">
      <div className="legal-container">
        <h1 className="legal-title">Status verwijderverzoek</h1>

        {id ? (
          <>
            <p className="legal-lead">
              We hebben je verzoek ontvangen en verwerkt. De Facebook-/
              Instagram-koppeling en de daaruit opgehaalde gegevens zijn
              uit {COMPANY.tradeName} verwijderd.
            </p>
            <p>
              Referentiecode: <strong>{id}</strong>
            </p>
          </>
        ) : (
          <p className="legal-lead">
            Geen verzoekcode gevonden. Heb je een verwijderverzoek ingediend
            en wil je de status weten? Neem contact op via het adres hieronder.
          </p>
        )}

        <p>
          Vragen over je gegevens? Mail{" "}
          <a href={`mailto:${COMPANY.privacyEmail}`}>{COMPANY.privacyEmail}</a>.
          Zie ook onze <a href="/delete-data">verwijderinstructies</a> en{" "}
          <a href="/privacy">privacyverklaring</a>.
        </p>
      </div>
    </section>
  );
}
