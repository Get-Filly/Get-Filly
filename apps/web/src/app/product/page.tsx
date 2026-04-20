const features = [
  {
    icon: "📊",
    title: "Bezettingsdashboard",
    desc: "Realtime inzicht in je bezettingsgraad per dag, week en maand. Kleurcodering laat direct zien waar je omzet mist.",
  },
  {
    icon: "💬",
    title: "AI-chatbot",
    desc: "Chat met Filly zoals je met een collega praat. Hij kent je data, doet voorstellen, en voert ze uit na jouw goedkeuring.",
  },
  {
    icon: "✉️",
    title: "E-mailcampagnes",
    desc: "Van concept tot verzending in één chat. Filly schrijft de mail, selecteert de juiste gasten, en stuurt op het beste moment.",
  },
  {
    icon: "📱",
    title: "Social media posts",
    desc: "Filly maakt posts voor Instagram en Facebook. Afgestemd op je merk, je aanbod, en de dagen die gevuld moeten worden.",
  },
  {
    icon: "📅",
    title: "Seizoensstrategie",
    desc: "Valentijnsdag, Koningsdag, kerst — Filly denkt vooruit. Je krijgt automatisch voorstellen, weken van tevoren.",
  },
  {
    icon: "🔗",
    title: "Koppelingen",
    desc: "Verbind met Zenchef, OpenTable, SevenRooms en andere platforms. Eenmalig instellen, daarna draait alles automatisch.",
  },
];

const diffs = [
  {
    num: "01",
    title: "AI dóet het werk. Jij keurt goed.",
    desc: "Andere tools assisteren — jij moet nog steeds campagnes verzinnen, schrijven en plannen. Filly doet dat. Hij leest je bezetting, weer en gasten, stelt campagnes voor, jij klikt 'Goedkeuren'. Meer niet.",
  },
  {
    num: "02",
    title: "Geen marketingkennis nodig.",
    desc: "Mailchimp en SevenRooms gaan ervan uit dat jij segmenten bouwt, A/B-tests opzet en open-rates analyseert. Get-Filly is voor ondernemers die gewoon willen koken en meer gasten willen. Filly beslist wat werkt, jij ziet alleen de uitkomst.",
  },
  {
    num: "03",
    title: "Plakt op wat je al hebt.",
    desc: "Je reserveringsplatform, je POS, je social media — die houd je. Get-Filly vervangt niks, integreert alleen. Dat betekent één losse koppeling en direct aan de slag, in plaats van wekenlang overstappen.",
  },
  {
    num: "04",
    title: "Meet wat écht werkt.",
    desc: "Andere tools laten zien: '248 mails verzonden, 42% geopend'. Wij laten zien: '+12 reserveringen, €540 extra omzet, 8 slapende gasten teruggekomen'. Per campagne. Zo weet je écht wat geld oplevert — en leert Filly daarvan voor de volgende keer.",
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
            Get Filly combineert je reserveringsdata met AI om automatisch
            campagnes te draaien die lege stoelen vullen. Je chat, Filly doet de
            rest.
          </p>
        </div>
      </section>

      {/* Vier differentiators */}
      <section style={{ paddingTop: 64, paddingBottom: 64 }}>
        <div className="container">
          <p className="section-label">Wat Get Filly anders maakt</p>
          <h2 className="section-title" style={{ maxWidth: 720 }}>
            Vier redenen waarom dit niet &ldquo;weer een marketing-tool&rdquo; is.
          </h2>

          <div
            style={{
              marginTop: 48,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
              gap: 32,
            }}
          >
            {diffs.map((d) => (
              <div
                key={d.num}
                style={{
                  display: "flex",
                  gap: 20,
                  padding: 28,
                  background: "var(--bg)",
                  borderRadius: "var(--radius)",
                }}
              >
                <div
                  style={{
                    fontSize: 32,
                    fontWeight: 800,
                    color: "var(--accent)",
                    letterSpacing: "-1px",
                    lineHeight: 1,
                    minWidth: 48,
                  }}
                >
                  {d.num}
                </div>
                <div>
                  <h3
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      marginBottom: 10,
                      letterSpacing: "-0.3px",
                    }}
                  >
                    {d.title}
                  </h3>
                  <p
                    style={{
                      fontSize: 15,
                      color: "var(--text-secondary)",
                      lineHeight: 1.6,
                    }}
                  >
                    {d.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="features" style={{ paddingTop: 48 }}>
        <div className="container">
          <p className="section-label">Alle functies</p>
          <h2 className="section-title">Wat zit er in.</h2>
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
