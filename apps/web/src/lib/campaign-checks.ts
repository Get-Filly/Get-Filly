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

// Mens-leesbare labels voor de chips en de Missende aspecten-koppen.
export const PLATFORM_LABEL: Record<string, string> = {
  mail: "Mail",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
  google_business: "Google Business",
};

// Voor de approve-bundle-API: alleen mail/instagram/facebook worden
// ondersteund. Andere platforms hebben (nog) geen bundle-pad.
export function toBundleChannel(
  platform: string,
): "mail" | "instagram" | "facebook" | null {
  if (
    platform === "mail" ||
    platform === "instagram" ||
    platform === "facebook"
  ) {
    return platform;
  }
  return null;
}

// Kernfunctie: gegeven een kanaal-config, retourneer welke velden
// nog niet ingevuld zijn. Volgorde van push() bepaalt de volgorde
// waarin de fields in de UI verschijnen (date → body → subject → photo).
export function getChannelMissing(
  platform: string,
  body: string | undefined | null,
  subject: string | undefined | null,
  scheduled: string | undefined | null,
  mediaId: string | undefined | null,
): MissingField[] {
  const missing: MissingField[] = [];
  if (!scheduled) missing.push("date");
  if (!body || !body.trim()) missing.push("body");
  if (platform === "mail" && (!subject || !subject.trim())) {
    missing.push("subject");
  }
  if (PHOTO_REQUIRED.has(platform) && !mediaId) {
    missing.push("photo");
  }
  return missing;
}
