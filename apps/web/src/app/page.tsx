import Link from "next/link";

// Testimonials voor de auto-rotating carousel. Gemengd qua branches
// (horeca, hotel, wellness, eventlocatie) zodat bezoekers uit andere
// sectoren zich ook aangesproken voelen — Get-Filly werkt voor elke
// zaak met variabele bezetting, niet alleen restaurants.
const TESTIMONIALS = [
  {
    quote:
      "Onze dinsdag was altijd rustig. Sinds Get-Filly draaien we elke week een gerichte actie en zitten we 30% voller op doordeweekse dagen.",
    name: "Sophie de Vries",
    role: "Eigenaar, Bistro Get-Filly",
  },
  {
    quote:
      "Ik heb geen marketingervaring. Filly stelt alles voor, ik klik op goedkeuren. Het voelt alsof ik een marketingmanager heb aangenomen.",
    name: "Marco Rossi",
    role: "Chef-eigenaar, Trattoria Bella",
  },
  {
    quote:
      "De seizoenscampagnes zijn briljant. Filly stelde een Paasbrunch voor, maakte de mail, en we zaten binnen twee dagen vol.",
    name: "Lisa van den Berg",
    role: "Manager, Brasserie Lux",
  },
  {
    quote:
      "We hebben 20% meer last-minute boekingen dankzij de dag-acties. Filly spot de rustige momenten voordat ik ze zelf door heb.",
    name: "Thomas Jansen",
    role: "Directeur, Boutique Hotel De Linde",
  },
  {
    quote:
      "Mijn agenda zat vol met gaten op donderdag. Binnen een maand waren die weg, omdat Filly gerichte kortingen aan stamklanten stuurt.",
    name: "Nadia El Amrani",
    role: "Eigenaar, Wellness Studio Orchid",
  },
  {
    quote:
      "Ik hoef geen posts meer zelf te maken. Filly matcht campagnes op onze bezettingsdata en plant ze vooruit — scheelt me uren per week.",
    name: "Jeroen Bakker",
    role: "Operations, Cafe Central",
  },
  {
    quote:
      "Voor onze zalenverhuur zijn de lange-termijn campagnes goud waard. Filly bouwt systematisch aan onze terugkerende klanten.",
    name: "Annemarie Post",
    role: "Manager, Eventlocatie De Schuur",
  },
  {
    quote:
      "Wat ik waardeer: Filly stuurt geen spam. Elke mail is afgestemd op de klant én onze bezetting. Dat voelt persoonlijk.",
    name: "Kevin de Groot",
    role: "Eigenaar, Restaurant Zeezicht",
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="hero">
        <div className="container">
          <h1 className="section-title fade-up d1">
            Meer klanten.
            <br />
            Minder lege momenten.
          </h1>
          <p className="section-subtitle fade-up d2">
            Get-Filly analyseert je bezettingsdata en zet AI in om op korte,
            middellange en lange termijn campagnes te draaien die je zaak
            voller maken.
          </p>
          <div className="hero-cta fade-up d3">
            <Link href="/signup" className="btn-primary">
              Vraag een demo
            </Link>
            <Link href="/product" className="btn-secondary">
              Bekijk het product →
            </Link>
          </div>

          {/* Dashboard mockup */}
          <div className="hero-mockup fade-up d4">
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
                    // Kleuren uit warme huisstijl: koper voor middel-bezet,
                    // gedempt terracotta voor kritieke dagen, bosgroen voor
                    // goede dagen. Alles in dezelfde toon-familie als de nav.
                    { day: "Ma", h: 50, pct: 50, c: "#D97F3C" },
                    { day: "Di", h: 60, pct: 60, c: "#D97F3C" },
                    { day: "Wo", h: 65, pct: 65, c: "#D97F3C" },
                    { day: "Do", h: 40, pct: 38, c: "#B0574F" },
                    { day: "Vr", h: 100, pct: 98, c: "#2D5A3F" },
                    { day: "Za", h: 110, pct: 100, c: "#2D5A3F" },
                    { day: "Zo", h: 90, pct: 91, c: "#2D5A3F" },
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

      {/* Features — Get-Filly vanuit drie tijdshorizonnen.
          Kort (vandaag) · Middel (deze week) · Lang (seizoenen).
          Alles draait om bezettingsdata: Filly reageert direct op wat
          vandaag misgaat, plant vooruit op weekpatronen en bouwt
          structureel aan klantbinding. */}
      <section className="features">
        <div className="container">
          {/* Sticky header blijft aan de top terwijl kaarten eronder
              cyclen. Hierdoor voelt de sectie "pinned": H2 + subtitel
              houden context vast, de kaarten overlappen elkaar eronder. */}
          <div className="features-sticky-header">
            <h2 className="section-title">
              Eén platform.
              <br />
              Drie horizonnen.
            </h2>
            <p
              className="section-subtitle"
              style={{ marginTop: 16, maxWidth: 640 }}
            >
              Filly kijkt continu naar je bezettingsdata en handelt op drie
              termijnen: van een actie voor vandaag tot structurele groei over
              het hele jaar.
            </p>
          </div>
          <div className="features-stack">
            {/* Rij 1 — Korte termijn: reageer vandaag op lage bezetting. */}
            <div className="feature-row">
              <div className="feature-row-text">
                <p className="feature-eyebrow">Vandaag</p>
                <h3 className="feature-row-title">
                  Vul lege dagen direct in
                </h3>
                <p className="feature-row-desc">
                  Filly spot dagen waarop je bezetting onverwacht laag is en
                  zet binnen minuten een gerichte actie uit naar de juiste
                  klanten. Geen lege stoelen meer door een rustige donderdag.
                </p>
              </div>
              <div className="feature-row-visual">
                <div className="fmock-chat">
                  <div className="fmock-msg fmock-msg-ai">
                    Donderdag staat op 38%. Zal ik een lunchactie mailen naar
                    je vaste klanten?
                  </div>
                  <div className="fmock-msg fmock-msg-user">
                    Ja, doe maar. €24,50 voor 3 gangen.
                  </div>
                  <div className="fmock-msg fmock-msg-ai">
                    Verstuurd naar 248 klanten ✓
                  </div>
                </div>
              </div>
            </div>

            {/* Rij 2 — Middellange termijn: patronen per week vooruit plannen. */}
            <div className="feature-row feature-row--reverse">
              <div className="feature-row-text">
                <p className="feature-eyebrow">Deze week</p>
                <h3 className="feature-row-title">
                  Stuur je bezetting bij
                </h3>
                <p className="feature-row-desc">
                  Patronen per week worden zichtbaar: een dip op dinsdag, een
                  drukke vrijdag. Filly plant dagen vooruit met gerichte posts
                  en campagnes zodat je week in balans komt.
                </p>
              </div>
              <div className="feature-row-visual">
                <div className="fmock-social">
                  <div className="fmock-social-header">
                    <div className="fmock-avatar"></div>
                    <div>
                      <div className="fmock-handle">getfilly_zaak</div>
                      <div className="fmock-time">Gepland voor dinsdag</div>
                    </div>
                  </div>
                  <div className="fmock-social-img">🍝</div>
                  <div className="fmock-social-caption">
                    Dinsdag 20% korting op onze signature-gerechten.
                  </div>
                </div>
              </div>
            </div>

            {/* Rij 3 — Lange termijn: loyaliteit en seizoenspatronen. */}
            <div className="feature-row">
              <div className="feature-row-text">
                <p className="feature-eyebrow">Seizoenen</p>
                <h3 className="feature-row-title">
                  Bouw aan structurele groei
                </h3>
                <p className="feature-row-desc">
                  Terugkerende campagnes, loyaliteitsprogramma&apos;s en
                  jaarlijkse patronen. Filly werkt op de achtergrond aan je
                  lange-termijn klantbasis — elk seizoen voller dan het vorige.
                </p>
              </div>
              <div className="feature-row-visual">
                <div className="fmock-email">
                  <div className="fmock-email-header">
                    <div className="fmock-email-from">Get-Filly</div>
                    <div className="fmock-email-subject">
                      Jouw najaarsmenu — 15% voordeel voor trouwe klanten
                    </div>
                  </div>
                  <div className="fmock-email-body">
                    Omdat je al een jaar bij ons bent: een exclusieve uitnodiging
                    voor ons nieuwe seizoensmenu.
                  </div>
                  <div className="fmock-email-cta">Reserveer mijn plek</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works — id matcht de jumplink "Hoe het werkt" in de navbar */}
      <section id="hoe-het-werkt" className="how-it-works">
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
          {/* Auto-rotating testimonial-carousel. De track bevat de 8
              quotes twee keer achter elkaar, zodat de CSS-animatie naar
              -50% kan scrollen en dan naadloos opnieuw begint. Op hover
              pauzeert de animatie zodat een lezer rustig kan lezen. */}
          <div className="testimonials-carousel">
            <div className="testimonials-track">
              {[...Array(2)].map((_, loop) =>
                TESTIMONIALS.map((t, i) => (
                  <div className="testimonial" key={`${loop}-${i}`}>
                    <p className="testimonial-quote">&ldquo;{t.quote}&rdquo;</p>
                    <div className="testimonial-author">
                      <div className="testimonial-avatar"></div>
                      <div>
                        <div className="testimonial-name">{t.name}</div>
                        <div className="testimonial-role">{t.role}</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <h2 className="section-title">
          Klaar om je zaak voller te krijgen?
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
