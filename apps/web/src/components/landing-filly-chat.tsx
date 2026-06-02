"use client";

// =============================================================================
// LandingFillyChat — de Filly-chat binnen de hero-mockup, als een afspelende
// conversatie i.p.v. één statische voorstel-kaart.
//
// Het verhaal (speelt 1× af zodra de mockup in beeld scrollt en blijft daarna
// in de eindstaat staan, ~9 seconden totaal):
//   1. Filly: "rustige dag gedetecteerd — zal ik een actie klaarzetten?"
//   2. Gast:  "Ja, graag"
//   3. Filly: voorstel-kaart 1 (Last-minute lunchdeal, di 3 juni)
//   4. De Goedkeuren-knop wordt ingedrukt → wordt "Goedgekeurd ✓"
//   5. Filly: "bekijk het concept en keur goed" mét link naar Campagnes
//   6. Gast:  "Bedenk nog een campagne voor volgende week dinsdag"
//   7. Filly: voorstel-kaart 2 (Midweek bistro-avond, di 10 juni)
//
// Omdat het gesprek langer is dan de chat hoog is, scrollt de chat-body
// mee naar onderen zodra er een beurt bijkomt — net als een echte chat.
// Vóór elke Filly-beurt staat even de typ-indicator. Bij prefers-reduced-
// motion tonen we direct de volledige eindstaat: geen timers, geen pop-in.
//
// Waarom een client-component: de homepage (page.tsx) is een server-component;
// deze chat heeft state + timers nodig, dus is 'm losgetrokken als eigen
// "use client"-eiland. De rest van de mockup blijft server.
// =============================================================================

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Send, Mail, Camera, MessageCircle, Check } from "lucide-react";

// Camera staat voor Instagram (lucide 1.14 heeft geen los Instagram-icoon).
type Campaign = {
  title: string;
  date: string;
  channels: { Icon: typeof Mail; label: string }[];
  meta: string;
};

const CAMPAIGN_1: Campaign = {
  title: "Last-minute lunchdeal",
  date: "di 3 juni",
  channels: [
    { Icon: Camera, label: "Instagram" },
    { Icon: Mail, label: "E-mail" },
    { Icon: MessageCircle, label: "WhatsApp" },
  ],
  meta: "Naar 248 vaste gasten · verstuurt automatisch di 11:00",
};

const CAMPAIGN_2: Campaign = {
  title: "Midweek bistro-avond",
  date: "di 10 juni",
  channels: [
    { Icon: Camera, label: "Instagram" },
    { Icon: Mail, label: "E-mail" },
  ],
  meta: "Naar 312 gasten in de buurt · verstuurt automatisch ma 16:00",
};

// Eén beurt in het gesprek.
//   'proposal' = een voorstel-kaart (approvable = de Goedkeuren-knop wordt hier ingedrukt).
//   'final'    = het tussenbericht met de link naar Campagnes.
//   'ai'/'user' = gewone tekstbubbels; 'big' maakt de eerste vraag groter.
type Turn =
  | { id: string; kind: "ai"; text: string; big?: boolean }
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "proposal"; campaign: Campaign; approvable?: boolean }
  | { id: string; kind: "final" };

const TURNS: Turn[] = [
  {
    id: "ai-vraag",
    kind: "ai",
    big: true,
    text: "Dinsdag 3 juni staat op 43%, ruim onder je gemiddelde. Zal ik daar een actie voor klaarzetten?",
  },
  { id: "user-ja", kind: "user", text: "Ja, graag 👍" },
  { id: "proposal-1", kind: "proposal", campaign: CAMPAIGN_1, approvable: true },
  { id: "ai-final", kind: "final" },
  {
    id: "user-meer",
    kind: "user",
    text: "Bedenk nog een campagne voor volgende week dinsdag",
  },
  { id: "proposal-2", kind: "proposal", campaign: CAMPAIGN_2 },
];

// Fases van het gesprek: hoeveel beurten zichtbaar zijn, of Filly op dat
// moment "typt", en of het eerste voorstel al is goedgekeurd (knop ingedrukt).
const PHASES: { count: number; typing: boolean; approved: boolean }[] = [
  { count: 0, typing: true, approved: false }, // Filly begint te typen
  { count: 1, typing: false, approved: false }, // → de (grote) vraag
  { count: 2, typing: false, approved: false }, // → "Ja, graag"
  { count: 2, typing: true, approved: false }, // Filly typt voorstel 1
  { count: 3, typing: false, approved: false }, // → voorstel-kaart 1
  { count: 3, typing: false, approved: true }, // → Goedkeuren ingedrukt
  { count: 3, typing: true, approved: true }, // Filly typt het tussenbericht
  { count: 4, typing: false, approved: true }, // → tussenbericht met link
  { count: 5, typing: false, approved: true }, // → "Bedenk nog een campagne…"
  { count: 5, typing: true, approved: true }, // Filly typt voorstel 2
  { count: 6, typing: false, approved: true }, // → voorstel-kaart 2 (eindstaat)
];

// Vertraging (ms) tót de vólgende fase. Lengte = PHASES.length - 1.
// Som = 9000ms → de hele conversatie duurt precies 9 seconden.
const STEP_DELAYS = [800, 1000, 700, 1000, 900, 700, 1100, 1100, 700, 1000];

// Vertraging (ms) ná het in beeld komen voordat de chat begint. Groter dan
// de NOTIF_DELAY van de telefoon (400ms), zodat de pushmelding eerst
// binnenkomt en pas dáárna de chat start.
const CHAT_INTRO_DELAY = 1300;

// De voorstel-kaart. Bij `approved` verandert de Goedkeuren-knop in een
// ingedrukte "Goedgekeurd ✓"-knop (zie de press-animatie in landing.css).
function ProposalCard({
  campaign,
  approved,
}: {
  campaign: Campaign;
  approved: boolean;
}) {
  return (
    <div className="md-proposal">
      <div className="md-proposal-head">
        <span className="md-proposal-title">{campaign.title}</span>
        <span className="md-proposal-date">{campaign.date}</span>
      </div>
      <div className="md-proposal-channels">
        {campaign.channels.map((c) => (
          <span key={c.label} className="md-ch-chip">
            <c.Icon size={9} strokeWidth={2} />
            {c.label}
          </span>
        ))}
      </div>
      <div className="md-proposal-meta">{campaign.meta}</div>
      <div className="md-proposal-actions">
        {approved ? (
          <span className="md-proposal-btn primary approved">
            <Check size={11} strokeWidth={2.5} />
            Goedgekeurd
          </span>
        ) : (
          <>
            <span className="md-proposal-btn primary">Goedkeuren</span>
            <span className="md-proposal-btn">Aanpassen</span>
          </>
        )}
      </div>
    </div>
  );
}

export function LandingFillyChat() {
  // Welke fase van het gesprek nu getoond wordt. Start op 0 (Filly typt).
  const [phase, setPhase] = useState(0);
  // De chat blijft leeg tot 'started' true wordt — pas ná de pushmelding.
  const [started, setStarted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // Toegankelijkheid: bij reduced-motion meteen de volledige eindstaat,
    // zonder timers of pop-in.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStarted(true);
      setPhase(PHASES.length - 1);
      return;
    }

    // Observeer de hele mockup (gedeeld met de telefoon) zodat de chat en de
    // pushmelding op hetzelfde moment getriggerd worden.
    const mockup = root.closest(".hero-mockup") ?? root;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let kicked = false;

    // Eerst de intro-vertraging (de telefoon-melding komt binnen), dan begint
    // de chat en lopen de fases af op de afgesproken vertragingen.
    const run = () => {
      if (kicked) return;
      kicked = true;
      timers.push(
        setTimeout(() => {
          setStarted(true);
          let acc = 0;
          STEP_DELAYS.forEach((delay, i) => {
            acc += delay;
            timers.push(setTimeout(() => setPhase(i + 1), acc));
          });
        }, CHAT_INTRO_DELAY),
      );
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
      { threshold: 0.35 },
    );
    observer.observe(mockup);

    return () => {
      observer.disconnect();
      timers.forEach(clearTimeout);
    };
  }, []);

  // Volg de conversatie: scroll de chat-body mee naar onderen zodra er een
  // beurt bijkomt, zodat het nieuwste bericht altijd in beeld blijft.
  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTo({ top: body.scrollHeight, behavior: "smooth" });
  }, [phase, started]);

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

      <div className="md-chat-body" ref={bodyRef}>
        {/* De chat blijft leeg tot de pushmelding binnen is (started). Daarna:
            alleen de beurten t/m de huidige fase; nieuwe beurten faden in
            (zie .md-chat--live .md-chat-msg in landing.css). Bestaande
            beurten houden hun key → animeren niet opnieuw. */}
        {started &&
          TURNS.slice(0, current.count).map((turn) => {
          if (turn.kind === "proposal") {
            return (
              <ProposalCard
                key={turn.id}
                campaign={turn.campaign}
                approved={turn.approvable ? current.approved : false}
              />
            );
          }
          if (turn.kind === "final") {
            return (
              <div key={turn.id} className="md-chat-msg ai">
                Top! Bekijk het concept en keur het definitief goed in{" "}
                <Link className="md-chat-link" href="/dashboard/campagnes">
                  Campagnes →
                </Link>
              </div>
            );
          }
          return (
            <div
              key={turn.id}
              className={`md-chat-msg ${turn.kind}${
                turn.kind === "ai" && turn.big ? " md-chat-msg--lg" : ""
              }`}
            >
              {turn.text}
            </div>
          );
        })}

        {/* Typ-indicator: drie stuiterende bolletjes. */}
        {started && current.typing && (
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
