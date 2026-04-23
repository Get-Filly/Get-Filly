// About-pagina van Get-Filly. Structuur:
//   1. Hero: naam + pitch
//   2. Missie: waarom we dit bouwen (statement)
//   3. Onze journey: huidige milestone + toekomstige hoofdstukken
//   4. Team-placeholder: founders (echte namen/fotos komen later)
//   5. Contact-CTA

const missionPillars: { title: string; desc: string }[] = [
  {
    title: "Ondernemer eerst",
    desc: "De eigenaar van een zaak heeft geen tijd voor marketing-knoppen draaien. Filly doet het werk en laat hem of haar focussen op gasten en gerechten.",
  },
  {
    title: "Geen hype, wel resultaat",
    desc: "Geen AI om de AI. We meten het alleen aan extra reserveringen en omzet. Als het dat niet oplevert, stopt het.",
  },
  {
    title: "Eigen data, eigen keuzes",
    desc: "Jouw bezettingsdata en klantenlijst zijn van jou. Geen doorverkoop, geen vendor lock-in, alles te exporteren.",
  },
];

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section style={{ paddingTop: 160, paddingBottom: 48 }} className="about">
        <div className="container">
          <p className="section-label">Over ons</p>
          <h1 className="section-title">Van idee naar impact.</h1>
          <p
            className="section-subtitle"
            style={{ marginTop: 18, maxWidth: 640 }}
          >
            Get-Filly is opgericht door twee ondernemers met één missie:
            zaken helpen om slimmer te vullen — zonder dat je er uren aan
            marketing aan kwijt bent.
          </p>
        </div>
      </section>

      {/* Missie — 3 pijlers in info-cards (herbruik van product-pagina) */}
      <section
        style={{
          background: "var(--true-white)",
          paddingTop: 80,
          paddingBottom: 80,
        }}
      >
        <div className="container">
          <p className="section-label">Missie</p>
          <h2 className="section-title" style={{ maxWidth: 720 }}>
            Wat ons drijft.
          </h2>
          <div className="feature-grid-3">
            {missionPillars.map((p) => (
              <div key={p.title} className="info-card">
                <h3 className="info-card-title">{p.title}</h3>
                <p className="info-card-desc">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Journey — bestaande structuur maar iets rijker */}
      <section style={{ paddingTop: 80, paddingBottom: 80 }} className="about">
        <div className="container">
          <p className="section-label">Onze journey</p>
          <h2 className="section-title">Waar we staan.</h2>
          <div className="journey">
            {/* Huidige milestone */}
            <div className="journey-current">
              <div className="journey-current-header">
                <div className="journey-badge">Nu</div>
                <div className="journey-year">2026</div>
              </div>
              <h3 className="journey-title">Hoofdstuk 1 — Founded</h3>
              <p className="journey-desc">
                Get-Filly is opgericht door twee Nyenrode-alumni met een
                passie voor horeca en technologie. We bouwen aan de
                AI-marketingassistent die elke zaak-eigenaar verdient. Eerste
                klanten onboarden in de komende maanden.
              </p>
            </div>

            <div className="journey-line"></div>

            {/* Toekomstige stappen */}
            <div className="journey-future">
              <div className="journey-future-item">
                <div className="journey-future-dot"></div>
                <div className="journey-future-label">
                  Hoofdstuk 2 — Eerste 100 klanten
                </div>
              </div>
              <div className="journey-future-item">
                <div className="journey-future-dot"></div>
                <div className="journey-future-label">
                  Hoofdstuk 3 — Internationale uitrol
                </div>
              </div>
              <div className="journey-future-item">
                <div className="journey-future-dot"></div>
                <div className="journey-future-label">
                  Hoofdstuk 4 — Benchmarks & community
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact CTA — hergebruikt .cta-section zodat alle elementen
          (label / titel / subtitel) uit dezelfde centrale styling komen. */}
      <section className="cta-section">
        <div className="container">
          <p className="section-label">Contact</p>
          <h2 className="section-title">Laten we kennismaken.</h2>
          <p className="section-subtitle">
            Vragen over Filly, samenwerken of sparren over je marketing?
            Stuur een mail, we reageren snel.
          </p>
          <a href="mailto:hi@get-filly.com" className="cta-btn">
            hi@get-filly.com
          </a>
        </div>
      </section>
    </>
  );
}
