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
      // Trigger zodra ~15% van het item in beeld is.
      { threshold: 0.15 },
    );

    items.forEach((el) => {
      el.classList.add("reveal-pending");
      const rect = el.getBoundingClientRect();
      // Al (bijna) in beeld bij het laden? Direct tonen, geen flits.
      // Anders verbergen + observeren tot je ernaartoe scrollt.
      if (rect.top < window.innerHeight * 0.88) {
        el.classList.add("reveal-shown");
      } else {
        observer.observe(el);
      }
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
