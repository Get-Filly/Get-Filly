"use client";

// =============================================================================
// LandingPhone — de vergrendelde telefoon naast de laptop in de hero-mockup.
//
// De telefoon (lockscreen met klok + datum) staat er meteen; de Get-Filly
// pushmelding "Rustige dagen gedetecteerd" popt ~1s nadat de TELEFOON zelf
// goed in beeld is — niet zodra de laptop-mockup begint. Reden: de melding
// zit onderaan het scherm; trigger je op de mockup-top, dan speelt de pop af
// terwijl de telefoon nog onder de vouw zit en mis je 'm. Met een bouncy
// overshoot zodat 'ie als een echte melding binnenkomt. Bij prefers-reduced-
// motion staat de melding er direct.
// =============================================================================

import { useEffect, useRef, useState } from "react";

// Vertraging (ms) ná het in beeld komen voordat de pushmelding opspringt.
// 1s: de pagina settelt eerst, dan popt de melding duidelijk als allereerste
// scripted gebeurtenis — nog vóór de MacBook-chat begint.
const NOTIF_DELAY = 1000;

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

    // Observeer de TELEFOON zelf met een hoge drempel: pas poppen wanneer
    // (vrijwel) de hele telefoon — incl. de onderkant waar de melding zit —
    // in beeld is. Zo zie je de pop écht gebeuren i.p.v. dat 'ie al
    // gearriveerd is tegen de tijd dat je naar de telefoon scrolt.
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
      { threshold: 0.8 },
    );
    observer.observe(el);

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
          <div className="phone-lock-date">dinsdag 5 mei</div>
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
              <div className="phone-notif-title">Rustige dagen gedetecteerd</div>
            </div>
          </div>
          <div className="phone-home-indicator"></div>
        </div>
      </div>
    </div>
  );
}
