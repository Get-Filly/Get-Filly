// =============================================================================
// PRICING-PAGINA — per 2026-05-13 herzien naar 2 pakketten (was 3):
//   - Growth (€99)   = vindbaarheid + zichtbaarheid
//   - Ultimate (€169) = alles van Growth + bereikbaarheid (e-mail + WhatsApp
//                       campagnes op basis van bezettingsdata)
// Floris heeft de tekst aangeleverd; tagline is nieuw veld per plan.
// =============================================================================

import Link from "next/link";

type PlanFeature = { text: string; disabled?: boolean };
type Plan = {
  name: string;
  tagline: string;
  desc: string;
  price: string;
  popular?: boolean;
  features: PlanFeature[];
  ctaText: string;
};
const plans: Plan[] = [
  {
    name: "Growth",
    tagline: "Word gevonden en blijf zichtbaar.",
    desc: "Voor restaurants die online beter gevonden willen worden en zichtbaarder willen zijn op sociale media, zonder er zelf tijd in te steken.",
    price: "€99",
    features: [
      { text: "Google Business optimalisatie en beheer" },
      { text: "Automatisch beantwoorden van reviews" },
      { text: "Verbeterde vindbaarheid in Google door SEO optimalisatie" },
      { text: "Vindbaarheid TripAdvisor, TheFork en OpenTable" },
      { text: "Vindbaarheid in AI-zoekmachines zoals ChatGPT, Claude en Gemini" },
      { text: "Contentplanning voor Instagram, TikTok en Facebook" },
      { text: "AI-gegenereerde posts in tone-of-voice van jouw restaurant" },
      { text: "Live dashboard met rapportage over vindbaarheid en bereik" },
    ],
    ctaText: "Start met Growth",
  },
  {
    name: "Ultimate",
    tagline: "Vul je lege tafels automatisch.",
    desc: "Alles van Growth, plus directe campagnes via e-mail en WhatsApp op basis van jouw bezettingsdata. Inclusief koppeling met jouw reserveringssysteem.",
    price: "€169",
    popular: true,
    features: [
      { text: "Alles uit het Growth pakket" },
      { text: "Koppeling met Zenchef, TheFork of Guestplan" },
      { text: "Koppeling met POS-systeem" },
      { text: "Automatische e-mailcampagnes op basis van bezetting" },
      { text: "WhatsApp campagnes voor last-minute reserveringen" },
      { text: "Segmentatie op vaste, nieuwe en slapende gasten" },
      { text: "Gepersonaliseerde e-mail en WhatsApp campagnes in de tone-of-voice van jouw restaurant" },
    ],
    ctaText: "Start met Ultimate",
  },
];

const faqs = [
  { q: "Hoelang duurt de onboarding?", a: "Gemiddeld 15 minuten. Je koppelt je reserveringssysteem en je Google Business-profiel, bevestigt je menu en Filly gaat dezelfde dag aan de slag." },
  { q: "Welke kanalen gebruikt Filly?", a: "E-mail, WhatsApp, Instagram, Facebook, TikTok en Google Business. Filly schrijft per kanaal in jouw huisstijl en plant elk bericht op het beste moment voor de juiste doelgroep." },
  { q: "Houd ik controle over wat Filly verstuurt?", a: "Ja. Filly genereert voorstellen, jij keurt goed of past aan. Er gaat niets de deur uit zonder jouw akkoord." },
  { q: "Hoe weet Filly welke actie ze moet voorstellen?", a: "Filly analyseert continu je bezetting en social media data, herkent patronen zoals terugkerende dips of seizoenstrends, en stelt op het juiste moment een gerichte actie voor." },
  { q: "Kan ik van plan wisselen?", a: "Ja, je kunt op elk moment upgraden of downgraden. Wijzigingen gaan in op de eerste dag van de volgende maand. Ongebruikte dagen worden verrekend." },
  { q: "Voor welke branches werkt Filly?", a: "De core werkt voor elke onderneming met variabele bezetting: hotels, wellness-studios, sportclubs, event-locaties. De standaardtemplates zijn horeca-first, maatwerk volgt op Pro en Enterprise." },
];

export default function PricingPage() {
  return (
    <>
      <section className="pricing-hero">
        <div className="container">
          {/* Sectie-intro gecentreerd zodat de pagina als geheel
              symmetrisch oogt — pakketten staan ook centraal met
              max-width, en de afsluitende CTA evenzo. Het 'Prijzen'-
              label is per 2026-05-13 weggehaald omdat de navbar
              actief-state + URL al duidelijk maken op welke pagina
              je bent; de titel hieronder spreekt voor zichzelf. */}
          <h1 className="section-title" style={{ textAlign: "center", margin: "0 auto" }}>Kies het pakket dat bij jouw restaurant past.</h1>
          <p className="section-subtitle" style={{ maxWidth: 640, marginLeft: "auto", marginRight: "auto", textAlign: "center" }}>Geen verborgen kosten. Geen lange contracten. Gewoon meer gasten aan tafel.</p>

          <div className="pricing-grid pricing-grid--two">
            {plans.map((p) => (
              <div key={p.name} className={`pricing-card ${p.popular ? "popular" : ""}`} style={{ backgroundColor: "rgb(250, 247, 241)" }}>
                {p.popular && <div className="popular-badge">Meest gekozen</div>}
                <div className="pricing-name">{p.name}</div>
                <div className="pricing-tagline">{p.tagline}</div>
                <div className="pricing-desc">{p.desc}</div>
                <div className="pricing-price">{p.price}<span>/maand</span></div>
                <ul className="pricing-features">
                  {p.features.map((f) => (
                    <li key={f.text} className={f.disabled ? "disabled" : ""}>{f.text}</li>
                  ))}
                </ul>
                <button className="pricing-btn">{p.ctaText}</button>
              </div>
            ))}
          </div>

          {/* Afsluitend CTA-blok onder de pakketten. Compactere
              variant (.pillars-cta--compact) — kleiner dan de
              homepage-CTA omdat dit een 'hulp-CTA' is, geen
              merk-finale. Max-width 980px zodat 't visueel
              uitgelijnd staat met de twee pakketten erboven. */}
          <div
            className="pillars-cta pillars-cta--compact"
            style={{ marginTop: 56, marginBottom: 0, maxWidth: 980 }}
          >
            <h3 className="pillars-cta-title">Niet zeker welk pakket past?</h3>
            <p className="pillars-cta-sub">Plan een gratis kennismaking en we kijken het samen met je door.</p>
            <Link href="/signup" className="cta-btn">Plan een gratis kennismaking</Link>
          </div>
        </div>
      </section>

      <section className="pricing-faq">
        <div className="container">
          <p className="section-label" style={{ textAlign: "center" }}>Veelgestelde vragen</p>
          <h2 className="section-title" style={{ textAlign: "center", margin: "0 auto" }}>Nog vragen?</h2>
          <div className="faq-list" style={{ marginLeft: "auto", marginRight: "auto" }}>
            {faqs.map((f) => (
              <details key={f.q} className="faq-item">
                <summary className="faq-q">{f.q}<span className="faq-icon" aria-hidden>+</span></summary>
                <div className="faq-a">{f.a}</div>
              </details>
            ))}
          </div>
          <div className="faq-contact">Meer vragen? Stuur ons een mail op <a href="mailto:hi@get-filly.com">hi@get-filly.com</a>.</div>
        </div>
      </section>
    </>
  );
}
