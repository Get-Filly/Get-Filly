"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  approveBundleSuggestion,
  approveSuggestion,
  deleteCampaign,
  fetchCampaigns,
  fetchSuggestions,
  updateCampaignStatus,
  updateSuggestion,
  type AiSuggestion,
  type BundleChannel,
  type Campaign,
} from "../../../lib/api";
import {
  GENERIC_MISSING_LABEL,
  PLATFORM_LABEL,
  getChannelMissing,
  toBundleChannel,
  type MissingField,
} from "../../../lib/campaign-checks";
import { UpcomingActionsBlock } from "../_components/upcoming-actions-block";
import { PageHeader } from "../../../components/ui/page-header";
import { Button } from "../../../components/ui/button";
import { Skeleton } from "../_components/skeleton";

// ============================================================
// /dashboard/campagnes — kanban-bord met 4 fase-kolommen
// ============================================================
// Floris-redesign 2026-05-12: 4 kolommen voor de campagne-flow:
//   - Voorstel  : pending ai_suggestions (single + chat_bundle)
//   - Concept   : campaigns met status='concept'
//   - Ingepland : campaigns met status='ingepland'
//   - Actief    : campaigns met status='actief'
// Voltooide campagnes verhuizen naar /campagnes/history.
//
// Bundle-handling: multi-channel-suggestions (trigger_type=
// 'chat_bundle') én campaigns met dezelfde group_id worden als één
// expand-bare bundle-card getoond. Klik op de chevron = uitklap met
// per-kanaal mini-rijen.
//
// Per 2026-05-21: TasksStrip (Overige acties) is verwijderd uit de
// campagnes-pagina. Reviews leven nu op /dashboard/vindbaarheid en
// GBP-posts komen in een toekomstige uitgebreide Vindbaarheid-hub.
// Low-occupancy-suggesties zijn al via de rode strook op het
// dashboard + de groene Filly-tile beschikbaar.

type KanbanColumn = {
  key: "voorstel" | "concept" | "ingepland" | "actief";
  label: string;
  description: string;
};

const COLUMNS: KanbanColumn[] = [
  { key: "voorstel", label: "Voorstel", description: "Wachten op je goedkeuring" },
  { key: "concept", label: "Concept", description: "Nog in te plannen" },
  { key: "ingepland", label: "Ingepland", description: "Wachten op verzendmoment" },
  { key: "actief", label: "Actief", description: "Loopt nu" },
];

// Eén item op het bord: of een suggestion (voorstel-kolom) of een
// campagne / bundle (overige kolommen).
type BoardItem =
  | { kind: "suggestion"; data: AiSuggestion }
  | { kind: "bundle-suggestion"; data: AiSuggestion }
  | { kind: "campaign"; data: Campaign }
  | { kind: "bundle-campaign"; groupId: string; campaigns: Campaign[] };

function typeIcon(t: string | undefined | null): string {
  if (!t) return "📋";
  if (t === "mail") return "✉️";
  if (t === "whatsapp") return "💬";
  if (t === "instagram") return "📱";
  if (t === "facebook") return "👥";
  if (t === "tiktok") return "🎵";
  if (t === "google_business") return "📍";
  return "📱";
}

function suggestionDisplayName(s: AiSuggestion): string {
  return s.suggested_campaign.name ?? "Voorstel";
}

function suggestionDisplayType(s: AiSuggestion): string {
  return (
    s.suggested_campaign.platform ??
    s.suggested_campaign.type ??
    s.suggested_campaign.channels?.[0]?.platform ??
    "campagne"
  );
}

// Korte datum + tijd: "13 mei 09:00". HH:MM alleen tonen als de
// timestamp ook een uur bevat (niet bij target_date pure datum).
function shortDateTime(iso: string, includeTime: boolean): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
  });
  if (!includeTime) return date;
  const time = d.toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} ${time}`;
}

// Stelt een datum/tijd-tekst samen voor een card-regel. Returnt
// "Geen datum" als er niks bekend is — bewust een tekst-fallback i.p.v.
// null zodat de kolom-uitlijning ook bij ontbrekende velden klopt.
function formatScheduled(
  iso: string | null | undefined,
  includeTime = true,
): string {
  if (!iso) return "Geen datum";
  return shortDateTime(iso, includeTime);
}

// "Target date" uit suggestion.trigger_context — fallback wanneer een
// voorstel nog geen concrete scheduled_for heeft maar wel een
// gewenste dag (bv. "13 mei").
function getSuggestionTargetDate(s: AiSuggestion): string | null {
  const ctx = s.trigger_context;
  if (ctx && typeof ctx === "object" && "target_date" in ctx) {
    const date = (ctx as { target_date?: string }).target_date;
    if (date) return date;
  }
  return null;
}

// ============================================================
// Inplan-vereisten per kanaal (zie ../lib/campaign-checks.ts)
// ============================================================
// De helpers (getChannelMissing, PLATFORM_LABEL, etc.) zijn gedeeld
// met de detail-pagina zodat de "wat mist er nog?"-logica op één
// plek staat en niet uit elkaar kan lopen.

// Eén entry per kanaal-check. Voor single-suggesties is dit een
// 1-elementen-array; voor bundles 1 entry per channel.
type ChannelCheck = {
  // Stabiele key voor React + voor de "enabled"-set. Voor bundles
  // = channel.id; voor single = "single".
  id: string;
  platform: string;
  label: string;
  // Voor bundle-approve hebben we de BundleChannel-string nodig
  // (mail|instagram|facebook). null = dit kanaal kan niet via
  // approveBundleSuggestion mee (bv. tiktok/whatsapp ondersteund
  // de backend nog niet). UI verbergt 'm dan niet, maar Plan in
  // werkt alleen voor de wél-ondersteunde channels.
  bundleChannel: BundleChannel | null;
  missing: MissingField[];
};

function computeSuggestionChecks(s: AiSuggestion): ChannelCheck[] {
  const sc = s.suggested_campaign;
  if (sc.channels && sc.channels.length > 0) {
    return sc.channels.map((ch) => {
      const v = ch.variants[ch.selected_index] ?? ch.variants[0];
      return {
        id: ch.id,
        platform: ch.platform,
        label: PLATFORM_LABEL[ch.platform] ?? ch.platform,
        bundleChannel: toBundleChannel(ch.platform),
        missing: getChannelMissing(
          ch.platform,
          v?.body,
          v?.subject_line,
          ch.scheduled_for ?? ch.filly_scheduled_for,
          ch.restaurant_media_id,
        ),
      };
    });
  }
  const platform = sc.platform ?? sc.type ?? "mail";
  const v = sc.variants?.[sc.selected_index ?? 0] ?? sc.variants?.[0];
  return [
    {
      id: "single",
      platform,
      label: PLATFORM_LABEL[platform] ?? platform,
      bundleChannel: toBundleChannel(platform),
      missing: getChannelMissing(
        platform,
        v?.body ?? sc.body ?? sc.caption,
        v?.subject_line ?? sc.subject_line ?? sc.subject,
        sc.scheduled_for,
        sc.restaurant_media_id,
      ),
    },
  ];
}

// ============================================================
// ChannelRow, unified data-model per kanaal-regel op de card
// ============================================================
// Eén regel per kanaal: kanaal-icon · datum/tijd · rechts-status.
// De rechts-status verschilt per fase:
//
//   - missing : "⚠ Foto" / "⚠ Datum" (suggesties + concept-cards)
//   - ready   : "✓" (alles compleet)
//   - planned : "📅 over 3 dgn" (ingepland)
//   - running : "🟢 Loopt nu" (actief, geen reservering-stats)
//   - stats   : "+3 reserveringen" (actief, met data)
//
// Door dezelfde rij-structuur over alle 4 kolommen te gebruiken
// houden we het visueel consistent: alleen de rechter-status-pill
// verandert, layout blijft.

type ChannelRow = {
  id: string;
  platform: string;
  // Datum/tijd-tekst (al geformatteerd, of "Geen datum").
  whenText: string;
  status: ChannelStatus;
};

type ChannelStatus =
  | { kind: "missing"; fields: MissingField[] }
  | { kind: "ready" }
  | { kind: "planned"; relativeText: string }
  | { kind: "running" }
  | { kind: "stats"; extraReservations: number };

// Bouw ChannelRow-array voor een suggestion (voorstel-kolom).
// Bundle = 1 entry per channel; single = 1 entry totaal.
function buildSuggestionRows(s: AiSuggestion): ChannelRow[] {
  const checks = computeSuggestionChecks(s);
  const sc = s.suggested_campaign;
  // Voor display van datum: probeer eerst scheduled_for, anders
  // target_date uit trigger_context (pure datum, geen tijd).
  const targetDate = getSuggestionTargetDate(s);
  return checks.map((c, idx) => {
    let whenIso: string | undefined | null = null;
    let includeTime = true;
    if (sc.channels && sc.channels.length > 0) {
      const ch = sc.channels[idx];
      whenIso = ch?.scheduled_for ?? ch?.filly_scheduled_for ?? null;
    } else {
      whenIso = sc.scheduled_for ?? null;
    }
    // Fallback op target_date (pure datum) als er geen scheduled_for is.
    if (!whenIso && targetDate) {
      whenIso = targetDate;
      includeTime = false;
    }
    return {
      id: c.id,
      platform: c.platform,
      whenText: formatScheduled(whenIso, includeTime),
      status:
        c.missing.length === 0
          ? { kind: "ready" }
          : { kind: "missing", fields: c.missing },
    };
  });
}

// Voor een Campaign (concept/ingepland/actief): één row per campagne.
// Bundle-campaign roept dit per campagne aan en concatenate.
function buildCampaignRow(c: Campaign): ChannelRow {
  const status: ChannelStatus = (() => {
    if (c.status === "actief") {
      const extra = c.result_stats?.extra_reservations ?? 0;
      return extra > 0
        ? { kind: "stats", extraReservations: extra }
        : { kind: "running" };
    }
    if (c.status === "ingepland" && c.scheduled_for) {
      return { kind: "planned", relativeText: relativeSuffix(c.scheduled_for) };
    }
    // Concept: check datum + tekst (rest is sowieso al gevuld bij approve).
    // Subject/foto-check zou backend-list-uitbreiding nodig hebben — voor
    // nu pragmatisch beperkt tot wat we wél weten.
    if (c.status === "concept") {
      const missing: MissingField[] = [];
      if (!c.scheduled_for) missing.push("date");
      if (!c.body_preview || !c.body_preview.trim()) missing.push("body");
      return missing.length === 0
        ? { kind: "ready" }
        : { kind: "missing", fields: missing };
    }
    // Default (bv. ingepland zonder scheduled_for, niet mogelijk maar safe).
    return { kind: "ready" };
  })();
  return {
    id: c.id,
    platform: c.type,
    whenText: formatScheduled(c.scheduled_for, true),
    status,
  };
}

// Is een set ChannelRow's "ready" om in te plannen / activeren?
// Datum + alle missing-fields moeten weg zijn.
function rowsReady(rows: ChannelRow[]): boolean {
  if (rows.length === 0) return false;
  return rows.every((r) => r.status.kind === "ready");
}

// ============================================================
// Card-aggregate helpers (samenvatting over alle kanalen)
// ============================================================
// Op een kanban-card tonen we alleen samenvattende info:
//   - welke kanalen meedoen (chips)
//   - de eerste/enige scheduled-datum
//   - statusindicator: ✓ Alles compleet of ⚠ ontbrekende velden

// Verzamel alle unieke ontbrekende velden over alle kanaal-rijen.
// Volgorde: date → body → subject → photo (zodat de zin lekker loopt).
function getAllMissing(rows: ChannelRow[]): MissingField[] {
  const fields = new Set<MissingField>();
  for (const row of rows) {
    if (row.status.kind === "missing") {
      for (const f of row.status.fields) fields.add(f);
    }
  }
  const order: MissingField[] = ["date", "body", "subject", "photo"];
  return order.filter((f) => fields.has(f));
}

// Welke platforms zitten in dit item? Voor de chip-rij bovenaan
// de card. Voor bundles meerdere; voor single 1.
function getItemPlatforms(item: BoardItem): string[] {
  if (item.kind === "suggestion") {
    const sc = item.data.suggested_campaign;
    return [sc.platform ?? sc.type ?? "mail"];
  }
  if (item.kind === "bundle-suggestion") {
    // Defensive: ?? [] vangt alleen null/undefined op. Bij oude
    // bundle-suggestions kon channels een object zijn (legacy shape
    // van vóór 2026-05-07 fase 2d) — dan zou .map() crashen met
    // "channels.map is not a function". Array.isArray-check is
    // veilig voor elke historische shape.
    const channels = item.data.suggested_campaign.channels;
    if (!Array.isArray(channels)) return [];
    return channels.map((c) => c.platform);
  }
  if (item.kind === "campaign") {
    return [item.data.type];
  }
  // bundle-campaign: uniek + in stabiele volgorde (volgorde van campagnes).
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of item.campaigns) {
    if (!seen.has(c.type)) {
      seen.add(c.type);
      out.push(c.type);
    }
  }
  return out;
}

// Vroegste scheduled-datum binnen het item. Voor bundles met meerdere
// momenten "vanaf X mei" tonen we apart (multiple=true).
function getEarliestScheduled(item: BoardItem): {
  iso: string | null;
  multiple: boolean;
} {
  const isos: string[] = [];
  if (item.kind === "suggestion") {
    if (item.data.suggested_campaign.scheduled_for) {
      isos.push(item.data.suggested_campaign.scheduled_for);
    } else {
      // Fallback op target_date uit trigger_context (pure datum).
      const target = getSuggestionTargetDate(item.data);
      if (target) isos.push(target);
    }
  } else if (item.kind === "bundle-suggestion") {
    // Array.isArray-guard tegen legacy bundle-shapes met channels=object.
    const chs = item.data.suggested_campaign.channels;
    if (Array.isArray(chs)) {
      for (const ch of chs) {
        const when = ch.scheduled_for ?? ch.filly_scheduled_for;
        if (when) isos.push(when);
      }
    }
  } else if (item.kind === "campaign") {
    if (item.data.scheduled_for) isos.push(item.data.scheduled_for);
  } else {
    for (const c of item.campaigns) {
      if (c.scheduled_for) isos.push(c.scheduled_for);
    }
  }
  if (isos.length === 0) return { iso: null, multiple: false };
  isos.sort();
  return { iso: isos[0], multiple: isos.length > 1 };
}

function relativeSuffix(iso: string): string {
  const target = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetMidnight = new Date(target);
  targetMidnight.setHours(0, 0, 0, 0);
  const diff = Math.round(
    (targetMidnight.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diff < 0) return "verleden";
  if (diff === 0) return "vandaag";
  if (diff === 1) return "morgen";
  return `over ${diff} dgn`;
}

// Wat tonen we op een campagne-card als datum-regel? Bij ingepland +
// concept met scheduled_for: kanaal-icon + datum + tijd. Anders een
// status-zin ("Nog niet ingepland" / "Loopt nu" / "+12 reserveringen").
function campaignDateLine(c: Campaign): string {
  const stats = c.result_stats ?? {};
  if (c.scheduled_for) {
    return `${typeIcon(c.type)} ${shortDateTime(c.scheduled_for, true)}`;
  }
  if (c.status === "concept") return "Nog niet ingepland";
  if (c.status === "actief") {
    return stats.extra_reservations != null && stats.extra_reservations > 0
      ? `+${stats.extra_reservations} reserveringen`
      : "Loopt nu";
  }
  return "Geen datum";
}

export default function CampagnesPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  // Per-item actie-state. Sleutel = cardKey(item) zodat zowel single
  // campaigns als bundles (group_id) een uniek busy-veld krijgen.
  const [busyId, setBusyId] = useState<string | null>(null);
  // Filter op kanaal. Lege set = alles tonen. Klik op chip = toggle.
  const [channelFilter, setChannelFilter] = useState<Set<string>>(new Set());
  const toggleChannel = (key: string) => {
    setChannelFilter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const refetch = async () => {
    try {
      const [camps, suggs] = await Promise.all([
        fetchCampaigns(),
        fetchSuggestions("pending"),
      ]);
      setCampaigns(camps);
      setSuggestions(suggs);
    } catch {
      // Stille fail: lege state zorgt voor empty-state per kolom.
    }
  };

  useEffect(() => {
    setLoading(true);
    refetch().finally(() => setLoading(false));
  }, []);

  // Verdeel items over de 4 kolommen.
  const columns = useMemo(() => {
    // Helper: matched een item de actieve kanaal-filter?
    // Lege filter = alles tonen. Bij multi-select = OR-match (heeft
    // minstens 1 van de geselecteerde kanalen).
    const matchesFilter = (channels: string[]): boolean => {
      if (channelFilter.size === 0) return true;
      return channels.some((c) => channelFilter.has(c));
    };
    const result: Record<KanbanColumn["key"], BoardItem[]> = {
      voorstel: [],
      concept: [],
      ingepland: [],
      actief: [],
    };

    // Voorstel-kolom: ai_suggestions, split op trigger_type voor bundles.
    for (const s of suggestions) {
      const sc = s.suggested_campaign;
      const channels =
        sc.channels && sc.channels.length > 0
          ? sc.channels.map((ch) => ch.platform)
          : [sc.platform ?? sc.type ?? "mail"];
      if (!matchesFilter(channels)) continue;
      if (s.trigger_type === "chat_bundle") {
        result.voorstel.push({ kind: "bundle-suggestion", data: s });
      } else {
        result.voorstel.push({ kind: "suggestion", data: s });
      }
    }

    // Campagne-kolommen: groepeer per group_id. Afgeronde campagnes
    // skippen (verhuisden naar /history-route).
    //
    // Per 2026-05-21: ook campagnes met scheduled_for < nu als
    // 'verlopen' behandelen — die horen óók in history (zelfs als
    // status nog op concept/ingepland/actief staat omdat pg_cron-job
    // 0043 nog niet gedraaid heeft sinds verstrijken). Safety-net
    // tegen de gap tussen verstrijken en nightly cleanup.
    const nowIso = new Date().toISOString();
    const isExpired = (c: Campaign) =>
      typeof c.scheduled_for === "string" && c.scheduled_for < nowIso;
    const byGroup = new Map<string, Campaign[]>();
    const standalone: Campaign[] = [];
    for (const c of campaigns) {
      if (c.status === "afgerond") continue;
      if (isExpired(c)) continue;
      if (c.group_id) {
        const arr = byGroup.get(c.group_id) ?? [];
        arr.push(c);
        byGroup.set(c.group_id, arr);
      } else {
        standalone.push(c);
      }
    }
    // Standalone: gewoon op status mappen + kanaal-filter.
    for (const c of standalone) {
      if (!matchesFilter([c.type])) continue;
      if (c.status === "concept") result.concept.push({ kind: "campaign", data: c });
      else if (c.status === "ingepland")
        result.ingepland.push({ kind: "campaign", data: c });
      else if (c.status === "actief")
        result.actief.push({ kind: "campaign", data: c });
    }
    // Bundles: status-bepaling op meest 'dominante' status binnen
    // de groep. Conservatief: concept > ingepland > actief (toon in
    // de vroegste fase als 'er nog iets te doen is').
    for (const [groupId, group] of byGroup.entries()) {
      if (group.length === 0) continue;
      const groupChannels = group.map((c) => c.type);
      if (!matchesFilter(groupChannels)) continue;
      const statuses = new Set(group.map((c) => c.status));
      let target: KanbanColumn["key"] | null = null;
      if (statuses.has("concept")) target = "concept";
      else if (statuses.has("ingepland")) target = "ingepland";
      else if (statuses.has("actief")) target = "actief";
      if (target) {
        result[target].push({
          kind: "bundle-campaign",
          groupId,
          campaigns: group,
        });
      }
    }

    // Per 2026-05-21: sorteer elke kolom op vroegste scheduled-datum
    // oplopend (eerstvolgende bovenaan). Items zonder datum (bv. een
    // voorstel waar Filly nog geen tijdstip aan koppelde) belanden
    // onderaan zodat de eigenaar de geplande dingen vooraan ziet.
    const sortByDate = (a: BoardItem, b: BoardItem) => {
      const da = getEarliestScheduled(a).iso;
      const db = getEarliestScheduled(b).iso;
      if (!da && !db) return 0;
      if (!da) return 1;  // a heeft geen datum → naar achter
      if (!db) return -1; // b heeft geen datum → b naar achter
      return da.localeCompare(db); // ISO-strings zijn lexicografisch sorteer-baar
    };
    for (const key of ["voorstel", "concept", "ingepland", "actief"] as const) {
      result[key].sort(sortByDate);
    }

    return result;
  }, [campaigns, suggestions, channelFilter]);

  // ============================================================
  // Polymorfe handlers — werken op elk BoardItem-kind
  // ============================================================
  // Per actie 1 handler die zelf uitzoekt of het een single-suggestion,
  // bundle-suggestion, single-campaign of bundle-campaign is. Voor
  // bundles loopt 'ie parallel over alle items in de groep.

  // Wrapper om error-handling + busy-state niet 6× te dupliceren.
  const runAction = async (
    item: BoardItem,
    actionLabel: string,
    fn: () => Promise<void>,
  ) => {
    setBusyId(cardKey(item));
    try {
      await fn();
      await refetch();
    } catch (e) {
      alert(
        e instanceof Error
          ? e.message
          : `${actionLabel} mislukt. Probeer opnieuw.`,
      );
    } finally {
      setBusyId(null);
    }
  };

  // Default kanalen bij bundle-approve. Backend ondersteunt momenteel
  // alleen mail/instagram/facebook in approve-bundle; tiktok/whatsapp
  // komen via aparte single-suggestions binnen.
  const DEFAULT_BUNDLE: BundleChannel[] = ["mail", "instagram", "facebook"];

  // Goedkeur: voorstel → concept. Niet voor campaign-items.
  const handleApprove = (item: BoardItem) =>
    runAction(item, "Goedkeuren", async () => {
      if (item.kind === "bundle-suggestion") {
        await approveBundleSuggestion(item.data.id, DEFAULT_BUNDLE);
      } else if (item.kind === "suggestion") {
        await approveSuggestion(item.data.id);
      }
    });

  // Afwijs: voorstel → rejected. Bundle = enige record (de suggestion
  // zelf), kanaal-records hangen daar onder.
  const handleReject = (item: BoardItem) =>
    runAction(item, "Afwijzen", async () => {
      if (item.kind === "suggestion" || item.kind === "bundle-suggestion") {
        await updateSuggestion(item.data.id, "rejected");
      }
    });

  // Plan in: zet campagne(s) op ingepland. Voorstel = approve + meteen
  // ingepland, campagne = directe status-overgang.
  const handlePlan = (item: BoardItem) =>
    runAction(item, "Inplannen", async () => {
      if (item.kind === "suggestion") {
        const { campaignId } = await approveSuggestion(item.data.id);
        await updateCampaignStatus(campaignId, "ingepland");
      } else if (item.kind === "bundle-suggestion") {
        const result = await approveBundleSuggestion(
          item.data.id,
          DEFAULT_BUNDLE,
        );
        const ids = [
          result.mailCampaignId,
          result.instagramCampaignId,
          result.facebookCampaignId,
        ].filter((id): id is string => !!id);
        await Promise.all(
          ids.map((id) => updateCampaignStatus(id, "ingepland")),
        );
      } else if (item.kind === "campaign") {
        await updateCampaignStatus(item.data.id, "ingepland");
      } else if (item.kind === "bundle-campaign") {
        await Promise.all(
          item.campaigns.map((c) =>
            updateCampaignStatus(c.id, "ingepland"),
          ),
        );
      }
    });

  // (Activeer-nu zit voortaan op de detail-pagina, niet meer op de
  // kanban-card; handler-implementatie komt terug zodra detail-page
  // die actie aanbiedt.)

  // Terugtrekken: ingeplande campagne(s) terug naar concept zodat
  // eigenaar 'm nog kan aanpassen of verwijderen.
  const handleRetract = (item: BoardItem) =>
    runAction(item, "Terugtrekken", async () => {
      if (item.kind === "campaign") {
        await updateCampaignStatus(item.data.id, "concept");
      } else if (item.kind === "bundle-campaign") {
        await Promise.all(
          item.campaigns.map((c) => updateCampaignStatus(c.id, "concept")),
        );
      }
    });

  // Verwijderen: hard-delete. Backend staat 't alleen toe op concept
  // of ingepland (zodat actief/verzonden campagnes immutable zijn).
  const handleDelete = (item: BoardItem) => {
    const isBundle = item.kind === "bundle-campaign";
    const msg = isBundle
      ? "Verwijder alle campagnes in deze bundle? Dit is permanent."
      : "Verwijder deze campagne? Dit is permanent.";
    if (!window.confirm(msg)) return Promise.resolve();
    return runAction(item, "Verwijderen", async () => {
      if (item.kind === "campaign") {
        await deleteCampaign(item.data.id);
      } else if (item.kind === "bundle-campaign") {
        await Promise.all(item.campaigns.map((c) => deleteCampaign(c.id)));
      }
    });
  };

  return (
    <div className="page-full">
      <PageHeader
        title="Campagnes"
        actions={
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            {/* Kanaal-filter-chips. Klik = toggle. Leeg = alles tonen. */}
            <div
              style={{
                display: "flex",
                gap: 4,
                paddingRight: 8,
                borderRight: "1px solid var(--border, #E5DFD0)",
                marginRight: 4,
              }}
            >
              {(
                [
                  { key: "mail", label: "Mail" },
                  { key: "instagram", label: "Instagram" },
                  { key: "facebook", label: "Facebook" },
                  { key: "tiktok", label: "TikTok" },
                  { key: "whatsapp", label: "WhatsApp" },
                  { key: "google_business", label: "Google Business" },
                ] as const
              ).map((ch) => {
                const active = channelFilter.has(ch.key);
                return (
                  <button
                    key={ch.key}
                    type="button"
                    onClick={() => toggleChannel(ch.key)}
                    title={`Filter op ${ch.label}`}
                    className="ui-channel-chip"
                    data-active={active ? "true" : "false"}
                    aria-pressed={active}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        lineHeight: 1,
                      }}
                    >
                      {ch.label}
                    </span>
                  </button>
                );
              })}
              {channelFilter.size > 0 && (
                <button
                  type="button"
                  onClick={() => setChannelFilter(new Set())}
                  title="Filter wissen"
                  style={{
                    padding: "6px 8px",
                    fontSize: 11,
                    border: "1px solid transparent",
                    background: "transparent",
                    color: "var(--tl)",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              )}
            </div>
            <Link
              href="/dashboard/campagnes/history"
              style={{ textDecoration: "none" }}
            >
              <Button variant="brand-soft">📦 Historie</Button>
            </Link>
          </div>
        }
      />

      {/* Alert-block: rustige + speciale dagen + "Vraag Filly om
          voorstellen"-knop. Zelfde block als op het dashboard, hier
          plek-relevant want eigenaar landt op /campagnes als hij iets
          met die dagen wil doen. */}
      <UpcomingActionsBlock layout="flex" />

      {/* Kanban-bord. Op desktop: 4 kolommen naast elkaar. Op mobile
          (< 900px): kolommen onder elkaar (stack) zodat scrollen
          natuurlijk verticaal is. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        {COLUMNS.map((col) => {
          const items = columns[col.key];
          return (
            <KanbanColumn
              key={col.key}
              column={col}
              items={items}
              loading={loading}
              busyId={busyId}
              onApprove={handleApprove}
              onReject={handleReject}
              onPlan={handlePlan}
              onRetract={handleRetract}
              onDelete={handleDelete}
            />
          );
        })}
      </div>

    </div>
  );
}

// ============================================================
// KanbanColumn, één kolom met kop + cards
// ============================================================
type ColumnProps = {
  column: KanbanColumn;
  items: BoardItem[];
  loading: boolean;
  busyId: string | null;
  onApprove: ActionHandler;
  onReject: ActionHandler;
  onPlan: ActionHandler;
  onRetract: ActionHandler;
  onDelete: ActionHandler;
};

type ActionHandler = (item: BoardItem) => void | Promise<void>;

function KanbanColumn({
  column,
  items,
  loading,
  busyId,
  onApprove,
  onReject,
  onPlan,
  onRetract,
  onDelete,
}: ColumnProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minHeight: 200,
      }}
    >
      {/* Kolom-header in eigen witte sub-card. Titel + counter rechts,
          subtitle eronder. Bewust geen kolom-bg meer eromheen zodat
          de pagina-layout strakker oogt — header + cards zijn nu
          allebei losse witte blokken, geen verzamelde kaart-binnen-kaart. */}
      <div
        style={{
          background: "var(--white, #FFFFFF)",
          border: "1px solid var(--border, #E5DFD0)",
          borderRadius: 8,
          padding: "12px 14px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "var(--text, #18181B)",
              letterSpacing: "-0.01em",
            }}
          >
            {column.label}
          </div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--tl)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {items.length}
          </div>
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--tl)",
            marginTop: 4,
          }}
        >
          {column.description}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          flex: 1,
        }}
      >
        {loading ? (
          [1, 2].map((i) => (
            <Skeleton key={i} height={86} style={{ borderRadius: 8 }} />
          ))
        ) : items.length === 0 ? (
          <div
            style={{
              fontSize: 12,
              color: "var(--tl)",
              padding: "16px 8px",
              textAlign: "center",
              border: "1px dashed var(--border, #E5DFD0)",
              borderRadius: 8,
            }}
          >
            Niks in deze kolom
          </div>
        ) : (
          items.map((item) => (
            <BoardCard
              key={cardKey(item)}
              item={item}
              busy={busyId === cardKey(item)}
              onApprove={onApprove}
              onReject={onReject}
              onPlan={onPlan}
              onRetract={onRetract}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}

function cardKey(item: BoardItem): string {
  if (item.kind === "bundle-campaign") return `bundle-camp-${item.groupId}`;
  if (item.kind === "bundle-suggestion") return `bundle-sug-${item.data.id}`;
  if (item.kind === "suggestion") return `sug-${item.data.id}`;
  return `camp-${item.data.id}`;
}

// Detail-URL per item-kind. Per 2026-05-13 (unified-detail-page):
// alle Campaign-cards (single én bundle) gaan naar dezelfde URL
// /campagnes/[id], waarbij [id] een campaign-id of group-id mag
// zijn (backend smart-detect). Alleen voorstellen blijven op
// /voorstel/[id] omdat dat een suggestion-id is met aparte fetch.
function cardHref(item: BoardItem): string {
  if (item.kind === "suggestion" || item.kind === "bundle-suggestion")
    return `/dashboard/campagnes/voorstel/${item.data.id}`;
  if (item.kind === "bundle-campaign")
    return `/dashboard/campagnes/${item.groupId}`;
  return `/dashboard/campagnes/${item.data.id}`;
}

// Status van het item, ongeacht of het een suggestion of campaign is.
// Voor suggestion → "voorstel"; voor campaign-bundle → meest "vroege"
// fase (zelfde logica als in de kolom-distributie).
function itemStatus(
  item: BoardItem,
): "voorstel" | "concept" | "ingepland" | "actief" {
  if (item.kind === "suggestion" || item.kind === "bundle-suggestion")
    return "voorstel";
  if (item.kind === "campaign") {
    if (item.data.status === "ingepland") return "ingepland";
    if (item.data.status === "actief") return "actief";
    return "concept";
  }
  // bundle-campaign: domineer op concept > ingepland > actief.
  const statuses = new Set(item.campaigns.map((c) => c.status));
  if (statuses.has("concept")) return "concept";
  if (statuses.has("ingepland")) return "ingepland";
  return "actief";
}

// Titel + bundle-pill voor de card-header. Voor bundles strippen we
// de eventuele "— mail/instagram/..."-suffix op de eerste campagne-
// naam zodat de bundle-titel niet platform-specifiek leest.
function cardTitleText(item: BoardItem): {
  text: string;
  isBundle: boolean;
} {
  if (item.kind === "suggestion") {
    return { text: suggestionDisplayName(item.data), isBundle: false };
  }
  if (item.kind === "bundle-suggestion") {
    return { text: suggestionDisplayName(item.data), isBundle: true };
  }
  if (item.kind === "bundle-campaign") {
    const first = item.campaigns[0];
    const cleaned =
      first.name.replace(
        /\s*[—\-·]\s*(mail|instagram|facebook|tiktok|whatsapp)\s*$/i,
        "",
      ) || first.name;
    return { text: cleaned, isBundle: true };
  }
  return { text: item.data.name, isBundle: false };
}

// Rij(en) per kanaal voor de card. Voor suggestion: per channel-check;
// voor campaign (bundle) per campaign-record.
function buildItemRows(item: BoardItem): ChannelRow[] {
  if (item.kind === "suggestion" || item.kind === "bundle-suggestion") {
    return buildSuggestionRows(item.data);
  }
  if (item.kind === "campaign") {
    return [buildCampaignRow(item.data)];
  }
  return item.campaigns.map(buildCampaignRow);
}

// ============================================================
// BoardCard, één kaart op het bord
// ============================================================
// Unified layout door alle 4 statussen heen:
//   - cardHeader  : icon + titel + (optioneel) bundle-pill
//   - channelRows : 1 regel per kanaal (kanaal-icon · datum · status)
//   - actions     : status-specifieke knoppen via <CardActions>
type CardProps = {
  item: BoardItem;
  busy: boolean;
  onApprove: ActionHandler;
  onReject: ActionHandler;
  onPlan: ActionHandler;
  onRetract: ActionHandler;
  onDelete: ActionHandler;
};

function BoardCard({
  item,
  busy,
  onApprove,
  onReject,
  onPlan,
  onRetract,
  onDelete,
}: CardProps) {
  const title = cardTitleText(item);
  const rows = buildItemRows(item);
  const status = itemStatus(item);
  const platforms = getItemPlatforms(item);
  const sched = getEarliestScheduled(item);
  // Status-kleur stuurt de 4px linker-streep — 1 kleur-accent per card
  // ipv meerdere gekleurde pillen. Box-shadow inset zodat de uniforme
  // 1px border eromheen niet hoeft te breken.
  const statusBarColor = cardStatusColor(status, rows);
  return (
    <Link
      href={cardHref(item)}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div
        style={{
          ...cardStyle,
          boxShadow: `inset 4px 0 0 0 ${statusBarColor}`,
          paddingLeft: 14,
        }}
      >
        <div style={cardHeaderRow}>
          <span style={cardTitle}>{title.text}</span>
          {/* Bundle-pill verwijderd per 2026-05-13 op verzoek:
              de "WhatsApp · social · Mail"-regel hieronder geeft
              al aan dat het multi-channel is, een extra label
              zou alleen ruis zijn. */}
        </div>
        <ScheduledLine sched={sched} status={status} />
        <ChannelLine platforms={platforms} />
        <CardStatusBlock status={status} rows={rows} item={item} />
        <CardActions
          item={item}
          status={status}
          rows={rows}
          busy={busy}
          onApprove={onApprove}
          onReject={onReject}
          onPlan={onPlan}
          onRetract={onRetract}
          onDelete={onDelete}
        />
      </div>
    </Link>
  );
}

// ============================================================
// ChannelLine, platte tekst met platform-namen
// ============================================================
// Was eerst een chip-rij maar dat voelde te kleurrijk; nu één regel
// "Mail · Instagram · Facebook" in subtiele grijze tekst — read-only
// info hoort geen kleur-vlak op te eisen.
function ChannelLine({ platforms }: { platforms: string[] }) {
  if (platforms.length === 0) return null;
  return (
    <div
      style={{
        fontSize: 11,
        color: "var(--tl)",
        marginTop: 4,
      }}
    >
      {platforms.map((p) => PLATFORM_LABEL[p] ?? p).join(" · ")}
    </div>
  );
}

// ============================================================
// ScheduledLine, datum/tijd-regel op de card
// ============================================================
// Voor Ingepland tonen we ook de relatieve tijd ("over 3 dgn").
// Voor bundle met meerdere momenten "vanaf X mei".
function ScheduledLine({
  sched,
  status,
}: {
  sched: { iso: string | null; multiple: boolean };
  status: "voorstel" | "concept" | "ingepland" | "actief";
}) {
  if (!sched.iso) {
    if (status === "actief") return null;
    return <div style={cardDatePrimary}>Geen datum</div>;
  }
  // Pure datum (YYYY-MM-DD) vs. timestamp herkennen — pure datum
  // tonen we zonder tijd-suffix.
  const hasTime = sched.iso.includes("T") || sched.iso.includes(" ");
  const text = shortDateTime(sched.iso, hasTime);
  if (status === "ingepland") {
    return (
      <div style={cardDatePrimary}>
        {text}{" "}
        <span style={{ fontWeight: 400, color: "var(--tl)" }}>
          · {relativeSuffix(sched.iso)}
        </span>
      </div>
    );
  }
  if (sched.multiple) {
    return <div style={cardDatePrimary}>vanaf {text}</div>;
  }
  return <div style={cardDatePrimary}>{text}</div>;
}

// ============================================================
// CardStatusBlock, samenvatting boven de knoppen
// ============================================================
// Platte tekst i.p.v. pill — minder visuele ruis. Kleur komt uit de
// statusColor() helper en stuurt zowel deze tekst-kleur als de
// linker-streep op de card.
// - Voorstel/Concept : "Alles compleet" of "Datum, Foto ontbreken"
// - Ingepland       : geen indicator (datum staat al in ScheduledLine)
// - Actief          : "Loopt" of "+3 reserveringen"
function CardStatusBlock({
  status,
  rows,
  item,
}: {
  status: "voorstel" | "concept" | "ingepland" | "actief";
  rows: ChannelRow[];
  item: BoardItem;
}) {
  if (status === "ingepland") return null;
  if (status === "actief") {
    const extra =
      item.kind === "campaign"
        ? item.data.result_stats?.extra_reservations ?? 0
        : item.kind === "bundle-campaign"
          ? item.campaigns.reduce(
              (sum, c) => sum + (c.result_stats?.extra_reservations ?? 0),
              0,
            )
          : 0;
    return (
      <div style={statusTextReady}>
        {extra > 0 ? `+${extra} reserveringen` : "Loopt"}
      </div>
    );
  }
  // voorstel / concept — per 2026-05-13 op verzoek van Floris:
  // alleen 'Compleet' (groen) of 'Incompleet' (amber). De
  // specifieke veldnamen tonen we niet meer; eigenaar ziet die
  // wel op de detail-pagina (Missende aspecten-card).
  const missing = getAllMissing(rows);
  return missing.length === 0 ? (
    <div style={statusTextReady}>Compleet</div>
  ) : (
    <div style={statusTextIncomplete}>Incompleet</div>
  );
}

// Status-kleur per card. Stuurt linker-streep + status-tekst-kleur.
function cardStatusColor(
  status: "voorstel" | "concept" | "ingepland" | "actief",
  rows: ChannelRow[],
): string {
  if (status === "actief") return "var(--color-brand-deep, #1F4A2D)";
  if (status === "ingepland") return "#94A3B8"; // slate-400, neutraal
  // voorstel / concept: ready = brand-groen; missing = amber
  return getAllMissing(rows).length === 0
    ? "var(--color-brand, #1F4A2D)"
    : "#F59E0B"; // amber-500
}

// ============================================================
// CardActions, status-specifieke knoppensets (simpel)
// ============================================================
// Voorstel : ✓ Goedkeur + × Afwijzen          (Goedkeur disabled tot ready)
// Concept  : 📅 Plan in + × Verwijderen        (Plan in disabled tot ready)
// Ingepland: ↩ Terugtrekken (full-width)
// Actief   : geen knoppen (read-only)
//
// Plan in en Activeer nu zitten voortaan op de detail-pagina; de card
// is bewust een quick-approve/reject UI. Eigenaar klikt op de card-body
// (Link) om naar detail te gaan voor extra acties.
type CardActionsProps = {
  item: BoardItem;
  status: "voorstel" | "concept" | "ingepland" | "actief";
  rows: ChannelRow[];
  busy: boolean;
  onApprove: ActionHandler;
  onReject: ActionHandler;
  onPlan: ActionHandler;
  onRetract: ActionHandler;
  onDelete: ActionHandler;
};

function CardActions({
  item,
  status,
  rows,
  busy,
  onApprove,
  onReject,
  onPlan,
  onRetract,
  onDelete,
}: CardActionsProps) {
  const router = useRouter();
  const ready = rowsReady(rows);

  if (status === "actief") return null;

  const stop = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  // Klik op de grijze hoofdknop (Goedkeur / Plan in) bij missing velden
  // navigeert naar de detail-pagina zodat eigenaar daar kan aanvullen.
  const handleMain = (action: () => void) => (e: React.MouseEvent) => {
    stop(e);
    if (busy) return;
    if (ready) action();
    else router.push(cardHref(item));
  };

  if (status === "voorstel") {
    return (
      <div style={actionsContainer} onClick={stop}>
        <div style={actionRow}>
          <button
            type="button"
            disabled={busy}
            onClick={handleMain(() => onApprove(item))}
            style={ready ? btnPrimaryReady : btnPrimaryGrey}
            title={
              ready
                ? "Voorstel goedkeuren — wordt concept"
                : "Vul eerst de ontbrekende velden in — klik om naar het voorstel te gaan"
            }
          >
            {busy ? "..." : "Goedkeur"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              stop(e);
              onReject(item);
            }}
            style={btnDangerGhost}
          >
            Afwijzen
          </button>
        </div>
      </div>
    );
  }

  if (status === "concept") {
    return (
      <div style={actionsContainer} onClick={stop}>
        <div style={actionRow}>
          <button
            type="button"
            disabled={busy}
            onClick={handleMain(() => onPlan(item))}
            style={ready ? btnPrimaryReady : btnPrimaryGrey}
            title={
              ready
                ? "Plan deze campagne in op het ingestelde moment"
                : "Vul eerst de ontbrekende velden in — klik om naar de campagne te gaan"
            }
          >
            {busy ? "..." : "Plan in"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              stop(e);
              onDelete(item);
            }}
            style={btnDangerGhost}
          >
            Verwijderen
          </button>
        </div>
      </div>
    );
  }

  // status === "ingepland"
  return (
    <div style={actionsContainer} onClick={stop}>
      <button
        type="button"
        disabled={busy}
        onClick={(e) => {
          stop(e);
          onRetract(item);
        }}
        style={btnSecondaryFull}
        title="Terug naar concept zodat je 'm kunt aanpassen of verwijderen"
      >
        Terugtrekken
      </button>
    </div>
  );
}

// ============================================================
// Shared card styles
// ============================================================
const cardStyle: React.CSSProperties = {
  background: "var(--white, #FFFFFF)",
  border: "1px solid var(--border, #E5DFD0)",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 12,
  cursor: "pointer",
  transition: "box-shadow 0.15s ease",
};
const cardHeaderRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  marginBottom: 4,
};
const cardTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--text, #18181B)",
  flex: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const cardSubtle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--tl)",
  marginTop: 2,
};
// Prominente datum-regel direct onder de titel. Iets groter dan de
// subtle-stijl en eigen kleur (var(--text)) zodat 'ie als hoofd-info
// leest, niet als bijschrift.
const cardDatePrimary: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--text, #18181B)",
  marginTop: 4,
  display: "flex",
  alignItems: "center",
  gap: 4,
};
const bundlePill: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  color: "var(--brand-deep, #1F4A2D)",
  background: "var(--brand-soft, #D6E0D8)",
  padding: "2px 6px",
  borderRadius: 999,
  textTransform: "uppercase",
  letterSpacing: 0.3,
  flexShrink: 0,
};
// Status-tekst onder de kanalen. Geen gekleurde pill meer (was te
// kleurrijk over 6 cards heen); platte tekst met kleur-letters past
// professioneler. De 4px linker-streep op de card draagt de visuele
// status zodat deze regel klein mag blijven.
const statusTextReady: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--color-brand-deep, #1F4A2D)",
  marginTop: 6,
};
const statusTextMissing: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: "var(--text, #18181B)",
  marginTop: 6,
};
// Per 2026-05-13: 'Incompleet'-label in amber. Compleet hergebruikt
// statusTextReady (groen) hierboven. Detail vind eigenaar op de
// detail-pagina (Missende aspecten-card).
const statusTextIncomplete: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#B45309", // amber-700 — sterke leesbaarheid op licht canvas
  marginTop: 6,
};

// Acties-container + horizontale rij voor Goedkeur/Afwijzen (of
// Plan-in/Verwijderen op concept).
const actionsContainer: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  marginTop: 10,
};
const actionRow: React.CSSProperties = {
  display: "flex",
  gap: 6,
};

// Basis voor alle card-knoppen: witte bg, dunne grijze border, donker
// label, neutrale rust-state. Kleur komt pas op hover. Geïnspireerd
// op de bestaande Button variant="secondary" maar dan via inline-style
// zodat we kleur-overrides (Afwijzen rood) makkelijk kunnen toepassen.
const btnBase: React.CSSProperties = {
  flex: 1,
  minHeight: 28,
  padding: "5px 12px",
  fontSize: 13,
  fontWeight: 500,
  background: "var(--color-white, #FFFFFF)",
  color: "var(--text, #18181B)",
  border: "1px solid var(--color-border, #E5DFD0)",
  borderRadius: "var(--radius, 6px)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
  whiteSpace: "nowrap",
  transition:
    "background 120ms ease, border-color 120ms ease, color 120ms ease",
};
// Goedkeur / Plan in: ready = donker-groene tekst (de actie heeft
// merkbetekenis). Hover wisselt naar brand-soft fill via :hover in
// een eventueel later CSS-bestand; voor nu blijft 'ie rustig wit.
const btnPrimaryReady: React.CSSProperties = {
  ...btnBase,
  color: "var(--color-brand-deep, #1F4A2D)",
  borderColor: "var(--color-brand, #1F4A2D)",
};
const btnPrimaryGrey: React.CSSProperties = {
  ...btnBase,
  color: "#A1A1AA",
};
// Afwijzen / Verwijderen: zelfde rustige basis, alleen donker-rode
// tekst om destructieve intent te tonen. Geen lichtrode achtergrond
// in rust — die zou de card weer kleurrijk maken.
const btnDangerGhost: React.CSSProperties = {
  ...btnBase,
  color: "#B91C1C", // rood-700
};
// Volledig-brede secondary, voor Terugtrekken op Ingepland.
const btnSecondaryFull: React.CSSProperties = {
  ...btnBase,
  flex: undefined,
  width: "100%",
};
