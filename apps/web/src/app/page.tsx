import Link from "next/link";

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="hero">
        <div className="container">
          <p className="section-label fade-up">Voor horecaondernemers</p>
          <h1 className="section-title fade-up d1">
            Meer gasten.
            <br />
            Minder lege stoelen.
          </h1>
          <p className="section-subtitle fade-up d2">
            Get-Filly analyseert je bezettingsdata en zet AI in om automatisch
            campagnes te draaien die je restaurant voller maken.
          </p>
          <div className="hero-cta fade-up d3">
            <Link href="/pricing" className="btn-primary">
              Vraag een demo aan
            </Link>
            <Link href="/product" className="btn-secondary">
              Bekijk het product →
            </Link>
          </div>

          {/* Dashboard mockup */}
          <div className="hero-mockup fade-up d4">
            <div className="mockup-bar">
              <div className="mockup-dot"></div>
              <div className="mockup-dot"></div>
              <div className="mockup-dot"></div>
            </div>
            <div className="mockup-content">
              <div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text-light)",
                    fontWeight: 500,
                    marginBottom: 16,
                  }}
                >
                  Bezettingsgraad — Week 16
                </div>
                <div className="mockup-chart">
                  {[
                    { day: "Ma", h: 50, pct: 50, c: "var(--orange)" },
                    { day: "Di", h: 60, pct: 60, c: "var(--orange)" },
                    { day: "Wo", h: 65, pct: 65, c: "var(--orange)" },
                    { day: "Do", h: 40, pct: 38, c: "var(--red)" },
                    { day: "Vr", h: 100, pct: 98, c: "var(--green)" },
                    { day: "Za", h: 110, pct: 100, c: "var(--green)" },
                    { day: "Zo", h: 90, pct: 91, c: "var(--green)" },
                  ].map(({ day, h, pct, c }) => (
                    <div key={day} className="mock-bar-group">
                      <div className="mock-bar-pct" style={{ color: c }}>{pct}%</div>
                      <div
                        className="mock-bar"
                        style={{ height: h, background: c }}
                      ></div>
                      <div className="mock-bar-label">{day}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mockup-chat">
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text-light)",
                    fontWeight: 500,
                    marginBottom: 16,
                  }}
                >
                  Filly AI
                </div>
                <div className="mock-msg mock-msg-ai">
                  Donderdag staat op 38%. Zal ik een lunchactie mailen naar je
                  vaste gasten?
                </div>
                <div className="mock-msg mock-msg-user">
                  Ja, doe maar. €24,50 voor 3 gangen.
                </div>
                <div className="mock-msg mock-msg-ai">
                  Klaar! Mail gaat naar 248 gasten. ✓
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="features">
        <div className="container">
          <p className="section-label">Wat Get-Filly doet</p>
          <h2 className="section-title">
            Eén platform.
            <br />
            Drie krachtige functies.
          </h2>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">💬</div>
              <h3 className="feature-title">Chat met je AI-assistent</h3>
              <p className="feature-desc">
                Vraag Filly om een campagne, bespreek ideeën, of laat je
                verrassen door proactieve suggesties. De AI kent je data en
                denkt mee.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">📱</div>
              <h3 className="feature-title">Automatische social media</h3>
              <p className="feature-desc">
                Filly maakt en plaatst posts op je social media kanalen. Van een
                spontane dagschotel tot een doordachte seizoenscampagne.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">✉️</div>
              <h3 className="feature-title">E-mailcampagnes op maat</h3>
              <p className="feature-desc">
                Korte termijn: een lunchactie voor aanstaande donderdag. Lange
                termijn: een Valentijnsmenu naar je vaste gasten. Filly regelt
                het.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="how-it-works">
        <div className="container">
          <p className="section-label">Hoe het werkt</p>
          <h2 className="section-title">In drie stappen meer gasten.</h2>
          <div className="steps">
            <div className="step">
              <div className="step-number">1</div>
              <h3 className="step-title">Koppel je reserveringssysteem</h3>
              <p className="step-desc">
                Verbind Zenchef, OpenTable, SevenRooms of een ander platform.
                Get-Filly importeert je data automatisch.
              </p>
            </div>
            <div className="step">
              <div className="step-number">2</div>
              <h3 className="step-title">Bekijk je bezetting</h3>
              <p className="step-desc">
                Zie per dag en week hoe vol je zit — historisch en actueel. De
                AI signaleert waar je omzet laat liggen.
              </p>
            </div>
            <div className="step">
              <div className="step-number">3</div>
              <h3 className="step-title">Laat Filly het oplossen</h3>
              <p className="step-desc">
                De AI stelt campagnes voor, maakt ze, en verstuurt ze. Jij keurt
                goed — Filly doet de rest.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="social-proof">
        <div className="container">
          <p className="section-label">Vertrouwd door restaurants</p>
          <h2 className="section-title" style={{ margin: "0 auto" }}>
            Wat onze klanten zeggen.
          </h2>
          <div className="logos-row">
            <div className="logo-placeholder">Bistro Get-Filly</div>
            <div className="logo-placeholder">Restaurant De Kas</div>
            <div className="logo-placeholder">Brasserie Lux</div>
            <div className="logo-placeholder">Trattoria Bella</div>
            <div className="logo-placeholder">Café Central</div>
          </div>
          <div className="testimonials">
            <div className="testimonial">
              <p className="testimonial-quote">
                &quot;Onze dinsdag was altijd rustig. Sinds Get-Filly draaien we
                elke week een gerichte actie en zitten we 30% voller op
                doordeweekse dagen.&quot;
              </p>
              <div className="testimonial-author">
                <div className="testimonial-avatar"></div>
                <div>
                  <div className="testimonial-name">Sophie de Vries</div>
                  <div className="testimonial-role">
                    Eigenaar, Bistro Get-Filly
                  </div>
                </div>
              </div>
            </div>
            <div className="testimonial">
              <p className="testimonial-quote">
                &quot;Ik heb geen marketingervaring. Filly stelt alles voor, ik
                klik op goedkeuren, klaar. Het voelt alsof ik een
                marketingmanager heb aangenomen.&quot;
              </p>
              <div className="testimonial-author">
                <div className="testimonial-avatar"></div>
                <div>
                  <div className="testimonial-name">Marco Rossi</div>
                  <div className="testimonial-role">
                    Chef-eigenaar, Trattoria Bella
                  </div>
                </div>
              </div>
            </div>
            <div className="testimonial">
              <p className="testimonial-quote">
                &quot;De seizoenscampagnes zijn briljant. Filly stelde een
                Paasbrunch voor, maakte de mail, en we zaten binnen twee dagen
                vol.&quot;
              </p>
              <div className="testimonial-author">
                <div className="testimonial-avatar"></div>
                <div>
                  <div className="testimonial-name">Lisa van den Berg</div>
                  <div className="testimonial-role">Manager, Brasserie Lux</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <h2 className="section-title">
          Klaar om je restaurant voller te krijgen?
        </h2>
        <p className="section-subtitle">
          Vraag een demo aan en ontdek wat Get-Filly voor jouw zaak kan doen.
        </p>
        <Link href="/pricing" className="cta-btn">
          Vraag een demo aan
        </Link>
      </section>
    </>
  );
}
