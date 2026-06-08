import Link from "next/link";
import { pageMetadata } from "@/config/seo";
import { FaqAccordion } from "./pricing/faq-accordion";
// Dezelfde lucide-iconen als het echte dashboard, zodat de mock in de
// hero 1-op-1 meebeweegt met de huidige product-look (grijze lijn-iconen).
import {
  LayoutDashboard,
  Megaphone,
  Search,
  CalendarDays,
  BarChart3,
  Bell,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Flame,
  Mail,
} from "lucide-react";
import {
  VindbaarheidVisual,
  ZichtbaarheidVisual,
  BereikbaarheidVisual,
} from "../components/landing-visuals";
import { ScrollReveal } from "../components/scroll-reveal";
// De Filly-chat en de telefoon zijn afspelende animaties (state + timers) en
// daarom losse "use client"-eilanden; de rest van de mockup blijft server.
import { LandingFillyChat } from "../components/landing-filly-chat";
import { LandingPhone } from "../components/landing-phone";

// =============================================================================
// HOMEPAGE, 1-op-1 conversie van het Claude Design-prototype.
// Bron: Desktop/Website Get-Filly/app.jsx → HomePage + MiniDashboard.
//
// Vertaalslag JSX → Next.js TSX:
//   - <button onClick={setPage}>  → <Link href>
//   - t.heroTitle1 etc.           → letterlijke string uit TWEAK_DEFAULTS
//   - "images/..." paths          → "/images/..." (leading slash voor /public)
//   - className-attribuut blijft identiek
//   - inline style={{...}} blijft 1-op-1 overgenomen (ook als ze redundant
//     lijken, design is leidend, geen "verbeteringen")
// =============================================================================

// =============================================================================
// MiniDashboard, visuele namaak van het echte Filly-dashboard,
// gerenderd binnen het MacBook-scherm in de hero.
// =============================================================================
function MiniDashboard() {
  // Nav: dezelfde 5 items + lucide-iconen als de echte sidebar.
  const NAV = [
    { Icon: LayoutDashboard, label: "Dashboard", active: true },
    { Icon: Megaphone, label: "Campagnes" },
    { Icon: Search, label: "Vindbaarheid" },
    { Icon: CalendarDays, label: "Reserveringen" },
    { Icon: BarChart3, label: "Rapportages" },
  ];

  // KPI-rij: 4 kaarten zoals op het nieuwe dashboard.
  const KPIS = [
    { label: "Bezetting vandaag", val: "55%" },
    { label: "Gasten vandaag", val: "43", extra: "0 via Filly" },
    { label: "Lopende campagnes", val: "3", extra: "actief of ingepland" },
    { label: "Voorgestelde campagnes", val: "1", extra: "wachten op goedkeuring" },
  ];

  // Heatmap-kalender mei 2026 (1 mei = vrijdag). p = bezetting%, lvl =
  // kleurtier (zie .md-cal-day.lvl-* in landing.css). today = 4 mei.
  // mail = klein envelop-markertje (geplande uiting), fire = drukke dag.
  type CalCell =
    | { d: number; p: number; lvl: number; today?: boolean; mail?: boolean; fire?: boolean }
    | null;
  const CAL: CalCell[][] = [
    [null, null, null, null, { d: 1, p: 42, lvl: 1 }, { d: 2, p: 41, lvl: 1 }, { d: 3, p: 80, lvl: 3, mail: true }],
    [{ d: 4, p: 55, lvl: 1, today: true }, { d: 5, p: 43, lvl: 1 }, { d: 6, p: 68, lvl: 2 }, { d: 7, p: 64, lvl: 1 }, { d: 8, p: 44, lvl: 1 }, { d: 9, p: 54, lvl: 1 }, { d: 10, p: 56, lvl: 1, mail: true }],
    [{ d: 11, p: 42, lvl: 1 }, { d: 12, p: 82, lvl: 3 }, { d: 13, p: 43, lvl: 1 }, { d: 14, p: 56, lvl: 1 }, { d: 15, p: 89, lvl: 3, mail: true }, { d: 16, p: 81, lvl: 3 }, { d: 17, p: 85, lvl: 3 }],
    [{ d: 18, p: 46, lvl: 1 }, { d: 19, p: 54, lvl: 1 }, { d: 20, p: 42, lvl: 1 }, { d: 21, p: 65, lvl: 2 }, { d: 22, p: 92, lvl: 3 }, { d: 23, p: 84, lvl: 3 }, { d: 24, p: 88, lvl: 3, mail: true }],
    [{ d: 25, p: 65, lvl: 2 }, { d: 26, p: 53, lvl: 1 }, { d: 27, p: 61, lvl: 1 }, { d: 28, p: 74, lvl: 2 }, { d: 29, p: 95, lvl: 4, fire: true }, { d: 30, p: 67, lvl: 2 }, { d: 31, p: 91, lvl: 3, mail: true }],
  ];

  return (
    <div className="mini-dash">
      {/* Sidebar */}
      <aside className="md-sidebar">
        <div className="md-workspace">
          <div className="md-avatar">DB</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="md-ws-name">Demo Bistro</div>
            <div className="md-ws-role">floriskoevermans@…</div>
          </div>
          <ChevronDown className="md-ws-chevron" size={11} strokeWidth={2} />
        </div>
        <div>
          <div className="md-section-label">Menu</div>
          <div className="md-nav">
            {NAV.map((n) => (
              <div key={n.label} className={`md-nav-item ${n.active ? "active" : ""}`}>
                <span className="md-nav-icon">
                  <n.Icon size={13} strokeWidth={1.75} />
                </span>
                <span>{n.label}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="md-main">
        <div className="md-topbar">
          <div className="md-page-title">Dashboard</div>
          <div className="md-top-actions">
            <span className="md-sync">Laatste sync: 2 min geleden</span>
            <span className="md-icon-btn"><Bell size={11} strokeWidth={1.75} /></span>
            <span className="md-icon-btn"><Search size={11} strokeWidth={1.75} /></span>
          </div>
        </div>

        {/* Alert-strook: 2 banners + groene CTA, zoals op het dashboard. */}
        <div className="md-alerts">
          <div className="md-alert-stack">
            <div className="md-alert">
              <strong>3 rustige dagen</strong> komende 2 weken: 5 mei (43%), 8 mei (44%), 13 mei (43%)
            </div>
            <div className="md-alert">
              <strong>1 speciale dag</strong> komende 6 weken: Moederdag (10 mei)
            </div>
          </div>
          <div className="md-cta-btn">Vraag Filly om voorstellen</div>
        </div>

        <div className="md-kpi-row">
          {KPIS.map((k) => (
            <div key={k.label} className="md-kpi">
              <div className="md-kpi-label">{k.label}</div>
              <div className="md-kpi-val">{k.val}</div>
              {k.extra && <div className="md-kpi-extra">{k.extra}</div>}
            </div>
          ))}
        </div>

        <div className="md-body">
          {/* Calendar */}
          <div className="md-card">
            <div className="md-card-head">
              <div className="md-cal-nav">
                <span className="md-cal-arrow"><ChevronLeft size={11} strokeWidth={2} /></span>
                <span className="md-card-title">Mei 2026</span>
                <span className="md-cal-arrow"><ChevronRight size={11} strokeWidth={2} /></span>
                <span className="md-cal-today-btn">Vandaag</span>
              </div>
              <div className="md-tabs">
                <span className="md-tab">Dag</span>
                <span className="md-tab">Week</span>
                <span className="md-tab active">Maand</span>
                <span className="md-tab">Jaar</span>
              </div>
            </div>
            <div className="md-cal">
              {["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"].map((d) => (
                <div key={d} className="md-cal-dow">{d}</div>
              ))}
              {CAL.flat().map((cell, i) => {
                if (!cell) return <div key={i} className="md-cal-day empty"></div>;
                return (
                  <div key={i} className={`md-cal-day lvl-${cell.lvl} ${cell.today ? "today" : ""}`}>
                    <span className="md-cal-top">
                      {cell.d}
                      {cell.fire && <Flame className="md-cal-fire" size={9} />}
                    </span>
                    <span className="md-cal-bottom">
                      {cell.mail && <Mail className="md-cal-mark" size={8} strokeWidth={2} />}
                      <span className="md-cal-pct">{cell.p}%</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Filly chat — afspelende conversatie (eigen client-component). */}
          <LandingFillyChat />
        </div>
      </div>
    </div>
  );
}

// Homepage: merk staat al vooraan in de titel, dus absoluteTitle
// (geen " · Get-Filly"-suffix erachter).
export const metadata = pageMetadata({
  title: "Get-Filly — Meer gasten. Minder lege momenten.",
  absoluteTitle: true,
  // Compacte entiteit-omschrijving (= eerste 2 zinnen van de hero), kort
  // genoeg zodat Google 'm niet afkapt (~155 tekens). De hero zelf heeft een
  // langere versie met de "met jouw goedkeuring"-regel er nog achteraan.
  description:
    "Get-Filly is een AI-platform voor restaurants. Het regelt je marketing, reviews, vindbaarheid in Google en AI-zoekmachines.",
  path: "/",
});

// FAQ + FAQPage-schema (zelfde array → blijft in sync). 2-koloms via .faq-list.
const faqs = [
  { q: "Wat is Get-Filly?", a: "Get-Filly is een AI-platform voor restaurants. Het regelt je marketing, reviews, vindbaarheid in Google en AI-zoekmachines. Met jouw goedkeuring wordt de uiting gedaan via het juiste kanaal, op het moment dat ze de meeste reserveringen genereren." },
  { q: "Voor wie is Get-Filly?", a: "Voor restaurants, cafés en andere horecaondernemers die meer gasten willen zonder uren aan marketing kwijt te zijn. Marketingervaring is niet nodig." },
  { q: "Houd ik controle over wat er live gaat?", a: "Ja. Filly doet voorstellen; jij keurt goed of past aan. Er gaat niets de deur uit zonder jouw akkoord." },
  { q: "Wat kost Get-Filly?", a: "Je betaalt een vast maandbedrag, zonder verborgen kosten. Bekijk de actuele pakketten op de prijzen-pagina." },
];

export default function HomePage() {
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
      <section className="hero">
        <div className="container">
          <h1 className="section-title fade-up d1">
            Meer gasten.<br />Minder lege momenten.
          </h1>
          <p className="section-subtitle fade-up d2">
            Get-Filly is een AI-platform voor restaurants. Het regelt je marketing, reviews, vindbaarheid in Google en AI-zoekmachines. Met jouw goedkeuring wordt de uiting gedaan via het juiste kanaal, op het moment dat ze de meeste reserveringen genereren.
          </p>
          <div className="hero-cta fade-up d3">
            <Link href="/contact" className="btn-primary">Vraag een demo</Link>
            <Link href="/product" className="btn-secondary">Bekijk het product →</Link>
          </div>

          <div className="hero-mockup fade-up d4">
            {/* Laptop in een eigen wrapper, zodat 'm los kan schalen en de
                telefoon ernaast absoluut gepositioneerd kan worden. */}
            <div className="mac">
              <div className="mac-lid">
                <div className="mac-camera"></div>
                <div className="mac-screen">
                  <MiniDashboard />
                </div>
              </div>
              <div className="mac-base"></div>
            </div>

            {/* Vergrendelde telefoon rechts: Get-Filly stuurt proactief een
                pushmelding zodra het een rustige dag detecteert. Eigen client-
                component, want de melding schuift als allereerste binnen (vóór
                de chat). Valt over de rechter-rand van de laptop (diepte) maar
                laat de Filly-chat vrij. Verborgen op mobiel. */}
            <LandingPhone />
          </div>
        </div>
      </section>

      <section id="hoe-het-werkt" className="features">
        <div className="container">
          {/* Per 2026-05-13: sectie herschreven naar 3 pijlers
              (Vindbaarheid / Zichtbaarheid / Bereikbaarheid) i.p.v.
              de tijd-as (Vandaag / Deze week / Seizoenen). De mockups
              op de visual-plek blijven voor nu; Floris vervangt
              foto's later met pijler-specifieke beelden (bv. Google-
              Maps listing voor Vindbaarheid). */}
          <h2 className="section-title">Meer gasten.<br />Volle tafels. Automatisch.</h2>
          {/* Activeert de site-brede scroll-reveal (data-reveal) op de
              pijler-visuals: 1× omhoog-faden bij in beeld, identiek aan
              de rest van de pagina. */}
          <ScrollReveal />
          <div className="features-stack">
            {/* Pijler 1 — Vindbaarheid (Google/SEO/AI-zoekmachines).
                Visual = VindbaarheidVisual: statische mockup met een
                Google-zoekresultaat (#1), een AI-chat die het restaurant
                aanbeveelt (GEO) en een review-kaart met eigenaar-antwoord.
                Per 2026-06-02 vervangt deze de oude geanimeerde hub. */}
            <div className="feature-row" data-reveal>
              <div className="feature-row-text">
                <p className="feature-eyebrow feature-eyebrow--pill">
                  <span className="feature-eyebrow-num">01</span>
                  <span>Vindbaarheid</span>
                </p>
                <h3 className="feature-row-title">Gevonden worden begint hier.</h3>
                <p className="feature-row-desc">Gasten zoeken online voordat ze reserveren. Wij zorgen dat jouw restaurant bovenaan staat in zoekmachines.</p>
                <ul className="feature-bullets">
                  <li>Google Business altijd up-to-date met actuele tijden, foto&rsquo;s en beschrijving</li>
                  <li>Reviews automatisch beantwoord in de tone-of-voice van het restaurant</li>
                  <li>SEO zodat je gevonden wordt op zoekopdrachten in jouw buurt</li>
                  <li>GEO-optimalisatie voor AI-zoekmachines zoals ChatGPT, Claude en Gemini</li>
                  <li>Zoekwoordstrategie afgestemd op jouw type restaurant en locatie</li>
                  <li>Live dashboard met rapportage over jouw zichtbaarheid in zoekmachines</li>
                </ul>
              </div>
              <div className="feature-row-visual">
                <VindbaarheidVisual />
              </div>
            </div>

            {/* Pijler 2 — Zichtbaarheid (social media, content,
                white-label). Visual = ZichtbaarheidVisual: drie
                overlappende social-posts (Facebook · TikTok · Instagram)
                met echte foto's uit public/visuals/, die via de
                scroll-reveal na elkaar opkomen. */}
            <div className="feature-row feature-row--reverse" data-reveal>
              <div className="feature-row-text">
                <p className="feature-eyebrow feature-eyebrow--pill">
                  <span className="feature-eyebrow-num">02</span>
                  <span>Zichtbaarheid</span>
                </p>
                <h3 className="feature-row-title">Blijf in beeld. Ook als ze niet reserveren.</h3>
                <p className="feature-row-desc">Gasten die jou kennen maar nog niet hebben gereserveerd, heb je nodig op stille avonden. Wij zorgen dat jij top of mind blijft via sociale media, automatisch en in jouw stijl.</p>
                <ul className="feature-bullets">
                  <li>Automatische contentplanning voor Instagram, Facebook en TikTok op basis van jouw bezettingsdata</li>
                  <li>AI-gegenereerde content volledig in de stijl en toon van jouw restaurant</li>
                  <li>Strategische timing gebaseerd op data, meer zichtbaarheid op dagen dat het rustig is</li>
                  <li>Suggesties voor stories en reels afgestemd op jouw regio en doelgroep</li>
                  <li>Alles white-label, gasten zien jouw naam, niet die van ons</li>
                  <li>Jij keurt elk bericht goed voordat het verstuurd wordt</li>
                  <li>Live dashboard rapportage over bereik, engagement en doorkliks</li>
                </ul>
              </div>
              <div className="feature-row-visual">
                <ZichtbaarheidVisual />
              </div>
            </div>

            {/* Pijler 3 — Bereikbaarheid (e-mail, WhatsApp,
                segmentatie). Visual = BereikbaarheidVisual: een
                e-mailcampagne-kaart + een WhatsApp-gesprek met echte
                chat-chrome. Per 2026-06-02; vervangt de losse fmock-email. */}
            <div className="feature-row" data-reveal>
              <div className="feature-row-text">
                <p className="feature-eyebrow feature-eyebrow--pill">
                  <span className="feature-eyebrow-num">03</span>
                  <span>Bereikbaarheid</span>
                </p>
                <h3 className="feature-row-title">De juiste boodschap. Op het juiste moment. Bij de juiste gast.</h3>
                <p className="feature-row-desc">Jouw bestaande gasten zijn de makkelijkste manier om lege tafels te vullen. Wij bereiken hen automatisch via e-mail en WhatsApp op het moment dat jouw bezetting het nodig heeft.</p>
                <ul className="feature-bullets">
                  <li>Automatische e-mailcampagnes op basis van real-time bezettingsdata</li>
                  <li>WhatsApp-campagnes met hoge openratio voor last-minute reserveringen</li>
                  <li>Gepersonaliseerde berichten in de tone-of-voice van het restaurant</li>
                  <li>Segmentatie op vaste gasten, nieuwe gasten en slapende gasten</li>
                  <li>Jij keurt elk bericht goed voordat het verstuurd wordt</li>
                </ul>
              </div>
              <div className="feature-row-visual">
                <BereikbaarheidVisual />
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* FAQ, hergebruikt .pricing-faq voor dezelfde sectie-styling. */}
      <section className="pricing-faq">
        <div className="container">
          <h2 className="section-title" style={{ textAlign: "center", margin: "0 auto" }}>Veelgestelde vragen</h2>
          <FaqAccordion faqs={faqs} name="home-faq" />
        </div>
      </section>

      {/* Afsluitende CTA. Per 2026-05-30 omgezet van de ingesloten
          .pillars-cta-kaart naar de full-bleed groene .cta-section,
          identiek aan de product- en over-pagina (eigen tekst). */}
      <section className="cta-section">
        <h2 className="section-title">Klaar om jouw tafels te vullen?</h2>
        <p className="section-subtitle">Vraag een demo aan en ontdek wat Get-Filly voor jouw onderneming kan doen.</p>
        <Link href="/contact" className="cta-btn">Plan een gratis kennismaking</Link>
        <p className="section-subtitle" style={{ marginTop: 32, fontSize: 15 }}>
          Of bekijk eerst{" "}
          <Link href="/pricing" style={{ color: "#FFFFFF", textDecoration: "underline" }}>de prijzen</Link>.
        </p>
      </section>

      {/* Footer-CTA-sectie verwijderd per 2026-05-13. De pijlers-
          CTA hierboven (groene "Plan een gratis kennismaking"-blok
          direct na de drie pijlers) is nu de enige homepage-CTA.
          Eén consistent actie-blok i.p.v. twee verschillende
          knoppen ("Plan kennismaking" vs "Vraag demo aan"). */}
    </>
  );
}
