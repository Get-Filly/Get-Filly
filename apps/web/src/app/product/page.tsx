import Link from "next/link";
import { ScrollReveal } from "@/components/scroll-reveal";
import { pageMetadata } from "@/config/seo";
import { FaqAccordion } from "../pricing/faq-accordion";

// =============================================================================
// PRODUCT-PAGINA, 1-op-1 conversie van Claude Design app.jsx → ProductPage.
// =============================================================================

export const metadata = pageMetadata({
  title: "De oplossing",
  description:
    "Ontdek hoe Get-Filly rustige momenten detecteert, de juiste actie bedenkt en met jouw goedkeuring campagnes via mail, social en WhatsApp live zet voor meer reserveringen.",
  path: "/product",
});

const features = [
  { title: "Bezettingsanalyse", desc: "Realtime inzicht in je bezettingsgraad per dag, week en maand. Filly herkent patronen zoals terugkerende dips of seizoenstrends en laat direct zien waar je omzet mist." },
  { title: "AI-chatbot", desc: "Chat met Filly zoals je met een collega praat. Hij kent je data en onderneming, doet voorstellen en voert ze uit na jouw goedkeuring." },
  { title: "Campagnes", desc: "Van concept tot verzending in één chat. Filly schrijft een mail of WhatsApp-bericht in jouw huisstijl, selecteert de juiste gasten en verzendt dit op het beste moment." },
  { title: "Social media posts", desc: "Filly maakt posts voor Instagram, Facebook en TikTok. Afgestemd op je merk, je aanbod, en de dagen die gevuld moeten worden." },
  { title: "Seizoensstrategie", desc: "Valentijnsdag, aspergeseizoen, Koningsdag, kerst, Filly denkt vooruit. Je krijgt automatisch voorstellen, weken van tevoren." },
  { title: "Google Business", desc: "Verschijn bovenaan in Google wanneer mensen zoeken naar restaurants in je buurt. Filly plaatst posts, reageert op reviews en houdt je profiel actueel zodat je beter gevonden wordt." },
];

// FAQ + FAQPage-schema (zelfde array → blijft in sync). 2-koloms via .faq-list.
const faqs = [
  { q: "Welke kanalen ondersteunt Get-Filly?", a: "E-mail, WhatsApp, Instagram, Facebook, TikTok en Google Business. Filly schrijft per kanaal in jouw huisstijl en plant elk bericht op het beste moment." },
  { q: "Helpt Get-Filly ook met reviews en vindbaarheid?", a: "Ja. Naast campagnes beantwoordt Filly reviews namens je zaak en verbetert het je vindbaarheid in Google én AI-zoekmachines." },
  { q: "Hoe weet Filly welke actie ze moet voorstellen?", a: "Filly analyseert continu je bezetting en data, herkent patronen zoals terugkerende dips of seizoenstrends, en stelt op het juiste moment een gerichte actie voor." },
  { q: "Heb ik technische of marketingkennis nodig?", a: "Nee. Je krijgt kant-en-klare voorstellen die je met één klik goedkeurt of aanpast; de rest doet Filly." },
];

export default function ProductPage() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <section className="product-hero">
        <div className="container">
          <h1 className="section-title">Jouw AI-assistent voor de horeca.</h1>
          <p className="section-subtitle">Get-Filly detecteert rustige momenten, bedenkt de juiste actie en kiest de juiste doelgroep, voor campagnes, reviews én je vindbaarheid in Google en AI-zoekmachines. Met jouw goedkeuring zet Get-Filly het automatisch live, zodat je meer reserveringen krijgt.</p>

          <div className="hero-diffs">
            <div className="hero-diff fade-up d1">
              <div className="hero-diff-num">01</div>
              <h3 className="hero-diff-title">AI d&oacute;et het werk. Jij keurt goed.</h3>
              <p className="hero-diff-desc">Van het herkennen van rustige momenten tot het opzetten van complete campagnes: Get-Filly automatiseert het hele proces voor meer gasten en omzet.</p>
            </div>
            <div className="hero-diff fade-up d2">
              <div className="hero-diff-num">02</div>
              <h3 className="hero-diff-title">Geen marketingkennis nodig.</h3>
              <p className="hero-diff-desc">Get-Filly doet het werk van een marketingbureau, maar dan automatisch, sneller en volledig gebaseerd op jouw data.</p>
            </div>
            <div className="hero-diff fade-up d3">
              <div className="hero-diff-num">03</div>
              <h3 className="hero-diff-title">Plakt op wat je al hebt.</h3>
              <p className="hero-diff-desc">Je reserveringsplatform, POS en socials houd je. Filly integreert in een paar klikken, geen overstap maar je partner.</p>
            </div>
            <div className="hero-diff fade-up d4">
              <div className="hero-diff-num">04</div>
              <h3 className="hero-diff-title">Meet wat &eacute;cht werkt.</h3>
              <p className="hero-diff-desc">Geen open-rates of clicks waar je uiteindelijk niets aan hebt, maar inzicht in hoeveel reserveringen, gasten en omzet elke campagne daadwerkelijk oplevert.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="product-walkthrough">
        <div className="container">
          <h2 className="section-title" style={{ maxWidth: 820 }}>Een week met Filly, van lege stoelen naar een volle onderneming.</h2>
          <p className="section-subtitle" style={{ maxWidth: 640 }}>Volg &eacute;&eacute;n campagneproces van begin tot eind. Drie minuten werk op maandag, twaalf extra reserveringen op donderdag.</p>

          <div className="features-stack" style={{ marginTop: 56 }}>
            {/* Scroll-reveal: laat de items één voor één oppoppen. */}
            <ScrollReveal />

            {/* STAP 1, Filly ziet de dip */}
            <div className="feature-row" data-reveal>
              <div className="feature-row-text">
                <div className="step-meta">
                  <div className="walk-step">
                    <span className="walk-step-num">01</span>
                    <span className="walk-step-label">Detectie</span>
                  </div>
                  <p className="feature-eyebrow">Maandag &middot; 09:14</p>
                </div>
                <h3 className="feature-row-title">Filly detecteert een dip en meldt het.</h3>
                <p className="feature-row-desc">Filly kijkt continu naar je reserveringsdata. Een donderdag op 38% is geen ramp, mits je het op tijd weet. Filly stuurt je &eacute;&eacute;n bericht: &ldquo;Donderdag loopt achter, zal ik iets uitzetten?&rdquo;</p>
              </div>
              <div className="feature-row-visual">
                <div className="pmock-occ">
                  <div className="pmock-occ-head">
                    <div>
                      <div className="pmock-occ-eyebrow">BEZETTING &middot; KOMENDE 7 DAGEN</div>
                      <div className="pmock-occ-title">Week 47 &middot; vooruitblik</div>
                    </div>
                    <div className="pmock-occ-pill">Live</div>
                  </div>
                  <div className="pmock-occ-bars">
                    {[
                      { d: "ma", v: 78, ok: true },
                      { d: "di", v: 56, alert: true },
                      { d: "wo", v: 64, ok: true },
                      { d: "do", v: 38, alert: true },
                      { d: "vr", v: 92, ok: true },
                      { d: "za", v: 95, ok: true },
                      { d: "zo", v: 58, ok: true },
                    ].map((b) => (
                      <div key={b.d} className={`pmock-occ-bar ${b.alert ? "is-alert" : ""}`}>
                        <div className="pmock-occ-track">
                          <div className="pmock-occ-fill" style={{ height: `${b.v}%` }} />
                        </div>
                        <div className="pmock-occ-day">{b.d}</div>
                        <div className="pmock-occ-pct">{b.v}%</div>
                      </div>
                    ))}
                  </div>
                  <div className="pmock-occ-alert">
                    <div className="pmock-occ-alert-dot" />
                    <div>
                      <div className="pmock-occ-alert-title">Donderdag onder verwachting</div>
                      <div className="pmock-occ-alert-sub">Verwacht: 65% &middot; Nu: 38% &middot; 18 stoelen vrij</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* STAP 2, Filly stelt drie kanalen voor */}
            <div className="feature-row feature-row--reverse" data-reveal>
              <div className="feature-row-text">
                <div className="step-meta">
                  <div className="walk-step">
                    <span className="walk-step-num">02</span>
                    <span className="walk-step-label">Voorstel</span>
                  </div>
                  <p className="feature-eyebrow">Maandag &middot; 09:15</p>
                </div>
                <h3 className="feature-row-title">Drie kanalen, &eacute;&eacute;n voorstel, klaar binnen een minuut.</h3>
                <p className="feature-row-desc">Filly stelt een complete campagne voor: een e-mail aan vaste gasten, een Instagram-post voor laat-boekers, en een WhatsApp-bericht voor je trouwste gasten. Tone-of-voice, beeld en timing, alles afgestemd op je onderneming.</p>
              </div>
              <div className="feature-row-visual">
                <div className="pmock-channels">
                  <div className="pmock-channels-head">
                    <span className="pmock-f-badge">F</span>
                    <span className="pmock-channels-title">Filly stelt voor, 3 kanalen</span>
                  </div>
                  <div className="pmock-channels-list">
                    <div className="pmock-ch">
                      <div className="pmock-ch-icon pmock-ch-icon--mail">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="5" width="18" height="14" rx="2" />
                          <path d="m3 7 9 6 9-6" />
                        </svg>
                      </div>
                      <div className="pmock-ch-body">
                        <div className="pmock-ch-label">E-mail &middot; 412 ontvangers</div>
                        <div className="pmock-ch-preview">&ldquo;Een rustige donderdag? Kom lunchen voor &euro;24,50.&rdquo;</div>
                      </div>
                      <div className="pmock-ch-meta">do 11:00</div>
                    </div>

                    <div className="pmock-ch">
                      <div className="pmock-ch-icon pmock-ch-icon--ig">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="5" />
                          <circle cx="12" cy="12" r="4" />
                          <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" />
                        </svg>
                      </div>
                      <div className="pmock-ch-body">
                        <div className="pmock-ch-label">Instagram &middot; feed &amp; story</div>
                        <div className="pmock-ch-preview">Terras-foto &middot; &ldquo;Donderdag-deal: 3 gangen voor &euro;24,50&rdquo;</div>
                      </div>
                      <div className="pmock-ch-meta">do 17:00</div>
                    </div>

                    <div className="pmock-ch">
                      <div className="pmock-ch-icon pmock-ch-icon--wa">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 17 0z" />
                        </svg>
                      </div>
                      <div className="pmock-ch-body">
                        <div className="pmock-ch-label">WhatsApp &middot; top 40 vaste gasten</div>
                        <div className="pmock-ch-preview">&ldquo;Hoi! Morgen nog plek aan onze keukentafel, reserveer hier.&rdquo;</div>
                      </div>
                      <div className="pmock-ch-meta">do 09:30</div>
                    </div>
                  </div>
                  <button className="pmock-channels-cta" type="button">
                    Goedkeuren &amp; versturen
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* STAP 3, Eén klik */}
            <div className="feature-row" data-reveal>
              <div className="feature-row-text">
                <div className="step-meta">
                  <div className="walk-step">
                    <span className="walk-step-num">03</span>
                    <span className="walk-step-label">Goedkeuring</span>
                  </div>
                  <p className="feature-eyebrow">Maandag &middot; 09:16</p>
                </div>
                <h3 className="feature-row-title">Eén goedkeuring, Filly doet de rest.</h3>
                <p className="feature-row-desc">Filly verstuurt en plant alle drie de berichten op het juiste moment, op het juiste kanaal en naar de juiste gasten. Jij geeft &eacute;&eacute;n keer akkoord, en hoeft je daarna niet meer bezig te houden met timing of losse kanalen.</p>
              </div>
              <div className="feature-row-visual">
                <div className="pmock-approve">
                  <div className="pmock-approve-banner">
                    <div className="pmock-approve-check">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </div>
                    <div>
                      <div className="pmock-approve-title">Campagne ingepland</div>
                      <div className="pmock-approve-sub">Goedgekeurd door Sophie &middot; 09:16</div>
                    </div>
                  </div>
                  <div className="pmock-approve-list">
                    <div className="pmock-approve-row">
                      <div className="pmock-approve-row-dot is-done" />
                      <div className="pmock-approve-row-label">E-mail naar 412 vaste gasten</div>
                      <div className="pmock-approve-row-meta">do 11:00</div>
                    </div>
                    <div className="pmock-approve-row">
                      <div className="pmock-approve-row-dot is-done" />
                      <div className="pmock-approve-row-label">Instagram-post + story</div>
                      <div className="pmock-approve-row-meta">do 17:00</div>
                    </div>
                    <div className="pmock-approve-row">
                      <div className="pmock-approve-row-dot is-pending" />
                      <div className="pmock-approve-row-label">WhatsApp naar top 40</div>
                      <div className="pmock-approve-row-meta">do 09:30</div>
                    </div>
                  </div>
                  <div className="pmock-approve-foot">
                    <span>Filly meldt zich zondag met de resultaten.</span>
                  </div>
                </div>
              </div>
            </div>

            {/* STAP 4, Instagram-post live, Filly plaatst en jij ziet 'm terug */}
            <div className="feature-row feature-row--reverse" data-reveal>
              <div className="feature-row-text">
                <div className="step-meta">
                  <div className="walk-step">
                    <span className="walk-step-num">04</span>
                    <span className="walk-step-label">Plaatsing</span>
                  </div>
                  <p className="feature-eyebrow">Donderdag &middot; 17:00</p>
                </div>
                <h3 className="feature-row-title">Je ziet je post live verschijnen, precies op tijd.</h3>
                <p className="feature-row-desc">Op donderdag plaatst Filly de Instagram-post en story automatisch, op het moment dat laat-boekers scrollen. Jij hoeft niets te doen, je ziet &rsquo;m gewoon voorbijkomen in je feed, volledig in jouw stijl, terwijl de reserveringen binnenlopen.</p>
              </div>
              <div className="feature-row-visual">
                {/* Mock van de live Instagram-post zoals een gast 'm in
                    de feed ziet: header + beeld met deal-tekst + actie-rij
                    + likes + caption. Beeld toont een echte gerechten-foto
                    (de groene gradient blijft als fallback achter de foto). */}
                <div className="pmock-ig">
                  <div className="pmock-ig-head">
                    <div className="pmock-ig-avatar">B</div>
                    <div className="pmock-ig-meta">
                      <div className="pmock-ig-name">bistrogetfilly</div>
                      <div className="pmock-ig-loc">Amsterdam &middot; Restaurant</div>
                    </div>
                    <span className="pmock-ig-live">Live</span>
                  </div>
                  <div className="pmock-ig-photo">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/images/instagram-gerechten.jpg"
                      alt="Drie gangen bij Bistro Get-Filly"
                      loading="lazy"
                    />
                    <span className="pmock-ig-photo-tag">Donderdag-deal<br />3 gangen &middot; &euro;24,50</span>
                  </div>
                  <div className="pmock-ig-actions">
                    <svg className="pmock-ig-heart" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A4.5 4.5 0 0 0 12 5.5 4.5 4.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />
                    </svg>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5a8.5 8.5 0 0 1 17 0Z" />
                    </svg>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 2 11 13" />
                      <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
                    </svg>
                    <span className="pmock-ig-actions-spacer" />
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" />
                    </svg>
                  </div>
                  {/* Likes lopen via de count-up (scroll-reveal.tsx) op van
                      128 naar 312 zodra de post in beeld komt. De 312 staat
                      hard in de HTML, dus zonder JS klopt het getal meteen. */}
                  <div className="pmock-ig-likes"><span className="pmock-count" data-count-from="128" data-count-delay="1300" data-count-duration="1400">312</span> Likes</div>
                  <div className="pmock-ig-caption"><strong>bistrogetfilly</strong> Nog een paar tafels vrij vanavond. Drie gangen voor &euro;24,50. #donderdagdeal</div>
                  <div className="pmock-ig-time">2 uur geleden</div>
                </div>
              </div>
            </div>

            {/* STAP 5, Resultaat */}
            <div className="feature-row" data-reveal>
              <div className="feature-row-text">
                <div className="step-meta">
                  <div className="walk-step">
                    <span className="walk-step-num">05</span>
                    <span className="walk-step-label">Resultaat</span>
                  </div>
                  <p className="feature-eyebrow">Zondag &middot; 23:00</p>
                </div>
                <h3 className="feature-row-title">Resultaat: 12 extra reserveringen op een rustige donderdag.</h3>
                <p className="feature-row-desc">Filly meldt zich aan het einde van de week met een korte samenvatting: wat heeft gewerkt, welk kanaal heeft gescoord, en wat ze volgende keer anders zou doen. Geen dashboards uitpluizen, gewoon &eacute;&eacute;n bericht.</p>
              </div>
              <div className="feature-row-visual">
                <div className="pmock-result">
                  <div className="pmock-result-head">
                    <div className="pmock-result-eyebrow">DONDERDAG-CAMPAGNE &middot; AFGEROND</div>
                    <div className="pmock-result-headline">Donderdagavond, van 38% naar 84%</div>
                  </div>
                  {/* Drie stats: reserveringen · klanten · eindbezetting.
                      De grid-kolommen zet ik inline op 3 (landing.css staat op
                      2) zodat dit blijft kloppen als landing.css ooit opnieuw
                      vanuit de design-bron wordt overschreven. */}
                  <div className="pmock-result-stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                    {/* De drie getallen tellen 1-voor-1 op via de count-up
                        (scroll-reveal.tsx); de delays lopen gelijk met de
                        fade-in-stagger in landing.css (2.2s / 2.5s / 2.8s),
                        ná de kanaalbalken en vóór de kop-payoff. */}
                    <div className="pmock-result-stat">
                      <div className="pmock-result-stat-num pmock-count" data-count-from="0" data-count-delay="2200">+12</div>
                      <div className="pmock-result-stat-label">extra reserveringen</div>
                    </div>
                    <div className="pmock-result-stat">
                      <div className="pmock-result-stat-num pmock-count" data-count-from="0" data-count-delay="2500">+34</div>
                      <div className="pmock-result-stat-label">extra klanten</div>
                    </div>
                    <div className="pmock-result-stat">
                      <div className="pmock-result-stat-num pmock-count" data-count-from="0" data-count-delay="2800">84%</div>
                      <div className="pmock-result-stat-label">eindbezetting</div>
                    </div>
                  </div>
                  <div className="pmock-result-breakdown">
                    <div className="pmock-result-breakdown-title">Per kanaal</div>
                    <div className="pmock-result-bar">
                      <div className="pmock-result-bar-label">E-mail</div>
                      <div className="pmock-result-bar-track"><div className="pmock-result-bar-fill" style={{ width: "58%" }} /></div>
                      <div className="pmock-result-bar-val">7 res.</div>
                    </div>
                    <div className="pmock-result-bar">
                      <div className="pmock-result-bar-label">Instagram</div>
                      <div className="pmock-result-bar-track"><div className="pmock-result-bar-fill" style={{ width: "33%" }} /></div>
                      <div className="pmock-result-bar-val">4 res.</div>
                    </div>
                    <div className="pmock-result-bar">
                      <div className="pmock-result-bar-label">WhatsApp</div>
                      <div className="pmock-result-bar-track"><div className="pmock-result-bar-fill" style={{ width: "9%" }} /></div>
                      <div className="pmock-result-bar-val">1 res.</div>
                    </div>
                  </div>
                  <div className="pmock-result-note">
                    <span className="pmock-f-badge">F</span>
                    <span>E-mail werkte het best, volgende keer schaal ik die als eerste op.</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      <section className="product-features">
        <div className="container">
          <h2 className="section-title">Wat zit er in.</h2>
          <div className="product-features-list">
            {features.map((f, i) => (
              <div key={f.title} className="hero-diff" data-reveal>
                <div className="hero-diff-num">{String(i + 1).padStart(2, "0")}</div>
                <h3 className="hero-diff-title">{f.title}</h3>
                <p className="hero-diff-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ, hergebruikt .pricing-faq voor dezelfde sectie-styling. */}
      <section className="pricing-faq">
        <div className="container">
          <h2 className="section-title" style={{ textAlign: "center", margin: "0 auto" }}>Veelgestelde vragen</h2>
          <FaqAccordion faqs={faqs} name="product-faq" />
        </div>
      </section>

      <section className="cta-section">
        <h2 className="section-title">Klaar om rustige momenten om te zetten in omzet?</h2>
        <p className="section-subtitle">Vraag een demo aan en ontdek wat Get-Filly voor jouw onderneming kan doen.</p>
        <Link className="cta-btn" href="/contact">Vraag een demo aan</Link>
        <p className="section-subtitle" style={{ marginTop: 32, fontSize: 15 }}>
          Benieuwd wat het kost? Bekijk{" "}
          <Link href="/pricing" style={{ color: "#FFFFFF", textDecoration: "underline" }}>de prijzen</Link>.
        </p>
      </section>
    </>
  );
}
