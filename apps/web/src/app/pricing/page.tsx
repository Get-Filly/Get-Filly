// =============================================================================
// PRICING-PAGINA, 1-op-1 conversie van Claude Design app.jsx → PricingPage.
// =============================================================================

const plans = [
  {
    name: "Starter",
    desc: "Data-inzicht + basis AI-marketing",
    price: "€120",
    features: [
      { text: "Bezettingsdashboard (realtime)" },
      { text: "Koppeling met 1 reserveringsplatform" },
      { text: "Historische data & vergelijkingen" },
      { text: "AI-chatbot" },
      { text: "Tot 4 e-mailcampagnes per maand" },
      { text: "Tot 8 social media posts per maand" },
      { text: "WhatsApp-campagnes", disabled: true },
      { text: "Dedicated accountmanager", disabled: true },
    ],
    ctaText: "Start met Starter",
  },
  {
    name: "Pro",
    desc: "Meer campagnes, meer kanalen",
    price: "€189",
    popular: true,
    features: [
      { text: "Alles van Starter" },
      { text: "Tot 12 e-mailcampagnes per maand" },
      { text: "Tot 20 social media posts per maand" },
      { text: "Seizoenssuggesties & planning" },
      { text: "Koppeling met 3 reserveringsplatforms" },
      { text: "WhatsApp-campagnes naar gasten" },
      { text: "Dedicated accountmanager", disabled: true },
      { text: "Maatwerk integraties", disabled: true },
    ],
    ctaText: "Start met Pro",
  },
  {
    name: "Enterprise",
    desc: "Alles onbeperkt + persoonlijke begeleiding",
    price: "€299",
    features: [
      { text: "Alles van Pro, onbeperkt" },
      { text: "Onbeperkte e-mailcampagnes" },
      { text: "Onbeperkte social media posts" },
      { text: "Onbeperkte WhatsApp-campagnes" },
      { text: "Onbeperkte platformkoppelingen" },
      { text: "Dedicated accountmanager" },
      { text: "Prioriteit bij nieuwe features" },
      { text: "Maatwerk integraties" },
    ],
    ctaText: "Neem contact op",
  },
];

const faqs = [
  { q: "Wat gebeurt er na de 14-dagen proefperiode?", a: "Je gaat automatisch naar het plan dat je gekozen hebt. Tijdens de proef kun je zonder kosten opzeggen, we vragen geen creditcard vooraf." },
  { q: "Kan ik van plan wisselen?", a: "Ja, je kunt op elk moment upgraden of downgraden. Wijzigingen gaan in op de eerste dag van de volgende maand. Ongebruikte dagen worden verrekend." },
  { q: "Wat als ik over de campagne-limiet heen ga?", a: "Je krijgt een seintje bij 80% en 95% van je limiet. Daarna kun je óf upgraden, óf extra campagnes bijkopen per stuk (€15 per mail, €8 per social post)." },
  { q: "Hoelang duurt de onboarding?", a: "Gemiddeld 15 minuten. Je koppelt je reserveringssysteem (Zenchef, OpenTable, SevenRooms of andere), bevestigt je menu en Filly gaat aan de slag." },
  { q: "Werkt Filly ook voor andere branches dan horeca?", a: "De core werkt voor elke onderneming met variabele bezetting, hotels, wellness-studios, sportclubs, event-locaties. De standaardtemplates zijn horeca-first, maatwerk volgt op Pro en Enterprise." },
  { q: "Waar staat mijn data?", a: "Alles binnen de EU (Frankfurt, Supabase). We delen géén data met derden, verkopen niks door en exporteren is altijd gratis mogelijk." },
];

export default function PricingPage() {
  return (
    <>
      <section className="pricing-hero">
        <div className="container">
          <p className="section-label">Pricing</p>
          <h1 className="section-title">Kies wat past bij je onderneming.</h1>
          <p className="section-subtitle">Geen verborgen kosten, geen jaarcontracten. Probeer Filly 14 dagen gratis, betaal pas als het werkt voor je onderneming.</p>

          <div className="hero-diffs">
            <div className="hero-diff">
              <div className="hero-diff-num">01</div>
              <h3 className="hero-diff-title">14 dagen gratis proberen.</h3>
              <p className="hero-diff-desc">Geen creditcard vooraf. Stop wanneer je wilt, niets dichtbinden, niets vooraf betalen.</p>
            </div>
            <div className="hero-diff">
              <div className="hero-diff-num">02</div>
              <h3 className="hero-diff-title">Maandelijks opzegbaar.</h3>
              <p className="hero-diff-desc">Geen jaarcontracten, geen kleine lettertjes. Wisselen van plan kan op elk moment.</p>
            </div>
            <div className="hero-diff">
              <div className="hero-diff-num">03</div>
              <h3 className="hero-diff-title">Alle data in de EU.</h3>
              <p className="hero-diff-desc">Servers in Frankfurt. Jouw bezetting en gastenlijst blijven van jou, geen doorverkoop, geen lock-in.</p>
            </div>
            <div className="hero-diff">
              <div className="hero-diff-num">04</div>
              <h3 className="hero-diff-title">Onboarding in 15 minuten.</h3>
              <p className="hero-diff-desc">Koppel je reserveringssysteem, bevestig je menu, Filly gaat dezelfde dag aan de slag.</p>
            </div>
          </div>

          <div className="pricing-grid">
            {plans.map((p) => (
              <div key={p.name} className={`pricing-card ${p.popular ? "popular" : ""}`} style={{ backgroundColor: "rgb(250, 247, 241)" }}>
                {p.popular && <div className="popular-badge">Meest gekozen</div>}
                <div className="pricing-name">{p.name}</div>
                <div className="pricing-desc">{p.desc}</div>
                <div className="pricing-price">{p.price}<span>/maand</span></div>
                <ul className="pricing-features">
                  {p.features.map((f) => (
                    <li key={f.text} className={f.disabled ? "disabled" : ""}>{f.text}</li>
                  ))}
                </ul>
                <button className="pricing-btn">{p.ctaText}</button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pricing-faq">
        <div className="container">
          <p className="section-label" style={{ textAlign: "center" }}>Veelgestelde vragen</p>
          <h2 className="section-title" style={{ textAlign: "center", margin: "0 auto" }}>Nog vragen?</h2>
          <div className="faq-list" style={{ marginLeft: "auto", marginRight: "auto" }}>
            {faqs.map((f) => (
              <details key={f.q} className="faq-item">
                <summary className="faq-q">{f.q}<span className="faq-icon" aria-hidden>+</span></summary>
                <div className="faq-a">{f.a}</div>
              </details>
            ))}
          </div>
          <div className="faq-contact">Meer vragen? Stuur ons een mail op <a href="mailto:hi@get-filly.com">hi@get-filly.com</a>.</div>
        </div>
      </section>
    </>
  );
}
