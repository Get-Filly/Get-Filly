// =============================================================================
// ABOUT-PAGINA. Doorlopend wit + groene waas (geen scheiding) t/m "Wat ons
// drijft"; daarna "Waar we staan" (papier-warm) + CTA. (2026-06-13)
// =============================================================================

import { Link } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { COMPANY } from "@/config/company";
import { ScrollReveal } from "@/components/scroll-reveal";
import { pageMetadata } from "@/config/seo";

// Stijl voor contextuele links in de groene cta-section (witte tekst,
// dus link = wit + onderstreept zodat 'ie opvalt op de groene achtergrond).
const inlineLink: React.CSSProperties = {
  color: "#FFFFFF",
  textDecoration: "underline",
};

export const metadata = pageMetadata({
  title: "Over ons",
  description:
    "Get-Filly is opgericht door twee ondernemers met één missie: horeca helpen rustige momenten om te zetten in omzet, zonder uren of grote marketingbudgetten.",
  path: "/about",
});

// Volgorde van de "Wat ons drijft"-pijlers; copy via about.pillars.<key>.
const PILLAR_KEYS = ["ownerFirst", "ownData", "aiPays"] as const;

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("about");
  const ch1 = t.raw("ch1") as string[];
  const ch2 = t.raw("ch2") as string[];
  const ch3 = t.raw("ch3") as string[];
  const ch4 = t.raw("ch4") as string[];

  return (
    <>
      {/* Scroll-reveal: laat de items één voor één oppoppen. */}
      <ScrollReveal />

      {/* Eén doorlopend blok (wit + groene waas), zonder scheiding tussen de
          onderdelen. Tot en met "Wat ons drijft". */}
      <div className="about-top">
        {/* ---------- Hero: twee koloms — tekst links, foto-progressie rechts ---------- */}
        <section className="about-intro">
          <div className="container">
            <div className="about-hero-grid">
              <div className="about-hero-text" data-reveal>
                <h1 className="section-title">{t("heroTitle")}</h1>
                <div className="about-story-body">
                  <p>{t("story.p1")}</p>
                  <p>{t("story.p2")}</p>
                  <p>{t("story.p3")}</p>
                </div>
              </div>

              {/* Rechts: drie foto's onder elkaar — dezelfde zaak van rustig
                  (boven) naar vol (onder). Bestanden in apps/web/public/images/. */}
              <div className="about-hero-media">
                <div className="about-photo">
                  <img src="/images/about-1.jpeg" alt={t("alt1")} loading="lazy" />
                </div>
                <div className="about-photo">
                  <img src="/images/about-2.jpeg" alt={t("alt2")} loading="lazy" />
                </div>
                <div className="about-photo">
                  <img src="/images/about-3.jpeg" alt={t("alt3")} loading="lazy" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Missie & visie als kaarten (geen aparte kop) ---------- */}
        <section className="about-mv-section">
          <div className="container">
            <div className="about-mv">
              <div className="about-mv-card" data-reveal>
                <p className="about-mv-label">{t("missionLabel")}</p>
                <p className="about-mv-text">{t("missionText")}</p>
              </div>
              <div className="about-mv-card" data-reveal>
                <p className="about-mv-label">{t("visionLabel")}</p>
                <p className="about-mv-text">{t("visionText")}</p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Wat ons drijft ---------- */}
        <section className="about-drive">
          <div className="container">
            <h2 className="section-title">{t("driveTitle")}</h2>

            {/* Hergebruikt dezelfde "hero-diff"-strip als op de product- en
                pricing-pagina: 3-koloms, dunne scheidingslijn bovenaan, geen
                card-achtergrond. Scroll-reveal (data-reveal). */}
            <div className="product-features-list">
              {PILLAR_KEYS.map((key) => (
                <div key={key} className="hero-diff" data-reveal>
                  <h3 className="hero-diff-title">{t(`pillars.${key}.title`)}</h3>
                  <p className="hero-diff-desc">{t(`pillars.${key}.desc`)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="about-journey">
        <div className="container">
          <h2 className="section-title">{t("journeyTitle")}</h2>

          <ol className="zig-timeline">
            <li className="zig-item zig-left active">
              <div className="zig-card" data-reveal>
                <div className="zig-card-badge">{t("now")}</div>
                <h3 className="zig-card-title">{t("ch1Title")}</h3>
                <ul className="zig-card-list">
                  {ch1.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="zig-marker"><span>2026</span></div>
            </li>

            <li className="zig-item zig-right">
              <div className="zig-marker"><span>2027</span></div>
              <div className="zig-card" data-reveal>
                <h3 className="zig-card-title">{t("ch2Title")}</h3>
                <ul className="zig-card-list">
                  {ch2.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </li>

            <li className="zig-item zig-left">
              <div className="zig-card" data-reveal>
                <h3 className="zig-card-title">{t("ch3Title")}</h3>
                <ul className="zig-card-list">
                  {ch3.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="zig-marker"><span>2028</span></div>
            </li>

            <li className="zig-item zig-right">
              <div className="zig-marker"><span>2029</span></div>
              <div className="zig-card" data-reveal>
                <h3 className="zig-card-title">{t("ch4Title")}</h3>
                <ul className="zig-card-list">
                  {ch4.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section className="cta-section">
        <h2 className="section-title">{t("ctaTitle")}</h2>
        <p className="section-subtitle">{t("ctaSubtitle")}</p>
        <a href={`mailto:${COMPANY.email}`} className="cta-btn">{COMPANY.email}</a>
        <p className="section-subtitle" style={{ marginTop: 32, fontSize: 15 }}>
          {t.rich("ctaLinks", {
            product: (chunks) => (
              <Link href="/product" style={inlineLink}>{chunks}</Link>
            ),
            pricing: (chunks) => (
              <Link href="/pricing" style={inlineLink}>{chunks}</Link>
            ),
          })}
        </p>
      </section>
    </>
  );
}
