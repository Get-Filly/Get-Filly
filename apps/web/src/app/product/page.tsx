const features = [
  {
    icon: "📊",
    title: "Bezettingsdashboard",
    desc: "Realtime inzicht in je bezettingsgraad per dag, week en maand. Kleurcodering laat direct zien waar je omzet mist. Vergelijk met vorige periodes.",
  },
  {
    icon: "💬",
    title: "AI-chatbot",
    desc: "Chat met Filly zoals je met een collega praat. De AI kent je data, doet voorstellen, en voert ze uit na jouw goedkeuring. Geen marketingkennis nodig.",
  },
  {
    icon: "✉️",
    title: "E-mailcampagnes",
    desc: "Van concept tot verzending in één chat. Filly schrijft de mail, selecteert de juiste gasten, en stuurt op het beste moment. Korte én lange termijn.",
  },
  {
    icon: "📱",
    title: "Social media posts",
    desc: "Filly maakt posts voor Instagram, Facebook en meer. Afgestemd op je merk, je aanbod, en de dagen die gevuld moeten worden.",
  },
  {
    icon: "📅",
    title: "Seizoensstrategie",
    desc: "Valentijnsdag, Koningsdag, kerst — Filly denkt vooruit. Je krijgt automatisch voorstellen voor speciale menu's en campagnes, weken van tevoren.",
  },
  {
    icon: "🔗",
    title: "Koppelingen",
    desc: "Verbind met Zenchef, OpenTable, SevenRooms en andere boekingsplatforms. Eenmalig instellen, daarna draait alles automatisch.",
  },
];

export default function ProductPage() {
  return (
    <>
      <section style={{ paddingTop: 160, paddingBottom: 0 }}>
        <div className="container">
          <p className="section-label">Product</p>
          <h1 className="section-title">
            Jouw AI marketing-assistent voor de horeca.
          </h1>
          <p className="section-subtitle">
            Get-Filly combineert je reserveringsdata met AI om automatisch
            campagnes te draaien die lege stoelen vullen. Je chat, Filly doet de
            rest.
          </p>
        </div>
      </section>

      <section className="features" style={{ paddingTop: 48 }}>
        <div className="container">
          <div className="features-grid">
            {features.map((f) => (
              <div key={f.title} className="feature-card">
                <div className="feature-icon">{f.icon}</div>
                <h3 className="feature-title">{f.title}</h3>
                <p className="feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
