type Plan = {
  name: string;
  desc: string;
  price: string;
  features: { text: string; disabled?: boolean }[];
  ctaText: string;
  popular?: boolean;
};

const plans: Plan[] = [
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
    popular: true,
  },
  {
    name: "Enterprise",
    desc: "Alles onbeperkt + persoonlijke begeleiding",
    price: "€299",
    features: [
      { text: "Alles van Pro — onbeperkt" },
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

// Veelgestelde vragen — hergebruikt .info-card / details HTML-tag voor
// native accordion-gedrag zonder JS.
const faqs: { q: string; a: string }[] = [
  {
    q: "Wat gebeurt er na de 14-dagen proefperiode?",
    a: "Je gaat automatisch naar het plan dat je gekozen hebt. Tijdens de proef kun je zonder kosten opzeggen — we vragen geen creditcard vooraf.",
  },
  {
    q: "Kan ik van plan wisselen?",
    a: "Ja, je kunt op elk moment upgraden of downgraden. Wijzigingen gaan in op de eerste dag van de volgende maand. Ongebruikte dagen worden verrekend.",
  },
  {
    q: "Wat als ik over de campagne-limiet heen ga?",
    a: "Je krijgt een seintje bij 80% en 95% van je limiet. Daarna kun je óf upgraden, óf extra campagnes bijkopen per stuk (€15 per mail, €8 per social post).",
  },
  {
    q: "Hoelang duurt de onboarding?",
    a: "Gemiddeld 15 minuten. Je koppelt je reserveringssysteem (Zenchef, OpenTable, SevenRooms of andere), bevestigt je menu en Filly gaat aan de slag.",
  },
  {
    q: "Werkt Filly ook voor andere branches dan horeca?",
    a: "De core werkt voor elke zaak met variabele bezetting — hotels, wellness-studios, sportclubs, event-locaties. De standaardtemplates zijn horeca-first, maatwerk volgt op Pro en Enterprise.",
  },
  {
    q: "Waar staat mijn data?",
    a: "Alles binnen de EU (Frankfurt, Supabase). We delen géén data met derden, verkopen niks door en exporteren is altijd gratis mogelijk.",
  },
];

export default function PricingPage() {
  return (
    <>
      <section
        style={{ paddingTop: 160, paddingBottom: 40 }}
        className="pricing"
      >
        <div className="container">
          <p className="section-label">Pricing</p>
          <h1
            className="section-title"
            style={{ textAlign: "center", margin: "0 auto" }}
          >
            Een plan voor elke zaak.
          </h1>
          <p
            className="section-subtitle"
            style={{ textAlign: "center", margin: "16px auto 0" }}
          >
            Geen verborgen kosten. Maandelijks opzegbaar.
          </p>

          <div className="pricing-grid">
            {plans.map((p) => (
              <div
                key={p.name}
                className={`pricing-card ${p.popular ? "popular" : ""}`}
              >
                {p.popular && (
                  <div className="popular-badge">Meest gekozen</div>
                )}
                <div className="pricing-name">{p.name}</div>
                <div className="pricing-desc">{p.desc}</div>
                <div className="pricing-price">
                  {p.price}
                  <span>/maand</span>
                </div>
                <ul className="pricing-features">
                  {p.features.map((f) => (
                    <li key={f.text} className={f.disabled ? "disabled" : ""}>
                      {f.text}
                    </li>
                  ))}
                </ul>
                <button className="pricing-btn">{p.ctaText}</button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ — HTML <details> voor native accordion zonder JS. Rustige
          volgorde, antwoorden zijn direct leesbaar. */}
      <section
        className="pricing-faq"
        style={{ paddingTop: 64, paddingBottom: 112 }}
      >
        <div className="container">
          <p className="section-label">Veelgestelde vragen</p>
          <h2 className="section-title" style={{ maxWidth: 640 }}>
            Nog vragen?
          </h2>
          <div className="faq-list">
            {faqs.map((f) => (
              <details key={f.q} className="faq-item">
                <summary className="faq-q">
                  {f.q}
                  <span className="faq-icon" aria-hidden>
                    +
                  </span>
                </summary>
                <div className="faq-a">{f.a}</div>
              </details>
            ))}
          </div>
          <div className="faq-contact">
            Meer vragen? Stuur ons een mail op{" "}
            <a href="mailto:hi@get-filly.com">hi@get-filly.com</a>.
          </div>
        </div>
      </section>
    </>
  );
}
