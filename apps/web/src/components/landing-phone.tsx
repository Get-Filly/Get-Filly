"use client";

// =============================================================================
// LandingPhone — de vergrendelde telefoon naast de laptop in de hero-mockup.
//
// De telefoon (lockscreen met klok + datum) staat er meteen; de Get-Filly
// pushmelding "1 rustige dag gedetecteerd" komt als ALLEREERSTE binnen-
// geschoven (~0,4s nadat de mockup in beeld komt), nog vóór de chat begint.
// De chat (LandingFillyChat) start daarna met een grotere intro-vertraging,
// zodat het verhaal klopt: eerst de melding, dan het gesprek.
//
// Beide componenten observeren dezelfde .hero-mockup, zodat ze op hetzelfde
// moment getriggerd worden en de volgorde altijd klopt (ongeacht scroll-
// richting). Bij prefers-reduced-motion staat de melding er direct.
// =============================================================================

import { useEffect, useRef, useState } from "react";

// Vertraging (ms) ná het in beeld komen voordat de pushmelding binnenschuift.
const NOTIF_DELAY = 400;

export function LandingPhone() {
  const ref = useRef<HTMLDivElement>(null);
  const [arrived, setArrived] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Toegankelijkheid: melding meteen tonen, geen binnenkomst-animatie.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setArrived(true);
      return;
    }

    // Observeer de hele mockup (gedeeld met de chat) zodat telefoon en chat
    // op hetzelfde moment getriggerd worden.
    const mockup = el.closest(".hero-mockup") ?? el;
    let timer: ReturnType<typeof setTimeout>;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            timer = setTimeout(() => setArrived(true), NOTIF_DELAY);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.35 },
    );
    observer.observe(mockup);

    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="hero-phone" aria-hidden="true" ref={ref}>
      <div className="phone-frame">
        <div className="phone-screen">
          <div className="phone-island"></div>
          <div className="phone-lock-time">9:41</div>
          <div className="phone-lock-date">dinsdag 3 juni</div>
          {/* De pushmelding zelf — schuift binnen zodra `arrived` true wordt. */}
          <div className={`phone-notif${arrived ? " arrived" : ""}`}>
            <span className="phone-notif-icon">
              {/* Het Get-Filly logo-symbool (uit logo.svg gecropt naar
                  logo-mark.svg) als app-icoon. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-mark.svg" alt="Get-Filly" />
            </span>
            <div className="phone-notif-main">
              <div className="phone-notif-meta">
                <span className="phone-notif-app">Get-Filly</span>
                <span className="phone-notif-time">nu</span>
              </div>
              <div className="phone-notif-title">1 rustige dag gedetecteerd</div>
            </div>
          </div>
          <div className="phone-home-indicator"></div>
        </div>
      </div>
    </div>
  );
}
