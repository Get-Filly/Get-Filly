import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cheerio from 'cheerio';
import type {
  HealthRunner,
  RunnerContext,
  RunnerFinding,
  RunnerResult,
} from './types';

/**
 * ============================================================
 * SeoRunner — on-page SEO + PageSpeed Insights
 * ============================================================
 *
 * Strategie:
 *   1. Fetch de homepage van het restaurant (1 request, geen crawl).
 *   2. Parse met cheerio en check 12 signalen (titles, meta, schema.org,
 *      OpenGraph, mobile-viewport, canonical, etc.).
 *   3. Roep Google PageSpeed Insights v5 aan voor mobile-strategy en
 *      pak 3 Lighthouse-categoriescores (performance, accessibility,
 *      seo). Dat geeft ons echte Lighthouse-data zonder eigen
 *      headless-browser te draaien.
 *
 * Waarom géén Claude/AI hier?
 *   - Deterministisch: zelfde site → zelfde score.
 *   - Sneller: ~1-2s i.p.v. ~10s.
 *   - Goedkoop: schaalt naar 1000+ wekelijkse audits zonder AI-budget.
 *
 * PageSpeed Insights API:
 *   - Endpoint:  https://www.googleapis.com/pagespeedonline/v5/runPagespeed
 *   - Quota:     25k requests/dag per IP zonder key. Met API-key later
 *                ophogen indien nodig. Bij 1000 klanten/week = 143/dag,
 *                ruim binnen quota.
 *   - Duur:      kan 10-30 sec per analyse. We zetten timeout op 60s en
 *                fallen terug naar enkel HTML-checks als 'ie timed out.
 * ============================================================
 */

/** Versie van deze runner. Bump bij elke wijziging van check-set of gewichten. */
const SEO_RUNNER_VERSION = 'seo.v1';

/** HTML-fetch timeout — restaurant-sites kunnen traag zijn (Wix/Squarespace). */
const FETCH_TIMEOUT_MS = 10_000;

/** PageSpeed timeout — Lighthouse audit zelf duurt soms 20-30 sec. */
const PAGESPEED_TIMEOUT_MS = 60_000;

/**
 * Check-definitie. Elke check heeft een vast points_lost-budget als 'ie
 * faalt; de runner berekent score = 100 - sum(points_lost van faalende
 * checks), geclamped naar 0-100.
 */
interface SeoCheck {
  key: string;
  severity: RunnerFinding['severity'];
  pointsBudget: number; // hoeveel je verliest als deze check faalt
  title: string;
  description: string;
  /** Wordt aangeroepen tijdens de run; geeft true/false + optionele fix-suggestie + details. */
  evaluate: (ctx: EvalContext) => CheckOutcome | Promise<CheckOutcome>;
}

interface CheckOutcome {
  passed: boolean;
  fixSuggestion?: string;
  fixLink?: string;
  details?: Record<string, unknown>;
}

interface EvalContext {
  ctx: RunnerContext;
  /** Geladen homepage-HTML, of null als fetch faalde. */
  $: cheerio.CheerioAPI | null;
  /** HTTP-status van homepage-fetch (200, 404, etc.) of null. */
  homepageStatus: number | null;
  /** Of we via HTTPS uitkwamen (na evt. redirect). */
  finalIsHttps: boolean;
  /** robots.txt bereikbaar? */
  robotsOk: boolean;
  /** sitemap.xml of /sitemap_index.xml bereikbaar? */
  sitemapOk: boolean;
  /** PageSpeed-scores (0-100). null als API faalde of timed out. */
  pageSpeed: PageSpeedScores | null;
}

interface PageSpeedScores {
  performance: number;
  accessibility: number;
  seo: number;
}

@Injectable()
export class SeoRunner implements HealthRunner {
  readonly category = 'seo' as const;
  private readonly logger = new Logger(SeoRunner.name);
  private readonly pagespeedApiKey?: string;

  constructor(config: ConfigService) {
    // Key is optioneel; zonder key krijg je 25k/dag/IP. Met key kan
    // het hoger en is rate-limiting per-key i.p.v. per-IP.
    this.pagespeedApiKey = config.get<string>('PAGESPEED_API_KEY') || undefined;
  }

  async run(ctx: RunnerContext): Promise<RunnerResult> {
    // Geen website? Dan kunnen we niks meten, score = 0 met 1 critical.
    if (!ctx.websiteUrl) {
      return {
        category: 'seo',
        score: 0,
        findings: [
          {
            category: 'seo',
            checkKey: 'seo.website_present',
            passed: false,
            severity: 'critical',
            pointsLost: 100,
            title: 'Geen website-URL ingesteld',
            description:
              'Zonder website-URL kunnen we geen SEO-analyse uitvoeren. Voeg je website toe in Instellingen → Identiteit.',
            fixSuggestion: 'Voeg je website-URL toe in je account-instellingen.',
            fixLink: '/dashboard/account?tab=identiteit',
            details: null,
          },
        ],
      };
    }

    // 1) Homepage fetchen + parsen
    const homepage = await this.fetchHomepage(ctx.websiteUrl);

    // 2) robots.txt + sitemap.xml HEAD-checks (parallel)
    const baseUrl = this.safeBaseUrl(ctx.websiteUrl);
    const [robotsOk, sitemapOk] = await Promise.all([
      baseUrl ? this.checkExists(`${baseUrl}/robots.txt`) : Promise.resolve(false),
      baseUrl ? this.checkSitemap(baseUrl) : Promise.resolve(false),
    ]);

    // 3) PageSpeed Insights (mag falen/timeouten zonder hele run te slopen)
    const pageSpeed = await this.fetchPageSpeed(ctx.websiteUrl);

    // 4) Eval-context bouwen
    const evalCtx: EvalContext = {
      ctx,
      $: homepage.$,
      homepageStatus: homepage.status,
      finalIsHttps: homepage.finalUrl?.startsWith('https://') ?? false,
      robotsOk,
      sitemapOk,
      pageSpeed,
    };

    // 5) Alle checks uitvoeren (sommige zijn async voor toekomstige uitbreiding)
    const findings: RunnerFinding[] = [];
    for (const check of this.checks()) {
      try {
        const outcome = await check.evaluate(evalCtx);
        findings.push({
          category: 'seo',
          checkKey: check.key,
          passed: outcome.passed,
          severity: check.severity,
          pointsLost: outcome.passed ? 0 : check.pointsBudget,
          title: check.title,
          description: check.description,
          fixSuggestion: outcome.fixSuggestion ?? null,
          fixLink: outcome.fixLink ?? null,
          details: outcome.details ?? null,
        });
      } catch (err) {
        // 1 falende check ≠ falende runner. Log + markeer als gefaald.
        this.logger.warn(
          `SEO-check ${check.key} crashte: ${err instanceof Error ? err.message : err}`,
        );
        findings.push({
          category: 'seo',
          checkKey: check.key,
          passed: false,
          severity: check.severity,
          pointsLost: check.pointsBudget,
          title: check.title,
          description: check.description,
          fixSuggestion: null,
          fixLink: null,
          details: { error: err instanceof Error ? err.message : String(err) },
        });
      }
    }

    // 6) Sub-score = 100 - som-van-verloren-punten, clamped 0-100
    const lost = findings.reduce((sum, f) => sum + f.pointsLost, 0);
    const score = Math.max(0, Math.min(100, 100 - lost));

    return { category: 'seo', score, findings };
  }

  // ============================================================
  // De checks zelf. Volgorde = volgorde in DB (handig voor debug).
  // pointsBudget-som zou ongeveer 100 moeten zijn; iets meer mag,
  // dan worden zeer slechte sites gewoon op 0 geclampt.
  // ============================================================

  private checks(): SeoCheck[] {
    return [
      {
        key: 'seo.https',
        severity: 'critical',
        pointsBudget: 15,
        title: 'Website draait op HTTPS',
        description:
          'Google rankt HTTP-sites lager en browsers tonen ze als onveilig. HTTPS is een harde vereiste voor vindbaarheid.',
        evaluate: ({ finalIsHttps }) => ({
          passed: finalIsHttps,
          fixSuggestion: finalIsHttps
            ? undefined
            : 'Activeer SSL bij je hosting-provider (vaak gratis via Let\'s Encrypt of automatisch bij Vercel/Wix/Squarespace).',
        }),
      },
      {
        key: 'seo.reachable',
        severity: 'critical',
        pointsBudget: 20,
        title: 'Homepage is bereikbaar',
        description:
          'De homepage moet een HTTP 200 teruggeven. Zonder bereikbare homepage kan Google niets indexeren.',
        evaluate: ({ homepageStatus }) => ({
          passed: homepageStatus !== null && homepageStatus >= 200 && homepageStatus < 400,
          details: { status: homepageStatus },
        }),
      },
      {
        key: 'seo.title_tag',
        severity: 'high',
        pointsBudget: 8,
        title: 'Title-tag aanwezig en goede lengte',
        description:
          'Optimaal 30-60 tekens. Te kort = weinig context; te lang = afgekapt in Google-resultaten.',
        evaluate: ({ $ }) => {
          if (!$) return { passed: false };
          const title = $('head title').first().text().trim();
          const len = title.length;
          const ok = len >= 30 && len <= 60;
          return {
            passed: ok,
            details: { title, length: len },
            fixSuggestion: ok
              ? undefined
              : 'Gebruik een title-tag van 30-60 tekens, bv. "Bistro X — Frans-Hollandse keuken in Utrecht".',
          };
        },
      },
      {
        key: 'seo.meta_description',
        severity: 'high',
        pointsBudget: 6,
        title: 'Meta-description aanwezig en goede lengte',
        description:
          'Optimaal 50-160 tekens. Verschijnt onder je titel in Google en beïnvloedt click-through-rate.',
        evaluate: ({ $ }) => {
          if (!$) return { passed: false };
          const desc = $('head meta[name="description"]').attr('content')?.trim() ?? '';
          const len = desc.length;
          const ok = len >= 50 && len <= 160;
          return {
            passed: ok,
            details: { description: desc, length: len },
            fixSuggestion: ok
              ? undefined
              : 'Voeg een meta-description toe van 50-160 tekens die uitlegt wat je restaurant uniek maakt.',
          };
        },
      },
      {
        key: 'seo.h1',
        severity: 'medium',
        pointsBudget: 4,
        title: 'H1-heading aanwezig',
        description:
          'Eén heldere H1 helpt Google begrijpen waar de pagina over gaat. Geen H1 = onduidelijke hiërarchie.',
        evaluate: ({ $ }) => {
          if (!$) return { passed: false };
          const count = $('h1').length;
          return {
            passed: count >= 1,
            details: { h1Count: count },
            fixSuggestion: count === 0 ? 'Voeg één H1 toe met je restaurant-naam of hoofdpropositie.' : undefined,
          };
        },
      },
      {
        key: 'seo.schema_restaurant',
        severity: 'critical',
        pointsBudget: 12,
        title: 'Schema.org Restaurant-markup',
        description:
          'JSON-LD met type "Restaurant" of "FoodEstablishment" is het belangrijkste signaal voor lokale SEO. Zonder dit ranken concurrenten met markup altijd hoger.',
        evaluate: ({ $ }) => {
          if (!$) return { passed: false };
          let found = false;
          $('script[type="application/ld+json"]').each((_, el) => {
            try {
              const raw = $(el).text();
              if (!raw) return;
              const parsed = JSON.parse(raw);
              const items = Array.isArray(parsed) ? parsed : [parsed];
              for (const item of items) {
                const type = item?.['@type'];
                const types = Array.isArray(type) ? type : [type];
                if (types.some((t) => t === 'Restaurant' || t === 'FoodEstablishment' || t === 'LocalBusiness')) {
                  found = true;
                  return false; // break .each
                }
              }
            } catch {
              // ongeldige JSON-LD, negeren
            }
          });
          return {
            passed: found,
            fixSuggestion: found
              ? undefined
              : 'Voeg JSON-LD schema toe met "@type": "Restaurant", inclusief naam, adres, openingstijden en cuisine. Zie schema.org/Restaurant.',
          };
        },
      },
      {
        key: 'seo.og_tags',
        severity: 'medium',
        pointsBudget: 4,
        title: 'Open Graph-tags voor social sharing',
        description:
          'og:title, og:description en og:image zorgen dat links naar je site er goed uitzien op WhatsApp, Facebook en Instagram.',
        evaluate: ({ $ }) => {
          if (!$) return { passed: false };
          const og = {
            title: $('meta[property="og:title"]').attr('content')?.trim(),
            description: $('meta[property="og:description"]').attr('content')?.trim(),
            image: $('meta[property="og:image"]').attr('content')?.trim(),
          };
          const ok = Boolean(og.title && og.description && og.image);
          return {
            passed: ok,
            details: og,
            fixSuggestion: ok ? undefined : 'Voeg og:title, og:description en og:image meta-tags toe in <head>.',
          };
        },
      },
      {
        key: 'seo.mobile_viewport',
        severity: 'high',
        pointsBudget: 6,
        title: 'Mobile viewport meta-tag',
        description:
          'Zonder viewport-tag toont mobiel een desktop-versie zoomed-out. Google rankt mobile-unfriendly sites veel lager.',
        evaluate: ({ $ }) => {
          if (!$) return { passed: false };
          const viewport = $('meta[name="viewport"]').attr('content')?.trim() ?? '';
          const ok = viewport.includes('width=device-width');
          return {
            passed: ok,
            details: { viewport },
            fixSuggestion: ok
              ? undefined
              : 'Voeg <meta name="viewport" content="width=device-width, initial-scale=1"> toe.',
          };
        },
      },
      {
        key: 'seo.canonical',
        severity: 'low',
        pointsBudget: 2,
        title: 'Canonical URL ingesteld',
        description:
          'Een canonical-tag voorkomt dat Google duplicate-content-issues krijgt bij parameter-varianten van je URL.',
        evaluate: ({ $ }) => {
          if (!$) return { passed: false };
          const canonical = $('link[rel="canonical"]').attr('href')?.trim();
          return {
            passed: Boolean(canonical),
            details: { canonical },
          };
        },
      },
      {
        key: 'seo.robots_txt',
        severity: 'low',
        pointsBudget: 2,
        title: 'robots.txt bereikbaar',
        description:
          'robots.txt vertelt zoekmachines welke pagina\'s ze mogen crawlen. Een lege of ontbrekende file is OK; een onbereikbare niet.',
        evaluate: ({ robotsOk }) => ({ passed: robotsOk }),
      },
      {
        key: 'seo.sitemap',
        severity: 'medium',
        pointsBudget: 3,
        title: 'sitemap.xml aanwezig',
        description:
          'Een sitemap helpt Google al je pagina\'s sneller te indexeren. Vooral handig bij menu-, blog- of evenement-pagina\'s.',
        evaluate: ({ sitemapOk }) => ({
          passed: sitemapOk,
          fixSuggestion: sitemapOk
            ? undefined
            : 'Genereer een sitemap.xml en plaats hem op je root-URL. Veel CMS\'en (WordPress, Wix) doen dit automatisch.',
        }),
      },
      // ============================================================
      // PageSpeed Insights — 3 sub-checks (performance, accessibility, seo)
      // Als PageSpeed-API uberhaupt faalde, krijgen al deze 0 punten.
      // ============================================================
      {
        key: 'seo.pagespeed_performance',
        severity: 'high',
        pointsBudget: 8,
        title: 'Snelheid (mobiel)',
        description:
          'Google\'s mobile-first index straft trage sites af. We meten Lighthouse-performance op mobile — score ≥ 50 is voldoende, ≥ 90 ideaal.',
        evaluate: ({ pageSpeed }) => {
          if (!pageSpeed) return { passed: false, details: { reason: 'pagespeed_unavailable' } };
          return {
            passed: pageSpeed.performance >= 50,
            details: { score: pageSpeed.performance },
            fixSuggestion:
              pageSpeed.performance >= 50
                ? undefined
                : 'Optimaliseer afbeeldingen (WebP), schakel browser-caching in, en minimaliseer JavaScript. Je hostingprovider kan vaak helpen.',
          };
        },
      },
      {
        key: 'seo.pagespeed_accessibility',
        severity: 'medium',
        pointsBudget: 5,
        title: 'Toegankelijkheid',
        description:
          'Lighthouse-accessibility-score meet of je site bruikbaar is voor mensen met beperkingen. Sinds 2025 weegt dit mee in Google-rankings.',
        evaluate: ({ pageSpeed }) => {
          if (!pageSpeed) return { passed: false, details: { reason: 'pagespeed_unavailable' } };
          return {
            passed: pageSpeed.accessibility >= 80,
            details: { score: pageSpeed.accessibility },
          };
        },
      },
      {
        key: 'seo.pagespeed_seo',
        severity: 'high',
        pointsBudget: 5,
        title: 'Lighthouse SEO-score',
        description:
          'Lighthouse\'s eigen SEO-categorie checkt 14 basis-signalen (meta-tags, links crawlable, etc.). Hoort altijd ≥ 90 te zijn.',
        evaluate: ({ pageSpeed }) => {
          if (!pageSpeed) return { passed: false, details: { reason: 'pagespeed_unavailable' } };
          return {
            passed: pageSpeed.seo >= 90,
            details: { score: pageSpeed.seo },
          };
        },
      },
    ];
  }

  // ============================================================
  // Helpers: fetch, parse, PageSpeed
  // ============================================================

  /**
   * Fetcht de homepage met timeout en redirect-tracking. Geeft de
   * uiteindelijke URL terug zodat we de HTTPS-check op de
   * post-redirect-URL kunnen doen (veel sites redirecten van http → https).
   */
  private async fetchHomepage(url: string): Promise<{
    $: cheerio.CheerioAPI | null;
    status: number | null;
    finalUrl: string | null;
  }> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const res = await fetch(url, {
        // Veel hosts blokkeren default fetch-UA; geef een realistische
        // bot-UA mee zodat we niet als scraper geblokkeerd worden.
        headers: { 'user-agent': 'GetFillyBot/1.0 (+https://getfilly.com/bot)' },
        signal: controller.signal,
        redirect: 'follow',
      });
      clearTimeout(timer);

      const finalUrl = res.url;
      const status = res.status;

      // Alleen HTML parsen; PDF/JSON-content slaan we over.
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.toLowerCase().includes('text/html')) {
        return { $: null, status, finalUrl };
      }

      const html = await res.text();
      return { $: cheerio.load(html), status, finalUrl };
    } catch (err) {
      this.logger.warn(
        `Homepage-fetch faalde voor ${url}: ${err instanceof Error ? err.message : err}`,
      );
      return { $: null, status: null, finalUrl: null };
    }
  }

  /** HEAD-request: bestaat de URL? */
  private async checkExists(url: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, {
        method: 'HEAD',
        headers: { 'user-agent': 'GetFillyBot/1.0' },
        signal: controller.signal,
        redirect: 'follow',
      });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }

  /** sitemap.xml óf sitemap_index.xml? Allebei tellen. */
  private async checkSitemap(baseUrl: string): Promise<boolean> {
    const candidates = [`${baseUrl}/sitemap.xml`, `${baseUrl}/sitemap_index.xml`];
    for (const u of candidates) {
      if (await this.checkExists(u)) return true;
    }
    return false;
  }

  /** Strip path/query, behoud protocol + host. */
  private safeBaseUrl(url: string): string | null {
    try {
      const u = new URL(url);
      return `${u.protocol}//${u.host}`;
    } catch {
      return null;
    }
  }

  /**
   * Vraagt PageSpeed Insights v5 om een Lighthouse-audit op mobile.
   * Returnt null bij timeout/error — losse checks markeren zichzelf
   * dan als gefaald met details.reason = 'pagespeed_unavailable'.
   */
  private async fetchPageSpeed(url: string): Promise<PageSpeedScores | null> {
    try {
      const params = new URLSearchParams({
        url,
        strategy: 'mobile',
      });
      // Meerdere categories via repeated query-param.
      params.append('category', 'performance');
      params.append('category', 'accessibility');
      params.append('category', 'seo');
      if (this.pagespeedApiKey) {
        params.set('key', this.pagespeedApiKey);
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PAGESPEED_TIMEOUT_MS);

      const res = await fetch(
        `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`,
        { signal: controller.signal },
      );
      clearTimeout(timer);

      if (!res.ok) {
        this.logger.warn(`PageSpeed gaf HTTP ${res.status} voor ${url}`);
        return null;
      }

      const json: unknown = await res.json();
      const categories = (json as {
        lighthouseResult?: {
          categories?: Record<string, { score?: number | null }>;
        };
      })?.lighthouseResult?.categories;

      if (!categories) return null;

      // Lighthouse-scores zijn 0-1 floats; we converteren naar 0-100.
      const pct = (v: number | null | undefined): number =>
        v == null ? 0 : Math.round(v * 100);

      return {
        performance: pct(categories.performance?.score),
        accessibility: pct(categories.accessibility?.score),
        seo: pct(categories.seo?.score),
      };
    } catch (err) {
      this.logger.warn(
        `PageSpeed-fetch faalde voor ${url}: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }
}

export { SEO_RUNNER_VERSION };
