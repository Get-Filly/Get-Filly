// =============================================================================
// ABOUT-PAGINA, 1-op-1 conversie van Claude Design app.jsx → AboutPage.
// =============================================================================

import { COMPANY } from "@/config/company";
import { ScrollReveal } from "@/components/scroll-reveal";

const missionPillars = [
  { title: "Ondernemer eerst", desc: "De ondernemer heeft geen uren te besteden aan marketing of website-optimalisatie. Filly doet het werk, jij richt je op je onderneming en gasten." },
  { title: "Eigen data, eigen keuzes", desc: "Jouw bezettingsdata en gastenlijst blijven van jou. Geen doorverkoop, je zit nergens aan vast, alles te exporteren." },
  { title: "AI die zichzelf terugverdient", desc: "Geen AI om de AI. We zetten jouw data in voor extra reserveringen. Levert het niets op, dan stopt het." },
];

export default function AboutPage() {
  return (
    <>
      {/* Scroll-reveal: laat de items één voor één oppoppen. */}
      <ScrollReveal />
      <section className="about-intro">
        <div className="container">
          <h1 className="section-title">Van idee naar impact.</h1>
          <p className="section-subtitle" style={{ marginTop: 18, maxWidth: 640 }}>
            Get-Filly is opgericht door twee ondernemers met één missie: ondernemingen helpen hun rustige momenten om te zetten in omzet, zonder dat je er uren of grote bedragen aan marketing en website-optimalisatie kwijt bent.
          </p>

          <div className="about-intro-divider"></div>
          <h2 className="section-title" style={{ maxWidth: 720 }}>Wat ons drijft.</h2>

          {/* Hergebruikt dezelfde "hero-diff"-stijl als op de product- en
              pricing-pagina: mono-genummerde 3-koloms strip met dunne
              scheidingslijn bovenaan, geen card-achtergrond. */}
          <div className="product-features-list">
            {missionPillars.map((p, i) => (
              // "Wat ons drijft" staat in beeld bij het laden van /about, dus
              // on-load fade-up (gestaggerd) i.p.v. scroll-reveal — zo poppen
              // tekst + bolletje wél netjes op.
              <div key={p.title} className={`hero-diff fade-up d${i + 1}`}>
                <div className="hero-diff-num">{String(i + 1).padStart(2, "0")}</div>
                <h3 className="hero-diff-title">{p.title}</h3>
                <p className="hero-diff-desc">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="about-journey">
        <div className="container">
          <h2 className="section-title">Waar we staan.</h2>

          <ol className="zig-timeline">
            <li className="zig-item zig-left active">
              <div className="zig-card" data-reveal>
                <div className="zig-card-badge">Nu</div>
                <h3 className="zig-card-title">Hoofdstuk 1, Founded</h3>
                <ul className="zig-card-list">
                  <li>Get-Filly opgericht door twee ambitieuze vrienden</li>
                  <li>MVP live</li>
                  <li>Eerste klanten aan boord</li>
                </ul>
              </div>
              <div className="zig-marker"><span>2026</span></div>
            </li>

            <li className="zig-item zig-right">
              <div className="zig-marker"><span>2027</span></div>
              <div className="zig-card" data-reveal>
                <h3 className="zig-card-title">Hoofdstuk 2, Eerste 100 klanten</h3>
                <ul className="zig-card-list">
                  <li>Filly nationaal uitrollen in heel Nederland</li>
                </ul>
              </div>
            </li>

            <li className="zig-item zig-left">
              <div className="zig-card" data-reveal>
                <h3 className="zig-card-title">Hoofdstuk 3, Internationale uitrol</h3>
                <ul className="zig-card-list">
                  <li>Eerst BeNeLux, daarna DACH-regio</li>
                  <li>Lokale teams, lokale data</li>
                </ul>
              </div>
              <div className="zig-marker"><span>2028</span></div>
            </li>

            <li className="zig-item zig-right">
              <div className="zig-marker"><span>2029</span></div>
              <div className="zig-card" data-reveal>
                <h3 className="zig-card-title">Hoofdstuk 4</h3>
                <ul className="zig-card-list">
                  <li>Wordt vervolgd&hellip;</li>
                </ul>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section className="cta-section">
        <h2 className="section-title">Laten we kennismaken.</h2>
        <p className="section-subtitle">Vragen over Filly, samenwerken of sparren over je marketing? Stuur een mail, we reageren snel.</p>
        <a href={`mailto:${COMPANY.email}`} className="cta-btn">{COMPANY.email}</a>
      </section>
    </>
  );
}
