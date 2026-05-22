// ============================================================
// Gedeelde types + helpers voor de campagne-detail-componenten
// ============================================================
//
// Per 2026-05-13 extract uit voorstel/[id]/page.tsx. Reden: de
// concept-detail (campagnes/[id]) gaat dezelfde building-blocks
// gebruiken zodat de UX consistent is over de 4 statussen
// (Voorstel/Concept/Ingepland/Actief). Door types + label-maps
// + format-helpers hier te centraliseren voorkomen we drift
// tussen de twee detail-pagina's.
//
// LET OP: dit is STAP 1 — extract zonder gedragsverandering.
// De voorstel-pagina blijft state + API-calls zelf doen; de
// componenten zijn 'controlled' en krijgen alles via props.

// Welke kanalen Filly kan inplannen. Mail + WhatsApp = direct-
// communicatie (1-op-1), social = openbare post. Google Business
// (per 2026-05-21 toegevoegd) is een openbare locatie-post via GBP;
// concept-fase werkt volledig, auto-publish wacht op Google's API-
// approval (BACKLOG fase F).
export type Platform =
  | "mail"
  | "whatsapp"
  | "instagram"
  | "facebook"
  | "tiktok"
  | "google_business";

// Lange label-vorm voor knoppen/chips ('Instagram-post' i.p.v.
// 'Instagram'). Voor compactere weergave gebruik shortPlatformName().
export const PLATFORM_ICON: Record<Platform, string> = {
  mail: "✉️",
  whatsapp: "💬",
  instagram: "📷",
  facebook: "👥",
  tiktok: "🎬",
  google_business: "🔍",
};

export const PLATFORM_LABEL: Record<Platform, string> = {
  mail: "E-mail",
  whatsapp: "WhatsApp-bericht",
  instagram: "Instagram-post",
  facebook: "Facebook-post",
  tiktok: "TikTok-video",
  google_business: "Google Business-post",
};

// Compacte naam voor pill-buttons: knip de suffix -post/-bericht/
// -video weg. 'Instagram-post' → 'Instagram'.
export function shortPlatformName(p: Platform): string {
  return PLATFORM_LABEL[p]
    .replace("-post", "")
    .replace("-bericht", "")
    .replace("-video", "");
}

// 'type' = legacy categorie (mail/social/whatsapp) die de variant-
// rendering en foto-flow nog gebruiken. Map vanuit Platform.
// google_business → 'social' want de content-shape (caption + media
// + scheduled_for) matcht 1-op-1 met de social-content-tabel.
export function platformToType(p: Platform): "mail" | "social" | "whatsapp" {
  if (p === "mail" || p === "whatsapp") return p;
  return "social";
}

// ============================================================
// Datum-helpers
// ============================================================

// Nederlandse weergave: "donderdag 14 mei om 17:00". Geen jaartal
// omdat suggesties altijd binnenkort vallen — jaartal voegt ruis toe.
export function formatDutchDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Conversie ISO → datetime-local-input-format ('2026-05-14T17:00').
// HTML datetime-local accepteert geen Z-suffix of tijdzone-offset,
// dus we strippen die door lokale getters te gebruiken.
export function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Vergelijk op MINUUT-precisie. datetime-local gaat niet dieper,
// dus seconden-verschil zou een vals-positieve afwijking-banner
// triggeren wanneer eigenaar 'Filly's voorstel' opnieuw kiest.
export function timesEqualToMinute(
  a: string | null,
  b: string | null,
): boolean {
  if (!a || !b) return false;
  const da = new Date(a);
  const db = new Date(b);
  return Math.floor(da.getTime() / 60000) === Math.floor(db.getTime() / 60000);
}

// Filly's voorgestelde tijdstip = target_date + standaard uur per
// platform-type. Mail/whatsapp 11:00 (lunch-bel-momentum), social
// 17:00 (after-work attention-window). Klanten zijn NL-only, dus
// browser-locale (de facto Europe/Amsterdam) volstaat.
export function fillySuggestedIso(
  targetDate: string | undefined,
  type: "mail" | "social" | "whatsapp",
): string | null {
  if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return null;
  const hour = type === "social" ? 17 : 11;
  const [y, m, d] = targetDate.split("-").map((s) => parseInt(s, 10));
  const dt = new Date(y, m - 1, d, hour, 0, 0, 0);
  return dt.toISOString();
}

// ============================================================
// Section-IDs voor jump-to-fix vanuit Missende aspecten
// ============================================================
// Klik op "Foto ontbreekt" → element.scrollIntoView() naar deze id.
export const SECTION_ID = {
  schedule: "section-schedule",
  foto: "section-foto",
  inhoud: "section-inhoud",
} as const;
