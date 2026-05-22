// ============================================================
// VindbaarheidVisualizer — Get-Filly hub + 8 partner-merken
// ============================================================
//
// Per 2026-05-21 (iteratie 4, op verzoek van Floris):
//   1) Layout: Filly centraal, 8 echte brand-logo's in een
//      cirkel eromheen (12/1:30/3/4:30/6/7:30/9/10:30).
//   2) Animatie in 3 fases:
//      a. Logos popen sequentieel in (Google → TheFork →
//         ChatGPT → Tripadvisor → Claude → OpenTable →
//         Gemini → Maps), 0.3s per logo.
//      b. Wanneer alle 8 zichtbaar zijn, tekenen de 8 aderen
//         tegelijk uit vanaf Filly naar elk logo (solid line,
//         stroke-dashoffset draw-out trick).
//      c. Daarna pulseren continu groene bloeddruppels vanaf
//         Filly naar elk logo (richting omgekeerd t.o.v. v3).
//   3) Aders: doorgetrokken (solid), opacity ~0.32, geen
//      stippels meer (per Floris-feedback "geen stippels,
//      echte aders").
//
// Implementatie: lijn-richting van hub naar logo (x1=hubX,
// x2=logoX). De stroke-dashoffset truc voor draw-out begint
// vanaf het start-punt = hub-kant, dus de lijn lijkt vanaf
// Filly naar buiten te groeien. Pulse-richting volgt dezelfde
// lijn-richting → pulsen lopen van Filly naar logo's.
//
// Geen useState/useEffect — alle timing via CSS keyframes.

import { BrandLogo, type BrandId } from "./brand-logos";

type Partner = {
  id: BrandId;
  name: string;
};

// Reveal-volgorde: bovenaan starten en klokwijs rond, met de
// merken die Floris vooraan wilde zien.
const PARTNERS: Partner[] = [
  { id: "google",      name: "Google Business" }, // 12 uur
  { id: "thefork",     name: "TheFork" },          //  1:30
  { id: "chatgpt",     name: "ChatGPT" },          //  3
  { id: "tripadvisor", name: "Tripadvisor" },      //  4:30
  { id: "claude",      name: "Claude" },           //  6
  { id: "opentable",   name: "OpenTable" },        //  7:30
  { id: "gemini",      name: "Gemini" },           //  9
  { id: "maps",        name: "Kaarten" },          // 10:30
];

// Animatie-fases (sec). Eén plek aanpassen = hele timeline
// schuift mee.
const NODE_STAGGER = 0.3;                                   // tussen 2 logo-pops
const NODE_DURATION = 0.4;                                  // 1 logo's fade-in
const NODES_DONE = (PARTNERS.length - 1) * NODE_STAGGER + NODE_DURATION; // = 2.5s
const LINES_DELAY = NODES_DONE + 0.15;                      // start net na laatste logo
const LINES_DURATION = 0.9;                                 // alle aders tegelijk
const PULSES_DELAY = LINES_DELAY + LINES_DURATION;          // pulsen starten als aders klaar zijn

// SVG-viewport: vierkant zodat de cirkel niet uitgerekt wordt.
const VB = 600;
const CX = VB / 2;
const CY = VB / 2;
// Hub: kleinere card (geen brede titel meer nodig — logo + naam
// passen comfortabel binnen 180x76px). Centraal geplaatst.
const HUB_W = 180;
const HUB_H = 76;
// Cirkel-radius waar de logo-centers op liggen. Gekozen zodat
// de logo's net buiten de hub vallen + voldoende ruimte voor
// de aders ertussen.
const LOGO_RADIUS = 220;
const LOGO_SIZE = 56;

// Bereken (x, y) voor logo op idx rond de cirkel. Start op -90°
// (bovenaan), klokwijs in stappen van 45°.
function logoPosition(idx: number) {
  const angleDeg = -90 + idx * (360 / PARTNERS.length);
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: CX + LOGO_RADIUS * Math.cos(angleRad),
    y: CY + LOGO_RADIUS * Math.sin(angleRad),
  };
}

// Eindpunten van de ader: start op hub-rand, eindigt op logo-rand
// (niet door het logo of de hub heen). De hub benaderen we als
// ellips (HUB_W/2 × HUB_H/2 + 6px marge); logo-rand is de witte
// cirkel rond het brand-icoon.
function lineEndpoints(idx: number) {
  const pos = logoPosition(idx);
  const dx = pos.x - CX;
  const dy = pos.y - CY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / dist; // unit-vector richting logo
  const uy = dy / dist;
  const a = HUB_W / 2 + 6;
  const b = HUB_H / 2 + 6;
  const tHub = 1 / Math.sqrt((ux * ux) / (a * a) + (uy * uy) / (b * b));
  const hubX = CX + ux * tHub;
  const hubY = CY + uy * tHub;
  const logoR = LOGO_SIZE / 2 + 6;
  const logoX = pos.x - ux * logoR;
  const logoY = pos.y - uy * logoR;
  return { hubX, hubY, logoX, logoY };
}

function lineLength(idx: number) {
  const { hubX, hubY, logoX, logoY } = lineEndpoints(idx);
  const dx = logoX - hubX;
  const dy = logoY - hubY;
  return Math.sqrt(dx * dx + dy * dy);
}

export function VindbaarheidVisualizer() {
  return (
    <div className="vh-container" aria-hidden="true">
      <svg
        className="vh-svg"
        viewBox={`0 0 ${VB} ${VB}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="vh-hub-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="6" stdDeviation="12" floodColor="#1F4A2D" floodOpacity="0.18" />
          </filter>
          <filter id="vh-logo-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="3" stdDeviation="6" floodColor="#1F4A2D" floodOpacity="0.12" />
          </filter>
        </defs>

        {/* ──────────────────────────────────────────────────
            Fase 2 + 3: aderen (solid, draw-out vanaf hub)
            + continue pulsen (van hub naar logo).
            Lijn-richting: x1=hubX → x2=logoX zodat de
            stroke-dashoffset truc de lijn vanaf de hub-kant
            "uittekent" en de puls in dezelfde richting loopt.
        ────────────────────────────────────────────────── */}
        {PARTNERS.map((p, idx) => {
          const { hubX, hubY, logoX, logoY } = lineEndpoints(idx);
          const len = lineLength(idx);
          const pulseLen = 18;
          const pulseStagger = `${PULSES_DELAY + idx * 0.16}s`;
          return (
            <g key={`line-${p.id}`}>
              {/* Solide aderlijn van hub naar logo. Initial
                  stroke-dashoffset = lijn-lengte (= verborgen),
                  animeert naar 0 (= volledig getekend). */}
              <line
                x1={hubX}
                y1={hubY}
                x2={logoX}
                y2={logoY}
                stroke="#1F4A2D"
                strokeWidth={1.6}
                strokeLinecap="round"
                className="vh-line-bg"
                style={{
                  ["--vh-line-len" as string]: `${len}`,
                }}
              />
              {/* Pulserend segment van hub naar logo. Dezelfde
                  lijn-richting → puls reist van Filly naar de
                  partner. */}
              <line
                x1={hubX}
                y1={hubY}
                x2={logoX}
                y2={logoY}
                stroke="var(--accent)"
                strokeWidth={3}
                strokeDasharray={`${pulseLen} ${len - pulseLen}`}
                strokeLinecap="round"
                className="vh-pulse"
                style={{
                  animationDelay: `${pulseStagger}, ${pulseStagger}`,
                  ["--vh-line-len" as string]: `${len}`,
                }}
              />
            </g>
          );
        })}

        {/* ──────────────────────────────────────────────────
            Get-Filly hub — centraal in de cirkel. Altijd
            zichtbaar (geen animatie).
        ────────────────────────────────────────────────── */}
        <rect
          x={CX - HUB_W / 2}
          y={CY - HUB_H / 2}
          width={HUB_W}
          height={HUB_H}
          rx={20}
          fill="#FFFFFF"
          stroke="rgba(31,74,45,0.08)"
          strokeWidth={1}
          filter="url(#vh-hub-shadow)"
        />
        <g transform={`translate(${CX - 56}, ${CY + 6})`}>
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
            Fase 1: 8 partner-logo's in cirkel rond de hub.
            Sequentieel popen in via NODE_STAGGER-delay. Geen
            tekst-labels onder de logo's (Floris-feedback).
        ────────────────────────────────────────────────── */}
        {PARTNERS.map((p, idx) => {
          const pos = logoPosition(idx);
          const nodeDelay = `${idx * NODE_STAGGER}s`;
          return (
            <g
              key={`node-${p.id}`}
              className="vh-node"
              style={{ animationDelay: nodeDelay }}
            >
              <circle
                cx={pos.x}
                cy={pos.y}
                r={LOGO_SIZE / 2 + 6}
                fill="#FFFFFF"
                stroke="rgba(31,74,45,0.08)"
                strokeWidth={1}
                filter="url(#vh-logo-shadow)"
              />
              <BrandLogo id={p.id} x={pos.x} y={pos.y} size={LOGO_SIZE} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
