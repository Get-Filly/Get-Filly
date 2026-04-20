export default function AboutPage() {
  return (
    <section style={{ paddingTop: 160 }} className="about">
      <div className="container">
        <p className="section-label">Over ons</p>
        <h1 className="section-title">Van idee naar impact.</h1>
        <p className="section-subtitle">
          Get-Filly is opgericht door twee ondernemers met één missie:
          restaurants helpen om slimmer te vullen.
        </p>

        <div className="journey">

          {/* Huidige milestone */}
          <div className="journey-current">
            <div className="journey-current-header">
              <div className="journey-badge">Nu</div>
              <div className="journey-year">2026</div>
            </div>
            <h2 className="journey-title">Hoofdstuk 1 — Founded</h2>
            <p className="journey-desc">
              Get-Filly is opgericht door twee Nyenrode-alumni met een passie
              voor horeca en technologie. We bouwen aan de AI-marketingassistent
              die elke restauranteigenaar verdient.
            </p>
          </div>

          {/* Verbindingslijn */}
          <div className="journey-line"></div>

          {/* Toekomstige stappen */}
          <div className="journey-future">
            {[1, 2, 3].map((i) => (
              <div key={i} className="journey-future-item">
                <div className="journey-future-dot"></div>
                <div className="journey-future-label">Volgend hoofdstuk</div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}
