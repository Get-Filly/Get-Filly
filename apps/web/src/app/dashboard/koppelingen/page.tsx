"use client";

type IntegrationCategory =
  | "reserveringen"
  | "vindbaarheid"
  | "communicatie"
  | "reviews"
  | "data";

type Integration = {
  key: string;
  icon: string;
  name: string;
  desc: string;
  status: "connected" | "disconnected";
  category: IntegrationCategory;
  autoConnected?: boolean;
};

const integrations: Integration[] = [
  {
    key: "zenchef",
    icon: "🍽️",
    name: "Reserveringsplatform",
    desc: "Zenchef, OpenTable, SevenRooms of Resengo — bezetting automatisch importeren en synchroniseren.",
    status: "disconnected",
    category: "reserveringen",
  },
  {
    key: "sendgrid",
    icon: "✉️",
    name: "E-mail (Resend / SendGrid)",
    desc: "Filly verstuurt campagne-mails namens jou — met jouw merknaam als afzender.",
    status: "disconnected",
    category: "communicatie",
  },
  {
    key: "instagram",
    icon: "📱",
    name: "Instagram",
    desc: "Posts en stories automatisch door Filly laten plaatsen op je business-account.",
    status: "disconnected",
    category: "communicatie",
  },
  {
    key: "facebook",
    icon: "👥",
    name: "Facebook",
    desc: "Posts, events en campagnes via Meta Business Suite (Graph API).",
    status: "disconnected",
    category: "communicatie",
  },
  {
    key: "whatsapp",
    icon: "💬",
    name: "WhatsApp Business",
    desc: "Directe berichten naar gasten (template-gebaseerd, conform WhatsApp-regels).",
    status: "disconnected",
    category: "communicatie",
  },
  {
    key: "google_business",
    icon: "📍",
    name: "Google Business Profile",
    desc: "Verhoog je vindbaarheid in Google Maps en zoekresultaten. Filly plaatst Posts, houdt openingstijden actueel en beantwoordt reviews. Belangrijkste kanaal voor local SEO.",
    status: "disconnected",
    category: "vindbaarheid",
  },
  {
    key: "tripadvisor",
    icon: "🧳",
    name: "TripAdvisor / The Fork",
    desc: "Reviews en reserveringen van grote reserverings- en review-platforms.",
    status: "disconnected",
    category: "reviews",
  },
  {
    key: "lightspeed",
    icon: "🧾",
    name: "POS / Kassasysteem",
    desc: "Lightspeed of EasyOrder — echte omzet per dag in plaats van een schatting.",
    status: "disconnected",
    category: "data",
  },
  {
    key: "weather",
    icon: "🌤️",
    name: "Weer (Open-Meteo)",
    desc: "7-daagse weersvoorspelling voor jouw locatie. Filly gebruikt dit voor bezetting- en campagne-voorspelling.",
    status: "connected",
    category: "data",
    autoConnected: true,
  },
];

const categoryLabels: Record<IntegrationCategory, { label: string; desc: string }> = {
  reserveringen: {
    label: "Reserveringen",
    desc: "Bron voor je bezettingsdata — het fundament van wat Filly doet.",
  },
  vindbaarheid: {
    label: "Vindbaarheid",
    desc: "Zorgen dat klanten je vinden via Google Maps en zoekresultaten.",
  },
  communicatie: {
    label: "Communicatie",
    desc: "Kanalen waarop Filly namens jou campagnes verstuurt.",
  },
  reviews: {
    label: "Reviews",
    desc: "Reputatie-platforms voor sterren en gast-feedback.",
  },
  data: {
    label: "Externe data",
    desc: "Weer, omzet en andere signalen die Filly's beslissingen beter maken.",
  },
};

// Volgorde volgt de klant-journey: eerst vindbaar (klant zoekt) →
// communicatie (actief benaderen) → reviews (terugkoppeling) → data.
const categoryOrder: IntegrationCategory[] = [
  "reserveringen",
  "vindbaarheid",
  "communicatie",
  "reviews",
  "data",
];

export default function KoppelingenPage() {
  const connectedCount = integrations.filter(
    (i) => i.status === "connected",
  ).length;
  const toDoCount = integrations.length - connectedCount;

  return (
    <div className="page-full">
      <div className="page-title">Koppelingen</div>
      <div className="page-subtitle">
        Verbind externe diensten om Filly toegang te geven tot data, kanalen en
        automatisering.
      </div>

      {/* Stats-row: hoeveel werkend, hoeveel nog nodig, totaal. Connected
          count krijgt brand-filly-styling zodat actieve koppelingen
          direct opvallen. */}
      <div className="stats-row">
        <div className="stat-card stat-card-filly">
          <div className="stat-card-label">Actief</div>
          <div className="stat-card-val">{connectedCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Nog te koppelen</div>
          <div className="stat-card-val">{toDoCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Totaal beschikbaar</div>
          <div className="stat-card-val">{integrations.length}</div>
        </div>
      </div>

      {/* Per categorie een eigen sub-sectie met kopje + beschrijving +
          cards. Geeft structuur en maakt duidelijk wat het nut van
          iedere groep is. */}
      {categoryOrder.map((cat) => {
        const group = integrations.filter((i) => i.category === cat);
        if (group.length === 0) return null;
        const meta = categoryLabels[cat];
        return (
          <div key={cat} className="integrations-section">
            <div className="integrations-section-head">
              <h3 className="integrations-section-title">{meta.label}</h3>
              <p className="integrations-section-desc">{meta.desc}</p>
            </div>
            <div className="integrations-grid">
              {group.map((i) => (
                <div
                  key={i.key}
                  className={`integration-card ${
                    i.status === "connected" ? "integration-card-active" : ""
                  }`}
                >
                  <div className="int-head">
                    <div className="int-icon">{i.icon}</div>
                    <div className="int-name">{i.name}</div>
                  </div>
                  <div className="int-desc">{i.desc}</div>
                  <div className="int-footer">
                    <span className={`int-status ${i.status}`}>
                      {i.status === "connected"
                        ? "✓ Actief"
                        : "Niet gekoppeld"}
                    </span>
                    {i.autoConnected ? (
                      <span className="int-auto">Auto via locatie</span>
                    ) : (
                      <button className="int-btn" disabled>
                        Binnenkort
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="integrations-note">
        Koppelingen worden in volgorde van prioriteit gebouwd:
        reserveringsplatform → e-mail → social → overige.
      </div>
    </div>
  );
}
