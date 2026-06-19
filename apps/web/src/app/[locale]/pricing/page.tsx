// =============================================================================
// PRICING-PAGINA — per 2026-05-13 herzien naar 2 pakketten (was 3):
//   - Growth (€99)   = vindbaarheid + zichtbaarheid
//   - Ultimate (€169) = alles van Growth + bereikbaarheid (e-mail + WhatsApp
//                       campagnes op basis van bezettingsdata)
// Floris heeft de tekst aangeleverd; tagline is nieuw veld per plan.
//
// I18N: de structurele data (naam, prijs, populariteit) staat hier in code;
// alle copy (tagline/desc/features/cta + faq's) komt uit de vertalingen
// (namespace "pricing"), gekoppeld via de plan-key.
// =============================================================================

import { Link } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { COMPANY } from "@/config/company";
import { FaqAccordion } from "./faq-accordion";
import { pageMetadata } from "@/config/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const tMeta = await getTranslations({ locale, namespace: "meta" });
  return pageMetadata({
    title: tMeta("pricing.title"),
    description: tMeta("pricing.description"),
    path: "/pricing",
    locale,
  });
}

type PlanMeta = {
  key: "growth" | "ultimate";
  name: string;
  price: string;
  popular?: boolean;
};
const PLAN_META: PlanMeta[] = [
  { key: "growth", name: "Growth", price: "€99" },
  { key: "ultimate", name: "Ultimate", price: "€169", popular: true },
];

// =============================================================================
// TIJDELIJK — prijzen + pakketten verbergen bij livegang.
// We willen de pakketten bij de lancering nog niet publiek tonen, dus
// leggen we er een blur overheen. Eén schakelaar: zet HIDE_PRICING op
// `false` (of verwijder deze constante + het gebruik verderop) en de
// pakketten zijn weer gewoon zichtbaar. Verder is er niets aan te passen.
// =============================================================================
const HIDE_PRICING = true;

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pricing");

  // FAQ's uit de vertalingen (array van {q,a}); ook gebruikt voor de
  // FAQPage structured data zodat die automatisch in sync blijft.
  const faqs = t.raw("faqs") as { q: string; a: string }[];
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
      <section className="pricing-hero">
        <div className="container">
          {/* Sectie-intro gecentreerd zodat de pagina als geheel
              symmetrisch oogt — pakketten staan ook centraal met
              max-width, en de afsluitende CTA evenzo. */}
          <h1 className="section-title" style={{ textAlign: "center", margin: "0 auto" }}>{t("heroTitle")}</h1>
          <p className="section-subtitle" style={{ maxWidth: 640, marginLeft: "auto", marginRight: "auto", textAlign: "center" }}>{t("heroSubtitle")}</p>

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
              {PLAN_META.map((p) => {
                const features = t.raw(`plans.${p.key}.features`) as string[];
                return (
                  <div key={p.key} className={`pricing-card ${p.popular ? "popular" : ""}`} style={{ backgroundColor: "rgb(250, 247, 241)" }}>
                    {p.popular && <div className="popular-badge">{t("popular")}</div>}
                    <div className="pricing-name">{p.name}</div>
                    <div className="pricing-tagline">{t(`plans.${p.key}.tagline`)}</div>
                    <div className="pricing-desc">{t(`plans.${p.key}.desc`)}</div>
                    <div className="pricing-price">{p.price}<span>{t("perMonth")}</span></div>
                    <ul className="pricing-features">
                      {features.map((text) => (
                        <li key={text}>{text}</li>
                      ))}
                    </ul>
                    <button className="pricing-btn">{t(`plans.${p.key}.ctaText`)}</button>
                  </div>
                );
              })}
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
                  {t("comingSoon")}
                </span>
              </div>
            )}
          </div>

          {/* Afsluitend CTA-blok onder de pakketten. */}
          <div
            className="pillars-cta pillars-cta--compact"
            style={{ marginTop: 56, marginBottom: 0, maxWidth: 980 }}
          >
            <h3 className="pillars-cta-title">{t("helpTitle")}</h3>
            <p className="pillars-cta-sub">{t("helpSub")}</p>
            <Link href="/contact" className="cta-btn">{t("helpCta")}</Link>
          </div>
        </div>
      </section>

      <section className="pricing-faq">
        <div className="container">
          <h2 className="section-title" style={{ textAlign: "center", margin: "0 auto" }}>{t("faqTitle")}</h2>
          <FaqAccordion faqs={faqs} name="pricing-faq" />
        </div>
      </section>

      {/* Afsluitende CTA boven de footer, full-bleed groen zoals op de
          home- en product-pagina. */}
      <section className="cta-section">
        <h2 className="section-title">{t("ctaTitle")}</h2>
        <p className="section-subtitle">{t("ctaSub")}</p>
        <a className="cta-btn" href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
        <p className="section-subtitle" style={{ marginTop: 32, fontSize: 15 }}>
          {t.rich("ctaProduct", {
            link: (chunks) => (
              <Link href="/product" style={{ color: "#FFFFFF", textDecoration: "underline" }}>
                {chunks}
              </Link>
            ),
          })}
        </p>
      </section>
    </>
  );
}
