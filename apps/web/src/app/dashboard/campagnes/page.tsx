"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  approveBundleSuggestion,
  approveSuggestion,
  fetchCampaigns,
  fetchSuggestions,
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

function suggestionReasoning(s: AiSuggestion): string | null {
  if (s.reasoning) return s.reasoning;
  const ctx = s.trigger_context;
  if (!ctx) return null;
  if (typeof ctx === "object" && "target_date" in ctx) {
    const date = (ctx as { target_date?: string }).target_date;
    return date ? `Voor ${date}` : null;
  }
  return null;
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
  const dayLabel = target.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
  });
  if (diff < 0) return `${dayLabel} (verleden)`;
  if (diff === 0) return `${dayLabel} (vandaag)`;
  if (diff === 1) return `${dayLabel} (morgen)`;
  return `${dayLabel} (over ${diff} dgn)`;
}

export default function CampagnesPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  // Per-item actie-state (approve / reject pending).
  const [busyId, setBusyId] = useState<string | null>(null);
  // Expanded bundle-cards.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
    const result: Record<KanbanColumn["key"], BoardItem[]> = {
      voorstel: [],
      concept: [],
      ingepland: [],
      actief: [],
    };

    // Voorstel-kolom: ai_suggestions, split op trigger_type voor bundles.
    for (const s of suggestions) {
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
    // Standalone: gewoon op status mappen.
    for (const c of standalone) {
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
  }, [campaigns, suggestions]);

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

  return (
    <div className="page-full">
      <PageHeader
        title="Campagnes"
        actions={
          <Link
            href="/dashboard/campagnes/history"
            style={{ textDecoration: "none" }}
          >
            <Button variant="brand-soft">📦 Historie</Button>
          </Link>
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
          items.map((item) => (
            <BoardCard
              key={cardKey(item)}
              item={item}
              busy={busyId === itemSuggestionId(item)}
              isExpanded={expanded.has(cardKey(item))}
              onToggleExpand={() => onToggleExpand(cardKey(item))}
              onApprove={onApprove}
              onReject={onReject}
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
};

function BoardCard({
  item,
  busy,
  isExpanded,
  onToggleExpand,
  onApprove,
  onReject,
}: CardProps) {
  // Voorstel (single-channel): naam · kanaal-icon · reden · ✓/✗.
  if (item.kind === "suggestion") {
    const s = item.data;
    const reason = suggestionReasoning(s);
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
          {reason && <div style={cardSubtle}>{reason}</div>}
          <div
            style={{ display: "flex", gap: 6, marginTop: 8 }}
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

  // Bundle-voorstel: 1 card met 3 channel-icons + expand.
  if (item.kind === "bundle-suggestion") {
    const s = item.data;
    const channels = s.suggested_campaign.channels ?? [];
    return (
      <div style={cardStyle}>
        <div style={cardHeaderRow}>
          <span style={{ fontSize: 16 }}>🎁</span>
          <span style={cardTitle}>{suggestionDisplayName(s)}</span>
          <span style={bundlePill}>Bundle</span>
        </div>
        <div
          style={{
            display: "flex",
            gap: 6,
            marginTop: 6,
            fontSize: 14,
          }}
        >
          {channels.map((ch, i) => (
            <span key={i} title={ch.platform}>
              {typeIcon(ch.platform)}
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => onApprove(s)}
            style={btnApprove}
          >
            {busy ? "..." : "✓ Goedkeur"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onReject(s)}
            style={btnReject}
          >
            ✗ Wijs af
          </button>
          <button
            type="button"
            onClick={onToggleExpand}
            style={btnGhost}
            aria-expanded={isExpanded}
          >
            {isExpanded ? "▴" : "▾"}
          </button>
        </div>
        {isExpanded && channels.length > 0 && (
          <div style={expandWrap}>
            {channels.map((ch, i) => (
              <div key={i} style={expandRow}>
                <span style={{ fontSize: 14 }}>{typeIcon(ch.platform)}</span>
                <span style={{ flex: 1, textTransform: "capitalize" }}>
                  {ch.platform}
                </span>
                <span style={{ fontSize: 10, color: "var(--tl)" }}>
                  {ch.scheduled_for
                    ? new Date(ch.scheduled_for).toLocaleDateString("nl-NL", {
                        day: "numeric",
                        month: "short",
                      })
                    : "geen datum"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Bundle-campagne: 1 card met channel-icons, expand toont mini-rijen
  // per kanaal-campagne. Klik op de naam = naar bundle-detail.
  if (item.kind === "bundle-campaign") {
    const first = item.campaigns[0];
    const name =
      first.name.replace(/\s*[—\-·]\s*(mail|instagram|facebook|tiktok|whatsapp)\s*$/i, "") ||
      first.name;
    return (
      <div style={cardStyle}>
        <Link
          href={`/dashboard/campagnes/bundle/${item.groupId}`}
          style={{
            textDecoration: "none",
            color: "inherit",
            display: "block",
          }}
        >
          <div style={cardHeaderRow}>
            <span style={{ fontSize: 16 }}>🎁</span>
            <span style={cardTitle}>{name}</span>
            <span style={bundlePill}>Bundle</span>
          </div>
          <div
            style={{
              display: "flex",
              gap: 6,
              marginTop: 6,
              fontSize: 14,
            }}
          >
            {item.campaigns.map((c) => (
              <span key={c.id} title={c.type}>
                {typeIcon(c.type)}
              </span>
            ))}
          </div>
        </Link>
        <button
          type="button"
          onClick={onToggleExpand}
          style={{ ...btnGhost, marginTop: 8, width: "100%" }}
          aria-expanded={isExpanded}
        >
          {isExpanded ? "▴ Inklappen" : "▾ Per kanaal"}
        </button>
        {isExpanded && (
          <div style={expandWrap}>
            {item.campaigns.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard/campagnes/${c.id}`}
                style={{
                  ...expandRow,
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <span style={{ fontSize: 14 }}>{typeIcon(c.type)}</span>
                <span style={{ flex: 1, textTransform: "capitalize" }}>
                  {c.type}
                </span>
                <span style={{ fontSize: 10, color: "var(--tl)" }}>
                  {c.scheduled_for
                    ? new Date(c.scheduled_for).toLocaleDateString("nl-NL", {
                        day: "numeric",
                        month: "short",
                      })
                    : "geen datum"}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Standalone campagne: link naar detail. Per status andere meta-info.
  const c = item.data;
  const stats = c.result_stats ?? {};
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
        {c.status === "ingepland" && c.scheduled_for && (
          <div style={cardSubtle}>{formatRelativeDate(c.scheduled_for)}</div>
        )}
        {c.status === "concept" && (
          <div style={cardSubtle}>Nog niet ingepland</div>
        )}
        {c.status === "actief" && (
          <div style={cardSubtle}>
            {stats.extra_reservations != null && stats.extra_reservations > 0
              ? `+${stats.extra_reservations} reserveringen`
              : "Loopt nu"}
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
