// ============================================================
// Campaign-bundle → unified-detail-view adapter
// ============================================================
//
// Per 2026-05-13: één frontend-view voor alle 4 statussen
// (Voorstel/Concept/Ingepland/Actief/Afgerond). De 5 detail-
// componenten (_components/campaign-detail/*) zijn ontworpen op
// de suggestion-shape (channels[].variants[] + selected_index).
//
// Deze adapter zet een CampaignBundle (1+ campaigns met optioneel
// een group) om naar diezelfde shape, zodat de componenten geen
// idee hoeven te hebben dat de data uit campaigns ipv ai_suggestions
// komt. Voorstel-detail vs unified-detail wordt enkel een data-
// bron-verschil, geen UI-verschil.
//
// Inputs: CampaignBundle van GET /campaigns/bundle/:id
// Output: UnifiedDetailView — exact wat de componenten als props
//         nodig hebben + een lookup van id → raw CampaignDetail
//         voor de mutate-callbacks in de page-laag.

import type {
  CampaignBundle,
  CampaignDetail,
  CampaignStatus,
  CampaignVariant,
} from "./api";
import type { Platform } from "../app/[locale]/dashboard/_components/campaign-detail/types";
import { getChannelChecklist, type ChecklistItem } from "./campaign-checks";

// Eén kanaal binnen de unified-view. Mirrort
// ai_suggestions.suggested_campaign.channels[] qua veld-namen
// zodat de componenten één pad hebben.
export type UnifiedChannel = {
  id: string; // = campaign.id
  platform: Platform;
  variants: CampaignVariant[];
  selected_index: number;
  scheduled_for: string | null;
  // Filly's voorstel voor verzendmoment (suggested_scheduled_for op
  // CampaignDetail). Null als Filly nooit een tijd heeft voorgesteld.
  filly_scheduled_for: string | null;
  filly_scheduled_reasoning: string | null;
  // Media: signed URL (1u TTL). Voor social = media_urls[0], voor
  // whatsapp = media_url. Voor mail altijd null (ondersteunt geen
  // foto's in deze versie).
  media_url: string | null;
  // Publicatie-status (social). published_at = succesvol naar Meta/IG/FB
  // gepost; publish_error = laatste publicatiefout (bv. "Instagram vereist
  // een afbeelding-URL"). Frontend toont dit zodat een mislukte/uitgestelde
  // publicatie niet meer stil is.
  published_at: string | null;
  publish_error: string | null;
  // IG-post die nog handmatig in de Instagram-app verwijderd moet worden
  // (Instagram laat geen verwijderen via de API toe). Bevat de directe
  // permalink, of "manual" als die niet bewaard is (oudere post). Null = niets.
  ig_pending_manual_delete_url: string | null;
  // Heeft dit kanaal nu een live gepubliceerde Instagram-post? Voor de
  // "verwijder Instagram ook handmatig"-waarschuwing vóór het stoppen.
  has_instagram_post: boolean;
};

export type UnifiedDetailView = {
  // Bundle-niveau. groupId is null voor standalone single-channel.
  groupId: string | null;
  bundleName: string | null;
  // De canonieke titel voor de header. Bij bundle: group.name. Bij
  // single-channel zonder group: campaign.name.
  name: string;
  // Status van de campagnes. Bij multi-channel zijn alle kanalen
  // normaliter dezelfde status — we pakken de "vroegste" als ze
  // ooit divergeren (concept < ingepland < actief < afgerond) zodat
  // de UI veilig op de meest-bewerkbare staat valt.
  status: CampaignStatus;
  // Filly's reasoning. Komt uit campaigns.ai_suggestion_id-join
  // (zie findById). Bij bundle: pak de eerste niet-null waarde —
  // alle kanalen van dezelfde suggestie delen dezelfde reasoning.
  reasoning: string | null;
  // Per-kanaal data voor de KanalenCard / InhoudCard / WanneerCard.
  channels: UnifiedChannel[];
  // Per-kanaal checklist voor MissendeAspectenCard. Wordt hier al
  // gecomputeerd zodat de page-laag 'm niet zelf hoeft samen te
  // stellen.
  channelsChecklist: Array<{
    id: string;
    platform: Platform;
    items: ChecklistItem[];
  }>;
  // Lookup: kanaal-id → raw CampaignDetail. De page-laag heeft 'm
  // nodig om edit-callbacks te wiren (welk endpoint, welke campaign-id).
  campaignsByChannelId: Record<string, CampaignDetail>;
};

// Bepaalt het specifieke platform van een campagne. Mail/whatsapp
// = type-equivalent. Social = uit content.platforms[0]. Backwards-
// compat: legacy social-campagnes zonder platforms-veld vallen
// terug op 'instagram' (eerste pure social-platform in onze stack).
function detectPlatform(c: CampaignDetail): Platform {
  if (c.type === "mail") return "mail";
  if (c.type === "whatsapp") return "whatsapp";
  const platforms = c.content?.platforms ?? [];
  const first = platforms[0];
  if (first === "instagram" || first === "facebook" || first === "tiktok") {
    return first;
  }
  return "instagram";
}

// "Heeft dit kanaal media gekoppeld?" → voor de checklist alleen
// truthy/falsy nodig. We geven 'has' / null door zodat
// getChannelChecklist zijn bestaande mediaId-arg blijft begrijpen
// zonder dat we 'm hoeven aan te passen.
function mediaTokenForChecklist(c: CampaignDetail): string | null {
  if (c.type === "whatsapp") {
    const url = c.content?.media_url;
    return typeof url === "string" && url.trim().length > 0 ? "has" : null;
  }
  const arr = c.content?.media_urls;
  return Array.isArray(arr) && arr.length > 0 ? "has" : null;
}

// "Vroegste" status — bij divergerende multi-channel-bundles geven
// we de UI altijd de meest-bewerkbare staat zodat eigenaar geen
// edit-knoppen mist door 1 afwijkend kanaal. In de praktijk
// gelijktrekken kanalen bij elke status-overgang, dus dit pad
// triggert zelden.
const STATUS_RANK: Record<CampaignStatus, number> = {
  concept: 0,
  ingepland: 1,
  actief: 2,
  afgerond: 3,
};
function earliestStatus(rows: CampaignDetail[]): CampaignStatus {
  if (rows.length === 0) return "concept";
  let earliest: CampaignStatus = rows[0].status;
  for (const r of rows) {
    if (STATUS_RANK[r.status] < STATUS_RANK[earliest]) {
      earliest = r.status;
    }
  }
  return earliest;
}

// Single channel uit een CampaignDetail.
function toUnifiedChannel(c: CampaignDetail): UnifiedChannel {
  const platform = detectPlatform(c);
  const variants = Array.isArray(c.variants) ? c.variants : [];
  const selectedIdxRaw =
    typeof c.selected_variant_index === "number"
      ? c.selected_variant_index
      : 0;
  const selectedIdx = Math.min(
    Math.max(selectedIdxRaw, 0),
    Math.max(variants.length - 1, 0),
  );
  const mediaUrl =
    c.type === "whatsapp"
      ? (typeof c.content?.media_url === "string"
          ? c.content.media_url
          : null)
      : (c.content?.media_urls?.[0] ?? null);
  const pubMeta = c.content as
    | {
        published_at?: unknown;
        publish_error?: unknown;
        ig_pending_manual_delete_url?: unknown;
        published_post_ids?: { instagram?: unknown } | null;
      }
    | null
    | undefined;
  return {
    id: c.id,
    platform,
    variants,
    selected_index: selectedIdx,
    scheduled_for: c.scheduled_for,
    filly_scheduled_for: c.suggested_scheduled_for ?? null,
    filly_scheduled_reasoning: c.suggested_scheduled_reasoning ?? null,
    media_url: mediaUrl,
    // published_at/publish_error komen uit campaign_social_content (mig 0058)
    // en zitten nog niet in het getypte content-model; lokaal uitlezen.
    published_at:
      typeof pubMeta?.published_at === "string" ? pubMeta.published_at : null,
    publish_error:
      typeof pubMeta?.publish_error === "string" ? pubMeta.publish_error : null,
    ig_pending_manual_delete_url:
      typeof pubMeta?.ig_pending_manual_delete_url === "string"
        ? pubMeta.ig_pending_manual_delete_url
        : null,
    has_instagram_post:
      typeof pubMeta?.published_post_ids?.instagram === "string",
  };
}

export function bundleToView(bundle: CampaignBundle): UnifiedDetailView {
  if (!Array.isArray(bundle.campaigns) || bundle.campaigns.length === 0) {
    throw new Error("Lege bundle — geen campagnes om weer te geven.");
  }

  const channels = bundle.campaigns.map(toUnifiedChannel);

  // Per-kanaal checklist op de huidige Gekozen-versie. Items die
  // al ingevuld zijn worden door getChannelChecklist weggefilterd.
  const channelsChecklist = bundle.campaigns.map((c) => {
    const channel = toUnifiedChannel(c);
    const v =
      channel.variants[channel.selected_index] ?? channel.variants[0];
    const items = getChannelChecklist(
      channel.platform,
      v?.body,
      v?.subject_line ?? undefined,
      // Alleen een VASTGELEGD moment (scheduled_for) telt als gekozen. Een
      // door Filly voorgesteld moment moet de eigenaar eerst accepteren via
      // de "Akkoord"-knop in de Wanneer-plaatsen-card (legt scheduled_for vast).
      channel.scheduled_for,
      mediaTokenForChecklist(c),
    );
    return { id: channel.id, platform: channel.platform, items };
  });

  // Reasoning eerste niet-null — alle kanalen van dezelfde suggestie
  // delen dezelfde reasoning.
  const reasoning =
    bundle.campaigns.find((c) => typeof c.reasoning === "string" && c.reasoning)
      ?.reasoning ?? null;

  const first = bundle.campaigns[0];
  const status = earliestStatus(bundle.campaigns);
  const name = bundle.group?.name ?? first.name ?? "Campagne";

  const campaignsByChannelId: Record<string, CampaignDetail> = {};
  for (const c of bundle.campaigns) {
    campaignsByChannelId[c.id] = c;
  }

  return {
    groupId: bundle.group?.id ?? null,
    bundleName: bundle.group?.name ?? null,
    name,
    status,
    reasoning,
    channels,
    channelsChecklist,
    campaignsByChannelId,
  };
}
