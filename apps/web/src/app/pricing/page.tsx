// =============================================================================
// PRICING-PAGINA — per 2026-05-13 herzien naar 2 pakketten (was 3):
//   - Growth (€99)   = vindbaarheid + zichtbaarheid
//   - Ultimate (€169) = alles van Growth + bereikbaarheid (e-mail + WhatsApp
//                       campagnes op basis van bezettingsdata)
// Floris heeft de tekst aangeleverd; tagline is nieuw veld per plan.
// =============================================================================

import Link from "next/link";
import { COMPANY } from "@/config/company";
import { FaqAccordion } from "./faq-accordion";
import { pageMetadata } from "@/config/seo";

export const metadata = pageMetadata({
  title: "Prijzen",
  description:
    "Bekijk de pakketten van Get-Filly. Geen verborgen kosten, geen lange contracten — gewoon meer gasten aan tafel. Vind het abonnement dat bij jouw restaurant past.",
  path: "/pricing",
});

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
  { q: "Hoelang duurt de onboarding?", a: "Binnen één dag ben je volledig onboard. Je koppelt je reserveringssysteem en je Google Business-profiel, bevestigt je menu en Filly gaat dezelfde dag voor je aan de slag." },
  { q: "Welke kanalen gebruikt Filly?", a: "E-mail, WhatsApp, Instagram, Facebook, TikTok en Google Business. Filly schrijft per kanaal in jouw huisstijl en plant elk bericht op het beste moment voor de juiste doelgroep." },
  { q: "Houd ik controle over wat Filly verstuurt?", a: "Ja. Filly genereert voorstellen, jij keurt goed of past aan. Er gaat niets de deur uit zonder jouw akkoord." },
  { q: "Hoe weet Filly welke actie ze moet voorstellen?", a: "Filly analyseert continu je bezetting en social media data, herkent patronen zoals terugkerende dips of seizoenstrends, en stelt op het juiste moment een gerichte actie voor." },
  { q: "Kan ik van plan wisselen?", a: "Ja, je kunt op elk moment upgraden of downgraden. Wijzigingen gaan in op de eerste dag van de volgende maand. Ongebruikte dagen worden verrekend." },
  { q: "Voor welke branches werkt Filly?", a: "De core werkt voor elke onderneming met variabele bezetting: hotels, wellness-studios, sportclubs, event-locaties. De standaardtemplates zijn horeca-first, maatwerk volgt op Pro en Enterprise." },
  { q: "Heb ik marketingervaring nodig?", a: "Nee. Filly is juist gemaakt voor ondernemers zonder marketingkennis. Je krijgt kant-en-klare voorstellen die je met één klik goedkeurt of aanpast, de rest doet Filly." },
  { q: "Hoe en wanneer betaal ik?", a: "Betaling loopt via onze betaalpartner Stripe, met creditcard, SEPA-incasso of iDEAL. Je betaalt vooruit per maand of per jaar, zonder verborgen kosten." },
  { q: "Kan ik maandelijks opzeggen?", a: "Ja. Je zegt maandelijks op via je dashboard, tegen het einde van de lopende periode. Daarna blijft Filly beschikbaar tot het einde van de al betaalde periode." },
  { q: "Wat gebeurt er met de gegevens van mijn gasten?", a: "Jij blijft eigenaar van je gastgegevens. Get-Filly verwerkt ze uitsluitend namens jou, op basis van een verwerkersovereenkomst conform de AVG. We verkopen je gegevens nooit en gebruiken ze niet voor eigen advertenties." },
  { q: "Hoe veilig zijn mijn gegevens?", a: "Alle gegevens gaan versleuteld over de lijn via TLS en we nemen passende technische en organisatorische maatregelen volgens de AVG. Werken we met een leverancier buiten de EU, bijvoorbeeld voor AI, dan leggen we daarvoor de wettelijk vereiste waarborgen vast." },
];

// =============================================================================
// TIJDELIJK — prijzen + pakketten verbergen bij livegang.
// We willen de pakketten bij de lancering nog niet publiek tonen, dus
// leggen we er een blur overheen. Eén schakelaar: zet HIDE_PRICING op
// `false` (of verwijder deze constante + het gebruik verderop) en de
// pakketten zijn weer gewoon zichtbaar. Verder is er niets aan te passen.
// =============================================================================
const HIDE_PRICING = true;

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

          {/* position:relative is de anker voor de "binnenkort"-overlay
              die we tonen zolang HIDE_PRICING aanstaat. */}
          <div style={{ position: "relative" }}>
            <div
              className="pricing-grid pricing-grid--two"
              // TIJDELIJK geblurd bij livegang — zie HIDE_PRICING bovenaan.
              // pointer-events/user-select uit zodat de pakketten ook niet
              // klikbaar of te selecteren zijn terwijl ze verborgen zijn.
              style={
                HIDE_PRICING
                  ? { filter: "blur(10px)", userSelect: "none", pointerEvents: "none" }
                  : undefined
              }
              aria-hidden={HIDE_PRICING || undefined}
            >
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

            {/* Overlay-label over de geblurde pakketten, zodat de blur als
                bewuste keuze leest en niet als renderfout. Verdwijnt mee
                zodra HIDE_PRICING op false gaat. */}
            {HIDE_PRICING && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  pointerEvents: "none",
                }}
              >
                <span
                  style={{
                    background: "var(--brand, #1F4A2D)",
                    color: "#FFFFFF",
                    padding: "10px 20px",
                    borderRadius: "999px",
                    fontSize: 15,
                    fontWeight: 600,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
                  }}
                >
                  Prijzen binnenkort beschikbaar
                </span>
              </div>
            )}
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
            <Link href="/contact" className="cta-btn">Plan een gratis kennismaking</Link>
          </div>
        </div>
      </section>

      <section className="pricing-faq">
        <div className="container">
          <h2 className="section-title" style={{ textAlign: "center", margin: "0 auto" }}>Veelgestelde vragen</h2>
          <FaqAccordion faqs={faqs} />
        </div>
      </section>

      {/* Afsluitende CTA boven de footer, full-bleed groen zoals op de
          home- en product-pagina. Vervangt de oude 'Meer vragen?'-regel
          die voorheen onder de FAQ stond. */}
      <section className="cta-section">
        <h2 className="section-title">Heb je nog vragen?</h2>
        <p className="section-subtitle">Mail ons, we helpen je graag verder.</p>
        <a className="cta-btn" href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
      </section>
    </>
  );
}
