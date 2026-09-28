"use client";

// =============================================================================
// LandingFillyChat — de Filly-chat binnen de hero-mockup, als een afspelende
// conversatie i.p.v. één statische voorstel-kaart.
//
// Het verhaal (speelt 1× af zodra de mockup in beeld scrollt en blijft daarna
// in de eindstaat staan, ~9 seconden totaal):
//   1. Filly: "rustige dag gedetecteerd — zal ik een actie klaarzetten?"
//   2. Gast:  "Ja, graag"
//   3. Filly: voorstel-kaart 1 (Last-minute lunchdeal, di 5 mei)
//   4. De Goedkeuren-knop wordt ingedrukt → wordt "Goedgekeurd ✓"
//   5. Filly: "bekijk het concept en keur goed" mét link naar Campagnes
//   6. Gast:  "Bedenk nog een campagne voor volgende week woensdag"
//   7. Filly: voorstel-kaart 2 (Midweek bistro-avond, wo 13 mei)
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
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Send, Share2, Film, Camera, Check } from "lucide-react";

// Per 2026-09-09 zijn de kanaal-chips generiek: de site houdt de koepelterm
// "uitingen op sociale media" aan (organisch én betaald) en specificeert de
// platforms (nog) niet. Camera staat voor een gewoon bericht, Film voor een reel.
type Campaign = {
  title: string;
  date: string;
  channels: { Icon: typeof Share2; label: string }[];
  meta: string;
};

// De campagne-kaarten en de gesprek-beurten worden per-locale opgebouwd binnen
// de component (useTranslations), zie buildTurns() hieronder. De kanaal-chips
// zijn generiek ("sociale media" + "advertentie") en vertalen dus mee.

// Eén beurt in het gesprek.
//   'proposal' = een voorstel-kaart (approvable = de Goedkeuren-knop wordt hier ingedrukt).
//   'final'    = het tussenbericht met de link naar Campagnes.
//   'ai'/'user' = gewone tekstbubbels; 'big' maakt de eerste vraag groter.
type Turn =
  | { id: string; kind: "ai"; text: string; big?: boolean }
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "proposal"; campaign: Campaign; approvable?: boolean }
  | { id: string; kind: "final" };

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

// Vertraging (ms) ná het in beeld komen van de mockup voordat de chat begint.
// Bewust ruim: zo popt de telefoon-melding eerst en begint de MacBook-chat
// pas dáárna met typen. Per 2026-06-02 +1s opgehoogd (2600 → 3600) op verzoek.
const CHAT_INTRO_DELAY = 3600;

// De voorstel-kaart. Bij `approved` verandert de Goedkeuren-knop in een
// ingedrukte "Goedgekeurd ✓"-knop (zie de press-animatie in landing.css).
function ProposalCard({
  campaign,
  approved,
}: {
  campaign: Campaign;
  approved: boolean;
}) {
  const t = useTranslations("home");
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
            {t("mockup.chat.approved")}
          </span>
        ) : (
          <>
            <span className="md-proposal-btn primary">{t("mockup.chat.approve")}</span>
            <span className="md-proposal-btn">{t("mockup.chat.edit")}</span>
          </>
        )}
      </div>
    </div>
  );
}

export function LandingFillyChat() {
  const t = useTranslations("home");

  // De twee voorstel-kaarten (locale-afhankelijk).
  const CAMPAIGN_1: Campaign = {
    title: t("mockup.chat.campaign1Title"),
    date: t("mockup.chat.campaign1Date"),
    channels: [
      { Icon: Share2, label: t("mockup.chat.channelSocial") },
      { Icon: Film, label: t("mockup.chat.channelFormatReel") },
    ],
    meta: t("mockup.chat.campaign1Meta"),
  };

  const CAMPAIGN_2: Campaign = {
    title: t("mockup.chat.campaign2Title"),
    date: t("mockup.chat.campaign2Date"),
    channels: [
      { Icon: Share2, label: t("mockup.chat.channelSocial") },
      { Icon: Camera, label: t("mockup.chat.channelFormatPost") },
    ],
    meta: t("mockup.chat.campaign2Meta"),
  };

  // Het scripted gesprek (zie het verhaal bovenaan dit bestand).
  const TURNS: Turn[] = [
    {
      id: "ai-vraag",
      kind: "ai",
      big: true,
      text: t("mockup.chat.askProposal"),
    },
    { id: "user-ja", kind: "user", text: t("mockup.chat.userYes") },
    { id: "proposal-1", kind: "proposal", campaign: CAMPAIGN_1, approvable: true },
    { id: "ai-final", kind: "final" },
    {
      id: "user-meer",
      kind: "user",
      text: t("mockup.chat.userMore"),
    },
    { id: "proposal-2", kind: "proposal", campaign: CAMPAIGN_2 },
  ];

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
      { threshold: 0.2 },
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
          <span className="md-chat-status">{t("mockup.chat.status")}</span>
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
                {t("mockup.chat.final")}{" "}
                <Link className="md-chat-link" href="/dashboard/campagnes">
                  {t("mockup.chat.finalLink")}
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
            aria-label={t("mockup.chat.typingAria")}
          >
            <span className="md-typing-dot" />
            <span className="md-typing-dot" />
            <span className="md-typing-dot" />
          </div>
        )}
      </div>

      <div className="md-chat-input">
        <div className="md-chat-input-text">{t("mockup.chat.inputPlaceholder")}</div>
        <div className="md-chat-send">
          <Send size={10} strokeWidth={2} />
        </div>
      </div>
    </div>
  );
}
