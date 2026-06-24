// ============================================================
// campaign-checks.ts — gedeelde "wat mist er nog?" logica
// ============================================================
//
// Gebruikt door:
//   - /dashboard/campagnes (kanban-cards: status-indicator boven knoppen)
//   - /dashboard/campagnes/voorstel/[id] (Missende aspecten-blok)
//
// Dezelfde regels op beide plekken zodat de eigenaar op de kanban
// nooit "alles compleet" ziet en in de detail-pagina alsnog tegen
// een rood vlaggetje aanloopt.

export type MissingField = "date" | "body" | "subject" | "photo";

// Generieke labels voor de korte samenvatting (kanban-pill,
// header-statusregel). Platform-onafhankelijk; voor de detail-pagina
// die per kanaal de label kan kleuren naar het platform (bv. TikTok =
// "Foto of video") gebruiken we getMissingLabel hieronder.
export const GENERIC_MISSING_LABEL: Record<MissingField, string> = {
  date: "Datum & tijd",
  body: "Tekst",
  subject: "Onderwerp",
  photo: "Foto",
};

// Platform-specifieke label. TikTok = video of foto (norm op dat
// platform is video, foto = back-up).
export function getMissingLabel(
  field: MissingField,
  platform: string,
): string {
  switch (field) {
    case "date":
      return "Datum & tijd";
    case "body":
      return "Tekst";
    case "subject":
      return "Onderwerp";
    case "photo":
      return platform === "tiktok" ? "Foto of video" : "Foto";
  }
}

// Kanalen waarbij visuele media écht vereist is. Facebook + Google
// Business: aanbevolen maar niet blokkerend (tekst-only post mag).
// Mail + WhatsApp: tekst-only kanalen.
export const PHOTO_REQUIRED = new Set(["instagram", "tiktok"]);

// Kanalen waarbij foto/video optioneel is — niet blokkerend, wel
// aanbevolen (een Facebook-post zonder beeld presteert minder). De
// UI toont deze velden in Missende aspecten als ○ (open bolletje)
// i.p.v. ● (gevuld = vereist) zodat eigenaar het verschil ziet.
export const PHOTO_OPTIONAL = new Set(["facebook", "google_business"]);

// Mens-leesbare labels voor de chips en de Missende aspecten-koppen.
export const PLATFORM_LABEL: Record<string, string> = {
  mail: "Mail",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
  google_business: "Google Business",
};

// Voor de approve-bundle-API: sinds 2026-06-22 ondersteunt de bundle alle
// 6 chat-kanalen (mail/instagram/facebook/whatsapp/google_business/tiktok).
export function toBundleChannel(
  platform: string,
):
  | "mail"
  | "instagram"
  | "facebook"
  | "whatsapp"
  | "google_business"
  | "tiktok"
  | null {
  if (
    platform === "mail" ||
    platform === "instagram" ||
    platform === "facebook" ||
    platform === "whatsapp" ||
    platform === "google_business" ||
    platform === "tiktok"
  ) {
    return platform;
  }
  return null;
}

// Een vers via "Maak eigen campagne" aangemaakt concept houdt deze
// placeholdertekst tot de eigenaar inhoud schrijft of genereert. Die telt
// NIET als ingevulde body — anders zou je een nog-niet-uitgewerkte campagne
// kunnen activeren/inplannen (en zou Filly's placeholder naar Meta gaan).
// Prefix-match, consistent met de backend (createConceptForPlatform).
export function isUnwrittenBody(body: string | undefined | null): boolean {
  const b = (body ?? "").trim();
  return (
    b.length === 0 || b.startsWith("Deze campagne is nog niet uitgewerkt")
  );
}

// Kernfunctie: gegeven een kanaal-config, retourneer welke velden
// nog niet ingevuld zijn. Volgorde van push() bepaalt de volgorde
// waarin de fields in de UI verschijnen (date → body → subject → photo).
// Telt alleen VEREISTE velden — voor de Goedkeur/Plan-in-blokking.
export function getChannelMissing(
  platform: string,
  body: string | undefined | null,
  subject: string | undefined | null,
  scheduled: string | undefined | null,
  mediaId: string | undefined | null,
): MissingField[] {
  const missing: MissingField[] = [];
  if (!scheduled) missing.push("date");
  if (isUnwrittenBody(body)) missing.push("body");
  if (platform === "mail" && (!subject || !subject.trim())) {
    missing.push("subject");
  }
  if (PHOTO_REQUIRED.has(platform) && !mediaId) {
    missing.push("photo");
  }
  return missing;
}

// Uitgebreide check: retourneert ALLE relevante velden (vereist +
// optioneel) met hun status. Voor de Missende aspecten-card op de
// voorstel-detail-pagina zodat we zowel ● vereist als ○ optioneel
// kunnen tonen. Items die al ingevuld zijn worden niet teruggegeven —
// we tonen alleen wat nog actie nodig heeft.
export type ChecklistItem = {
  field: MissingField;
  required: boolean;
};

export function getChannelChecklist(
  platform: string,
  body: string | undefined | null,
  subject: string | undefined | null,
  scheduled: string | undefined | null,
  mediaId: string | undefined | null,
): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  if (!scheduled) items.push({ field: "date", required: true });
  if (isUnwrittenBody(body)) items.push({ field: "body", required: true });
  if (platform === "mail" && (!subject || !subject.trim())) {
    items.push({ field: "subject", required: true });
  }
  if (PHOTO_REQUIRED.has(platform) && !mediaId) {
    items.push({ field: "photo", required: true });
  } else if (PHOTO_OPTIONAL.has(platform) && !mediaId) {
    items.push({ field: "photo", required: false });
  }
  return items;
}
