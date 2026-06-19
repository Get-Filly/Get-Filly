"use client";

// =============================================================================
// FaqAccordion, client-component voor de veelgestelde-vragen-lijst
// =============================================================================
// Twee gedragingen:
//   1. Exclusief openen: elke <details> deelt name="pricing-faq", dus de
//      browser sluit automatisch de vorige zodra je een andere opent.
//   2. Sluiten bij klik buiten de lijst: een document-listener sluit elke
//      open <details> zodra je ergens anders op het scherm klikt.
// Staat los van de (server-rendered) pagina zodat alleen dit stukje
// client-side JS nodig heeft.
// =============================================================================

import { useEffect, useRef } from "react";

type Faq = { q: string; a: string };

export function FaqAccordion({
  faqs,
  name = "faq",
}: {
  faqs: Faq[];
  // Groepsnaam voor exclusief-openen (één naam per pagina). Default "faq";
  // geef per pagina een eigen naam mee als er meerdere FAQ's zouden staan.
  name?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const list = listRef.current;
      if (!list) return;
      // Klik binnen de lijst (op een vraag of antwoord) → laat het
      // native open/dicht-gedrag z'n werk doen.
      if (list.contains(e.target as Node)) return;
      // Klik buiten de lijst → sluit elke open vraag.
      list
        .querySelectorAll<HTMLDetailsElement>("details[open]")
        .forEach((d) => {
          d.open = false;
        });
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  return (
    <div
      ref={listRef}
      className="faq-list"
      style={{ marginLeft: "auto", marginRight: "auto" }}
    >
      {faqs.map((f) => (
        <details key={f.q} name={name} className="faq-item">
          <summary className="faq-q">
            {f.q}
            <span className="faq-icon" aria-hidden>
              +
            </span>
          </summary>
          <div className="faq-a">{f.a}</div>
        </details>
      ))}
    </div>
  );
}
