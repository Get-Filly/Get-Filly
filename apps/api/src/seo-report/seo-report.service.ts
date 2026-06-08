import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiService } from '../ai/ai.service';
import { MailService } from '../mail/mail.service';

// ============================================================
// SeoReportService — wekelijks vindbaarheid-rapport
// ============================================================
// Audit van ONZE eigen site (get-filly.com) + Google Business-profiel,
// over vier pijlers: AI-zoekmachines, klassieke SEO, Google Business
// en algehele internetvindbaarheid. Daarna een korte Claude-analyse
// (score + concrete kansen) en het geheel als e-mail naar
// info@get-filly.com.
//
// Bewust lean (parallelle fetches + 1 Places-call + 1 beknopte Claude-
// call) i.v.m. de 10s-functielimiet op Vercel.

// Onze canonieke site. Bewust hardcoded: dit rapport gaat specifiek
// over get-filly.com (niet over WEB_URL, dat kan een preview zijn).
const SITE = 'https://www.get-filly.com';
const PAGES = ['/', '/product', '/pricing', '/about', '/contact'];

type PageAudit = {
  path: string;
  status: number;
  title: string | null;
  description: string | null;
  canonical: string | null;
  h1: string | null;
  ogImage: boolean;
  hasJsonLd: boolean;
};

type FileChecks = { llms: number; robots: number; sitemap: number };

// Google Business: configured=false → geen Place ID/API-key gezet.
type Gbp = {
  configured: boolean;
  name: string | null;
  rating: number | null;
  reviewCount: number | null;
};

@Injectable()
export class SeoReportService {
  private readonly logger = new Logger(SeoReportService.name);

  constructor(
    private readonly ai: AiService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  private firstMatch(html: string, re: RegExp): string | null {
    const m = html.match(re);
    return m && m[1] ? m[1].trim() : null;
  }

  private async auditPage(path: string): Promise<PageAudit> {
    try {
      const res = await fetch(`${SITE}${path}`, { redirect: 'follow' });
      const html = res.ok ? await res.text() : '';
      // H1: pak de inner-text en strip eventuele geneste tags.
      const h1Raw = this.firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
      const h1 = h1Raw ? h1Raw.replace(/<[^>]+>/g, '').trim() || null : null;
      return {
        path,
        status: res.status,
        title: this.firstMatch(html, /<title[^>]*>([^<]*)<\/title>/i),
        description: this.firstMatch(
          html,
          /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
        ),
        canonical: this.firstMatch(
          html,
          /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i,
        ),
        h1,
        ogImage: /<meta[^>]+property=["']og:image["']/i.test(html),
        hasJsonLd: /<script[^>]+type=["']application\/ld\+json["']/i.test(html),
      };
    } catch (err) {
      this.logger.warn(`Audit ${path} faalde: ${String(err)}`);
      return {
        path,
        status: 0,
        title: null,
        description: null,
        canonical: null,
        h1: null,
        ogImage: false,
        hasJsonLd: false,
      };
    }
  }

  private async checkStatus(path: string): Promise<number> {
    try {
      const res = await fetch(`${SITE}${path}`, { redirect: 'follow' });
      return res.status;
    } catch {
      return 0;
    }
  }

  // Get-Filly's eigen Google Business-profiel (rating + #reviews) via de
  // Places API (nieuw v1). Env-gated: zonder GETFILLY_PLACE_ID +
  // GOOGLE_PLACES_API_KEY meldt het rapport "niet gekoppeld".
  private async fetchGoogleBusiness(): Promise<Gbp> {
    const placeId = this.config.get<string>('GETFILLY_PLACE_ID');
    const key = this.config.get<string>('GOOGLE_PLACES_API_KEY');
    if (!placeId || !key) {
      return { configured: false, name: null, rating: null, reviewCount: null };
    }
    try {
      const res = await fetch(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
        {
          headers: {
            'X-Goog-Api-Key': key,
            'X-Goog-FieldMask': 'displayName,rating,userRatingCount',
          },
        },
      );
      if (!res.ok) {
        this.logger.warn(`Places-call faalde (${res.status}).`);
        return {
          configured: true,
          name: null,
          rating: null,
          reviewCount: null,
        };
      }
      const data = (await res.json()) as {
        displayName?: { text?: string };
        rating?: number;
        userRatingCount?: number;
      };
      return {
        configured: true,
        name: data.displayName?.text ?? null,
        rating: data.rating ?? null,
        reviewCount: data.userRatingCount ?? null,
      };
    } catch (err) {
      this.logger.warn(`Places-call error: ${String(err)}`);
      return { configured: true, name: null, rating: null, reviewCount: null };
    }
  }

  /** Draait de audit, vraagt Claude om analyse en mailt het rapport. */
  async runAndSend(): Promise<{ ok: true }> {
    const [pages, llms, robots, sitemap, gbp] = await Promise.all([
      Promise.all(PAGES.map((p) => this.auditPage(p))),
      this.checkStatus('/llms.txt'),
      this.checkStatus('/robots.txt'),
      this.checkStatus('/sitemap.xml'),
      this.fetchGoogleBusiness(),
    ]);
    const files: FileChecks = { llms, robots, sitemap };

    // Korte Claude-analyse. Fail-soft: zonder analyse mailen we toch
    // de feiten, zodat een AI-storing het rapport niet blokkeert.
    let analysis: string;
    try {
      analysis = await this.ai.generateText({
        system:
          'Je bent een specialist in online vindbaarheid (SEO, GEO/AI-zoekmachines ' +
          'zoals ChatGPT/Perplexity/Google AI Overviews/Gemini, en Google Business). ' +
          'Je beoordeelt de vindbaarheid van een SaaS-bedrijf. Antwoord in het ' +
          'Nederlands, bondig en actiegericht — dit gaat als interne e-mail uit.',
        prompt:
          `Actuele staat van Get-Filly (get-filly.com):\n\n${this.buildFacts(pages, files, gbp)}\n\n` +
          'Geef, gestructureerd per pijler:\n' +
          '1. Een totale beoordeling met score (x/10) + 1-2 zinnen waarom.\n' +
          '2. Per pijler (AI-zoekmachines, klassieke SEO, Google Business, ' +
          'algehele internetvindbaarheid) de belangrijkste 1-2 kansen, kort.\n' +
          '3. De top-3 acties voor deze week, gesorteerd op impact.\n' +
          'Hou het kort genoeg voor een e-mail.',
        // Haiku: snel (blijft binnen de 10s-functielimiet) + goedkoop
        // voor een wekelijkse job; ruim voldoende voor deze analyse.
        model: 'claude-haiku-4-5-20251001',
        maxTokens: 900,
        meta: { restaurantId: null, feature: 'seo_weekly_audit' },
      });
    } catch (err) {
      this.logger.warn(`Claude-analyse faalde: ${String(err)}`);
      analysis =
        '(AI-analyse kon deze week niet worden gegenereerd — zie de feiten hieronder.)';
    }

    const { html, text } = this.buildEmail(pages, files, gbp, analysis);
    await this.mail.sendSeoReport(
      'Get-Filly vindbaarheid — wekelijks rapport',
      html,
      text,
    );
    this.logger.log('Wekelijks vindbaarheid-rapport verstuurd.');
    return { ok: true };
  }

  private gbpLine(gbp: Gbp): string {
    if (!gbp.configured) {
      return 'Google Business: niet gekoppeld (zet GETFILLY_PLACE_ID + GOOGLE_PLACES_API_KEY).';
    }
    if (gbp.rating === null) {
      return 'Google Business: gekoppeld, maar kon de gegevens niet ophalen.';
    }
    return `Google Business${gbp.name ? ` (${gbp.name})` : ''}: ${gbp.rating.toFixed(1)} ⭐ uit ${gbp.reviewCount ?? 0} reviews.`;
  }

  // Compacte feiten-tekst voor de Claude-prompt.
  private buildFacts(pages: PageAudit[], files: FileChecks, gbp: Gbp): string {
    const lines = pages.map(
      (p) =>
        `- ${p.path} (HTTP ${p.status}): title="${p.title ?? '—'}" | description="${p.description ?? '—'}" | h1="${p.h1 ?? '—'}" | canonical=${p.canonical ?? '—'} | og:image=${p.ogImage ? 'ja' : 'nee'} | JSON-LD=${p.hasJsonLd ? 'ja' : 'nee'}`,
    );
    lines.push(
      `- Bestanden: /llms.txt HTTP ${files.llms} | /robots.txt HTTP ${files.robots} | /sitemap.xml HTTP ${files.sitemap}`,
    );
    lines.push(`- ${this.gbpLine(gbp)}`);
    return lines.join('\n');
  }

  private esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private buildEmail(
    pages: PageAudit[],
    files: FileChecks,
    gbp: Gbp,
    analysis: string,
  ): { html: string; text: string } {
    const ok = (b: boolean) => (b ? '✓' : '✗');
    const fileLine = (label: string, status: number) =>
      `${label}: HTTP ${status} ${status === 200 ? '✓' : '✗'}`;

    const rowsHtml = pages
      .map(
        (p) => `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #E5DFD0;"><strong>${this.esc(p.path)}</strong></td>
        <td style="padding:6px 10px;border-bottom:1px solid #E5DFD0;">${p.status}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E5DFD0;">${p.title ? this.esc(p.title) : '<span style="color:#B42318;">ontbreekt</span>'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E5DFD0;">${p.description ? '✓' : '<span style="color:#B42318;">✗</span>'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E5DFD0;">${ok(!!p.h1)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E5DFD0;">${ok(!!p.canonical)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E5DFD0;">${ok(p.hasJsonLd)}</td>
      </tr>`,
      )
      .join('');

    const analysisHtml = analysis
      .split(/\n{2,}/)
      .map(
        (para) =>
          `<p style="margin:0 0 10px;">${this.esc(para).replace(/\n/g, '<br>')}</p>`,
      )
      .join('');

    const html = `<!DOCTYPE html>
<html lang="nl"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:system-ui,-apple-system,sans-serif;color:#18181B;background:#FAF7F1;">
  <div style="max-width:640px;margin:0 auto;padding:32px 24px;background:#fff;">
    <h1 style="margin:0 0 4px;font-size:20px;color:#1F4A2D;">Vindbaarheid — wekelijks rapport</h1>
    <p style="margin:0 0 20px;color:#6B6F71;font-size:13px;">get-filly.com · AI-zoekmachines, SEO, Google Business &amp; internetvindbaarheid</p>

    <h2 style="font-size:15px;margin:0 0 8px;">Beoordeling &amp; kansen</h2>
    <div style="font-size:14px;line-height:1.55;">${analysisHtml}</div>

    <h2 style="font-size:15px;margin:24px 0 8px;">Google Business</h2>
    <p style="font-size:13px;margin:0;">${this.esc(this.gbpLine(gbp))}</p>

    <h2 style="font-size:15px;margin:24px 0 8px;">Metadata per pagina (SEO)</h2>
    <table style="border-collapse:collapse;width:100%;font-size:13px;">
      <tr style="text-align:left;color:#6B6F71;">
        <th style="padding:6px 10px;">Pagina</th><th style="padding:6px 10px;">HTTP</th>
        <th style="padding:6px 10px;">Title</th><th style="padding:6px 10px;">Descr.</th>
        <th style="padding:6px 10px;">H1</th><th style="padding:6px 10px;">Canon.</th>
        <th style="padding:6px 10px;">JSON-LD</th>
      </tr>
      ${rowsHtml}
    </table>

    <h2 style="font-size:15px;margin:24px 0 8px;">Vindbaarheids-bestanden</h2>
    <ul style="font-size:13px;line-height:1.6;margin:0;padding-left:18px;">
      <li>${fileLine('/llms.txt', files.llms)}</li>
      <li>${fileLine('/robots.txt', files.robots)}</li>
      <li>${fileLine('/sitemap.xml', files.sitemap)}</li>
    </ul>

    <p style="margin:24px 0 0;color:#9A9A9A;font-size:11px;">Automatisch gegenereerd door Filly · wekelijks.</p>
  </div>
</body></html>`;

    const text = [
      'Get-Filly vindbaarheid — wekelijks rapport',
      '',
      'BEOORDELING & KANSEN',
      analysis,
      '',
      `GOOGLE BUSINESS: ${this.gbpLine(gbp)}`,
      '',
      'METADATA PER PAGINA (SEO)',
      ...pages.map(
        (p) =>
          `- ${p.path} (HTTP ${p.status}) title:${p.title ?? 'ontbreekt'} | descr:${ok(!!p.description)} | h1:${ok(!!p.h1)} | canonical:${ok(!!p.canonical)} | json-ld:${ok(p.hasJsonLd)}`,
      ),
      '',
      'BESTANDEN',
      fileLine('/llms.txt', files.llms),
      fileLine('/robots.txt', files.robots),
      fileLine('/sitemap.xml', files.sitemap),
    ].join('\n');

    return { html, text };
  }
}
