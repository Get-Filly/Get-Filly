"use client";

// =============================================================================
// ScrollReveal, generieke scroll-reveal voor genummerde secties
// =============================================================================
// Elk element met het attribuut `data-reveal` schuift omhoog + faded in zodra
// het in beeld scrollt, zodat items er één voor één in komen (walkthrough-
// stappen, pijlers, hero-diffs, de "waar we staan"-tijdlijn). Een genummerd
// bolletje binnen het item popt mee (zie de [data-reveal]-CSS in landing.css).
//
// Progressive enhancement:
//   - Items die bij het laden al (bijna) in beeld staan, blijven direct
//     zichtbaar — geen verberg-flits.
//   - Items daaronder worden verborgen tot ze de viewport in scrollen.
//   - Zonder JS of bij prefers-reduced-motion blijft alles gewoon staan (de
//     verberg-stijl hangt aan .reveal-pending, die wij hier pas toevoegen).
// Rendert zelf niets; het effect draait via een IntersectionObserver.
// =============================================================================

import { useEffect } from "react";

export function ScrollReveal() {
  useEffect(() => {
    const items = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal]"),
    );
    if (items.length === 0) return;

    // Toegankelijkheidsvoorkeur respecteren: dan alles meteen tonen.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal-shown");
            observer.unobserve(entry.target);
          }
        });
      },
      // Trigger als het item ~15% in beeld is gescrolld (rootMargin -15%).
      // Middenweg: laat genoeg dat je de fade ziet gebeuren (vooral bij de
      // hoge oplossing-kaarten), maar niet zo laat als de eerdere -25%.
      { threshold: 0, rootMargin: "0px 0px -15% 0px" },
    );

    items.forEach((el) => {
      el.classList.add("reveal-pending");
      const rect = el.getBoundingClientRect();
      // Alleen items duidelijk bovenin het scherm bij het laden meteen
      // tonen (geen flits). Alles daaronder verbergen + observeren, zodat
      // het zichtbaar opspringt zodra je ernaartoe scrollt — i.p.v. al
      // "ingeladen" te staan. (Drempel verlaagd van 0.88 → 0.5.)
      if (rect.top < window.innerHeight * 0.5) {
        el.classList.add("reveal-shown");
      } else {
        observer.observe(el);
      }
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
