import { Link } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageMetadata } from "@/config/seo";
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
} from "@/components/landing-visuals";
import { ScrollReveal } from "@/components/scroll-reveal";
// De Get-Filly-chat en de telefoon zijn afspelende animaties (state + timers) en
// daarom losse "use client"-eilanden; de rest van de mockup blijft server.
import { LandingFillyChat } from "@/components/landing-filly-chat";
import { LandingPhone } from "@/components/landing-phone";

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
// MiniDashboard, visuele namaak van het echte Get-Filly-dashboard,
// gerenderd binnen het MacBook-scherm in de hero.
// =============================================================================
async function MiniDashboard() {
  const t = await getTranslations("home");

  // Nav: dezelfde 5 items + lucide-iconen als de echte sidebar.
  const NAV = [
    { Icon: LayoutDashboard, label: t("mockup.dashboard.nav.dashboard"), active: true },
    { Icon: Megaphone, label: t("mockup.dashboard.nav.campaigns") },
    { Icon: Search, label: t("mockup.dashboard.nav.findability") },
    { Icon: CalendarDays, label: t("mockup.dashboard.nav.reservations") },
    { Icon: BarChart3, label: t("mockup.dashboard.nav.reports") },
  ];

  // KPI-rij: 4 kaarten zoals op het nieuwe dashboard.
  const KPIS = [
    { label: t("mockup.dashboard.kpi.occupancyLabel"), val: "55%" },
    { label: t("mockup.dashboard.kpi.guestsLabel"), val: "43", extra: t("mockup.dashboard.kpi.guestsExtra") },
    { label: t("mockup.dashboard.kpi.runningLabel"), val: "3", extra: t("mockup.dashboard.kpi.runningExtra") },
    { label: t("mockup.dashboard.kpi.proposedLabel"), val: "1", extra: t("mockup.dashboard.kpi.proposedExtra") },
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
          <div className="md-section-label">{t("mockup.dashboard.menuLabel")}</div>
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
          <div className="md-page-title">{t("mockup.dashboard.pageTitle")}</div>
          <div className="md-top-actions">
            <span className="md-sync">{t("mockup.dashboard.sync")}</span>
            <span className="md-icon-btn"><Bell size={11} strokeWidth={1.75} /></span>
            <span className="md-icon-btn"><Search size={11} strokeWidth={1.75} /></span>
          </div>
        </div>

        {/* Alert-strook: 2 banners + groene CTA, zoals op het dashboard. */}
        <div className="md-alerts">
          <div className="md-alert-stack">
            <div className="md-alert">
              {t.rich("mockup.dashboard.alertQuiet", { strong: (c) => <strong>{c}</strong> })}
            </div>
            <div className="md-alert">
              {t.rich("mockup.dashboard.alertSpecial", { strong: (c) => <strong>{c}</strong> })}
            </div>
          </div>
          <div className="md-cta-btn">{t("mockup.dashboard.alertCta")}</div>
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
                <span className="md-card-title">{t("mockup.dashboard.calMonth")}</span>
                <span className="md-cal-arrow"><ChevronRight size={11} strokeWidth={2} /></span>
                <span className="md-cal-today-btn">{t("mockup.dashboard.calToday")}</span>
              </div>
              <div className="md-tabs">
                <span className="md-tab">{t("mockup.dashboard.calTabs.day")}</span>
                <span className="md-tab">{t("mockup.dashboard.calTabs.week")}</span>
                <span className="md-tab active">{t("mockup.dashboard.calTabs.month")}</span>
                <span className="md-tab">{t("mockup.dashboard.calTabs.year")}</span>
              </div>
            </div>
            <div className="md-cal">
              {(t.raw("mockup.dashboard.calDow") as string[]).map((d) => (
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

          {/* Get-Filly chat — afspelende conversatie (eigen client-component). */}
          <LandingFillyChat />
        </div>
      </div>
    </div>
  );
}

// De 4 kernpunten uit de kennishub die ook op de home onder "Waarom het
// werkt" staan (titels gelijk aan /blog). De kaarten linken door naar de
// kennishub. De "binnenkort online"-tekst + icoon tonen we bewust ALLEEN op
// de blogpagina, niet hier.
// De copy van deze 4 kaarten staat in de vertalingen (home.whyPoints.*);
// hier alleen de message-keys in de gewenste volgorde.
const WHY_POINT_KEYS = ["data", "profile", "reviews", "posting"] as const;

// Eigen home-metadata (niet via de layout-default, die localiseert niet
// betrouwbaar voor de home-route). title is absoluut (merk zit al vooraan).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const tMeta = await getTranslations({ locale, namespace: "meta" });
  return pageMetadata({
    title: tMeta("home.title"),
    description: tMeta("home.description"),
    path: "/",
    absoluteTitle: true,
    locale,
  });
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // Koppelt deze (statisch gerenderde) pagina aan de juiste locale.
  setRequestLocale(locale);
  const t = await getTranslations("home");

  return (
    <>
      {/* Eén doorlopende witte sectie met groene gloed: hero + "Waarom het
          werkt" + de pijlers vloeien in elkaar over. De losse achtergronden,
          gloeden en het hero-raster van deze drie secties worden in
          .home-flow uitgezet (zie landing.css). */}
      <div className="home-flow">
      <section className="hero">
        <div className="container">
          <h1 className="section-title fade-up d1">
            {t.rich("heroTitle", { br: () => <br /> })}
          </h1>
          <p className="section-subtitle fade-up d2">
            {t("heroSubtitle")}
          </p>
          <div className="hero-cta fade-up d3">
            <Link href="/contact" className="btn-primary">{t("ctaDemo")}</Link>
            <Link href="/product" className="btn-secondary">{t("ctaProduct")}</Link>
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
                laat de Get-Filly-chat vrij. Verborgen op mobiel. */}
            <LandingPhone />
          </div>
        </div>
      </section>

      {/* "Waarom het werkt" — de 4 kernpunten uit de kennishub, direct na de
          hero. De kaarten poppen op zodra je ze in beeld scrollt (site-brede
          scroll-reveal: data-reveal op een wrapper om elke kaart). De reveal-
          snelheid is afgestemd op de "AI dóet het werk"-blokken op /product
          (zie .why-grid in landing.css). Ze linken door naar /blog; de
          "binnenkort online"-tekst staat bewust alleen op de blogpagina. */}
      <section className="why-works">
        <div className="container">
          <div className="why-head">
            <h2 className="section-title">{t("whyTitle")}</h2>
            <p className="section-subtitle">{t("whySubtitle")}</p>
          </div>
          <div className="why-grid">
            {WHY_POINT_KEYS.map((key) => (
              <div key={key} data-reveal>
                <Link href="/blog" className="blog-card">
                  <div className="blog-eyebrow">
                    {t(`whyPoints.${key}.eyebrow`)}
                  </div>
                  <div className="blog-card-title">
                    {t(`whyPoints.${key}.title`)}
                  </div>
                </Link>
              </div>
            ))}
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
          <h2 className="section-title">{t.rich("pillars.sectionTitle", { br: () => <br /> })}</h2>
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
                <p className="feature-eyebrow">
                  <span>{t("pillars.findability.eyebrow")}</span>
                </p>
                <h3 className="feature-row-title">{t("pillars.findability.title")}</h3>
                <p className="feature-row-desc">{t("pillars.findability.desc")}</p>
                <ul className="feature-bullets">
                  {(t.raw("pillars.findability.bullets") as string[]).map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
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
                <p className="feature-eyebrow">
                  <span>{t("pillars.visibility.eyebrow")}</span>
                </p>
                <h3 className="feature-row-title">{t("pillars.visibility.title")}</h3>
                <p className="feature-row-desc">{t("pillars.visibility.desc")}</p>
                <ul className="feature-bullets">
                  {(t.raw("pillars.visibility.bullets") as string[]).map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
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
                <p className="feature-eyebrow">
                  <span>{t("pillars.reachability.eyebrow")}</span>
                </p>
                <h3 className="feature-row-title">{t("pillars.reachability.title")}</h3>
                <p className="feature-row-desc">{t("pillars.reachability.desc")}</p>
                <ul className="feature-bullets">
                  {(t.raw("pillars.reachability.bullets") as string[]).map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>
              <div className="feature-row-visual">
                <BereikbaarheidVisual />
              </div>
            </div>
          </div>

        </div>
      </section>
      {/* einde .home-flow (hero + "Waarom het werkt" + pijlers) */}
      </div>

      {/* Afsluitende CTA. Per 2026-05-30 omgezet van de ingesloten
          .pillars-cta-kaart naar de full-bleed groene .cta-section,
          identiek aan de product- en over-pagina (eigen tekst). */}
      <section className="cta-section">
        <h2 className="section-title">{t("finalCta.title")}</h2>
        <p className="section-subtitle">{t("finalCta.subtitle")}</p>
        <Link href="/contact" className="cta-btn">{t("finalCta.button")}</Link>
        <p className="section-subtitle" style={{ marginTop: 32, fontSize: 15 }}>
          {t.rich("finalCta.orSee", {
            link: (c) => (
              <Link href="/pricing" style={{ color: "#FFFFFF", textDecoration: "underline" }}>
                {c}
              </Link>
            ),
          })}
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
