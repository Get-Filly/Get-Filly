// ============================================================
// ZichtbaarheidVisualizer — Get-Filly als social-content-hub
// ============================================================
//
// Per 2026-05-21 (iteratie 3, definitief): matcht de originele
// PNG-layout van Floris met grote Filly-cirkel centraal en 3
// grote platform-cirkels eromheen, elk met een mini-card vol
// bullets ernaast. Plus dynamische extras:
//   - Korte stippellijn Filly → platform (directe verbinding)
//   - Gebogen pijl-arc die om de platform heen draait met
//     groene puls erlangs (content stream uit Filly)
//   - Sequentiële reveal van platforms + cards
//
// Layout (procenten van container):
//   - Filly:         50% / 42%  (groot, centraal)
//   - Instagram:     22% / 22%  (linksboven)
//   - Facebook:      78% / 22%  (rechtsboven)
//   - TikTok:        50% / 80%  (onder)
//
// Mini-cards:
//   - IG-card links van IG-cirkel
//   - FB-card rechts van FB-cirkel
//   - TikTok-card onder TikTok-cirkel
//
// Animatie-fases:
//   1) Platform-cirkel + mini-card popen sequentieel in
//      (Instagram → Facebook → TikTok), 0.4s per platform.
//   2) Korte stippellijnen + gebogen pijl-arcs tekenen tegelijk
//      uit vanaf Filly.
//   3) Continue groene content-pulsen langs elke gebogen arc
//      (Filly publiceert content naar elk platform).

import { BrandLogo, type BrandId } from "./brand-logos";

type Platform = {
  id: BrandId;
  name: string;
  bullets: string[];
  // Positie in % van de container (x,y) van het platform-icoon-center.
  px: number;
  py: number;
  // Positie in % van het mini-card-center.
  cardX: number;
  cardY: number;
  // Arc curve-richting voor de gebogen pijl. 'cw' = klokwijs
  // om het platform heen (linkerkant), 'ccw' = tegenklok
  // (rechterkant). Bepaalt welke kant de pijl uitwaait.
  arcDir: "cw" | "ccw";
};

const PLATFORMS: Platform[] = [
  {
    id: "instagram",
    name: "Instagram",
    bullets: ["Visuele inspiratie", "Meer bereik", "Meer reserveringen"],
    px: 22,  py: 22,
    cardX: 13, cardY: 36,
    arcDir: "ccw",
  },
  {
    id: "facebook",
    name: "Facebook",
    bullets: ["Lokale doelgroep", "Gerichte campagnes", "Meer gasten"],
    px: 78, py: 22,
    cardX: 87, cardY: 36,
    arcDir: "cw",
  },
  {
    id: "tiktok",
    name: "TikTok",
    bullets: ["Krachtige content", "Nieuwe doelgroepen", "Meer traffic"],
    px: 50, py: 78,
    cardX: 50, cardY: 94,
    arcDir: "cw",
  },
];

// Animatie-timing (sec).
const NODE_STAGGER = 0.4;
const NODE_DURATION = 0.5;
const NODES_DONE = (PLATFORMS.length - 1) * NODE_STAGGER + NODE_DURATION; // 1.3s
const LINES_DELAY = NODES_DONE + 0.15;                                    // 1.45s
const LINES_DURATION = 1.0;
const PULSES_DELAY = LINES_DELAY + LINES_DURATION;                        // 2.45s

// SVG-viewBox in 100x100 zodat we makkelijk in procenten kunnen
// werken — matcht 1-op-1 met de HTML left/top%.
const VB = 100;
const HUB_X = 50;
const HUB_Y = 42;

// Bereken een gebogen pad van Filly-rand naar platform-rand.
// We gebruiken een quadratic-Bezier waarbij het controlepunt
// loodrecht op de hub→platform-lijn ligt, op afstand 'bowOut'.
// Richting (cw/ccw) bepaalt aan welke kant de boog uitwaait.
function buildArcPath(p: Platform, bowOut = 14) {
  // Vector van hub naar platform
  const dx = p.px - HUB_X;
  const dy = p.py - HUB_Y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / dist;
  const uy = dy / dist;
  // Loodrechte vector (90° gedraaid). cw vs ccw bepaalt teken.
  const sign = p.arcDir === "cw" ? 1 : -1;
  const nx = -uy * sign;
  const ny = ux * sign;
  // Start: net buiten Filly-rand (Filly-cirkel-radius ≈ 16 in viewBox-eenheden)
  const startOffset = 16;
  const sx = HUB_X + ux * startOffset;
  const sy = HUB_Y + uy * startOffset;
  // Eindpunt: net naast platform-cirkel (radius ≈ 8 in viewBox-eenheden)
  const endOffset = 8;
  const ex = p.px - ux * endOffset;
  const ey = p.py - uy * endOffset;
  // Controlepunt: middenpunt + loodrechte verschuiving
  const mx = (sx + ex) / 2 + nx * bowOut;
  const my = (sy + ey) / 2 + ny * bowOut;
  return { d: `M ${sx} ${sy} Q ${mx} ${my} ${ex} ${ey}`, sx, sy, ex, ey };
}

// Person-icoon voor in de mini-cards (matcht PNG: 2 mensjes naast
// de platform-naam).
function PersonsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="zb-card-persons" aria-hidden="true">
      <circle cx="9"  cy="8.5" r="3" fill="var(--accent)" />
      <circle cx="16" cy="9.5" r="2.4" fill="var(--accent)" />
      <path
        d="M3 19c0-2.8 2.4-5 6-5s6 2.2 6 5"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M14.5 19c0-2 1.5-3.7 3.5-3.7s3.5 1.7 3.5 3.7"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ZichtbaarheidVisualizer() {
  return (
    <div className="zb-container" aria-hidden="true">
      {/* SVG-overlay: stippellijnen + gebogen arc-pijlen +
          pulserende content-streams. */}
      <svg
        className="zb-svg"
        viewBox={`0 0 ${VB} ${VB}`}
        preserveAspectRatio="none"
      >
        <defs>
          {/* Pijlkop-marker — gebruikt door alle 3 arc-paden. */}
          <marker
            id="zb-arrowhead"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
            markerUnits="userSpaceOnUse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
          </marker>
        </defs>

        {PLATFORMS.map((p, idx) => {
          const arc = buildArcPath(p);
          // Schat ruwe lijn-lengte voor stroke-dashoffset. Quadratic
          // bezier-lengte = ongeveer 1.1× rechte afstand voor onze
          // matige curve.
          const dx = p.px - HUB_X;
          const dy = p.py - HUB_Y;
          const straightLen = Math.sqrt(dx * dx + dy * dy);
          const arcLen = straightLen * 1.15;
          const pulseLen = arcLen * 0.15;
          const pulseStagger = `${PULSES_DELAY + idx * 0.2}s`;
          return (
            <g key={`zb-line-${p.id}`}>
              {/* Korte stippel-lijn: directe verbinding Filly → platform. */}
              <line
                x1={HUB_X}
                y1={HUB_Y}
                x2={p.px}
                y2={p.py}
                stroke="#1F4A2D"
                strokeOpacity={0.35}
                strokeWidth={0.35}
                strokeDasharray="0.8 1.2"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                className="zb-dotline"
                style={{
                  animationDelay: `${LINES_DELAY}s`,
                }}
              />
              {/* Gebogen pijl-arc met pijl-kop aan het einde. */}
              <path
                d={arc.d}
                fill="none"
                stroke="#1F4A2D"
                strokeOpacity={0.55}
                strokeWidth={0.45}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                markerEnd="url(#zb-arrowhead)"
                className="zb-arc"
                style={{
                  animationDelay: `${LINES_DELAY}s`,
                  ["--vh-line-len" as string]: `${arcLen}`,
                }}
              />
              {/* Pulserende content-stream langs de arc. */}
              <path
                d={arc.d}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={0.9}
                strokeDasharray={`${pulseLen} ${arcLen - pulseLen}`}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                className="zb-pulse"
                style={{
                  animationDelay: `${pulseStagger}, ${pulseStagger}`,
                  ["--vh-line-len" as string]: `${arcLen}`,
                }}
              />
            </g>
          );
        })}
      </svg>

      {/* Filly-hub: grote witte cirkel met logo + naam (PNG-style). */}
      <div className="zb-hub-circle" style={{ left: `${HUB_X}%`, top: `${HUB_Y}%` }}>
        <svg viewBox="0 0 64 32" className="zb-hub-glyph" aria-hidden="true">
          <path
            d="M 32 14 A 12 12 0 1 0 32 26"
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2.2}
            strokeLinecap="round"
          />
          <rect x={12}   y={20} width={2.2} height={6}    rx={0.6} fill="#1F3B2A" />
          <rect x={15.5} y={18} width={2.2} height={8}    rx={0.6} fill="#2D5A3F" />
          <rect x={19}   y={15} width={2.2} height={11}   rx={0.6} fill="#5E9570" />
          <rect x={22.5} y={12} width={2.2} height={14}   rx={0.6} fill="#7DA87A" />
          <text x={36} y={24} fontSize={13} fontWeight={700} fill="var(--accent)" fontFamily="inherit">
            Get-Filly
          </text>
        </svg>
      </div>

      {/* 3 platform-cirkels — eigen logos. */}
      {PLATFORMS.map((p, idx) => {
        const nodeDelay = `${idx * NODE_STAGGER}s`;
        return (
          <div
            key={`zb-circle-${p.id}`}
            className="zb-platform-circle"
            style={{
              left: `${p.px}%`,
              top: `${p.py}%`,
              animationDelay: nodeDelay,
            }}
          >
            <svg viewBox="0 0 24 24" className="zb-platform-logo" aria-hidden="true">
              <BrandLogo id={p.id} x={12} y={12} size={24} />
            </svg>
          </div>
        );
      })}

      {/* 3 mini-cards met bullets. Verschijnen tegelijk met hun
          platform-cirkel via dezelfde nodeDelay. */}
      {PLATFORMS.map((p, idx) => {
        const nodeDelay = `${idx * NODE_STAGGER}s`;
        return (
          <div
            key={`zb-card-${p.id}`}
            className="zb-card"
            style={{
              left: `${p.cardX}%`,
              top: `${p.cardY}%`,
              animationDelay: nodeDelay,
            }}
          >
            <div className="zb-card-header">
              <PersonsIcon />
              <span className="zb-card-name">{p.name}</span>
            </div>
            <ul className="zb-card-bullets">
              {p.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
