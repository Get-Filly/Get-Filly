"use client";

// =============================================================================
// ScrollReveal, generieke scroll-reveal voor genummerde secties
// =============================================================================
// Elk element met het attribuut `data-reveal` schuift omhoog + faded in zodra
// het in beeld scrollt, zodat items er één voor één in komen (walkthrough-
// stappen, pijlers, hero-diffs, de "waar we staan"-tijdlijn). Een genummerd
// bolletje binnen het item popt mee (zie de [data-reveal]-CSS in landing.css).
//
// Daarnaast: count-up. Elk getal met de class `.pmock-count` BINNEN een
// gereveald item telt op van een startwaarde naar zijn eindwaarde zodra de
// kaart in beeld komt (de likes-teller bij stap 04, de stats bij stap 05 van de
// product-walkthrough). De eindwaarde staat HARD in de HTML, dus zonder JS /
// met reduced-motion klopt het getal meteen; we animeren er hier alleen naartoe.
//
// Progressive enhancement:
//   - Items die bij het laden al (bijna) in beeld staan, blijven direct
//     zichtbaar — geen verberg-flits.
//   - Items daaronder worden verborgen tot ze de viewport in scrollen.
//   - Zonder JS of bij prefers-reduced-motion blijft alles gewoon staan (de
//     verberg-stijl hangt aan .reveal-pending, die wij hier pas toevoegen) en
//     blijven count-up-getallen op hun eindwaarde.
// Rendert zelf niets; het effect draait via een IntersectionObserver.
// =============================================================================

import { useEffect } from "react";

export function ScrollReveal() {
  useEffect(() => {
    const items = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal]"),
    );
    if (items.length === 0) return;

    // Toegankelijkheidsvoorkeur respecteren: dan alles meteen tonen én de
    // count-up-getallen op hun eindwaarde laten staan (we doen hier niets).
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // --- Count-up: tel een .pmock-count-getal van `from` naar zijn eindwaarde.
    // De eindwaarde lezen we uit de HTML (textContent), zodat een prefix/suffix
    // ("+12", "84%") bewaard blijft. Data-attributen sturen het gedrag:
    //   data-count-from      startwaarde (default 0)
    //   data-count-duration  duur in ms (default 1000)
    //   data-count-delay     wachttijd ná reveal in ms (default 0)
    const runCountUp = (el: HTMLElement) => {
      // countTarget onthouden, zodat een eventuele her-reveal niet vanaf de
      // al-getelde waarde opnieuw begint te tellen.
      const finalText = (el.dataset.countTarget ?? el.textContent ?? "").trim();
      const match = finalText.match(/^(\D*)(\d+)(\D*)$/);
      if (!match) return;
      el.dataset.countTarget = finalText;

      const [, prefix, numStr, suffix] = match;
      const target = parseInt(numStr, 10);
      const from = Number(el.dataset.countFrom ?? 0);
      const duration = Number(el.dataset.countDuration ?? 1000);
      const delay = Number(el.dataset.countDelay ?? 0);

      const render = (value: number) => {
        el.textContent = `${prefix}${Math.round(value)}${suffix}`;
      };
      render(from); // start meteen op de beginwaarde (kaart is nog verborgen)

      // easeOutCubic: zelfde rustige uitloop-gevoel als de fade-ins.
      const ease = (t: number) => 1 - Math.pow(1 - t, 3);
      let startTs: number | null = null;
      const tick = (ts: number) => {
        if (startTs === null) startTs = ts;
        const t = Math.min(1, (ts - startTs) / duration);
        render(from + (target - from) * ease(t));
        if (t < 1) requestAnimationFrame(tick);
      };
      window.setTimeout(() => requestAnimationFrame(tick), delay);
    };

    // Eén plek die een item "toont": class zetten + de count-ups erin starten.
    const reveal = (el: HTMLElement) => {
      el.classList.add("reveal-shown");
      el.querySelectorAll<HTMLElement>(".pmock-count").forEach(runCountUp);
    };

    // Twee observers: de standaard (-15%, item ~15% in beeld) en een "late"
    // variant (-25%) voor items met data-reveal-late. Die laatste worden nooit
    // meteen bij load getoond en reveallen pas na een klein tikje scrollen —
    // gebruikt bij de 1e walkthrough-stap ("Detectie"), zodat de percentage-
    // balken (scaleY-fill) pas vollopen als je een stukje naar beneden scrolt
    // i.p.v. al bij paginaload.
    const makeObserver = (rootMargin: string) =>
      new IntersectionObserver(
        (entries, obs) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              reveal(entry.target as HTMLElement);
              obs.unobserve(entry.target);
            }
          });
        },
        { threshold: 0, rootMargin },
      );

    const observer = makeObserver("0px 0px -15% 0px");
    const observerLate = makeObserver("0px 0px -25% 0px");

    items.forEach((el) => {
      el.classList.add("reveal-pending");
      const rect = el.getBoundingClientRect();
      // Meet de positie t.o.v. de BOVENKANT van de pagina (absolute
      // document-positie = rect.top + window.scrollY), NIET t.o.v. de
      // huidige scrollpositie. Anders is het toeval: bij client-side
      // navigatie of scroll-restoration (terug/vooruit) kan de pagina al
      // naar beneden gescrold zijn als dit draait, waardoor items die ver
      // onderaan staan tóch in de "bovenste helft" lijken te vallen en
      // meteen — zonder pop-in — getoond worden. Dat gaf het verschil
      // "soms staan de social-kaarten er al, soms springen ze op".
      // Met de absolute positie telt alléén wat écht bovenin de pagina
      // staat als "direct tonen" (geen flits); al het andere popt elke
      // keer hetzelfde op zodra je ernaartoe scrollt.
      const absoluteTop = rect.top + window.scrollY;
      // data-reveal-late: nooit meteen tonen bij load — altijd via scroll-in,
      // met de latere trigger (observerLate).
      const isLate = el.hasAttribute("data-reveal-late");
      if (!isLate && absoluteTop < window.innerHeight * 0.5) {
        reveal(el);
      } else {
        (isLate ? observerLate : observer).observe(el);
      }
    });

    return () => {
      observer.disconnect();
      observerLate.disconnect();
    };
  }, []);

  return null;
}
