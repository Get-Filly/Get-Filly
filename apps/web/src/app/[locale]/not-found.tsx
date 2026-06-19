// =============================================================================
// Custom 404, /not-found
// =============================================================================
// Vervangt de kale Next-standaard-404 door een on-brand pagina met heldere
// links terug de site in (beter voor bezoekers én voor crawlers, die zo niet
// in een doodlopende straat belanden). Wordt automatisch binnen de root-
// layout gerenderd, dus navbar + footer zitten er al omheen.
// =============================================================================

import Link from "next/link";

export default function NotFound() {
  return (
    <section className="legal-page">
      <div className="legal-container">
        <h1 className="legal-title">Pagina niet gevonden</h1>
        <p className="legal-lead">
          Deze pagina bestaat niet (meer). Misschien is de link verouderd of is
          er een typefout in het adres geslopen.
        </p>

        <div className="legal-section">
          <p>Ga verder naar een van deze pagina&apos;s:</p>
          <ul>
            <li><Link href="/">Home</Link></li>
            <li><Link href="/product">De oplossing</Link></li>
            <li><Link href="/pricing">Prijzen</Link></li>
            <li><Link href="/about">Over ons</Link></li>
            <li><Link href="/contact">Contact &amp; demo</Link></li>
          </ul>
        </div>

        <div style={{ marginTop: 28 }}>
          <Link href="/" className="btn-primary">Terug naar home</Link>
        </div>
      </div>
    </section>
  );
}
