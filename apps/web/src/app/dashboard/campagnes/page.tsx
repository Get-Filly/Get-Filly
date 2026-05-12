"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  approveBundleSuggestion,
  approveSuggestion,
  fetchCampaigns,
  fetchSuggestions,
  updateCampaignStatus,
  updateSuggestion,
  type AiSuggestion,
  type Campaign,
} from "../../../lib/api";
import { TasksStrip } from "../_components/tasks-strip";
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
// TasksStrip (Overige acties) blijft staan onderaan tot Floris
// besloten heeft hoe daar verder mee om te gaan.

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

// Body-snippet voor de preview op de kaart. Single = body uit eerste
// variant of legacy body-veld. Bundle = theme als 'ie er is, anders
// de body van het eerste kanaal.
function suggestionSnippet(s: AiSuggestion): string | null {
  const sc = s.suggested_campaign;
  // Bundle (multi-channel): theme heeft prioriteit, dat is 1 zin
  // die alle kanalen samen beschrijft.
  if (sc.channels && sc.channels.length > 0) {
    const theme = (sc as { theme?: string }).theme;
    if (theme) return truncate(theme, 100);
    const first = sc.channels[0]?.variants?.[0]?.body;
    if (first) return truncate(first, 100);
    return null;
  }
  // Single: variants[selected_index].body, anders eerste variant,
  // anders legacy body-veld.
  if (sc.variants && sc.variants.length > 0) {
    const idx = sc.selected_index ?? 0;
    const v = sc.variants[idx] ?? sc.variants[0];
    if (v?.body) return truncate(v.body, 100);
  }
  if (sc.body) return truncate(sc.body, 100);
  if (sc.caption) return truncate(sc.caption, 100);
  return null;
}

// Doelgroep-label uit trigger_context.target_segment (gezet door
// Filly bij het genereren). Kan null zijn voor oudere suggesties.
function suggestionSegment(s: AiSuggestion): string | null {
  const ctx = s.trigger_context;
  if (ctx && typeof ctx === "object" && "target_segment" in ctx) {
    const seg = (ctx as { target_segment?: string }).target_segment;
    if (typeof seg === "string" && seg.trim()) return seg.trim();
  }
  return null;
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

// Datum-regel: voor single = 1 datum-tijd, voor bundle =
// "✉️ 10 mei 09:00 · 📱 11 mei 17:00".
function suggestionDateLabel(s: AiSuggestion): string | null {
  const sc = s.suggested_campaign;
  if (sc.channels && sc.channels.length > 0) {
    const parts: string[] = [];
    for (const ch of sc.channels) {
      const when = ch.scheduled_for ?? ch.filly_scheduled_for;
      if (!when) continue;
      parts.push(
        `${typeIcon(ch.platform)} ${shortDateTime(when, true)}`,
      );
    }
    if (parts.length > 0) return parts.join(" · ");
  }
  if (sc.scheduled_for) {
    return shortDateTime(sc.scheduled_for, true);
  }
  const ctx = s.trigger_context;
  if (ctx && typeof ctx === "object" && "target_date" in ctx) {
    const date = (ctx as { target_date?: string }).target_date;
    if (date) {
      // target_date is een pure datum (YYYY-MM-DD), geen tijd erbij.
      return shortDateTime(date, false);
    }
  }
  return null;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max).trimEnd() + "…";
}

function formatRelativeDate(iso: string | null): string {
  if (!iso) return "Geen datum";
  const target = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetMidnight = new Date(target);
  targetMidnight.setHours(0, 0, 0, 0);
  const diff = Math.round(
    (targetMidnight.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  const dayTime = shortDateTime(iso, true);
  if (diff < 0) return `${dayTime} · verleden`;
  if (diff === 0) return `${dayTime} · vandaag`;
  if (diff === 1) return `${dayTime} · morgen`;
  return `${dayTime} · over ${diff} dgn`;
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
  // Per-item actie-state (approve / reject pending).
  const [busyId, setBusyId] = useState<string | null>(null);
  // Expanded bundle-cards (legacy, ongebruikt sinds card-revisie).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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
    const byGroup = new Map<string, Campaign[]>();
    const standalone: Campaign[] = [];
    for (const c of campaigns) {
      if (c.status === "afgerond") continue;
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

    return result;
  }, [campaigns, suggestions, channelFilter]);

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleApprove = async (s: AiSuggestion) => {
    setBusyId(s.id);
    try {
      if (s.trigger_type === "chat_bundle") {
        // Default: alle 3 kanalen meenemen (mail + instagram + facebook).
        // Bundle-detail-pagina laat eigenaar straks per kanaal opt-in/out.
        await approveBundleSuggestion(s.id, ["mail", "instagram", "facebook"]);
      } else {
        await approveSuggestion(s.id);
      }
      await refetch();
    } catch (e) {
      alert(
        e instanceof Error
          ? e.message
          : "Goedkeuren mislukt. Probeer opnieuw.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (s: AiSuggestion) => {
    setBusyId(s.id);
    try {
      await updateSuggestion(s.id, "rejected");
      await refetch();
    } catch (e) {
      alert(
        e instanceof Error
          ? e.message
          : "Afwijzen mislukt. Probeer opnieuw.",
      );
    } finally {
      setBusyId(null);
    }
  };

  // Concept-campagne goedkeuren: status → ingepland. Vereist dat
  // scheduled_for al gezet is (anders weet de backend niet wanneer
  // 'm te versturen). Als die ontbreekt: toon foutmelding + leid
  // door naar de detail-page om eerst een datum te kiezen.
  const handleApproveConcept = async (c: Campaign) => {
    if (!c.scheduled_for) {
      alert(
        "Stel eerst een verzendmoment in voordat je de campagne goedkeurt.",
      );
      return;
    }
    setBusyId(c.id);
    try {
      await updateCampaignStatus(c.id, "ingepland");
      await refetch();
    } catch (e) {
      alert(
        e instanceof Error
          ? e.message
          : "Goedkeuren mislukt. Probeer opnieuw.",
      );
    } finally {
      setBusyId(null);
    }
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
                  { key: "mail", icon: "✉️", label: "Mail" },
                  { key: "instagram", icon: "📱", label: "Instagram" },
                  { key: "facebook", icon: "👥", label: "Facebook" },
                  { key: "tiktok", icon: "🎵", label: "TikTok" },
                  { key: "whatsapp", icon: "💬", label: "WhatsApp" },
                  { key: "social", icon: "📱", label: "Social (legacy)" },
                ] as const
              ).map((ch) => {
                const active = channelFilter.has(ch.key);
                // 'social' is een legacy-type voor campagnes vóór de
                // platform-split (2026-05-07). Toon 'm niet apart in
                // de UI tenzij eigenaar hem al gebruikt heeft.
                if (ch.key === "social") return null;
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
                    {ch.icon}
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
              expanded={expanded}
              onToggleExpand={toggleExpand}
              onApprove={handleApprove}
              onReject={handleReject}
              onApproveConcept={handleApproveConcept}
            />
          );
        })}
      </div>

      {/* Overige acties (TasksStrip): blijft voorlopig — Floris
          beslist later hoe dit blok evolueert. */}
      <TasksStrip />
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
  expanded: Set<string>;
  onToggleExpand: (key: string) => void;
  onApprove: (s: AiSuggestion) => void;
  onReject: (s: AiSuggestion) => void;
  onApproveConcept: (c: Campaign) => void;
};

function KanbanColumn({
  column,
  items,
  loading,
  busyId,
  expanded,
  onToggleExpand,
  onApprove,
  onReject,
  onApproveConcept,
}: ColumnProps) {
  return (
    <div
      style={{
        background: "var(--bg-soft, #FAF7F1)",
        border: "1px solid var(--border, #E5DFD0)",
        borderRadius: 10,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        minHeight: 200,
      }}
    >
      <div style={{ marginBottom: 10 }}>
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
              fontSize: 14,
              fontWeight: 700,
              color: "var(--text, #18181B)",
            }}
          >
            {column.label}
          </div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--tl)",
              background: "var(--white, #FFFFFF)",
              border: "1px solid var(--border, #E5DFD0)",
              padding: "2px 8px",
              borderRadius: 999,
            }}
          >
            {items.length}
          </div>
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--tl)",
            marginTop: 2,
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
          items.map((item) => {
            const sid = itemSuggestionId(item);
            const cid =
              item.kind === "campaign" ? item.data.id : null;
            return (
              <BoardCard
                key={cardKey(item)}
                item={item}
                busy={
                  (sid != null && busyId === sid) ||
                  (cid != null && busyId === cid)
                }
                isExpanded={expanded.has(cardKey(item))}
                onToggleExpand={() => onToggleExpand(cardKey(item))}
                onApprove={onApprove}
                onReject={onReject}
                onApproveConcept={onApproveConcept}
              />
            );
          })
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

function itemSuggestionId(item: BoardItem): string | null {
  if (item.kind === "suggestion" || item.kind === "bundle-suggestion")
    return item.data.id;
  return null;
}

// ============================================================
// BoardCard, één kaart op het bord
// ============================================================
type CardProps = {
  item: BoardItem;
  busy: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onApprove: (s: AiSuggestion) => void;
  onReject: (s: AiSuggestion) => void;
  onApproveConcept: (c: Campaign) => void;
};

function BoardCard({
  item,
  busy,
  isExpanded,
  onToggleExpand,
  onApprove,
  onReject,
  onApproveConcept,
}: CardProps) {
  // Voorstel (single-channel): naam + kanaal + datum + snippet +
  // doelgroep + acties. Uniforme template binnen de Voorstel-kolom.
  if (item.kind === "suggestion") {
    const s = item.data;
    const date = suggestionDateLabel(s);
    const snippet = suggestionSnippet(s);
    return (
      <Link
        href={`/dashboard/campagnes/voorstel/${s.id}`}
        style={{ textDecoration: "none", color: "inherit" }}
      >
        <div style={cardStyle}>
          <div style={cardHeaderRow}>
            <span style={{ fontSize: 16 }}>
              {typeIcon(suggestionDisplayType(s))}
            </span>
            <span style={cardTitle}>{suggestionDisplayName(s)}</span>
          </div>
          {date && <div style={cardSubtle}>{date}</div>}
          {snippet && <div style={cardSnippet}>{snippet}</div>}
          <div
            style={{ display: "flex", gap: 6, marginTop: 10 }}
            onClick={(e) => e.preventDefault()}
          >
            <button
              type="button"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                onApprove(s);
              }}
              style={btnApprove}
            >
              {busy ? "..." : "✓ Goedkeur"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                onReject(s);
              }}
              style={btnReject}
            >
              ✗ Wijs af
            </button>
          </div>
        </div>
      </Link>
    );
  }

  // Bundle-voorstel: zelfde template als single-voorstel, maar met
  // multi-kanaal-datum-regel + BUNDLE-pill. Klik op de card-body (niet
  // op de knoppen) navigeert naar voorstel-detail.
  if (item.kind === "bundle-suggestion") {
    const s = item.data;
    const date = suggestionDateLabel(s);
    const snippet = suggestionSnippet(s);
    const channels = s.suggested_campaign.channels ?? [];
    return (
      <Link
        href={`/dashboard/campagnes/voorstel/${s.id}`}
        style={{ textDecoration: "none", color: "inherit" }}
      >
        <div style={cardStyle}>
          <div style={cardHeaderRow}>
            <span style={{ fontSize: 16 }}>🎁</span>
            <span style={cardTitle}>{suggestionDisplayName(s)}</span>
            <span style={bundlePill}>Bundle</span>
          </div>
          {date ? (
            <div style={cardSubtle}>{date}</div>
          ) : (
            channels.length > 0 && (
              <div style={cardSubtle}>
                {channels.map((ch) => typeIcon(ch.platform)).join(" · ")}
              </div>
            )
          )}
          {snippet && <div style={cardSnippet}>{snippet}</div>}
          <div
            style={{ display: "flex", gap: 6, marginTop: 10 }}
            onClick={(e) => e.preventDefault()}
          >
            <button
              type="button"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                onApprove(s);
              }}
              style={btnApprove}
            >
              {busy ? "..." : "✓ Goedkeur"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                onReject(s);
              }}
              style={btnReject}
            >
              ✗ Wijs af
            </button>
          </div>
        </div>
      </Link>
    );
  }

  // Bundle-campagne: 1 card met multi-kanaal-datum-regel. Klik =
  // navigeer naar bundle-detail. Geen expand-knop meer (per kanaal
  // zie je daar). Body-snippet/segment tonen we hier nog niet voor
  // campagnes (komt zodra backend list-response uitgebreid is).
  if (item.kind === "bundle-campaign") {
    const first = item.campaigns[0];
    const name =
      first.name.replace(
        /\s*[—\-·]\s*(mail|instagram|facebook|tiktok|whatsapp)\s*$/i,
        "",
      ) || first.name;
    const dateLabel = item.campaigns
      .map((c) => {
        if (!c.scheduled_for) return null;
        return `${typeIcon(c.type)} ${shortDateTime(c.scheduled_for, true)}`;
      })
      .filter((s): s is string => !!s)
      .join(" · ");
    // Body-preview: pak de eerste campagne in de groep die er een
    // heeft (vaak de mail-versie heeft de rijkste tekst).
    const snippet =
      item.campaigns.find((c) => c.body_preview)?.body_preview ?? null;
    return (
      <Link
        href={`/dashboard/campagnes/bundle/${item.groupId}`}
        style={{ textDecoration: "none", color: "inherit" }}
      >
        <div style={cardStyle}>
          <div style={cardHeaderRow}>
            <span style={{ fontSize: 16 }}>🎁</span>
            <span style={cardTitle}>{name}</span>
            <span style={bundlePill}>Bundle</span>
          </div>
          <div style={cardSubtle}>
            {dateLabel ||
              item.campaigns.map((c) => typeIcon(c.type)).join(" · ")}
          </div>
          {snippet && <div style={cardSnippet}>{snippet}</div>}
        </div>
      </Link>
    );
  }

  // Standalone campagne: zelfde template als voorstel-card (naam +
  // kanaal-icon + datum/status + body-snippet). Body komt uit
  // backend campaign-list met joined content (mail / social).
  // Concept-cards krijgen extra '✓ Goedkeur'-knop die status →
  // ingepland zet (vereist scheduled_for op de campagne).
  const c = item.data;
  const isApprovableConcept =
    c.status === "concept" && !!c.scheduled_for;
  return (
    <Link
      href={`/dashboard/campagnes/${c.id}`}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div style={cardStyle}>
        <div style={cardHeaderRow}>
          <span style={{ fontSize: 16 }}>{typeIcon(c.type)}</span>
          <span style={cardTitle}>{c.name}</span>
        </div>
        <div style={cardSubtle}>
          {c.status === "ingepland" && c.scheduled_for
            ? formatRelativeDate(c.scheduled_for)
            : campaignDateLine(c)}
        </div>
        {c.body_preview && (
          <div style={cardSnippet}>{c.body_preview}</div>
        )}
        {c.status === "concept" && (
          <div
            style={{ marginTop: 10 }}
            onClick={(e) => e.preventDefault()}
          >
            <button
              type="button"
              disabled={busy || !isApprovableConcept}
              onClick={(e) => {
                e.stopPropagation();
                onApproveConcept(c);
              }}
              title={
                isApprovableConcept
                  ? "Verplaats naar Ingepland — campagne loopt mee op het gezette moment"
                  : "Zet eerst een verzendmoment op de detail-pagina"
              }
              style={{ ...btnApprove, width: "100%" }}
            >
              {busy ? "..." : "✓ Goedkeur & plan in"}
            </button>
          </div>
        )}
      </div>
    </Link>
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
const cardSnippet: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-secondary, #52525B)",
  marginTop: 6,
  lineHeight: 1.4,
  // 2 regels max bij heel lange snippets — voorkomt dat 1 card de
  // hele kolom overneemt.
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};
const cardSegment: React.CSSProperties = {
  fontSize: 10,
  color: "var(--accent, #1F4A2D)",
  marginTop: 6,
  fontWeight: 500,
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
const btnApprove: React.CSSProperties = {
  flex: 1,
  padding: "5px 8px",
  fontSize: 11,
  fontWeight: 500,
  border: "1px solid var(--brand, #1F4A2D)",
  background: "var(--brand, #1F4A2D)",
  color: "#FFFFFF",
  borderRadius: 5,
  cursor: "pointer",
};
const btnReject: React.CSSProperties = {
  flex: 1,
  padding: "5px 8px",
  fontSize: 11,
  fontWeight: 500,
  border: "1px solid var(--border, #E5DFD0)",
  background: "transparent",
  color: "var(--tl)",
  borderRadius: 5,
  cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  padding: "5px 8px",
  fontSize: 11,
  fontWeight: 500,
  border: "1px solid var(--border, #E5DFD0)",
  background: "transparent",
  color: "var(--tl)",
  borderRadius: 5,
  cursor: "pointer",
  flexShrink: 0,
};
const expandWrap: React.CSSProperties = {
  marginTop: 8,
  paddingTop: 8,
  borderTop: "1px solid var(--border, #E5DFD0)",
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 11,
};
const expandRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "4px 6px",
  borderRadius: 4,
  background: "var(--bg-soft, #FAF7F1)",
};
