import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import * as cheerio from 'cheerio';
import { AiService } from './ai.service';

// ============================================================
// WebsiteAnalyzerService — "Filly leest je website en vult je profiel"
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
  // Branding & verhaal — voeden account-pagina-secties
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
  // Socials — optioneel, alleen als expliciet in site-HTML
  social_media?: {
    instagram?: string;
    facebook?: string;
    tiktok?: string;
    linkedin?: string;
  };
  // Openingstijden — staan vaak gewoon op horeca-sites en zijn dus
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
  // crawl minstens 1 pagina oplevert — Claude vult in wat ie kan.
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

    // Stap 5: Claude vragen om het profiel te extraheren als JSON.
    const raw = await this.ai.generateText({
      system: this.buildSystemPrompt(),
      prompt: `URL: ${startUrl}\n\nSite-inhoud (max 20k tekens, mogelijk afgekapt):\n\n${combined}`,
      model: 'claude-sonnet-4-6',
      maxTokens: 800,
      // Pre-onboarding call: user heeft nog geen restaurant, dus we
      // kunnen niet in ai_usage loggen (restaurant_id is NOT NULL).
      // Scope op de user zelf, met een speciale "pre_onboarding"-marker
      // zodat we 't in de logs kunnen herkennen zodra we de kolom
      // nullable hebben gemaakt. Voor nu: geen DB-log, alleen console.
      meta: {
        // Pre-onboarding call: user heeft nog geen restaurant-id. Sinds
        // migratie 0012 is ai_usage.restaurant_id nullable, dus deze
        // call wordt correct gelogd als "pre-onboarding".
        restaurantId: null,
        feature: 'analyze_website',
      },
    });

    return parseProfile(raw);
  }

  // Haal één pagina op met een korte timeout. Retourneert null bij
  // netwerkfout, niet-html content-type, of non-2xx status — dan
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
      // Timeout, DNS, connection refused, etc. — gewoon skippen.
      this.logger.debug(`Skip ${url}: ${String(err)}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildSystemPrompt(): string {
    return `Je bent Filly. De gebruiker heeft zijn restaurant-website gegeven en jij vult het volledige account-profiel in voor de onboarding.

Geef ALLEEN een JSON-object terug zonder uitleg, zonder markdown-codeblok eromheen. Gebruik deze exacte keys (leeg laten mag als je iets niet kunt afleiden):

{
  "name": "<naam van het restaurant>",
  "type": "<een van: bistro, brasserie, fine_dining, trattoria, café, bar, hotel_restaurant, event_locatie, anders>",
  "description": "<2-4 zinnen NL over de zaak: wat is het, wat maakt het bijzonder>",
  "brand_tone": "<casual | professional | playful>",

  "address": "<straat + huisnummer>",
  "postal_code": "<postcode>",
  "city": "<stad>",

  "tagline": "<korte pay-off / slagzin, max 10 woorden>",
  "atmosphere": "<1-2 zinnen NL over sfeer en interieur>",
  "target_audience": "<1-2 zinnen NL over voor wie dit restaurant is>",
  "unique_selling_points": "<puntsgewijs of komma-gescheiden: 3-5 dingen die deze zaak onderscheiden>",
  "special_events": "<evenementen of terugkerende concepten: wijnavonden, live muziek, brunches, etc. Leeg als niet genoemd.>",

  "signature_dishes": ["<gerecht>", "<gerecht>", "<gerecht>"],
  "cuisine_style": ["<keukenstijl>", "<keukenstijl>"],

  "website_summary": "<max 300 tekens NL samenvatting die Filly zelf later hergebruikt als context bij het schrijven van campagnes>",

  "social_media": {
    "instagram": "<handle of URL als je 't vindt>",
    "facebook": "<handle of URL>",
    "tiktok": "<handle of URL>",
    "linkedin": "<handle of URL>"
  },

  "opening_hours": {
    "mon": { "open": "<HH:MM>", "close": "<HH:MM>" },
    "tue": { "open": "<HH:MM>", "close": "<HH:MM>" },
    "wed": { "open": "<HH:MM>", "close": "<HH:MM>" },
    "thu": { "open": "<HH:MM>", "close": "<HH:MM>" },
    "fri": { "open": "<HH:MM>", "close": "<HH:MM>" },
    "sat": { "open": "<HH:MM>", "close": "<HH:MM>" },
    "sun": { "open": "<HH:MM>", "close": "<HH:MM>" }
  },

  "contact_email": "<info@... als je 't ziet, anders weglaten>",
  "contact_phone": "<vast of mobiel, format zoals op site, anders weglaten>",
  "legal_name": "<juridische bedrijfsnaam zoals 'Bistro X B.V.' of 'Bistro X V.O.F.', alleen als je die letterlijk vindt>",

  "confidence": "<high | medium | low>",
  "notes": "<wat miste je, wat is onzeker>"
}

Harde regels:
- ALLES in het Nederlands, ongeacht taal van de site. Keuken- en sfeer-termen vertalen.
- Verzin NIETS. Als je een veld niet kunt afleiden uit de content, laat het leeg (lege string, lege array, weglaten) — liever niks dan bluf.
- brand_tone:
    * casual = gemoedelijk, buurt-gevoel, toegankelijk
    * professional = verfijnd, strak, hogere prijsklasse
    * playful = speels, creatief, jonger publiek, knipoog
- signature_dishes: alleen ALS er op de site expliciet "onze specialiteit" / "signature" / "huis-" wordt genoemd, of als specifieke gerechten steeds terugkomen. Max 5.
- cuisine_style: lowercase woorden, bv. ["frans", "seizoensgebonden"], ["italiaans", "pizza"], ["nederlands", "brasserie"].
- social_media: alleen URLs of handles die daadwerkelijk op de site linken. Als alleen een algemene ig-link in footer, handle is genoeg.
- website_summary: dit is GEEN marketing-copy maar een interne notitie voor Filly zelf — schrijf zakelijk en feitelijk, max 300 tekens.
- opening_hours:
    * Strict format: per dag een object { "open": "HH:MM", "close": "HH:MM" } in 24-uurs notatie.
    * Voor dagen die op de site als gesloten zijn aangeduid: laat de dag-key WEG (niet { "open":"", "close":"" } sturen).
    * "Half 12" → "11:30". "12u" → "12:00". "vanaf 11u tot middernacht" → "11:00" / "00:00".
    * Bij dubbele openings-blokken (bv. lunch + diner met onderbreking): pak de breedste range (eerste open → laatste close).
    * Als de site geen openingstijden noemt: laat het hele opening_hours-object weg.
- contact_email/contact_phone: alleen als ze letterlijk op de site staan, geen gokken op basis van domein.
- legal_name: alleen pakken als je 'm in een footer of "over ons"-pagina ziet staan ("BV", "VOF", "h.o.d.n."). Niet hetzelfde als de gewone restaurant-naam.
- confidence: "low" als je op losse flarden moest gissen, "medium" als het meeste klopte maar je twijfelde op sommige velden, "high" als alles expliciet stond.`;
  }
}

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
    // Strip hash fragments — die hebben geen server-content.
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

// Claude retourneert JSON als string — parse veilig. Bij malformed
// JSON vallen we terug op een lege profile met confidence="low".
function parseProfile(raw: string): ExtractedProfile {
  const trimmed = raw.trim();
  // Soms komt Claude met ```json ... ``` ondanks de prompt-instructie.
  // Strip dat eerst: pak het grootste {...}-blok.
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { confidence: 'low', notes: 'Geen JSON gevonden in AI-respons.' };
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    return {
      name: asTrimmedString(parsed.name),
      type: asTrimmedString(parsed.type),
      description: asTrimmedString(parsed.description),
      brand_tone: asBrandTone(parsed.brand_tone),
      address: asTrimmedString(parsed.address),
      postal_code: asTrimmedString(parsed.postal_code),
      city: asTrimmedString(parsed.city),
      tagline: asTrimmedString(parsed.tagline),
      atmosphere: asTrimmedString(parsed.atmosphere),
      target_audience: asTrimmedString(parsed.target_audience),
      unique_selling_points: asTrimmedString(parsed.unique_selling_points),
      special_events: asTrimmedString(parsed.special_events),
      signature_dishes: asStringArray(parsed.signature_dishes),
      cuisine_style: asStringArray(parsed.cuisine_style),
      website_summary: asTrimmedString(parsed.website_summary)?.slice(0, 400),
      social_media: asSocialMedia(parsed.social_media),
      opening_hours: asOpeningHours(parsed.opening_hours),
      contact_email: asTrimmedString(parsed.contact_email),
      contact_phone: asTrimmedString(parsed.contact_phone),
      legal_name: asTrimmedString(parsed.legal_name),
      confidence:
        parsed.confidence === 'high' || parsed.confidence === 'medium'
          ? parsed.confidence
          : 'low',
      notes: asTrimmedString(parsed.notes),
    };
  } catch (err) {
    throw new InternalServerErrorException(
      `Kon Filly's antwoord niet lezen: ${String(err)}`,
    );
  }
}

// Kleine type-coercers om de parsed JSON defensief in te dikken.
// Claude kan een leeg array terugstuuren als "[]" of een lege string —
// wij normaliseren allemaal naar undefined zodat caller één check doet.
function asTrimmedString(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

function asBrandTone(v: unknown): ExtractedProfile['brand_tone'] {
  if (v === 'casual' || v === 'professional' || v === 'playful') return v;
  return undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const cleaned = v
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
  return cleaned.length > 0 ? cleaned : undefined;
}

function asSocialMedia(
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
    const val = asTrimmedString(o[k]);
    if (val) out[k] = val;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

// Strikte validatie van openings-uren. Claude moet HH:MM in 24-uurs
// notatie aanleveren — alles wat daarvan afwijkt gooien we weg in
// plaats van halve data door te schuiven naar de DB. Dagen zonder
// geldige open+close worden uitgefilterd zodat de UI later "Gesloten"
// toont voor die dag.
function asOpeningHours(
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
