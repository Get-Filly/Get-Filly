import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
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
  // Toon-tab: schrijfstijl + merkverhaal. (do_not_mention NIET hier —
  // dat is een eigenaar-instructie 'wat NIET zeggen', niet uit een
  // website af te leiden.)
  tone_of_voice?: string;
  brand_story?: string;
  // SEO-tab: zoekwoorden + standaard-hashtags voor posts.
  keywords?: string[];
  default_hashtags?: string[];
  // Basis-tab: locatie-omschrijving (buurt/ligging) + prijzen/awards.
  location_description?: string;
  awards?: string[];
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
  // Redirects volgen we handmatig (zie fetchPage) zodat we elke hop
  // tegen de SSRF-blocklist kunnen checken. Cap om redirect-loops te
  // stoppen.
  private readonly MAX_REDIRECTS = 4;
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
  //
  // SSRF-bescherming: we volgen redirects HANDMATIG (redirect: 'manual')
  // en checken iedere hop tegen assertPublicUrl. Een op het oog publieke
  // URL kan immers 302'en naar localhost / 169.254.169.254 (cloud-
  // metadata) / een interne range. Zonder deze check zou een ingelogde
  // gebruiker onze server interne endpoints laten ophalen en de inhoud
  // via Claude terugkrijgen.
  private async fetchPage(
    url: string,
  ): Promise<{ html: string } | null> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.FETCH_TIMEOUT_MS,
    );
    try {
      let currentUrl = url;
      for (let hop = 0; hop <= this.MAX_REDIRECTS; hop++) {
        // Resolve de hostname en weiger niet-publieke adressen vóór we
        // verbinden. Bij elke redirect-hop opnieuw (de redirect-target
        // is door de bron-server gekozen, niet door ons).
        const isPublic = await assertPublicUrl(currentUrl);
        if (!isPublic) {
          this.logger.warn(
            `Skip ${currentUrl}: niet-publiek adres geblokkeerd (SSRF-guard)`,
          );
          return null;
        }
        const res = await fetch(currentUrl, {
          signal: controller.signal,
          redirect: 'manual',
          headers: {
            // User-agent zodat we beleefd herkenbaar zijn in hun server-
            // logs. Sommige sites weigeren default node-fetch.
            'User-Agent':
              'Mozilla/5.0 (compatible; GetFillyBot/1.0; +https://get-filly.com)',
            Accept: 'text/html',
          },
        });
        // Redirect: pak de Location, maak 'm absoluut en check 'm opnieuw.
        if (res.status >= 300 && res.status < 400) {
          const location = res.headers.get('location');
          if (!location) {
            this.logger.debug(`Skip ${currentUrl}: redirect zonder Location`);
            return null;
          }
          try {
            currentUrl = new URL(location, currentUrl).toString();
          } catch {
            this.logger.debug(`Skip ${currentUrl}: ongeldige redirect-target`);
            return null;
          }
          continue;
        }
        if (!res.ok) {
          this.logger.debug(`Skip ${currentUrl}: HTTP ${res.status}`);
          return null;
        }
        const contentType = res.headers.get('content-type') ?? '';
        if (!contentType.includes('text/html')) {
          this.logger.debug(`Skip ${currentUrl}: content-type ${contentType}`);
          return null;
        }
        const html = await res.text();
        return { html };
      }
      this.logger.debug(`Skip ${url}: te veel redirects`);
      return null;
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
- tone_of_voice: beschrijf de schrijfstijl/merkstem in 1-2 zinnen zoals Filly die moet aanhouden, bv. "Warm en persoonlijk, je-vorm, met een vleugje humor. Niet formeel." Leid dit af uit hoe de site zelf schrijft.
- brand_story: kort het oorsprong-/merkverhaal als de site daar iets over zegt (sinds-jaar, familiebedrijf, missie, chef-achtergrond). Max ~300 tekens. Niets op de site hierover → weglaten.
- keywords: 5-10 SEO-zoekwoorden waarop deze zaak gevonden wil worden, afgeleid uit keuken + locatie + gerechten, bv. ["italiaans restaurant utrecht", "verse pasta", "wijnbar centrum"]. Lowercase.
- default_hashtags: 3-6 social-hashtags passend bij de zaak, met #, bv. ["#bistroutrecht", "#seizoensküche", "#wijnliefhebber"].
- location_description: korte omschrijving van ligging/buurt als de site dat noemt, bv. "In het hart van de Utrechtse binnenstad, aan de gracht."
- awards: prijzen/onderscheidingen die letterlijk op de site staan ("Bib Gourmand", "beste van 2023"). Niets gevonden → weglaten.
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
    // Toon-tab — schrijfstijl + merkverhaal afgeleid uit de site-teksten.
    tone_of_voice: { type: 'string' },
    brand_story: { type: 'string' },
    // SEO-tab — zoekwoorden + hashtags op basis van keuken, locatie,
    // gerechten en sfeer.
    keywords: {
      type: 'array',
      items: { type: 'string' },
    },
    default_hashtags: {
      type: 'array',
      items: { type: 'string' },
    },
    // Basis-tab — ligging/buurt + eventuele prijzen of onderscheidingen.
    location_description: { type: 'string' },
    awards: {
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

// SSRF-guard: is dit een URL die we veilig mogen ophalen? We resolven
// de hostname naar IP('s) en weigeren loopback / private / link-local /
// CGNAT / multicast / cloud-metadata-adressen. Een IP-literal wordt
// direct gecheckt. Niet-resolvebare hosts volgen we ook niet.
//
// Caveat: tussen deze DNS-lookup en de daadwerkelijke fetch-connectie
// zit een (kleine) TOCTOU-race (DNS-rebinding). Voor volledige dichtheid
// zou je op het gevalideerde IP moeten pinnen; dat kan Node's fetch niet
// zonder een custom agent. Deze check dekt de praktische SSRF-vectoren
// (directe interne URL + redirect naar intern) af.
async function assertPublicUrl(rawUrl: string): Promise<boolean> {
  let hostname: string;
  try {
    hostname = new URL(rawUrl).hostname;
  } catch {
    return false;
  }
  // Strip IPv6-brackets: "[::1]" → "::1".
  const host = hostname.replace(/^\[/, '').replace(/\]$/, '');
  if (!host) return false;

  // Host is al een IP-literal → direct checken, geen DNS nodig.
  if (isIP(host)) {
    return !isPrivateIp(host);
  }

  // Hostname → resolve alle adressen en weiger als er ook maar één
  // niet-publiek is.
  try {
    const addrs = await lookup(host, { all: true });
    if (addrs.length === 0) return false;
    return addrs.every((a) => !isPrivateIp(a.address));
  } catch {
    // Niet te resolven → niet volgen.
    return false;
  }
}

// Valt dit IP binnen een niet-publieke / gereserveerde range?
function isPrivateIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPrivateIpv4(ip);
  if (family === 6) return isPrivateIpv6(ip);
  return true; // onbekend formaat → veiligheidshalve blokkeren
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p));
  if (
    parts.length !== 4 ||
    parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  ) {
    return true; // ongeldig → blokkeren
  }
  const [a, b, c] = parts;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 IETF
  if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return true; // 192.88.99.0/24 6to4 relay
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmark
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 TEST-NET-3
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true; // loopback / unspecified
  // IPv4-mapped (::ffff:1.2.3.4) → check het ingebedde v4-adres.
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(lower);
  if (mapped) return isPrivateIpv4(mapped[1]);
  const firstHextet = parseInt(lower.split(':')[0] || '0', 16);
  if (firstHextet >= 0xfc00 && firstHextet <= 0xfdff) return true; // fc00::/7 ULA
  if (firstHextet >= 0xfe80 && firstHextet <= 0xfebf) return true; // fe80::/10 link-local
  if (firstHextet >= 0xff00) return true; // ff00::/8 multicast
  return false;
}

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
    tone_of_voice: trimToUndefined(raw.tone_of_voice),
    brand_story: trimToUndefined(raw.brand_story)?.slice(0, 400),
    keywords: cleanStringArray(raw.keywords),
    default_hashtags: cleanStringArray(raw.default_hashtags),
    location_description: trimToUndefined(raw.location_description),
    awards: cleanStringArray(raw.awards),
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
