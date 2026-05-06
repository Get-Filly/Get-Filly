// =============================================================================
// PRICING-PAGINA, 1-op-1 conversie van Claude Design app.jsx → PricingPage.
// =============================================================================

type PlanFeature = { text: string; disabled?: boolean };
type Plan = {
  name: string;
  desc: string;
  price: string;
  popular?: boolean;
  features: PlanFeature[];
  ctaText: string;
};
const plans: Plan[] = [
  {
    name: "Basic",
    desc: "Voor ondernemingen die starten met data-gestuurde marketing",
    price: "€99",
    features: [
      { text: "Bezettingsanalyse + patroonherkenning" },
      { text: "CRM & POS-koppeling" },
      { text: "Max. 4 Filly AI-campagne suggesties per dag" },
      { text: "500 e-mails, 100 WhatsApp, 5 social ads" },
      { text: "A/B testing + last-minute boost" },
      { text: "Externe data" },
      { text: "Standaard support" },
    ],
    ctaText: "Start met Basic",
  },
  {
    name: "Growth",
    desc: "Voor ondernemingen die opschalen naar meerdere kanalen",
    price: "€169",
    popular: true,
    features: [
      { text: "Alles van Basic" },
      { text: "Max. 6 Filly AI-campagne suggesties per dag" },
      { text: "2.000 e-mails, 500 WhatsApp, 10 social ads" },
      { text: "Google Business optimalisatie" },
      { text: "AI-vindbaarheid" },
    ],
    ctaText: "Start met Growth",
  },
  {
    name: "Pro",
    desc: "Voor ondernemingen met hoge campagne-volumes en focus op marge",
    price: "€249",
    features: [
      { text: "Alles van Growth" },
      { text: "Max. 8 Filly AI-campagne suggesties per dag" },
      { text: "Onbeperkte e-mails, WhatsApp en social ads" },
      { text: "Margin-aware campagnes" },
      { text: "Priority support" },
    ],
    ctaText: "Start met Pro",
  },
];

const faqs = [
  { q: "Hoelang duurt de onboarding?", a: "Gemiddeld 15 minuten. Je koppelt je reserveringssysteem en je Google Business-profiel, bevestigt je menu en Filly gaat dezelfde dag aan de slag." },
  { q: "Welke kanalen gebruikt Filly?", a: "E-mail, WhatsApp, Instagram, Facebook, TikTok en Google Business. Filly schrijft per kanaal in jouw huisstijl en plant elk bericht op het beste moment voor de juiste doelgroep." },
  { q: "Houd ik controle over wat Filly verstuurt?", a: "Ja. Filly genereert voorstellen, jij keurt goed of past aan. Er gaat niets de deur uit zonder jouw akkoord." },
  { q: "Hoe weet Filly welke actie ze moet voorstellen?", a: "Filly analyseert continu je bezetting en social media data, herkent patronen zoals terugkerende dips of seizoenstrends, en stelt op het juiste moment een gerichte actie voor." },
  { q: "Kan ik van plan wisselen?", a: "Ja, je kunt op elk moment upgraden of downgraden. Wijzigingen gaan in op de eerste dag van de volgende maand. Ongebruikte dagen worden verrekend." },
  { q: "Voor welke branches werkt Filly?", a: "De core werkt voor elke onderneming met variabele bezetting: hotels, wellness-studios, sportclubs, event-locaties. De standaardtemplates zijn horeca-first, maatwerk volgt op Pro en Enterprise." },
];

export default function PricingPage() {
  return (
    <>
      <section className="pricing-hero">
        <div className="container">
          <p className="section-label">Pricing</p>
          <h1 className="section-title">Kies wat past bij je onderneming.</h1>
          <p className="section-subtitle" style={{ maxWidth: "none" }}>Geen verborgen kosten, maandelijks opzegbaar en onboarding in 15 minuten.</p>

          <div className="pricing-grid">
            {plans.map((p) => (
              <div key={p.name} className={`pricing-card ${p.popular ? "popular" : ""}`} style={{ backgroundColor: "rgb(250, 247, 241)" }}>
                {p.popular && <div className="popular-badge">Meest gekozen</div>}
                <div className="pricing-name">{p.name}</div>
                <div className="pricing-desc">{p.desc}</div>
                <div className="pricing-price">{p.price}<span>/maand</span></div>
                <div className="pricing-fee">+ 5% performance fee op extra omzet</div>
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
