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
      if (absoluteTop < window.innerHeight * 0.5) {
        el.classList.add("reveal-shown");
      } else {
        observer.observe(el);
      }
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
