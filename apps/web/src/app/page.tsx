import Link from "next/link";

// =============================================================================
// HOMEPAGE — 1-op-1 conversie van het Claude Design-prototype.
// Bron: Desktop/Website Get-Filly/app.jsx → HomePage + MiniDashboard.
//
// Vertaalslag JSX → Next.js TSX:
//   - <button onClick={setPage}>  → <Link href>
//   - t.heroTitle1 etc.           → letterlijke string uit TWEAK_DEFAULTS
//   - "images/..." paths          → "/images/..." (leading slash voor /public)
//   - className-attribuut blijft identiek
//   - inline style={{...}} blijft 1-op-1 overgenomen (ook als ze redundant
//     lijken — design is leidend, geen "verbeteringen")
// =============================================================================

const TESTIMONIALS = [
  { quote: "Onze dinsdag was altijd rustig. Sinds Get-Filly draaien we elke week een gerichte actie en zitten we 30% voller op doordeweekse dagen.", name: "Sophie de Vries", role: "Eigenaar, Bistro Get-Filly" },
  { quote: "Ik heb geen marketingervaring. Filly stelt alles voor, ik klik op goedkeuren. Het voelt alsof ik een marketingmanager heb aangenomen.", name: "Marco Rossi", role: "Chef-eigenaar, Trattoria Bella" },
  { quote: "De seizoenscampagnes zijn briljant. Filly stelde een Paasbrunch voor, maakte de mail, en we zaten binnen twee dagen vol.", name: "Lisa van den Berg", role: "Manager, Brasserie Lux" },
  { quote: "We hebben 20% meer last-minute boekingen dankzij de dag-acties. Filly spot de rustige momenten voordat ik ze zelf door heb.", name: "Thomas Jansen", role: "Directeur, Boutique Hotel De Linde" },
  { quote: "Mijn agenda zat vol met gaten op donderdag. Binnen een maand waren die weg, omdat Filly gerichte kortingen aan stamklanten stuurt.", name: "Nadia El Amrani", role: "Eigenaar, Wellness Studio Orchid" },
  { quote: "Ik hoef geen posts meer zelf te maken. Filly matcht campagnes op onze bezettingsdata en plant ze vooruit — scheelt me uren per week.", name: "Jeroen Bakker", role: "Operations, Cafe Central" },
  { quote: "Voor onze zalenverhuur zijn de lange-termijn campagnes goud waard. Filly bouwt systematisch aan onze terugkerende klanten.", name: "Annemarie Post", role: "Manager, Eventlocatie De Schuur" },
  { quote: "Wat ik waardeer: Filly stuurt geen spam. Elke mail is afgestemd op de klant én onze bezetting. Dat voelt persoonlijk.", name: "Kevin de Groot", role: "Eigenaar, Restaurant Zeezicht" },
];

// =============================================================================
// MiniDashboard — visuele namaak van het echte Filly-dashboard,
// gerenderd binnen het MacBook-scherm in de hero.
// =============================================================================
function MiniDashboard() {
  const NAV = [
    { icon: "📊", label: "Dashboard", active: true },
    { icon: "📣", label: "Campagnes" },
    { icon: "📆", label: "Reserveringen" },
    { icon: "👥", label: "Gasten" },
    { icon: "⭐", label: "Reviews" },
    { icon: "🍽️", label: "Menu" },
    { icon: "📈", label: "Rapportages" },
    { icon: "🔗", label: "Koppelingen" },
  ];

  const KPIS = [
    { label: "Bezetting vandaag", val: "82%" },
    { label: "Bezetting april", val: "74%", extra: "12% via Filly", positive: true },
    { label: "Gasten april", val: "1.248", extra: "+184 via Filly", positive: true },
    { label: "Voorgesteld", val: "3", extra: "wachten op je" },
    { label: "Omzet april", val: "€48.6k", extra: "+€6.4k via Filly", positive: true },
  ];

  type CalCell = { d: number; p: number; lvl: number; today?: boolean } | null;
  const CAL: CalCell[][] = [
    [null, null, { d: 1, p: 62, lvl: 1 }, { d: 2, p: 71, lvl: 2 }, { d: 3, p: 88, lvl: 3 }, { d: 4, p: 96, lvl: 4 }, { d: 5, p: 92, lvl: 3 }],
    [{ d: 6, p: 58, lvl: 1 }, { d: 7, p: 64, lvl: 1 }, { d: 8, p: 70, lvl: 2 }, { d: 9, p: 38, lvl: 0 }, { d: 10, p: 84, lvl: 3 }, { d: 11, p: 98, lvl: 4 }, { d: 12, p: 95, lvl: 4 }],
    [{ d: 13, p: 60, lvl: 1 }, { d: 14, p: 67, lvl: 2 }, { d: 15, p: 72, lvl: 2 }, { d: 16, p: 82, lvl: 3, today: true }, { d: 17, p: 78, lvl: 2 }, { d: 18, p: 96, lvl: 4 }, { d: 19, p: 91, lvl: 3 }],
    [{ d: 20, p: 55, lvl: 1 }, { d: 21, p: 42, lvl: 0 }, { d: 22, p: 68, lvl: 2 }, { d: 23, p: 74, lvl: 2 }, { d: 24, p: 86, lvl: 3 }, { d: 25, p: 99, lvl: 4 }, { d: 26, p: 94, lvl: 3 }],
    [{ d: 27, p: 64, lvl: 1 }, { d: 28, p: 70, lvl: 2 }, { d: 29, p: 76, lvl: 2 }, { d: 30, p: 80, lvl: 3 }, null, null, null],
  ];

  return (
    <div className="mini-dash">
      {/* Sidebar */}
      <aside className="md-sidebar">
        <div className="md-workspace">
          <div className="md-avatar">BG</div>
          <div style={{ minWidth: 0 }}>
            <div className="md-ws-name">Bistro Get-Filly</div>
            <div className="md-ws-role">Eigenaar</div>
          </div>
        </div>
        <div>
          <div className="md-section-label">Menu</div>
          <div className="md-nav">
            {NAV.map((n) => (
              <div key={n.label} className={`md-nav-item ${n.active ? "active" : ""}`}>
                <span className="md-nav-icon">{n.icon}</span>
                <span>{n.label}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="md-main">
        <div className="md-topbar">
          <div>
            <div className="md-page-title">Dashboard</div>
            <div className="md-page-sub">Woensdag 16 april · Filly draait 3 campagnes</div>
          </div>
          <div className="md-pill">✨ Filly maakt voorstellen</div>
        </div>

        <div className="md-kpi-row">
          {KPIS.map((k) => (
            <div key={k.label} className="md-kpi">
              <div className="md-kpi-label">{k.label}</div>
              <div className="md-kpi-val">{k.val}</div>
              {k.extra && <div className={`md-kpi-extra ${k.positive ? "positive" : ""}`}>{k.extra}</div>}
            </div>
          ))}
        </div>

        <div className="md-body">
          {/* Calendar */}
          <div className="md-card">
            <div className="md-card-head">
              <div>
                <div className="md-card-title">Bezettingsgraad</div>
                <div className="md-card-sub">April 2026</div>
              </div>
              <div className="md-tabs">
                <span className="md-tab">Dag</span>
                <span className="md-tab active">Maand</span>
                <span className="md-tab">Jaar</span>
              </div>
            </div>
            <div className="md-cal">
              {["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"].map((d) => (
                <div key={d} className="md-cal-dow">{d}</div>
              ))}
              {CAL.flat().map((cell, i) => {
                if (!cell) return <div key={i} className="md-cal-day empty"></div>;
                return (
                  <div key={i} className={`md-cal-day lvl-${cell.lvl} ${cell.today ? "today" : ""}`}>
                    <span>{cell.d}</span>
                    <span className="md-cal-pct">{cell.p}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Filly chat */}
          <div className="md-chat">
            <div className="md-chat-head">
              <div className="md-chat-avatar"></div>
              <div className="md-chat-name">Filly</div>
              <div className="md-chat-status">online</div>
            </div>
            <div className="md-chat-body">
              <div className="md-chat-msg ai">
                Donderdag 9 april zit op 38%. Zal ik een lunchactie mailen naar je vaste gasten?
              </div>
              <div className="md-chat-proposal">
                <div className="md-prop-title">Lunchactie · 3-gangen €24,50</div>
                <div className="md-prop-meta">E-mail · 248 ontvangers · verzending donderdag 11:00</div>
                <div className="md-prop-actions">
                  <span className="md-prop-btn primary">Goedkeuren</span>
                  <span className="md-prop-btn">Bekijk versies →</span>
                </div>
              </div>
              <div className="md-chat-msg user">Verstuur naar 248 gasten</div>
              <div className="md-chat-msg ai">Top. Verstuurd naar 248 gasten ✓</div>
            </div>
            <div className="md-chat-input">
              <div className="md-chat-input-text">Stel Filly een vraag…</div>
              <div className="md-chat-send">↑</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="container">
          <h1 className="section-title fade-up d1">
            Meer klanten.<br />Minder lege momenten.
          </h1>
          <p className="section-subtitle fade-up d2">
            Get-Filly analyseert je bezettingsdata en zet AI in om op korte, middellange en lange termijn campagnes te draaien die je zaak voller maken.
          </p>
          <div className="hero-cta fade-up d3">
            <Link href="/signup" className="btn-primary">Vraag een demo</Link>
            <Link href="/product" className="btn-secondary">Bekijk het product →</Link>
          </div>

          <div className="hero-mockup fade-up d4">
            <div className="mac-lid">
              <div className="mac-camera"></div>
              <div className="mac-screen">
                <MiniDashboard />
              </div>
            </div>
            <div className="mac-base"></div>
          </div>
        </div>
      </section>

      <section id="hoe-het-werkt" className="features">
        <div className="container">
          <h2 className="section-title">Eén platform.<br />Drie horizonnen.</h2>
          <p className="section-subtitle" style={{ marginTop: 16, maxWidth: 640 }}>
            Filly kijkt continu naar je bezettingsdata en handelt op drie termijnen: van een actie voor vandaag tot structurele groei over het hele jaar.
          </p>
          <div className="features-stack">
            {/* Rij 1 — design heeft hier inline width:1100/textAlign:left/fontWeight:100. */}
            <div className="feature-row" style={{ width: "1100px", textAlign: "left", fontWeight: "100" }}>
              <div className="feature-row-text">
                <p className="feature-eyebrow">Vandaag</p>
                <h3 className="feature-row-title">Vul lege dagen direct in</h3>
                <p className="feature-row-desc">Filly spot dagen waarop je bezetting onverwacht laag is en zet binnen minuten een gerichte actie uit naar de juiste klanten. Geen lege stoelen meer door een rustige donderdag.</p>
              </div>
              <div className="feature-row-visual">
                <div className="fmock-chat">
                  <div className="fmock-chat-head">
                    <div className="fmock-chat-avatar"></div>
                    <div>
                      <div className="fmock-chat-name">Filly</div>
                      <div className="fmock-chat-status">online · denkt mee</div>
                    </div>
                  </div>
                  <div className="fmock-chat-thread">
                    <div className="fmock-bubble fmock-bubble-user">
                      <div className="fmock-bubble-eyebrow">JIJ</div>
                      <div>Donderdag staat op 38% — wat zou je voorstellen?</div>
                    </div>

                    <div className="fmock-bubble fmock-bubble-ai">
                      <div className="fmock-bubble-eyebrow">
                        <span className="fmock-f-badge">F</span>
                        FILLY AI
                      </div>
                      <div className="fmock-bubble-text">
                        Op basis van je vaste klanten stel ik een 3-gangen lunchactie voor. Ik heb drie versies uitgewerkt — kies je favoriet.
                      </div>
                      <div className="fmock-proposal">
                        <div className="fmock-proposal-head">
                          <span className="fmock-proposal-eyebrow">CAMPAGNE-VOORSTEL</span>
                          <span className="fmock-proposal-pill">E-MAIL</span>
                        </div>
                        <div className="fmock-proposal-title">Donderdag-lunch · 3 gangen €24,50</div>
                        <div className="fmock-proposal-sub">Onderwerp: Een rustige donderdag? Kom lunchen voor €24,50.</div>
                        <div className="fmock-proposal-note">Filly bedacht 3 versies — kies je favoriet via &ldquo;Bekijk versies&rdquo;.</div>
                        <div className="fmock-proposal-action">Concept aangemaakt. <span className="fmock-proposal-link">Bekijken →</span></div>
                      </div>
                    </div>
                  </div>
                  <div className="fmock-chat-input">
                    <span className="fmock-chat-placeholder">Vraag Filly iets…</span>
                    <button className="fmock-chat-send" aria-label="Verstuur">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="feature-row feature-row--reverse">
              <div className="feature-row-text">
                <p className="feature-eyebrow">Deze week</p>
                <h3 className="feature-row-title">Stuur je bezetting bij</h3>
                <p className="feature-row-desc">Patronen per week worden zichtbaar: een dip op dinsdag, een drukke vrijdag. Filly plant dagen vooruit met gerichte posts en campagnes zodat je week in balans komt.</p>
              </div>
              <div className="feature-row-visual">
                <div className="fmock-social">
                  <div className="fmock-social-header">
                    <div className="fmock-avatar"></div>
                    <div className="fmock-social-headtxt">
                      <div className="fmock-handle">bistro_getfilly</div>
                      <div className="fmock-location" style={{ color: "rgb(82, 82, 91)" }}>Amsterdam · Centrum</div>
                    </div>
                    <div className="fmock-dots" style={{ backgroundColor: "rgb(250, 247, 241)" }}>⋯</div>
                  </div>
                  <div className="fmock-social-img">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/images/amsterdam-terras.avif"
                      alt="Terras aan de Amsterdamse grachten"
                      loading="lazy"
                    />
                  </div>
                  <div className="fmock-social-actions">
                    <div className="fmock-icons">
                      <svg className="fmock-ig-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-label="Vind ik leuk">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                      </svg>
                      <svg className="fmock-ig-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-label="Reageer">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                      </svg>
                      <svg className="fmock-ig-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-label="Deel">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                    </div>
                    <svg className="fmock-ig-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-label="Opslaan">
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <div className="fmock-social-likes">142 vind-ik-leuks</div>
                  <div className="fmock-social-caption">
                    <strong>bistro_getfilly</strong> Er zijn nog plekken op het terras, kom bij ons genieten van het mooie weer ☀️
                  </div>
                  <div className="fmock-social-meta" style={{ color: "rgb(82, 82, 91)" }}>Gepland · dinsdag 11:00 via Filly</div>
                </div>
              </div>
            </div>

            <div className="feature-row" style={{ padding: "56px" }}>
              <div className="feature-row-text">
                <p className="feature-eyebrow">Seizoenen</p>
                <h3 className="feature-row-title">Bouw aan structurele groei</h3>
                <p className="feature-row-desc">Terugkerende campagnes, loyaliteitsprogramma&rsquo;s en jaarlijkse patronen. Filly werkt op de achtergrond aan je lange-termijn klantbasis — elk seizoen voller dan het vorige.</p>
              </div>
              <div className="feature-row-visual">
                <div className="fmock-email">
                  <div className="fmock-email-header">
                    <div className="fmock-email-meta">
                      <div className="fmock-email-from">Bistro Get-Filly</div>
                      <div className="fmock-email-time" style={{ color: "rgb(82, 82, 91)" }}>vandaag · 10:14</div>
                    </div>
                    <div className="fmock-email-subject">We hebben je al een tijdje niet gezien — kom weer eens langs</div>
                    <div className="fmock-email-to" style={{ color: "rgb(82, 82, 91)" }}>aan: marieke@voorbeeld.nl</div>
                  </div>
                  <div className="fmock-email-body">
                    Hé Marieke,<br /><br />
                    Het is alweer ruim drie maanden geleden dat we je voor het laatst aan tafel zagen. We zouden het leuk vinden om je weer te zien.<br /><br />
                    Als welkom-terug bieden we je <strong>een glas wijn van het huis</strong> aan bij je volgende bezoek.
                  </div>
                  <div className="fmock-email-cta" style={{ fontSize: "10px" }}>Reserveer mijn tafel</div>
                  <div className="fmock-email-foot" style={{ backgroundColor: "rgb(214, 224, 216)" }}>
                    <span style={{ color: "#52525b" }}>Verstuurd door Filly · 1 van 64 win-back e-mails deze week</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="how-it-works">
        <div className="container">
          <h2 className="section-title">In drie stappen meer gasten.</h2>
          <div className="steps">
            <div className="step">
              <div className="step-number">1</div>
              <h3 className="step-title">Koppel je reserveringssysteem</h3>
              <p className="step-desc">Verbind Zenchef, OpenTable, SevenRooms of een ander platform. Get-Filly importeert je data automatisch.</p>
            </div>
            <div className="step">
              <div className="step-number">2</div>
              <h3 className="step-title">Bekijk je bezetting</h3>
              <p className="step-desc">Zie per dag en week hoe vol je zit — historisch en actueel. De AI signaleert waar je omzet laat liggen.</p>
            </div>
            <div className="step">
              <div className="step-number">3</div>
              <h3 className="step-title">Laat Filly het oplossen</h3>
              <p className="step-desc">De AI stelt campagnes voor, maakt ze, en verstuurt ze. Jij keurt goed — Filly doet de rest.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="social-proof">
        <div className="container">
          <p className="section-label">Vertrouwd door restaurants</p>
          <h2 className="section-title" style={{ margin: "0 auto" }}>Wat onze klanten zeggen.</h2>
          <div className="logos-row">
            <div className="logo-placeholder">Bistro Get-Filly</div>
            <div className="logo-placeholder">Restaurant De Kas</div>
            <div className="logo-placeholder">Brasserie Lux</div>
            <div className="logo-placeholder">Trattoria Bella</div>
            <div className="logo-placeholder">Café Central</div>
          </div>
          <div className="testimonials-carousel">
            <div className="testimonials-track">
              {[0, 1].map((loop) =>
                TESTIMONIALS.map((tt, i) => (
                  <div className="testimonial" key={`${loop}-${i}`}>
                    <p className="testimonial-quote">&ldquo;{tt.quote}&rdquo;</p>
                    <div className="testimonial-author">
                      <div className="testimonial-avatar"></div>
                      <div>
                        <div className="testimonial-name">{tt.name}</div>
                        <div className="testimonial-role">{tt.role}</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="cta-section">
        <h2 className="section-title">Klaar om je zaak voller te krijgen?</h2>
        <p className="section-subtitle">Vraag een demo aan en ontdek wat Get-Filly voor jouw zaak kan doen.</p>
        <Link href="/pricing" className="cta-btn">Vraag een demo aan</Link>
      </section>
    </>
  );
}
