/**
 * ============================================================
 * UTM-helper: bouwt consistent-getagde tracking-URLs
 * ============================================================
 *
 * Bron-van-waarheid voor de UTM-naming-conventie uit filly-brein
 * hoofdstuk 14.1. Alle links die Filly genereert (in mail-bodies, in
 * GBP-posts, in WhatsApp-berichten, etc.) moeten via deze helper om
 * GA4/Plausible-data leesbaar te houden.
 *
 * Vaste structuur:
 *   utm_source   = kanaal (mail / instagram / facebook / tiktok /
 *                          whatsapp / google_business)
 *   utm_medium   = format (feed / reels / stories / post / event /
 *                          dm / newsletter / etc.)
 *   utm_campaign = campagne-slug (kebab-case, max 64 chars)
 *   utm_content  = variant-id of slug ("variant-2", "signature-photo")
 *   utm_term     = alleen bij betaalde search ads (keyword)
 *
 * Voorbeeld:
 *   buildUtmUrl('https://bistro-x.nl/reserveren', {
 *     source: 'mail',
 *     medium: 'newsletter',
 *     campaign: 'moederdag-2026',
 *     content: 'variant-2',
 *   })
 *   → https://bistro-x.nl/reserveren?utm_source=mail&utm_medium=newsletter
 *     &utm_campaign=moederdag-2026&utm_content=variant-2
 *
 * Robust against:
 *   - URLs met bestaande query-params (we mergen, niet overschrijven)
 *   - URLs met fragment (anchor blijft achteraan)
 *   - Spaces / hoofdletters / accenten in slug-velden (kebab-case-helper)
 *   - Lege/null waarden (worden niet meegestuurd)
 */

/** Kanaal-conventies, matching filly-brain.config FillyChannel. */
export type UtmSource =
  | 'mail'
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'whatsapp'
  | 'google_business';

export interface UtmParams {
  source: UtmSource;
  medium: string;
  campaign: string;
  /** Bv. 'variant-1' / 'signature-dish-photo'. Optioneel. */
  content?: string;
  /** Alleen voor betaalde search-ads. Optioneel. */
  term?: string;
}

/**
 * Bouw een tracking-URL met UTM-parameters. Geeft de baseUrl
 * onveranderd terug als de baseUrl niet parseerbaar is (defensief).
 */
export function buildUtmUrl(baseUrl: string, params: UtmParams): string {
  if (!baseUrl || typeof baseUrl !== 'string') return baseUrl;

  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    // Ongeldige URL → return onveranderd. De caller (Filly's tekst-
    // generation) krijgt geen kapotte link maar de oorspronkelijke
    // string terug.
    return baseUrl;
  }

  // Source + medium + campaign zijn altijd verplicht. Slugify ze.
  url.searchParams.set('utm_source', params.source);
  url.searchParams.set('utm_medium', slugify(params.medium));
  url.searchParams.set('utm_campaign', slugify(params.campaign));

  if (params.content && params.content.trim().length > 0) {
    url.searchParams.set('utm_content', slugify(params.content));
  }
  if (params.term && params.term.trim().length > 0) {
    url.searchParams.set('utm_term', slugify(params.term));
  }

  return url.toString();
}

/**
 * Converteer een vrije string naar kebab-case slug:
 *   "Moederdag 2026 — Brunch!" → "moederdag-2026-brunch"
 *   "Filly's Signature Dish"  → "fillys-signature-dish"
 *
 * Strip accenten via NFD-normalisatie, lower-case, vervang niet-
 * alfanumerieke chars door koppeltekens, collaps multi-dash. Max 64
 * tekens om URL-lengte beheersbaar te houden (sommige mail-clients
 * truncaten lange URLs).
 */
export function slugify(input: string): string {
  if (!input) return '';
  return (
    input
      .normalize('NFD')
      // Strip combining diacritical marks (accenten).
      // eslint-disable-next-line no-misleading-character-class
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64)
  );
}

/**
 * Bouw de utm_medium-waarde op basis van kanaal + format. Conform
 * filly-brein hoofdstuk 14.1.
 *
 *   defaultMedium('mail')              → 'newsletter'
 *   defaultMedium('instagram', 'reel') → 'reels'
 *   defaultMedium('whatsapp')          → 'dm'
 */
export function defaultMedium(
  source: UtmSource,
  format?: string,
): string {
  if (format) return slugify(format);
  switch (source) {
    case 'mail':
      return 'newsletter';
    case 'instagram':
      return 'feed';
    case 'facebook':
      return 'post';
    case 'tiktok':
      return 'video';
    case 'whatsapp':
      return 'dm';
    case 'google_business':
      return 'post-update';
  }
}

/**
 * Tag alle URLs in een tekst- of HTML-body met UTM-parameters. Idempotent:
 * URLs die al een utm_source hebben blijven onveranderd zodat we geen
 * dubbele tagging krijgen wanneer Filly's gegenereerde body een externe
 * link bevat die al getracked wordt.
 *
 * Gebruik in MailService bij send-time, niet bij generatie — zo zijn de
 * UTMs altijd consistent met de actuele campaign-naam, ook na rename
 * of varianten-switch.
 */
export function addUtmToAllLinks(body: string, params: UtmParams): string {
  if (!body) return body;
  // Match http(s)-URLs tot whitespace, quote, gt-bracket of close-paren.
  // Dat dekt zowel HTML href="..." (stopt bij ") als markdown-style
  // (link) en plain-text URLs.
  const urlRegex = /https?:\/\/[^\s"'<>)]+/gi;
  return body.replace(urlRegex, (match) => {
    if (/[?&]utm_source=/i.test(match)) return match;
    return buildUtmUrl(match, params);
  });
}

/**
 * Parser-helper: leest UTM-parameters uit een URL terug. Handig voor
 * de attributie-hook op de reservation-page die de UTMs uit de URL
 * haalt en aan `reservations.via_campaign_id` koppelt.
 */
export function parseUtmFromUrl(url: string): Partial<UtmParams> | null {
  try {
    const u = new URL(url);
    const source = u.searchParams.get('utm_source') as UtmSource | null;
    const medium = u.searchParams.get('utm_medium');
    const campaign = u.searchParams.get('utm_campaign');
    if (!source && !medium && !campaign) return null;
    return {
      source: source ?? undefined,
      medium: medium ?? undefined,
      campaign: campaign ?? undefined,
      content: u.searchParams.get('utm_content') ?? undefined,
      term: u.searchParams.get('utm_term') ?? undefined,
    } as Partial<UtmParams>;
  } catch {
    return null;
  }
}
