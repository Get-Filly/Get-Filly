// =============================================================================
// ABOUT-PAGINA, 1-op-1 conversie van Claude Design app.jsx → AboutPage.
// =============================================================================

const missionPillars = [
  { title: "Ondernemer eerst", desc: "De eigenaar van een onderneming heeft geen tijd voor marketing-knoppen draaien. Filly doet het werk en laat hem of haar focussen op gasten en gerechten." },
  { title: "Geen hype, wel resultaat", desc: "Geen AI om de AI. We meten het alleen aan extra reserveringen en omzet. Als het dat niet oplevert, stopt het." },
  { title: "Eigen data, eigen keuzes", desc: "Jouw bezettingsdata en klantenlijst zijn van jou. Geen doorverkoop, geen vendor lock-in, alles te exporteren." },
];

export default function AboutPage() {
  return (
    <>
      <section className="about-intro">
        <div className="container">
          <p className="section-label">Over ons</p>
          <h1 className="section-title">Van idee naar impact.</h1>
          <p className="section-subtitle" style={{ marginTop: 18, maxWidth: 640 }}>
            Get-Filly is opgericht door twee ondernemers met één missie: ondernemingen helpen om slimmer te vullen, zonder dat je er uren aan marketing aan kwijt bent.
          </p>

          <div className="about-intro-divider"></div>

          <p className="section-label" style={{ marginTop: 0 }}>Missie</p>
          <h2 className="section-title" style={{ maxWidth: 720 }}>Wat ons drijft.</h2>

          {/* Hergebruikt dezelfde "hero-diff"-stijl als op de product- en
              pricing-pagina: mono-genummerde 3-koloms strip met dunne
              scheidingslijn bovenaan, geen card-achtergrond. */}
          <div className="product-features-list">
            {missionPillars.map((p, i) => (
              <div key={p.title} className="hero-diff">
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
          <p className="section-label">Onze journey</p>
          <h2 className="section-title">Waar we staan.</h2>

          <ol className="zig-timeline">
            <li className="zig-item zig-left active">
              <div className="zig-card">
                <div className="zig-card-badge">Nu</div>
                <h3 className="zig-card-title">Hoofdstuk 1 &mdash; Founded</h3>
                <ul className="zig-card-list">
                  <li>Get-Filly opgericht door twee Nyenrode-alumni</li>
                  <li>Eerste klanten onboarden in Amsterdam &amp; Utrecht</li>
                  <li>AI-marketingassistent voor de horeca live</li>
                </ul>
              </div>
              <div className="zig-marker"><span>2026</span></div>
            </li>

            <li className="zig-item zig-right">
              <div className="zig-marker"><span>2027</span></div>
              <div className="zig-card">
                <h3 className="zig-card-title">Hoofdstuk 2 &mdash; Eerste 100 klanten</h3>
                <ul className="zig-card-list">
                  <li>Filly nationaal uitrollen in heel Nederland</li>
                  <li>Alle horeca-types &mdash; van bistro tot brasserie</li>
                </ul>
              </div>
            </li>

            <li className="zig-item zig-left">
              <div className="zig-card">
                <h3 className="zig-card-title">Hoofdstuk 3 &mdash; Internationale uitrol</h3>
                <ul className="zig-card-list">
                  <li>Eerst BeNeLux, daarna DACH-regio</li>
                  <li>Lokale teams, lokale data</li>
                </ul>
              </div>
              <div className="zig-marker"><span>2028</span></div>
            </li>

            <li className="zig-item zig-right">
              <div className="zig-marker"><span>2029</span></div>
              <div className="zig-card">
                <h3 className="zig-card-title">Hoofdstuk 4 &mdash; Benchmarks &amp; community</h3>
                <ul className="zig-card-list">
                  <li>Restaurants vergelijken met peers</li>
                  <li>Best practices delen tussen ondernemingen onderling</li>
                </ul>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section className="cta-section">
        <div className="container">
          <p className="section-label">Contact</p>
          <h2 className="section-title">Laten we kennismaken.</h2>
          <p className="section-subtitle">Vragen over Filly, samenwerken of sparren over je marketing? Stuur een mail, we reageren snel.</p>
          <a href="mailto:hi@get-filly.com" className="cta-btn">hi@get-filly.com</a>
        </div>
      </section>
    </>
  );
}
