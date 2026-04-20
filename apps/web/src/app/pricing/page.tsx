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

export default function PricingPage() {
  return (
    <section style={{ paddingTop: 160 }} className="pricing">
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
  );
}
