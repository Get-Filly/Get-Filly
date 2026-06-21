// ============================================================
// Privacy-verklaring, /privacy
// ============================================================
// Publieke pagina (AVG art. 13/14). De volledige tekst is per
// 2026-05-30 vervangen door de aangeleverde, uitgebreide
// conceptversie (afgestemd op AVG, Google OAuth Verification,
// Meta App Review, Stripe, bunq en Anthropic/Claude).
//
// Bedrijfsgegevens komen uit `apps/web/src/config/company.ts`
// (KvK, adres, telefoon). De draft-banner verdwijnt automatisch
// nu legalName + KvK zijn ingevuld; het document blijft formeel
// een conceptversie tot een jurist 'm heeft gereviewd.
// ============================================================

import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { COMPANY, formatFullAddress } from "@/config/company";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("leg_privacy_page");
  return {
    // Korte titel; de root-template maakt er "Privacyverklaring · Get-Filly" van.
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: "/privacy" },
  };
}

const LAST_UPDATED = "18 juni 2026";
const VERSION = "v1.1";

// Lichte, herbruikbare tabel-styling zodat de overzichtstabellen
// netjes ogen zonder van een mogelijk-ontbrekende CSS-class af te
// hangen.
const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  margin: "12px 0",
  fontSize: 14,
};
const thtd: React.CSSProperties = {
  border: "1px solid var(--border, #E5DFD0)",
  padding: "8px 10px",
  textAlign: "left",
  verticalAlign: "top",
};

export default function PrivacyPage() {
  const t = useTranslations("leg_privacy_page");
  const fullAddress = formatFullAddress();

  return (
    <section className="legal-page">
      <div className="legal-container">
        <p className="legal-meta">
          {t("lastUpdated", { date: LAST_UPDATED, version: VERSION })}
        </p>
        <h1 className="legal-title">{t("title")}</h1>
        <p className="legal-lead">{t("lead")}</p>

        <nav className="legal-toc" aria-label={t("tocAriaLabel")}>
          <div className="legal-toc-title">{t("tocTitle")}</div>
          <ol>
            <li><a href="#wie">{t("toc.who")}</a></li>
            <li><a href="#gegevens">{t("toc.data")}</a></li>
            <li><a href="#waarom">{t("toc.why")}</a></li>
            <li><a href="#analyses">{t("toc.analyses")}</a></li>
            <li><a href="#integraties">{t("toc.integrations")}</a></li>
            <li><a href="#google">{t("toc.google")}</a></li>
            <li><a href="#meta">{t("toc.meta")}</a></li>
            <li><a href="#ai">{t("toc.ai")}</a></li>
            <li><a href="#delen">{t("toc.sharing")}</a></li>
            <li><a href="#buitenland">{t("toc.transfers")}</a></li>
            <li><a href="#bewaartermijn">{t("toc.retention")}</a></li>
            <li><a href="#beveiliging">{t("toc.security")}</a></li>
            <li><a href="#cookies">{t("toc.cookies")}</a></li>
            <li><a href="#rechten">{t("toc.rights")}</a></li>
            <li><a href="#intrekken">{t("toc.withdraw")}</a></li>
            <li><a href="#eigendom">{t("toc.ownership")}</a></li>
            <li><a href="#minderjarigen">{t("toc.minors")}</a></li>
            <li><a href="#datalekken">{t("toc.breaches")}</a></li>
            <li><a href="#wijzigingen">{t("toc.changes")}</a></li>
            <li><a href="#contact">{t("toc.contact")}</a></li>
          </ol>
        </nav>

        {/* 1 */}
        <div id="wie" className="legal-section">
          <h2>{t("who.heading")}</h2>
          <p>{t("who.intro")}</p>
          <table style={tableStyle}>
            <tbody>
              <tr>
                <th style={thtd}>{t("who.controllerLabel")}</th>
                <td style={thtd}>
                  {t("who.controllerValue", {
                    legalName: COMPANY.legalName ?? "",
                    kvk: COMPANY.kvk ?? "",
                  })}
                </td>
              </tr>
              <tr>
                <th style={thtd}>{t("who.addressLabel")}</th>
                <td style={thtd}>{fullAddress}</td>
              </tr>
              <tr>
                <th style={thtd}>{t("who.emailLabel")}</th>
                <td style={thtd}>
                  <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
                </td>
              </tr>
              <tr>
                <th style={thtd}>{t("who.phoneLabel")}</th>
                <td style={thtd}>{COMPANY.phone}</td>
              </tr>
              <tr>
                <th style={thtd}>{t("who.supervisorLabel")}</th>
                <td style={thtd}>{t("who.supervisorValue")}</td>
              </tr>
            </tbody>
          </table>
          <p>{t("who.scope")}</p>
        </div>

        {/* 2 */}
        <div id="gegevens" className="legal-section">
          <h2>{t("data.heading")}</h2>
          <p>{t("data.intro")}</p>

          <h3>{t("data.user.heading")}</h3>
          <p>{t("data.user.intro")}</p>
          <ul>
            <li>{t("data.user.name")}</li>
            <li>{t("data.user.email")}</li>
            <li>{t("data.user.phone")}</li>
            <li>{t("data.user.password")}</li>
            <li>{t("data.user.role")}</li>
            <li>{t("data.user.settings")}</li>
            <li>{t("data.user.loginTimes")}</li>
            <li>{t("data.user.usage")}</li>
            <li>{t("data.user.support")}</li>
          </ul>
          <p>{t("data.user.purpose")}</p>

          <h3>{t("data.business.heading")}</h3>
          <p>{t("data.business.intro")}</p>
          <ul>
            <li>{t("data.business.name")}</li>
            <li>{t("data.business.type")}</li>
            <li>{t("data.business.address")}</li>
            <li>{t("data.business.hours")}</li>
            <li>{t("data.business.website")}</li>
            <li>{t("data.business.menu")}</li>
            <li>{t("data.business.reservationOptions")}</li>
            <li>{t("data.business.reservations")}</li>
            <li>{t("data.business.reviews")}</li>
            <li>{t("data.business.visibility")}</li>
            <li>{t("data.business.social")}</li>
            <li>{t("data.business.integrations")}</li>
          </ul>

          <h3>{t("data.guests.heading")}</h3>
          <p>{t("data.guests.intro")}</p>
          <p>{t("data.guests.controller")}</p>
          <p>{t("data.guests.processor")}</p>
          <p>{t("data.guests.dpa")}</p>
          <p>{t("data.guests.listIntro")}</p>
          <ul>
            <li>{t("data.guests.name")}</li>
            <li>{t("data.guests.email")}</li>
            <li>{t("data.guests.phone")}</li>
            <li>{t("data.guests.history")}</li>
            <li>{t("data.guests.frequency")}</li>
            <li>{t("data.guests.datetime")}</li>
            <li>{t("data.guests.preferences")}</li>
            <li>{t("data.guests.marketing")}</li>
          </ul>
          <p>{t("data.guests.responsibility")}</p>

          <h3>{t("data.ai.heading")}</h3>
          <p>{t("data.ai.intro")}</p>
          <ul>
            <li>{t("data.ai.actionType")}</li>
            <li>{t("data.ai.prompts")}</li>
            <li>{t("data.ai.responses")}</li>
            <li>{t("data.ai.models")}</li>
            <li>{t("data.ai.tokens")}</li>
            <li>{t("data.ai.timestamp")}</li>
            <li>{t("data.ai.business")}</li>
            <li>{t("data.ai.errors")}</li>
          </ul>
          <p>{t("data.ai.minimization")}</p>

          <h3>{t("data.technical.heading")}</h3>
          <p>{t("data.technical.intro")}</p>
          <ul>
            <li>{t("data.technical.ip")}</li>
            <li>{t("data.technical.device")}</li>
            <li>{t("data.technical.os")}</li>
            <li>{t("data.technical.pages")}</li>
            <li>{t("data.technical.clicks")}</li>
            <li>{t("data.technical.session")}</li>
            <li>{t("data.technical.errors")}</li>
            <li>{t("data.technical.logs")}</li>
            <li>{t("data.technical.security")}</li>
          </ul>
          <p>{t("data.technical.purpose")}</p>

          <h3>{t("data.public.heading")}</h3>
          <p>{t("data.public.intro")}</p>
          <ul>
            <li>{t("data.public.websites")}</li>
            <li>{t("data.public.websiteTech")}</li>
            <li>{t("data.public.reviews")}</li>
            <li>{t("data.public.listings")}</li>
            <li>{t("data.public.social")}</li>
            <li>{t("data.public.media")}</li>
            <li>{t("data.public.searchResults")}</li>
            <li>{t("data.public.platforms")}</li>
          </ul>
          <p>{t("data.public.basis")}</p>

          <h3>{t("data.payment.heading")}</h3>
          <p>{t("data.payment.intro")}</p>
          <ul>
            <li>{t("data.payment.invoice")}</li>
            <li>{t("data.payment.billingName")}</li>
            <li>{t("data.payment.status")}</li>
            <li>{t("data.payment.transactionId")}</li>
            <li>{t("data.payment.subscription")}</li>
            <li>{t("data.payment.lastFour")}</li>
            <li>{t("data.payment.bankTransactions")}</li>
          </ul>
          <p>{t("data.payment.providers")}</p>
        </div>

        {/* 3 */}
        <div id="waarom" className="legal-section">
          <h2>{t("why.heading")}</h2>
          <p>{t("why.intro")}</p>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thtd}>{t("why.colPurpose")}</th>
                <th style={thtd}>{t("why.colExamples")}</th>
                <th style={thtd}>{t("why.colBasis")}</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style={thtd}>{t("why.account.purpose")}</td><td style={thtd}>{t("why.account.examples")}</td><td style={thtd}>{t("why.account.basis")}</td></tr>
              <tr><td style={thtd}>{t("why.service.purpose")}</td><td style={thtd}>{t("why.service.examples")}</td><td style={thtd}>{t("why.service.basis")}</td></tr>
              <tr><td style={thtd}>{t("why.health.purpose")}</td><td style={thtd}>{t("why.health.examples")}</td><td style={thtd}>{t("why.health.basis")}</td></tr>
              <tr><td style={thtd}>{t("why.integrations.purpose")}</td><td style={thtd}>{t("why.integrations.examples")}</td><td style={thtd}>{t("why.integrations.basis")}</td></tr>
              <tr><td style={thtd}>{t("why.guests.purpose")}</td><td style={thtd}>{t("why.guests.examples")}</td><td style={thtd}>{t("why.guests.basis")}</td></tr>
              <tr><td style={thtd}>{t("why.payment.purpose")}</td><td style={thtd}>{t("why.payment.examples")}</td><td style={thtd}>{t("why.payment.basis")}</td></tr>
              <tr><td style={thtd}>{t("why.bank.purpose")}</td><td style={thtd}>{t("why.bank.examples")}</td><td style={thtd}>{t("why.bank.basis")}</td></tr>
              <tr><td style={thtd}>{t("why.security.purpose")}</td><td style={thtd}>{t("why.security.examples")}</td><td style={thtd}>{t("why.security.basis")}</td></tr>
              <tr><td style={thtd}>{t("why.product.purpose")}</td><td style={thtd}>{t("why.product.examples")}</td><td style={thtd}>{t("why.product.basis")}</td></tr>
              <tr><td style={thtd}>{t("why.marketing.purpose")}</td><td style={thtd}>{t("why.marketing.examples")}</td><td style={thtd}>{t("why.marketing.basis")}</td></tr>
              <tr><td style={thtd}>{t("why.legal.purpose")}</td><td style={thtd}>{t("why.legal.examples")}</td><td style={thtd}>{t("why.legal.basis")}</td></tr>
            </tbody>
          </table>
        </div>

        {/* 4 */}
        <div id="analyses" className="legal-section">
          <h2>{t("analyses.heading")}</h2>
          <p>{t("analyses.intro")}</p>
          <ul>
            <li>{t("analyses.healthScores")}</li>
            <li>{t("analyses.potentialScores")}</li>
            <li>{t("analyses.opportunityScores")}</li>
            <li>{t("analyses.benchmarks")}</li>
            <li>{t("analyses.visibilityScores")}</li>
            <li>{t("analyses.recommendations")}</li>
            <li>{t("analyses.revenueInsights")}</li>
          </ul>
          <p>{t("analyses.advisory")}</p>
          <p>{t("analyses.noGuestScoring")}</p>
        </div>

        {/* 5 */}
        <div id="integraties" className="legal-section">
          <h2>{t("integrations.heading")}</h2>
          <p>{t("integrations.intro")}</p>
          <p>{t("integrations.consentIntro")}</p>
          <ul>
            <li>{t("integrations.whatData")}</li>
            <li>{t("integrations.whatPurpose")}</li>
            <li>{t("integrations.whatPermissions")}</li>
            <li>{t("integrations.howRevoke")}</li>
          </ul>
          <p>{t("integrations.minimization")}</p>
        </div>

        {/* 6 */}
        <div id="google" className="legal-section">
          <h2>{t("google.heading")}</h2>
          <p>{t("google.intro")}</p>
          <ul>
            <li>{t("google.businessName")}</li>
            <li>{t("google.profileInfo")}</li>
            <li>{t("google.contact")}</li>
            <li>{t("google.hours")}</li>
            <li>{t("google.categories")}</li>
            <li>{t("google.reviews")}</li>
            <li>{t("google.photos")}</li>
            <li>{t("google.location")}</li>
            <li>{t("google.performance")}</li>
          </ul>
          <p>{t("google.usageIntro")}</p>
          <ul>
            <li>{t("google.useHealth")}</li>
            <li>{t("google.useAnalyze")}</li>
            <li>{t("google.useAdvice")}</li>
            <li>{t("google.useTrends")}</li>
            <li>{t("google.useOptimize")}</li>
            <li>{t("google.useReplyReviews")}</li>
            <li>{t("google.usePosts")}</li>
            <li>{t("google.useComplete")}</li>
            <li>{t("google.useManagePhotos")}</li>
            <li>{t("google.useFlagMissing")}</li>
            <li>{t("google.useMonitor")}</li>
            <li>{t("google.useCompare")}</li>
          </ul>
          <h3>{t("google.storage.heading")}</h3>
          <p>{t("google.storage.body")}</p>

          <h3>{t("google.retention.heading")}</h3>
          <p>{t("google.retention.body")}</p>

          <h3>{t("google.declarations.heading")}</h3>
          <ul>
            <li>{t("google.declarations.noSell")}</li>
            <li>{t("google.declarations.noAds")}</li>
            <li>{t("google.declarations.noTraining")}</li>
            <li>{t("google.declarations.noBrokers")}</li>
            <li>{t("google.declarations.noChanges")}</li>
          </ul>
          <p>{t("google.limitedUse")}</p>
          <p>
            <em>{t("google.limitedUseEn")}</em>
          </p>
          <p>{t("google.autoActions")}</p>

          <h3>{t("google.revoke.heading")}</h3>
          <p>{t("google.revoke.body")}</p>
          <p>
            {t.rich("google.revoke.manage", {
              link: (chunks) => (
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {chunks}
                </a>
              ),
            })}
          </p>
        </div>

        {/* 7 */}
        <div id="meta" className="legal-section">
          <h2>{t("meta.heading")}</h2>
          <p>{t("meta.intro")}</p>
          <p>{t("meta.accessIntro")}</p>
          <ul>
            <li>{t("meta.accountName")}</li>
            <li>{t("meta.businessInfo")}</li>
            <li>{t("meta.pages")}</li>
            <li>{t("meta.publicPosts")}</li>
            <li>{t("meta.drafts")}</li>
            <li>{t("meta.engagement")}</li>
            <li>{t("meta.stats")}</li>
            <li>{t("meta.campaignInsights")}</li>
            <li>{t("meta.messages")}</li>
            <li>{t("meta.technicalMetadata")}</li>
          </ul>
          <p>{t("meta.usageIntro")}</p>
          <ul>
            <li>{t("meta.useHealth")}</li>
            <li>{t("meta.usePerformance")}</li>
            <li>{t("meta.useAnalyze")}</li>
            <li>{t("meta.useInsights")}</li>
            <li>{t("meta.useGenerate")}</li>
            <li>{t("meta.usePublish")}</li>
            <li>{t("meta.useEditDrafts")}</li>
            <li>{t("meta.useModerate")}</li>
            <li>{t("meta.useMonitor")}</li>
            <li>{t("meta.useCompare")}</li>
            <li>{t("meta.useFlagMissing")}</li>
          </ul>
          <p>{t("meta.noSell")}</p>
          <p>{t("meta.noAds")}</p>
          <p>{t("meta.noTraining")}</p>
          <p>{t("meta.noBrokers")}</p>
          <p>{t("meta.noChanges")}</p>
          <p>{t("meta.autoActions")}</p>
          <p>{t("meta.onBehalf")}</p>
          <p>{t("meta.disconnect")}</p>
          <p>{t("meta.deletion")}</p>
        </div>

        {/* 8 */}
        <div id="ai" className="legal-section">
          <h2>{t("ai.heading")}</h2>
          <p>{t("ai.intro")}</p>
          <p>{t("ai.anthropic")}</p>
          <p>{t("ai.dataFlow")}</p>
          <p>{t("ai.claudeCode")}</p>

          <h3>{t("ai.noTraining.heading")}</h3>
          <p>{t("ai.noTraining.body")}</p>

          <h3>{t("ai.humanControl.heading")}</h3>
          <p>{t("ai.humanControl.intro")}</p>
          <ul>
            <li>{t("ai.humanControl.campaigns")}</li>
            <li>{t("ai.humanControl.guestComms")}</li>
            <li>{t("ai.humanControl.publication")}</li>
            <li>{t("ai.humanControl.decisions")}</li>
            <li>{t("ai.humanControl.operational")}</li>
          </ul>
          <p>{t("ai.humanControl.disclaimer")}</p>
        </div>

        {/* 9 */}
        <div id="delen" className="legal-section">
          <h2>{t("sharing.heading")}</h2>
          <p>{t("sharing.intro")}</p>

          <h3>{t("sharing.subprocessors.heading")}</h3>
          <p>{t("sharing.subprocessors.intro")}</p>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thtd}>{t("sharing.colParty")}</th>
                <th style={thtd}>{t("sharing.colFunction")}</th>
                <th style={thtd}>{t("sharing.colLocation")}</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style={thtd}>Supabase, Inc.</td><td style={thtd}>{t("sharing.supabase.function")}</td><td style={thtd}>{t("sharing.supabase.location")}</td></tr>
              <tr><td style={thtd}>Anthropic, PBC</td><td style={thtd}>{t("sharing.anthropic.function")}</td><td style={thtd}>{t("sharing.anthropic.location")}</td></tr>
              <tr><td style={thtd}>Resend, Inc.</td><td style={thtd}>{t("sharing.resend.function")}</td><td style={thtd}>{t("sharing.resend.location")}</td></tr>
              <tr><td style={thtd}>Vercel, Inc.</td><td style={thtd}>{t("sharing.vercel.function")}</td><td style={thtd}>{t("sharing.vercel.location")}</td></tr>
              <tr><td style={thtd}>Stripe</td><td style={thtd}>{t("sharing.stripe.function")}</td><td style={thtd}>{t("sharing.stripe.location")}</td></tr>
              <tr><td style={thtd}>bunq B.V.</td><td style={thtd}>{t("sharing.bunq.function")}</td><td style={thtd}>{t("sharing.bunq.location")}</td></tr>
              <tr><td style={thtd}>Google</td><td style={thtd}>{t("sharing.google.function")}</td><td style={thtd}>{t("sharing.google.location")}</td></tr>
              <tr><td style={thtd}>Meta Platforms</td><td style={thtd}>{t("sharing.metaPlatforms.function")}</td><td style={thtd}>{t("sharing.metaPlatforms.location")}</td></tr>
            </tbody>
          </table>
          <p>{t("sharing.noSell")}</p>
        </div>

        {/* 10 */}
        <div id="buitenland" className="legal-section">
          <h2>{t("transfers.heading")}</h2>
          <p>{t("transfers.intro")}</p>
          <ul>
            <li>{t("transfers.adequacy")}</li>
            <li>{t("transfers.dpf")}</li>
            <li>{t("transfers.scc")}</li>
            <li>{t("transfers.measures")}</li>
            <li>{t("transfers.other")}</li>
          </ul>
          <p>{t("transfers.assessment")}</p>
        </div>

        {/* 11 */}
        <div id="bewaartermijn" className="legal-section">
          <h2>{t("retention.heading")}</h2>
          <p>{t("retention.intro")}</p>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thtd}>{t("retention.colType")}</th>
                <th style={thtd}>{t("retention.colPeriod")}</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style={thtd}>{t("retention.account.type")}</td><td style={thtd}>{t("retention.account.period")}</td></tr>
              <tr><td style={thtd}>{t("retention.guests.type")}</td><td style={thtd}>{t("retention.guests.period")}</td></tr>
              <tr><td style={thtd}>{t("retention.results.type")}</td><td style={thtd}>{t("retention.results.period")}</td></tr>
              <tr><td style={thtd}>{t("retention.health.type")}</td><td style={thtd}>{t("retention.health.period")}</td></tr>
              <tr><td style={thtd}>{t("retention.tokens.type")}</td><td style={thtd}>{t("retention.tokens.period")}</td></tr>
              <tr><td style={thtd}>{t("retention.googleMeta.type")}</td><td style={thtd}>{t("retention.googleMeta.period")}</td></tr>
              <tr><td style={thtd}>{t("retention.aiLogs.type")}</td><td style={thtd}>{t("retention.aiLogs.period")}</td></tr>
              <tr><td style={thtd}>{t("retention.aiContent.type")}</td><td style={thtd}>{t("retention.aiContent.period")}</td></tr>
              <tr><td style={thtd}>{t("retention.invoices.type")}</td><td style={thtd}>{t("retention.invoices.period")}</td></tr>
              <tr><td style={thtd}>{t("retention.bank.type")}</td><td style={thtd}>{t("retention.bank.period")}</td></tr>
              <tr><td style={thtd}>{t("retention.securityLogs.type")}</td><td style={thtd}>{t("retention.securityLogs.period")}</td></tr>
              <tr><td style={thtd}>{t("retention.marketing.type")}</td><td style={thtd}>{t("retention.marketing.period")}</td></tr>
            </tbody>
          </table>
        </div>

        {/* 12 */}
        <div id="beveiliging" className="legal-section">
          <h2>{t("security.heading")}</h2>
          <p>{t("security.intro")}</p>
          <ul>
            <li>{t("security.tls")}</li>
            <li>{t("security.encryption")}</li>
            <li>{t("security.hashing")}</li>
            <li>{t("security.rbac")}</li>
            <li>{t("security.rls")}</li>
            <li>{t("security.logging")}</li>
            <li>{t("security.prodAccess")}</li>
            <li>{t("security.secrets")}</li>
            <li>{t("security.backups")}</li>
            <li>{t("security.monitoring")}</li>
            <li>{t("security.incidents")}</li>
            <li>{t("security.dpas")}</li>
          </ul>
          <p>{t("security.tokens")}</p>
        </div>

        {/* 13 */}
        <div id="cookies" className="legal-section">
          <h2>{t("cookies.heading")}</h2>
          <p>{t("cookies.functional")}</p>
          <p>{t("cookies.nonEssential")}</p>
          <p>{t("cookies.noThirdParty")}</p>
        </div>

        {/* 14 */}
        <div id="rechten" className="legal-section">
          <h2>{t("rights.heading")}</h2>
          <p>{t("rights.intro")}</p>
          <ul>
            <li>{t("rights.access")}</li>
            <li>{t("rights.rectification")}</li>
            <li>{t("rights.erasure")}</li>
            <li>{t("rights.restriction")}</li>
            <li>{t("rights.portability")}</li>
            <li>{t("rights.objection")}</li>
            <li>{t("rights.withdrawal")}</li>
            <li>{t("rights.humanIntervention")}</li>
          </ul>
          <p>
            {t.rich("rights.request", {
              link: (chunks) => (
                <a href={`mailto:${COMPANY.privacyEmail}`}>{chunks}</a>
              ),
              email: COMPANY.privacyEmail ?? "",
            })}
          </p>
          <p>{t("rights.guestRequests")}</p>
        </div>

        {/* 15 */}
        <div id="intrekken" className="legal-section">
          <h2>{t("withdraw.heading")}</h2>
          <p>{t("withdraw.intro")}</p>
          <ul>
            <li>{t("withdraw.removeIntegration")}</li>
            <li>{t("withdraw.revokePlatform")}</li>
            <li>
              {t.rich("withdraw.contact", {
                link: (chunks) => (
                  <a href={`mailto:${COMPANY.privacyEmail}`}>{chunks}</a>
                ),
                email: COMPANY.privacyEmail ?? "",
              })}
            </li>
          </ul>
          <p>{t("withdraw.afterWithdrawal")}</p>
        </div>

        {/* 16 */}
        <div id="eigendom" className="legal-section">
          <h2>{t("ownership.heading")}</h2>
          <p>{t("ownership.intro")}</p>
          <ul>
            <li>{t("ownership.reservations")}</li>
            <li>{t("ownership.guests")}</li>
            <li>{t("ownership.customerLists")}</li>
            <li>{t("ownership.campaigns")}</li>
            <li>{t("ownership.photos")}</li>
            <li>{t("ownership.reviews")}</li>
            <li>{t("ownership.reports")}</li>
            <li>{t("ownership.businessData")}</li>
            <li>{t("ownership.platformData")}</li>
          </ul>
        </div>

        {/* 17 */}
        <div id="minderjarigen" className="legal-section">
          <h2>{t("minors.heading")}</h2>
          <p>{t("minors.body")}</p>
        </div>

        {/* 18 */}
        <div id="datalekken" className="legal-section">
          <h2>{t("breaches.heading")}</h2>
          <p>{t("breaches.procedure")}</p>
          <p>
            {t.rich("breaches.report", {
              link: (chunks) => (
                <a href={`mailto:${COMPANY.securityEmail}`}>{chunks}</a>
              ),
              email: COMPANY.securityEmail ?? "",
              subject: t("breaches.subject"),
            })}
          </p>
        </div>

        {/* 19 */}
        <div id="wijzigingen" className="legal-section">
          <h2>{t("changes.heading")}</h2>
          <p>{t("changes.body")}</p>
        </div>

        {/* 20 */}
        <div id="contact" className="legal-section">
          <h2>{t("contact.heading")}</h2>
          <p>{t("contact.intro")}</p>
          <ul>
            <li>{COMPANY.legalName}</li>
            <li>{t("contact.address", { address: fullAddress ?? "" })}</li>
            <li>
              {t.rich("contact.email", {
                link: (chunks) => (
                  <a href={`mailto:${COMPANY.email}`}>{chunks}</a>
                ),
                email: COMPANY.email ?? "",
              })}
            </li>
            <li>{t("contact.phone", { phone: COMPANY.phone ?? "" })}</li>
            <li>{t("contact.kvk", { kvk: COMPANY.kvk ?? "" })}</li>
          </ul>
          <p>
            {t.rich("contact.complaint", {
              link: (chunks) => (
                <a
                  href="https://autoriteitpersoonsgegevens.nl"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {chunks}
                </a>
              ),
            })}
          </p>
        </div>
      </div>
    </section>
  );
}
