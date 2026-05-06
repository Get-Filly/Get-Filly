import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import * as cheerio from 'cheerio';
import type Anthropic from '@anthropic-ai/sdk';
import { AiService } from './ai.service';

// ============================================================
// WebsiteAnalyzerService, "Filly leest je website en vult je profiel"
// ============================================================
// Eigenaar geeft URL → we fetchen de homepage + een handvol interne
// subpagina's → combineren de text → sturen naar Claude met een
// extract-prompt → terug krijgen we een geschat restaurant-profiel.
//
// Bewuste limieten (kosten + ethiek + latency):
//   - Max 10 pagina's (incl. homepage)
//   - Max 20.000 tekens plain-text naar Claude (na strip)
//   - Per fetch max 5 sec timeout
//   - Alleen same-origin subpagina's volgen
//   - Alleen text/html content-type volgen (skip PDFs, images, etc.)
//
// Prioritering van pagina's binnen het domein:
//   Menu / Kaart > Over ons / About > Contact > Home > rest
//   Rationale: menu + over-ons bevatten de meeste toon- en sfeer-signalen.
// ============================================================

export type ExtractedProfile = {
  // Basics
  name?: string;
  type?: string;
  description?: string;
  brand_tone?: 'casual' | 'professional' | 'playful';
  // Locatie
  address?: string;
  postal_code?: string;
  city?: string;
  // Branding & verhaal, voeden account-pagina-secties
  tagline?: string;
  atmosphere?: string;
  target_audience?: string;
  unique_selling_points?: string;
  special_events?: string;
  signature_dishes?: string[];
  cuisine_style?: string[];
  // Korte samenvatting die Filly zelf hergebruikt in chat-context.
  // Max ~300 tekens; anders bloat 't onze prompts overal.
  website_summary?: string;
  // Socials, optioneel, alleen als expliciet in site-HTML
  social_media?: {
    instagram?: string;
    facebook?: string;
    tiktok?: string;
    linkedin?: string;
  };
  // Openingstijden, staan vaak gewoon op horeca-sites en zijn dus
  // goed te extraheren. Format strikt: per dag-key open + close in
  // HH:MM (24-uurs). Dagen die ontbreken = gesloten. Lege object =
  // niet gevonden op de site.
  opening_hours?: Record<string, { open: string; close: string }>;
  // Contact-info uit footer of contact-pagina
  contact_email?: string;
  contact_phone?: string;
  // Juridische naam (vaak in footer: "Bistro X B.V." of "Bistro X V.O.F.")
  legal_name?: string;
  confidence: 'high' | 'medium' | 'low';
  notes?: string;
};

@Injectable()
export class WebsiteAnalyzerService {
  private readonly logger = new Logger(WebsiteAnalyzerService.name);

  // Waar we subpagina-URLs tegen prioriteren. Meer overlap = hogere rank.
  private readonly PRIORITY_KEYWORDS = [
    'menu',
    'kaart',
    'over',
    'about',
    'keuken',
    'team',
    'chef',
    'contact',
    'verhaal',
    'story',
  ];

  private readonly MAX_PAGES = 10;
  private readonly MAX_TOTAL_CHARS = 20_000;
  // Veel restaurant-sites draaien achter Cloudflare/Wix/Squarespace met
  // trage first-paint. 12s is genoeg voor de traagste CDN-cold-start,
  // kort genoeg om de gebruiker niet te laten wachten op een site
  // die er gewoon niet meer is.
  private readonly FETCH_TIMEOUT_MS = 12_000;

  constructor(private readonly ai: AiService) {}

  // Publieke entry-point. Gooit BadRequestException bij ongeldige URL,
  // InternalServerErrorException bij netwerkfouten die we niet zinvol
  // kunnen afhandelen. Geeft altijd een ExtractedProfile terug als de
  // crawl minstens 1 pagina oplevert, Claude vult in wat ie kan.
  async analyze(rawUrl: string): Promise<ExtractedProfile> {
    const startUrl = normalizeUrl(rawUrl);
    if (!startUrl) {
      throw new BadRequestException(
        'Ongeldige URL. Gebruik het volledige adres, bv. https://jouwrestaurant.nl',
      );
    }

    // Stap 1: homepage fetchen. Zonder homepage geen crawl.
    const homepage = await this.fetchPage(startUrl);
    if (!homepage) {
      throw new BadRequestException(
        'Kon de website niet bereiken. Check de URL en probeer nog eens.',
      );
    }

    // Stap 2: subpagina's binnen hetzelfde domein verzamelen.
    const origin = new URL(startUrl).origin;
    const links = extractSameOriginLinks(homepage.html, origin);
    const ranked = rankLinks(links, this.PRIORITY_KEYWORDS);

    // Stap 3: tot MAX_PAGES fetchen (homepage telt mee als 1).
    const pages: Array<{ url: string; text: string }> = [
      { url: startUrl, text: extractText(homepage.html) },
    ];

    for (const url of ranked) {
      if (pages.length >= this.MAX_PAGES) break;
      const page = await this.fetchPage(url);
      if (!page) continue;
      pages.push({ url, text: extractText(page.html) });
    }

    // Stap 4: texts samenvoegen, afkappen op MAX_TOTAL_CHARS. We geven
    // per pagina een label mee zodat Claude context heeft over waar
    // welk stukje vandaan komt ("dit is de menu-pagina, dit is over-ons").
    const combined = pages
      .map(
        (p) =>
          `--- ${p.url} ---\n${p.text.slice(0, 4000)}`, // max ~4k per pagina
      )
      .join('\n\n')
      .slice(0, this.MAX_TOTAL_CHARS);

    // Stap 5: Claude vragen om het profiel te extraheren via tool-use.
    // Het JSON-schema garandeert geldige output, geen JSON.parse-fouten
    // meer op markdown-codeblokken of trailing comma's. Het schema
    // beschrijft alle velden + enum-keuzes voor type/brand_tone/confidence
    // zodat Claude geen verzonnen waarden kan teruggeven.
    const raw = await this.ai.generateStructured<RawProfileFromTool>({
      system: this.buildSystemPrompt(),
      prompt: `URL: ${startUrl}\n\nSite-inhoud (max 20k tekens, mogelijk afgekapt):\n\n${combined}`,
      model: 'claude-sonnet-4-6',
      maxTokens: 1500,
      toolName: 'extract_restaurant_profile',
      toolDescription:
        'Vul het restaurant-profiel in op basis van de meegegeven website-inhoud. Verzin niets, laat velden weg als je ze niet kunt afleiden.',
      inputSchema: WEBSITE_PROFILE_SCHEMA,
      meta: {
        // Pre-onboarding call: user heeft nog geen restaurant-id. Sinds
        // migratie 0012 is ai_usage.restaurant_id nullable, dus deze
        // call wordt correct gelogd als "pre-onboarding".
        restaurantId: null,
        feature: 'analyze_website',
      },
    });

    return coerceProfile(raw);
  }

  // Haal één pagina op met een korte timeout. Retourneert null bij
  // netwerkfout, niet-html content-type, of non-2xx status, dan
  // slaan we die pagina gewoon over en gaan door met de volgende.
  private async fetchPage(
    url: string,
  ): Promise<{ html: string } | null> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.FETCH_TIMEOUT_MS,
    );
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          // User-agent zodat we beleefd herkenbaar zijn in hun server-
          // logs. Sommige sites weigeren default node-fetch.
          'User-Agent':
            'Mozilla/5.0 (compatible; GetFillyBot/1.0; +https://get-filly.com)',
          Accept: 'text/html',
        },
      });
      if (!res.ok) {
        this.logger.debug(`Skip ${url}: HTTP ${res.status}`);
        return null;
      }
      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('text/html')) {
        this.logger.debug(`Skip ${url}: content-type ${contentType}`);
        return null;
      }
      const html = await res.text();
      return { html };
    } catch (err) {
      // Timeout, DNS, connection refused, etc., gewoon skippen.
      this.logger.debug(`Skip ${url}: ${String(err)}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildSystemPrompt(): string {
    return `Je bent Filly. De gebruiker heeft zijn restaurant-website gegeven en jij vult het volledige account-profiel in voor de onboarding.

Je geeft je antwoord via de tool 'extract_restaurant_profile'. Het schema bepaalt de structuur, jij bepaalt de inhoud.

Inhoudsregels:
- ALLES in het Nederlands, ongeacht taal van de site. Keuken- en sfeer-termen vertalen.
- Verzin NIETS. Als je een veld niet kunt afleiden uit de content, laat het weg (gebruik tool-args alleen als je daadwerkelijk iets te zeggen hebt).
- brand_tone:
    * casual = gemoedelijk, buurt-gevoel, toegankelijk
    * professional = verfijnd, strak, hogere prijsklasse
    * playful = speels, creatief, jonger publiek, knipoog
- signature_dishes: alleen ALS er op de site expliciet "onze specialiteit" / "signature" / "huis-" wordt genoemd, of als specifieke gerechten steeds terugkomen. Max 5.
- cuisine_style: lowercase woorden, bv. ["frans", "seizoensgebonden"], ["italiaans", "pizza"], ["nederlands", "brasserie"].
- social_media: alleen URLs of handles die daadwerkelijk op de site linken. Als alleen een algemene ig-link in footer, handle is genoeg.
- website_summary: dit is GEEN marketing-copy maar een interne notitie voor Filly zelf, schrijf zakelijk en feitelijk, max 300 tekens.
- opening_hours:
    * Strict format: per dag een object { "open": "HH:MM", "close": "HH:MM" } in 24-uurs notatie.
    * Voor dagen die op de site als gesloten zijn aangeduid: laat de dag-key WEG.
    * "Half 12" → "11:30". "12u" → "12:00". "vanaf 11u tot middernacht" → "11:00" / "00:00".
    * Bij dubbele openings-blokken (bv. lunch + diner met onderbreking): pak de breedste range.
    * Als de site geen openingstijden noemt: laat het hele opening_hours-object weg.
- contact_email/contact_phone: alleen als ze letterlijk op de site staan, geen gokken op basis van domein.
- legal_name: alleen pakken als je 'm in een footer of "over ons"-pagina ziet staan ("BV", "VOF", "h.o.d.n."). Niet hetzelfde als de gewone restaurant-naam.
- confidence: "low" als je op losse flarden moest gissen, "medium" als het meeste klopte maar je twijfelde op sommige velden, "high" als alles expliciet stond.`;
  }
}

// ============================================================
// JSON-schema voor extract_restaurant_profile (tool-use)
// ============================================================
// De Anthropic API valideert hier op: type-checks, enums (type,
// brand_tone, confidence) en object-shapes. Géén verplichte velden
// behalve confidence, Claude moet altijd zijn eigen onzekerheid
// kunnen aangeven, ook bij een lege site. Pattern-validation voor
// HH:MM doen we pas in coerceProfile (extra defensief).
const WEBSITE_PROFILE_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    type: {
      type: 'string',
      enum: [
        'bistro',
        'brasserie',
        'fine_dining',
        'trattoria',
        'café',
        'bar',
        'hotel_restaurant',
        'event_locatie',
        'anders',
      ],
    },
    description: { type: 'string' },
    brand_tone: {
      type: 'string',
      enum: ['casual', 'professional', 'playful'],
    },
    address: { type: 'string' },
    postal_code: { type: 'string' },
    city: { type: 'string' },
    tagline: { type: 'string' },
    atmosphere: { type: 'string' },
    target_audience: { type: 'string' },
    unique_selling_points: { type: 'string' },
    special_events: { type: 'string' },
    signature_dishes: {
      type: 'array',
      items: { type: 'string' },
    },
    cuisine_style: {
      type: 'array',
      items: { type: 'string' },
    },
    website_summary: { type: 'string' },
    social_media: {
      type: 'object',
      properties: {
        instagram: { type: 'string' },
        facebook: { type: 'string' },
        tiktok: { type: 'string' },
        linkedin: { type: 'string' },
      },
    },
    opening_hours: {
      type: 'object',
      properties: {
        mon: openingDayShape(),
        tue: openingDayShape(),
        wed: openingDayShape(),
        thu: openingDayShape(),
        fri: openingDayShape(),
        sat: openingDayShape(),
        sun: openingDayShape(),
      },
    },
    contact_email: { type: 'string' },
    contact_phone: { type: 'string' },
    legal_name: { type: 'string' },
    confidence: {
      type: 'string',
      enum: ['low', 'medium', 'high'],
    },
    notes: { type: 'string' },
  },
  required: ['confidence'],
} as const satisfies Anthropic.Tool.InputSchema;

function openingDayShape() {
  return {
    type: 'object' as const,
    properties: {
      open: { type: 'string' as const },
      close: { type: 'string' as const },
    },
    required: ['open', 'close'] as const,
  };
}

// Wat Claude via tool-use teruggeeft, alle velden optioneel,
// behalve confidence. Identiek aan ExtractedProfile maar met
// tussenstap zodat we expliciet maken dat dit nog ruwe data is.
type RawProfileFromTool = Partial<ExtractedProfile> & {
  confidence: ExtractedProfile['confidence'];
};

// ============================================================
// Helpers
// ============================================================

// Normaliseer input: voeg https:// toe als geen protocol, parse.
// Retourneert null bij onbruikbare input.
function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const u = new URL(withProtocol);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    // Strip hash fragments, die hebben geen server-content.
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

// Vind alle same-origin links in de HTML, dedupe, skip query strings
// die duidelijk tracking-noise zijn (utm_, gclid, fbclid).
function extractSameOriginLinks(html: string, origin: string): string[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const links: string[] = [];

  $('a[href]').each((_, el) => {
    const raw = $(el).attr('href') ?? '';
    if (!raw || raw.startsWith('#') || raw.startsWith('mailto:') ||
        raw.startsWith('tel:') || raw.startsWith('javascript:')) {
      return;
    }
    try {
      const abs = new URL(raw, origin);
      if (abs.origin !== origin) return; // cross-origin
      // Strip hash + tracking-params zodat we geen duplicaten
      // oppikken die feitelijk dezelfde pagina zijn.
      abs.hash = '';
      const params = abs.searchParams;
      for (const key of Array.from(params.keys())) {
        if (/^(utm_|gclid|fbclid|ref|source)/i.test(key)) {
          params.delete(key);
        }
      }
      const clean = abs.toString();
      if (!seen.has(clean) && clean !== origin + '/') {
        seen.add(clean);
        links.push(clean);
      }
    } catch {
      // Ongeldige URL → skip.
    }
  });

  return links;
}

// Rang-orden links op basis van prioriteits-keywords in path.
// Links met 'menu' of 'over' komen eerst; rest daarna.
function rankLinks(links: string[], priorityKeywords: string[]): string[] {
  return [...links].sort((a, b) => {
    const scoreA = priorityScore(a, priorityKeywords);
    const scoreB = priorityScore(b, priorityKeywords);
    return scoreB - scoreA;
  });
}

function priorityScore(url: string, keywords: string[]): number {
  const lower = url.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) score += 1;
  }
  return score;
}

// Strip alle HTML, scripts, styles, nav en footer. Wat overblijft
// is de inhoudelijke tekst waar Claude iets aan heeft.
function extractText(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, noscript, nav, footer, header svg, iframe').remove();
  const text = $('body').text() ?? '';
  // Normaliseer whitespace: meerdere spaties/tabs/newlines → 1 spatie
  // voor spaties binnen regel, maar houd paragraaf-breaks enigszins
  // herkenbaar zodat Claude context heeft.
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

// Tool-use garandeert al dat we een gevalideerd JSON-object krijgen.
// Wat we hier nog wél doen: lege strings → undefined coercen (Claude
// stuurt soms `""` ondanks instructie), HH:MM-format-validatie op
// opening_hours (schema kent geen pattern-validation cross-day) en
// website_summary cap op 400 tekens als safety-net.
function coerceProfile(raw: RawProfileFromTool): ExtractedProfile {
  return {
    name: trimToUndefined(raw.name),
    type: trimToUndefined(raw.type),
    description: trimToUndefined(raw.description),
    brand_tone: raw.brand_tone,
    address: trimToUndefined(raw.address),
    postal_code: trimToUndefined(raw.postal_code),
    city: trimToUndefined(raw.city),
    tagline: trimToUndefined(raw.tagline),
    atmosphere: trimToUndefined(raw.atmosphere),
    target_audience: trimToUndefined(raw.target_audience),
    unique_selling_points: trimToUndefined(raw.unique_selling_points),
    special_events: trimToUndefined(raw.special_events),
    signature_dishes: cleanStringArray(raw.signature_dishes),
    cuisine_style: cleanStringArray(raw.cuisine_style),
    website_summary: trimToUndefined(raw.website_summary)?.slice(0, 400),
    social_media: cleanSocialMedia(raw.social_media),
    opening_hours: validateOpeningHours(raw.opening_hours),
    contact_email: trimToUndefined(raw.contact_email),
    contact_phone: trimToUndefined(raw.contact_phone),
    legal_name: trimToUndefined(raw.legal_name),
    confidence: raw.confidence,
    notes: trimToUndefined(raw.notes),
  };
}

// Lege string of niet-string → undefined. Tool-use forceert het type
// al, maar Claude levert nog steeds soms `""` voor "ik weet 't niet".
function trimToUndefined(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

// Filter lege strings + duplicaten uit een array. Schema garandeert
// het type al, maar lege strings haal je het beste alsnog weg.
function cleanStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const cleaned = v
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
  return cleaned.length > 0 ? cleaned : undefined;
}

function cleanSocialMedia(
  v: unknown,
): ExtractedProfile['social_media'] | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const out: NonNullable<ExtractedProfile['social_media']> = {};
  const keys: Array<keyof NonNullable<ExtractedProfile['social_media']>> = [
    'instagram',
    'facebook',
    'tiktok',
    'linkedin',
  ];
  for (const k of keys) {
    const val = trimToUndefined(o[k]);
    if (val) out[k] = val;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

// HH:MM-validatie als safety-net. Schema kent geen pattern-property,
// dus dagen die niet kloppen filteren we hier weg ipv halve data
// door te sluizen naar de DB.
function validateOpeningHours(
  v: unknown,
): ExtractedProfile['opening_hours'] | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const validDays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
  const out: Record<string, { open: string; close: string }> = {};

  for (const day of validDays) {
    const entry = o[day];
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const open = typeof e.open === 'string' ? e.open.trim() : '';
    const close = typeof e.close === 'string' ? e.close.trim() : '';
    if (!HHMM.test(open) || !HHMM.test(close)) continue;
    out[day] = { open, close };
  }

  return Object.keys(out).length > 0 ? out : undefined;
}
