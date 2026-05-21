// ============================================================
// VindbaarheidVisualizer — Get-Filly hub + 8 partner-merken
// ============================================================
//
// Per 2026-05-13 (iteratie 3, op verzoek van Floris):
//   - Layout: Get-Filly hub bovenaan, 8 echte brand-logo's in
//     één horizontale rij onderaan, rechte stralen ertussen
//     (zoals het Spotlight-design dat Floris als referentie
//     deelde).
//   - Animatie: alle 8 logo's faden tegelijk in vanaf
//     onzichtbaar. Daarna verschijnen de stippel-aderen tussen
//     hub en elke logo. Daarna pulsen er continu groene
//     bloeddruppels door elke ader, van logo naar hub.
//   - Logo's: echte brand-SVGs via <BrandLogo> (zie brand-
//     logos.tsx). Vereenvoudigd maar herkenbaar.
//
// Geen state of useEffect — alles via CSS keyframes.

import { BrandLogo, type BrandId } from "./brand-logos";

type Partner = {
  id: BrandId;
  name: string;
};

// Volgorde van links naar rechts. Bewust gemixt: 'sterkste'
// merken (Google, ChatGPT, Tripadvisor) afgewisseld met
// minder bekende zodat de rij visueel evenwichtig oogt.
const PARTNERS: Partner[] = [
  { id: "google",      name: "Google Business" },
  { id: "tripadvisor", name: "Tripadvisor" },
  { id: "chatgpt",     name: "ChatGPT" },
  { id: "thefork",     name: "TheFork" },
  { id: "claude",      name: "Claude" },
  { id: "maps",        name: "Kaarten" },
  { id: "opentable",   name: "OpenTable" },
  { id: "gemini",      name: "Gemini" },
];

// SVG-viewport. Compacter dan vorige iteratie (520→420) want
// horizontale rij neemt geen extra hoogte.
const VB_W = 720;
const VB_H = 420;
// Hub: rechthoek-card bovenaan met logo + naam, gecentreerd.
const HUB_W = 200;
const HUB_H = 80;
const HUB_X = (VB_W - HUB_W) / 2;
const HUB_Y = 28;
const HUB_BOTTOM_X = VB_W / 2;
const HUB_BOTTOM_Y = HUB_Y + HUB_H;
// Logos-rij onderaan. 8 partners evenly gespaceerd over de
// volle width minus 40px marge aan elke kant.
const LOGO_ROW_Y = 320;
const LOGO_SIZE = 44;
const LOGO_MARGIN = 56;
const LOGO_STEP = (VB_W - 2 * LOGO_MARGIN) / (PARTNERS.length - 1);

function logoPosition(idx: number) {
  return {
    x: LOGO_MARGIN + idx * LOGO_STEP,
    y: LOGO_ROW_Y,
  };
}

// Lijn-eindpunt: net boven de logo zodat hij niet door de
// cirkel heen loopt.
function lineEndY(logoY: number) {
  return logoY - LOGO_SIZE / 2 - 4;
}

// Lijnlengte per partner — verschilt omdat ze niet allemaal
// even ver van de hub-bottom liggen. We hebben deze nodig om
// de puls-dasharray correct te maken (1 puls per lijnlengte).
function lineLength(idx: number) {
  const pos = logoPosition(idx);
  const dx = pos.x - HUB_BOTTOM_X;
  const dy = lineEndY(pos.y) - HUB_BOTTOM_Y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function VindbaarheidVisualizer() {
  return (
    <div className="vh-container" aria-hidden="true">
      <svg
        className="vh-svg"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="vh-hub-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#1F4A2D" floodOpacity="0.18" />
          </filter>
        </defs>

        {/* ──────────────────────────────────────────────────
            Aderen + pulsen tussen hub-onderkant en elk logo.
            Per partner: 2 lijnen (bg + puls), staggered delays.
        ────────────────────────────────────────────────── */}
        {PARTNERS.map((p, idx) => {
          const pos = logoPosition(idx);
          const x1 = HUB_BOTTOM_X;
          const y1 = HUB_BOTTOM_Y;
          const x2 = pos.x;
          const y2 = lineEndY(pos.y);
          const len = lineLength(idx);
          const pulseLen = 14;
          // Stagger per partner zodat pulsen niet synchroon
          // door alle 8 aderen tegelijk lopen.
          const pulseDelay = `${1.4 + idx * 0.18}s`;
          return (
            <g key={`line-${p.id}`}>
              {/* Aderlijn — vaste gestippelde achtergrond,
                  loopt van logo naar hub (x1→x2 omgekeerd zou
                  pulsrichting omkeren). */}
              <line
                x1={x2} y1={y2} x2={x1} y2={y1}
                stroke="#1F4A2D"
                strokeWidth={1.4}
                strokeDasharray="3 6"
                strokeLinecap="round"
                className="vh-line-bg"
              />
              {/* Puls — kort groen segment dat van logo naar
                  hub reist (stroke-dashoffset wordt negatief). */}
              <line
                x1={x2} y1={y2} x2={x1} y2={y1}
                stroke="var(--accent)"
                strokeWidth={3}
                strokeDasharray={`${pulseLen} ${len - pulseLen}`}
                strokeLinecap="round"
                className="vh-pulse"
                style={{
                  animationDelay: `0.7s, ${pulseDelay}`,
                  // CSS-var voor de keyframe: hoeveel ver de
                  // stroke-dashoffset moet schuiven = 1 lijnlengte.
                  ["--vh-line-len" as string]: `${len}`,
                }}
              />
            </g>
          );
        })}

        {/* ──────────────────────────────────────────────────
            Get-Filly hub — rechthoek-card bovenaan met logo
            + naam. Geen animatie.
        ────────────────────────────────────────────────── */}
        <rect
          x={HUB_X}
          y={HUB_Y}
          width={HUB_W}
          height={HUB_H}
          rx={20}
          fill="#FFFFFF"
          stroke="rgba(31,74,45,0.08)"
          strokeWidth={1}
          filter="url(#vh-hub-shadow)"
        />
        {/* Logo + tekst horizontaal gecentreerd in de hub-card. */}
        <g transform={`translate(${HUB_X + 30}, ${HUB_Y + 50})`}>
          <path
            d="M 19 -8 A 11 11 0 1 0 19 3"
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeLinecap="round"
          />
          <rect x={1}    y={2}  width={2} height={6}  rx={0.5} fill="#1F3B2A" />
          <rect x={4.5}  y={0}  width={2} height={8}  rx={0.5} fill="#2D5A3F" />
          <rect x={8}    y={-3} width={2} height={11} rx={0.5} fill="#5E9570" />
          <rect x={11.5} y={-6} width={2} height={14} rx={0.5} fill="#7DA87A" />
          <text
            x={30}
            y={5}
            fontSize={18}
            fontWeight={700}
            fill="var(--accent)"
            fontFamily="inherit"
          >
            Get-Filly
          </text>
        </g>

        {/* ──────────────────────────────────────────────────
            8 partner-logo's in een rij onderaan. Stagger
            fade-in voor natuurlijk ritme.
        ────────────────────────────────────────────────── */}
        {PARTNERS.map((p, idx) => {
          const pos = logoPosition(idx);
          const nodeDelay = `${idx * 0.06}s`;
          return (
            <g
              key={`node-${p.id}`}
              className="vh-node"
              style={{ animationDelay: nodeDelay }}
            >
              {/* Lichte ring/shadow rond de logo zodat 't 'card'
                  voelt en boven de aderen contrasteert. */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={LOGO_SIZE / 2 + 6}
                fill="#FFFFFF"
                stroke="rgba(31,74,45,0.08)"
                strokeWidth={1}
                filter="url(#vh-hub-shadow)"
              />
              {/* Echte brand-SVG */}
              <BrandLogo id={p.id} x={pos.x} y={pos.y} size={LOGO_SIZE} />
              {/* Naam-label */}
              <text
                x={pos.x}
                y={pos.y + LOGO_SIZE / 2 + 22}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill="var(--text)"
                fontFamily="inherit"
              >
                {p.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
