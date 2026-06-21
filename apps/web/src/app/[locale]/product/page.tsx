import { Link } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ScrollReveal } from "@/components/scroll-reveal";
import { pageMetadata } from "@/config/seo";

// =============================================================================
// PRODUCT-PAGINA, 1-op-1 conversie van Claude Design app.jsx → ProductPage.
// I18N: alle zichtbare copy (incl. de mock-widgets) komt uit de vertalingen
// (namespace "product"). Alleen structurele data (bezettingspercentages,
// kanaal-iconen, count-up-getallen) staat hier in code.
// =============================================================================

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return pageMetadata({
    title: t("product.title"),
    description: t("product.description"),
    path: "/product",
    locale,
  });
}

// Volgorde van de feature-kaarten; copy via product.features.<key>.
const FEATURE_KEYS = [
  "occupancy",
  "chatbot",
  "campaigns",
  "social",
  "season",
  "google",
] as const;

export default async function ProductPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("product");

  // Bezettingsbalken: dag-key + percentage + alert-vlag. Labels via t.
  const occBars = [
    { key: "mon", v: 78 },
    { key: "tue", v: 56 },
    { key: "wed", v: 64 },
    { key: "thu", v: 38, alert: true },
    { key: "fri", v: 92 },
    { key: "sat", v: 95 },
    { key: "sun", v: 58 },
  ] as const;

  return (
    <>
      <section className="product-hero">
        <div className="container">
          <h1 className="section-title">{t("heroTitle")}</h1>
          <p className="section-subtitle">{t("heroSubtitle")}</p>

          <div className="hero-diffs">
            <div className="hero-diff fade-up d1">
              <h3 className="hero-diff-title">{t("diffs.approve.title")}</h3>
              <p className="hero-diff-desc">{t("diffs.approve.desc")}</p>
            </div>
            <div className="hero-diff fade-up d2">
              <h3 className="hero-diff-title">{t("diffs.noMarketing.title")}</h3>
              <p className="hero-diff-desc">{t("diffs.noMarketing.desc")}</p>
            </div>
            <div className="hero-diff fade-up d3">
              <h3 className="hero-diff-title">{t("diffs.integrates.title")}</h3>
              <p className="hero-diff-desc">{t("diffs.integrates.desc")}</p>
            </div>
            <div className="hero-diff fade-up d4">
              <h3 className="hero-diff-title">{t("diffs.measures.title")}</h3>
              <p className="hero-diff-desc">{t("diffs.measures.desc")}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="product-walkthrough">
        <div className="container">
          <h2 className="section-title" style={{ maxWidth: 820 }}>{t("walkTitle")}</h2>
          <p className="section-subtitle" style={{ maxWidth: 640 }}>{t("walkSubtitle")}</p>

          <div className="features-stack" style={{ marginTop: 56 }}>
            {/* Scroll-reveal: laat de items één voor één oppoppen. */}
            <ScrollReveal />

            {/* STAP 1, Get-Filly ziet de dip */}
            <div className="feature-row" data-reveal>
              <div className="feature-row-text">
                <div className="step-meta">
                  <div className="walk-step">
                    <span className="walk-step-label">{t("steps.detection.label")}</span>
                  </div>
                  <p className="feature-eyebrow">{t("steps.detection.eyebrow")}</p>
                </div>
                <h3 className="feature-row-title">{t("steps.detection.title")}</h3>
                <p className="feature-row-desc">{t("steps.detection.desc")}</p>
              </div>
              <div className="feature-row-visual">
                <div className="pmock-occ">
                  <div className="pmock-occ-head">
                    <div>
                      <div className="pmock-occ-eyebrow">{t("mock.occEyebrow")}</div>
                      <div className="pmock-occ-title">{t("mock.occTitle")}</div>
                    </div>
                    <div className="pmock-occ-pill">{t("mock.live")}</div>
                  </div>
                  <div className="pmock-occ-bars">
                    {occBars.map((b) => (
                      <div key={b.key} className={`pmock-occ-bar ${"alert" in b && b.alert ? "is-alert" : ""}`}>
                        <div className="pmock-occ-track">
                          <div className="pmock-occ-fill" style={{ height: `${b.v}%` }} />
                        </div>
                        <div className="pmock-occ-day">{t(`mock.days.${b.key}`)}</div>
                        <div className="pmock-occ-pct">{b.v}%</div>
                      </div>
                    ))}
                  </div>
                  <div className="pmock-occ-alert">
                    <div className="pmock-occ-alert-dot" />
                    <div>
                      <div className="pmock-occ-alert-title">{t("mock.occAlertTitle")}</div>
                      <div className="pmock-occ-alert-sub">{t("mock.occAlertSub")}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* STAP 2, Get-Filly stelt drie kanalen voor */}
            <div className="feature-row feature-row--reverse" data-reveal>
              <div className="feature-row-text">
                <div className="step-meta">
                  <div className="walk-step">
                    <span className="walk-step-label">{t("steps.proposal.label")}</span>
                  </div>
                  <p className="feature-eyebrow">{t("steps.proposal.eyebrow")}</p>
                </div>
                <h3 className="feature-row-title">{t("steps.proposal.title")}</h3>
                <p className="feature-row-desc">{t("steps.proposal.desc")}</p>
              </div>
              <div className="feature-row-visual">
                <div className="pmock-channels">
                  <div className="pmock-channels-head">
                    <span className="pmock-f-badge">F</span>
                    <span className="pmock-channels-title">{t("mock.channelsTitle")}</span>
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
                        <div className="pmock-ch-label">{t("mock.mailLabel")}</div>
                        <div className="pmock-ch-preview">{t("mock.mailPreview")}</div>
                      </div>
                      <div className="pmock-ch-meta">{t("mock.mailMeta")}</div>
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
                        <div className="pmock-ch-label">{t("mock.igLabel")}</div>
                        <div className="pmock-ch-preview">{t("mock.igPreview")}</div>
                      </div>
                      <div className="pmock-ch-meta">{t("mock.igMeta")}</div>
                    </div>

                    <div className="pmock-ch">
                      <div className="pmock-ch-icon pmock-ch-icon--wa">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 17 0z" />
                        </svg>
                      </div>
                      <div className="pmock-ch-body">
                        <div className="pmock-ch-label">{t("mock.waLabel")}</div>
                        <div className="pmock-ch-preview">{t("mock.waPreview")}</div>
                      </div>
                      <div className="pmock-ch-meta">{t("mock.waMeta")}</div>
                    </div>
                  </div>
                  <button className="pmock-channels-cta" type="button">
                    {t("mock.channelsCta")}
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
                    <span className="walk-step-label">{t("steps.approval.label")}</span>
                  </div>
                  <p className="feature-eyebrow">{t("steps.approval.eyebrow")}</p>
                </div>
                <h3 className="feature-row-title">{t("steps.approval.title")}</h3>
                <p className="feature-row-desc">{t("steps.approval.desc")}</p>
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
                      <div className="pmock-approve-title">{t("mock.approveTitle")}</div>
                      <div className="pmock-approve-sub">{t("mock.approveSub")}</div>
                    </div>
                  </div>
                  <div className="pmock-approve-list">
                    <div className="pmock-approve-row">
                      <div className="pmock-approve-row-dot is-done" />
                      <div className="pmock-approve-row-label">{t("mock.approveRow1")}</div>
                      <div className="pmock-approve-row-meta">{t("mock.mailMeta")}</div>
                    </div>
                    <div className="pmock-approve-row">
                      <div className="pmock-approve-row-dot is-done" />
                      <div className="pmock-approve-row-label">{t("mock.approveRow2")}</div>
                      <div className="pmock-approve-row-meta">{t("mock.igMeta")}</div>
                    </div>
                    <div className="pmock-approve-row">
                      <div className="pmock-approve-row-dot is-pending" />
                      <div className="pmock-approve-row-label">{t("mock.approveRow3")}</div>
                      <div className="pmock-approve-row-meta">{t("mock.waMeta")}</div>
                    </div>
                  </div>
                  <div className="pmock-approve-foot">
                    <span>{t("mock.approveFoot")}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* STAP 4, Instagram-post live */}
            <div className="feature-row feature-row--reverse" data-reveal>
              <div className="feature-row-text">
                <div className="step-meta">
                  <div className="walk-step">
                    <span className="walk-step-label">{t("steps.placement.label")}</span>
                  </div>
                  <p className="feature-eyebrow">{t("steps.placement.eyebrow")}</p>
                </div>
                <h3 className="feature-row-title">{t("steps.placement.title")}</h3>
                <p className="feature-row-desc">{t("steps.placement.desc")}</p>
              </div>
              <div className="feature-row-visual">
                <div className="pmock-ig">
                  <div className="pmock-ig-head">
                    <div className="pmock-ig-avatar">B</div>
                    <div className="pmock-ig-meta">
                      <div className="pmock-ig-name">bistrogetfilly</div>
                      <div className="pmock-ig-loc">{t("mock.igLoc")}</div>
                    </div>
                    <span className="pmock-ig-live">{t("mock.live")}</span>
                  </div>
                  <div className="pmock-ig-photo">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/images/instagram-gerechten.jpg"
                      alt="Drie gangen bij Bistro Get-Filly"
                      loading="lazy"
                    />
                    <span className="pmock-ig-photo-tag">{t("mock.igPhotoTag1")}<br />{t("mock.igPhotoTag2")}</span>
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
                  {/* Likes lopen via de count-up (scroll-reveal.tsx) op van 128
                      naar 312 zodra de post in beeld komt. */}
                  <div className="pmock-ig-likes"><span className="pmock-count" data-count-from="128" data-count-delay="1300" data-count-duration="1400">312</span> {t("mock.igLikes")}</div>
                  <div className="pmock-ig-caption"><strong>bistrogetfilly</strong> {t("mock.igCaptionText")}</div>
                  <div className="pmock-ig-time">{t("mock.igTime")}</div>
                </div>
              </div>
            </div>

            {/* STAP 5, Resultaat */}
            <div className="feature-row" data-reveal>
              <div className="feature-row-text">
                <div className="step-meta">
                  <div className="walk-step">
                    <span className="walk-step-label">{t("steps.result.label")}</span>
                  </div>
                  <p className="feature-eyebrow">{t("steps.result.eyebrow")}</p>
                </div>
                <h3 className="feature-row-title">{t("steps.result.title")}</h3>
                <p className="feature-row-desc">{t("steps.result.desc")}</p>
              </div>
              <div className="feature-row-visual">
                <div className="pmock-result">
                  <div className="pmock-result-head">
                    <div className="pmock-result-eyebrow">{t("mock.resultEyebrow")}</div>
                    <div className="pmock-result-headline">{t("mock.resultHeadline")}</div>
                  </div>
                  <div className="pmock-result-stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                    <div className="pmock-result-stat">
                      <div className="pmock-result-stat-num pmock-count" data-count-from="0" data-count-delay="2200">+12</div>
                      <div className="pmock-result-stat-label">{t("mock.resultStat1")}</div>
                    </div>
                    <div className="pmock-result-stat">
                      <div className="pmock-result-stat-num pmock-count" data-count-from="0" data-count-delay="2500">+34</div>
                      <div className="pmock-result-stat-label">{t("mock.resultStat2")}</div>
                    </div>
                    <div className="pmock-result-stat">
                      <div className="pmock-result-stat-num pmock-count" data-count-from="0" data-count-delay="2800">84%</div>
                      <div className="pmock-result-stat-label">{t("mock.resultStat3")}</div>
                    </div>
                  </div>
                  <div className="pmock-result-breakdown">
                    <div className="pmock-result-breakdown-title">{t("mock.resultBreakdown")}</div>
                    <div className="pmock-result-bar">
                      <div className="pmock-result-bar-label">E-mail</div>
                      <div className="pmock-result-bar-track"><div className="pmock-result-bar-fill" style={{ width: "58%" }} /></div>
                      <div className="pmock-result-bar-val">7 {t("mock.resultRes")}</div>
                    </div>
                    <div className="pmock-result-bar">
                      <div className="pmock-result-bar-label">Instagram</div>
                      <div className="pmock-result-bar-track"><div className="pmock-result-bar-fill" style={{ width: "33%" }} /></div>
                      <div className="pmock-result-bar-val">4 {t("mock.resultRes")}</div>
                    </div>
                    <div className="pmock-result-bar">
                      <div className="pmock-result-bar-label">WhatsApp</div>
                      <div className="pmock-result-bar-track"><div className="pmock-result-bar-fill" style={{ width: "9%" }} /></div>
                      <div className="pmock-result-bar-val">1 {t("mock.resultRes")}</div>
                    </div>
                  </div>
                  <div className="pmock-result-note">
                    <span className="pmock-f-badge">F</span>
                    <span>{t("mock.resultNote")}</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      <section className="product-features">
        <div className="container">
          <h2 className="section-title">{t("featuresTitle")}</h2>
          <div className="product-features-list">
            {FEATURE_KEYS.map((key) => (
              <div key={key} className="hero-diff" data-reveal>
                <h3 className="hero-diff-title">{t(`features.${key}.title`)}</h3>
                <p className="hero-diff-desc">{t(`features.${key}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="cta-section">
        <h2 className="section-title">{t("ctaTitle")}</h2>
        <p className="section-subtitle">{t("ctaSubtitle")}</p>
        <Link className="cta-btn" href="/contact">{t("ctaButton")}</Link>
        <p className="section-subtitle" style={{ marginTop: 32, fontSize: 15 }}>
          {t.rich("ctaPricing", {
            link: (chunks) => (
              <Link href="/pricing" style={{ color: "#FFFFFF", textDecoration: "underline" }}>
                {chunks}
              </Link>
            ),
          })}
        </p>
      </section>
    </>
  );
}
