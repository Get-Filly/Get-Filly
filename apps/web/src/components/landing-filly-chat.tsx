"use client";

// =============================================================================
// LandingFillyChat — de Filly-chat binnen de hero-mockup, nu als een
// afspelende conversatie i.p.v. één statische voorstel-kaart.
//
// Het verhaal (speelt 1× af zodra de mockup in beeld scrollt en blijft
// daarna in de eindstaat staan, ~5 seconden totaal):
//   1. Filly: "rustige dag gedetecteerd — zal ik een actie klaarzetten?"
//   2. Gast:  "Ja, graag"
//   3. Filly: de Last-minute lunchdeal-voorstelkaart
//   4. Filly: "bekijk het volledige concept in Campagnes"
//   5. Gast:  "Keur goed" (laatste bericht)
//
// Vóór de eerste Filly-beurt en vóór het voorstel staat even de typ-
// indicator, zodat het als een echte chat aanvoelt. Bij prefers-reduced-
// motion tonen we direct de volledige eindstaat: geen timers, geen pop-in.
//
// Waarom een client-component: de homepage (page.tsx) is een server-
// component; deze chat heeft state + timers nodig, dus is 'm losgetrokken
// als eigen "use client"-eiland. De rest van de mockup blijft server.
// =============================================================================

import { useEffect, useRef, useState } from "react";
import { Send, Mail, Camera, MessageCircle, TrendingUp } from "lucide-react";

// Kanaal-chips op de voorstel-kaart. Camera staat voor Instagram
// (lucide 1.14 heeft geen los Instagram-icoon) — identiek aan de oude mock.
const PROPOSAL_CHANNELS = [
  { Icon: Camera, label: "Instagram" },
  { Icon: Mail, label: "E-mail" },
  { Icon: MessageCircle, label: "WhatsApp" },
];

// Eén beurt in het gesprek. 'proposal' rendert de voorstel-kaart.
type Turn =
  | { id: string; kind: "ai" | "user"; text: string }
  | { id: string; kind: "proposal" };

const TURNS: Turn[] = [
  {
    id: "ai-vraag",
    kind: "ai",
    text: "Dinsdag 3 juni staat op 43%, ruim onder je gemiddelde. Zal ik daar een actie voor klaarzetten?",
  },
  { id: "user-ja", kind: "user", text: "Ja, graag 👍" },
  { id: "proposal", kind: "proposal" },
  {
    id: "ai-concept",
    kind: "ai",
    text: "Top! Het volledige concept staat klaar in Campagnes.",
  },
  { id: "user-keurgoed", kind: "user", text: "Bekeken — keur goed ✅" },
];

// Fases van het gesprek: hoeveel beurten zichtbaar zijn + of Filly op dat
// moment "typt". De typ-indicator vóór een Filly-beurt maakt het levendig.
const PHASES: { count: number; typing: boolean }[] = [
  { count: 0, typing: true }, // Filly begint te typen
  { count: 1, typing: false }, // → de vraag verschijnt
  { count: 2, typing: false }, // → "Ja, graag"
  { count: 2, typing: true }, // Filly typt het voorstel
  { count: 3, typing: false }, // → de voorstel-kaart
  { count: 4, typing: false }, // → "concept staat in Campagnes"
  { count: 5, typing: false }, // → "Keur goed" (laatste bericht, eindstaat)
];

// Vertraging (ms) tót de vólgende fase. Lengte = PHASES.length - 1.
// Som ≈ 5000ms → de hele conversatie duurt ongeveer 5 seconden.
const STEP_DELAYS = [800, 900, 650, 900, 850, 850];

// De voorstel-kaart — 1-op-1 dezelfde markup/styling als de oude statische
// mock, nu als één gespreks-beurt.
function ProposalCard() {
  return (
    <div className="md-proposal">
      <div className="md-proposal-head">
        <span className="md-proposal-title">Last-minute lunchdeal</span>
        <span className="md-proposal-date">di 3 juni</span>
      </div>
      <div className="md-proposal-channels">
        {PROPOSAL_CHANNELS.map((c) => (
          <span key={c.label} className="md-ch-chip">
            <c.Icon size={9} strokeWidth={2} />
            {c.label}
          </span>
        ))}
      </div>
      <div className="md-proposal-meta">
        Naar 248 vaste gasten · verstuurt automatisch di 11:00
      </div>
      <div className="md-proposal-impact">
        <TrendingUp size={11} strokeWidth={2} />
        +18 couverts verwacht
      </div>
      <div className="md-proposal-actions">
        <span className="md-proposal-btn primary">Goedkeuren</span>
        <span className="md-proposal-btn">Aanpassen</span>
      </div>
    </div>
  );
}

export function LandingFillyChat() {
  // Welke fase van het gesprek nu getoond wordt. Start op 0 (Filly typt).
  const [phase, setPhase] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // Toegankelijkheid: bij reduced-motion meteen de volledige eindstaat,
    // zonder timers of pop-in.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase(PHASES.length - 1);
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    let started = false;

    // Loopt de fases stap voor stap af, op de afgesproken vertragingen.
    const run = () => {
      if (started) return;
      started = true;
      let acc = 0;
      STEP_DELAYS.forEach((delay, i) => {
        acc += delay;
        timers.push(setTimeout(() => setPhase(i + 1), acc));
      });
    };

    // Start pas als de mockup echt in beeld komt (en maar 1×).
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            run();
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.4 },
    );
    observer.observe(root);

    return () => {
      observer.disconnect();
      timers.forEach(clearTimeout);
    };
  }, []);

  const current = PHASES[phase];

  return (
    <div className="md-chat md-chat--live" ref={rootRef}>
      <div className="md-chat-head">
        <div className="md-chat-avatar">F</div>
        <div style={{ minWidth: 0 }}>
          <div className="md-chat-name">Filly AI</div>
        </div>
        <div className="md-chat-head-right">
          <span className="md-chat-status">Online</span>
        </div>
      </div>

      <div className="md-chat-body">
        {/* Alleen de beurten t/m de huidige fase; nieuwe beurten faden in
            (zie .md-chat--live .md-chat-msg in landing.css). Bestaande
            beurten houden hun key → animeren niet opnieuw. */}
        {TURNS.slice(0, current.count).map((turn) =>
          turn.kind === "proposal" ? (
            <ProposalCard key={turn.id} />
          ) : (
            <div key={turn.id} className={`md-chat-msg ${turn.kind}`}>
              {turn.text}
            </div>
          ),
        )}

        {/* Typ-indicator: drie stuiterende bolletjes. */}
        {current.typing && (
          <div
            className="md-chat-msg ai md-typing"
            role="status"
            aria-label="Filly is aan het typen"
          >
            <span className="md-typing-dot" />
            <span className="md-typing-dot" />
            <span className="md-typing-dot" />
          </div>
        )}
      </div>

      <div className="md-chat-input">
        <div className="md-chat-input-text">Vraag Filly iets…</div>
        <div className="md-chat-send">
          <Send size={10} strokeWidth={2} />
        </div>
      </div>
    </div>
  );
}
