"use client";

type Integration = {
  key: string;
  icon: string;
  name: string;
  desc: string;
  status: "connected" | "disconnected";
  autoConnected?: boolean;
};

const integrations: Integration[] = [
  {
    key: "weather",
    icon: "🌤️",
    name: "Weer (Open-Meteo)",
    desc: "Automatische 7-daagse weersvoorspelling voor jouw restaurant-locatie. Gebruikt door Filly voor bezettings-voorspelling en campagne-suggesties.",
    status: "connected",
    autoConnected: true,
  },
  {
    key: "sendgrid",
    icon: "✉️",
    name: "E-mail (SendGrid / Resend)",
    desc: "Voor het daadwerkelijk verzenden van campagne-mails naar je gasten.",
    status: "disconnected",
  },
  {
    key: "instagram",
    icon: "📱",
    name: "Instagram",
    desc: "Posts en stories automatisch door Filly laten plaatsen.",
    status: "disconnected",
  },
  {
    key: "facebook",
    icon: "👥",
    name: "Facebook",
    desc: "Posts, events en reclame via Meta Graph API.",
    status: "disconnected",
  },
  {
    key: "whatsapp",
    icon: "💬",
    name: "WhatsApp Business",
    desc: "Directe berichten naar gasten (template-gebaseerd, conform WhatsApp-regels).",
    status: "disconnected",
  },
  {
    key: "zenchef",
    icon: "🍽️",
    name: "Reserveringsplatform",
    desc: "Zenchef, OpenTable, SevenRooms of Resengo — om bezetting automatisch te importeren.",
    status: "disconnected",
  },
  {
    key: "lightspeed",
    icon: "🧾",
    name: "POS / Kassasysteem",
    desc: "Lightspeed of EasyOrder voor echte omzet per dag (i.p.v. geschat).",
    status: "disconnected",
  },
  {
    key: "google_business",
    icon: "⭐",
    name: "Google Business Profile",
    desc: "Recensies lezen, Google Posts plaatsen, reviews beantwoorden.",
    status: "disconnected",
  },
  {
    key: "tripadvisor",
    icon: "🧳",
    name: "TripAdvisor / The Fork",
    desc: "Reviews en reserveringen van grote reserverings-/review-platforms.",
    status: "disconnected",
  },
];

export default function KoppelingenPage() {
  return (
    <div className="page-full">
      <div className="page-title">Koppelingen</div>
      <div className="page-subtitle">
        Verbind externe diensten om Filly toegang te geven tot data, kanalen en
        automatisering.
      </div>

      <div className="integrations-grid">
        {integrations.map((i) => (
          <div key={i.key} className="integration-card">
            <div className="int-head">
              <div className="int-icon">{i.icon}</div>
              <div className="int-name">{i.name}</div>
            </div>
            <div className="int-desc">{i.desc}</div>
            <div className="int-footer">
              <span className={`int-status ${i.status}`}>
                {i.status === "connected" ? "✓ Actief" : "Niet gekoppeld"}
              </span>
              {i.autoConnected ? (
                <span style={{ fontSize: 11, color: "var(--tl)" }}>
                  Auto via locatie
                </span>
              ) : (
                <button className="int-btn" disabled>
                  Binnenkort
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 20, fontSize: 12, color: "var(--tl)" }}>
        Koppelingen worden in volgorde van prioriteit gebouwd:
        reserveringsplatform &rarr; e-mail &rarr; social &rarr; overige.
      </div>
    </div>
  );
}
