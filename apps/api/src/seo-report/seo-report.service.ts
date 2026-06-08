import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { MailService } from '../mail/mail.service';

// ============================================================
// SeoReportService — wekelijks AI-vindbaarheid-rapport
// ============================================================
// Audit van ONZE eigen site (get-filly.com): per kernpagina de
// belangrijkste metadata + de drie vindbaarheids-bestanden
// (llms.txt / robots / sitemap). Daarna een korte Claude-analyse
// "hoe goed worden we gevonden in AI-zoekmachines + wat kan beter",
// en het geheel als e-mail naar info@get-filly.com.
//
// Bewust lean (parallelle fetches + 1 beknopte Claude-call) i.v.m.
// de 10s-functielimiet op Vercel.

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
  ogImage: boolean;
  hasJsonLd: boolean;
};

type FileChecks = { llms: number; robots: number; sitemap: number };

@Injectable()
export class SeoReportService {
  private readonly logger = new Logger(SeoReportService.name);

  constructor(
    private readonly ai: AiService,
    private readonly mail: MailService,
  ) {}

  private firstMatch(html: string, re: RegExp): string | null {
    const m = html.match(re);
    return m && m[1] ? m[1].trim() : null;
  }

  private async auditPage(path: string): Promise<PageAudit> {
    try {
      const res = await fetch(`${SITE}${path}`, { redirect: 'follow' });
      const html = res.ok ? await res.text() : '';
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

  /** Draait de audit, vraagt Claude om analyse en mailt het rapport. */
  async runAndSend(): Promise<{ ok: true }> {
    const [pages, llms, robots, sitemap] = await Promise.all([
      Promise.all(PAGES.map((p) => this.auditPage(p))),
      this.checkStatus('/llms.txt'),
      this.checkStatus('/robots.txt'),
      this.checkStatus('/sitemap.xml'),
    ]);
    const files: FileChecks = { llms, robots, sitemap };

    // Korte Claude-analyse. Fail-soft: zonder analyse mailen we toch
    // de feiten, zodat een AI-storing het rapport niet blokkeert.
    let analysis: string;
    try {
      analysis = await this.ai.generateText({
        system:
          'Je bent een SEO/GEO-specialist. Je beoordeelt hoe goed een SaaS-website ' +
          'vindbaar is in AI-zoekmachines (ChatGPT, Perplexity, Google AI Overviews, ' +
          'Gemini) én klassieke zoekmachines. Antwoord in het Nederlands, bondig en ' +
          'actiegericht — dit gaat als interne e-mail uit.',
        prompt:
          `Actuele staat van get-filly.com:\n\n${this.buildFacts(pages, files)}\n\n` +
          'Geef:\n' +
          '1. Een korte beoordeling met een score (x/10) van onze huidige ' +
          'AI-vindbaarheid + 1-2 zinnen waarom.\n' +
          '2. De 3 tot 5 belangrijkste concrete verbeterkansen voor deze week, ' +
          'elk op één regel, gesorteerd op impact.\n' +
          'Hou het kort genoeg voor een e-mail.',
        // Haiku: snel (blijft binnen de 10s-functielimiet) + goedkoop
        // voor een wekelijkse job; ruim voldoende voor deze analyse.
        model: 'claude-haiku-4-5-20251001',
        maxTokens: 700,
        meta: { restaurantId: null, feature: 'seo_weekly_audit' },
      });
    } catch (err) {
      this.logger.warn(`Claude-analyse faalde: ${String(err)}`);
      analysis =
        '(AI-analyse kon deze week niet worden gegenereerd — zie de feiten hieronder.)';
    }

    const { html, text } = this.buildEmail(pages, files, analysis);
    await this.mail.sendSeoReport(
      'Get-Filly vindbaarheid — wekelijks rapport',
      html,
      text,
    );
    this.logger.log('Wekelijks vindbaarheid-rapport verstuurd.');
    return { ok: true };
  }

  // Compacte feiten-tekst voor de Claude-prompt.
  private buildFacts(pages: PageAudit[], files: FileChecks): string {
    const lines = pages.map(
      (p) =>
        `- ${p.path} (HTTP ${p.status}): title="${p.title ?? '—'}" | description="${p.description ?? '—'}" | canonical=${p.canonical ?? '—'} | og:image=${p.ogImage ? 'ja' : 'nee'} | JSON-LD=${p.hasJsonLd ? 'ja' : 'nee'}`,
    );
    lines.push(
      `- /llms.txt: HTTP ${files.llms} | /robots.txt: HTTP ${files.robots} | /sitemap.xml: HTTP ${files.sitemap}`,
    );
    return lines.join('\n');
  }

  private esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private buildEmail(
    pages: PageAudit[],
    files: FileChecks,
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
    <p style="margin:0 0 20px;color:#6B6F71;font-size:13px;">get-filly.com · AI-zoekmachines &amp; SEO</p>

    <h2 style="font-size:15px;margin:0 0 8px;">Kansen &amp; beoordeling</h2>
    <div style="font-size:14px;line-height:1.55;">${analysisHtml}</div>

    <h2 style="font-size:15px;margin:24px 0 8px;">Metadata per pagina</h2>
    <table style="border-collapse:collapse;width:100%;font-size:13px;">
      <tr style="text-align:left;color:#6B6F71;">
        <th style="padding:6px 10px;">Pagina</th><th style="padding:6px 10px;">HTTP</th>
        <th style="padding:6px 10px;">Title</th><th style="padding:6px 10px;">Descr.</th>
        <th style="padding:6px 10px;">Canon.</th><th style="padding:6px 10px;">JSON-LD</th>
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
      'KANSEN & BEOORDELING',
      analysis,
      '',
      'METADATA PER PAGINA',
      ...pages.map(
        (p) =>
          `- ${p.path} (HTTP ${p.status}) title:${p.title ?? 'ontbreekt'} | descr:${ok(!!p.description)} | canonical:${ok(!!p.canonical)} | json-ld:${ok(p.hasJsonLd)}`,
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
