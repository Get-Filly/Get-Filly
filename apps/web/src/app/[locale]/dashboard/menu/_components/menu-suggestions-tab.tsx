"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  acceptMenuSuggestion,
  generateMenuSuggestions,
  refineMenuSuggestion,
  rejectMenuSuggestion,
  type SuggestedMenuItem,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "../../_components/skeleton";

// ============================================================
// MenuSuggestionsTab, "Voorgesteld" view op /dashboard/menu
// ============================================================
//
// Rendert een grid van Filly-voorstellen met per kaart:
//   - Naam, beschrijving, categorie + dietary tags
//   - Prijs-range
//   - Filly's reden ("waarom past dit")
//   - Acties: Toevoegen / Andere variant / Verwijder
//
// Bovenaan een primary-knop "✨ Vraag Filly om voorstellen" die de
// hele lijst bijwerkt (3-5 nieuwe pending-rijen).
//
// De parent (menu-page) levert items + onMutate zodat we na een actie
// (accept/reject/refine) direct de menu-items-state in de page kunnen
// laten herladen, een geaccepteerd voorstel verschijnt dan ook
// meteen in de Alle/Voorgerecht/etc-tabs.
// ============================================================

type Props = {
  // 'pending' = de Voorgesteld-tab. Eigenaar kan accepteren / variant
  //   vragen / verwijderen, en bovenaan de hele batch (her)genereren
  //   met de daily-cap.
  // 'rejected' = de Afgewezen-tab. Read-only kaarten plus alleen een
  //   "Toch toevoegen"-actie. Geen generate-knop, geen variant, geen
  //   delete (al rejected).
  mode: "pending" | "rejected";
  items: SuggestedMenuItem[];
  loading: boolean;
  // Wordt aangeroepen na elke mutation (generate/accept/reject/refine).
  // Parent moet (a) suggesties opnieuw fetchen en (b) als 'menuChanged'
  // true is ook de menu-items opnieuw fetchen.
  onMutate: (menuChanged: boolean) => void | Promise<void>;
};

export function MenuSuggestionsTab({
  mode,
  items,
  loading,
  onMutate,
}: Props) {
  const t = useTranslations("dash_menu_components_menu_suggestions_tab");
  // Globale state voor de "Vraag Filly"-knop. Eén AI-call tegelijk
  // zodat een eigenaar niet per ongeluk dubbel klikt en €0,15+ verbrandt.
  const [generating, setGenerating] = useState(false);
  // Per-card busy-state (id → true). Voorkomt dubbele klikken op
  // accept/reject/refine zonder de hele lijst te disablen.
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const setCardBusy = (id: string, v: boolean) =>
    setBusy((b) => ({ ...b, [id]: v }));

  const handleGenerate = async () => {
    setError(null);
    setGenerating(true);
    try {
      await generateMenuSuggestions();
      await onMutate(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.unknown"));
    } finally {
      setGenerating(false);
    }
  };

  const handleAccept = async (id: string) => {
    setError(null);
    setCardBusy(id, true);
    try {
      await acceptMenuSuggestion(id);
      // menuChanged=true → parent refresht ook de echte menu_items
      // zodat het nieuwe gerecht meteen in de andere tabs te zien is.
      await onMutate(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.acceptFailed"));
    } finally {
      setCardBusy(id, false);
    }
  };

  const handleReject = async (id: string) => {
    setError(null);
    setCardBusy(id, true);
    try {
      await rejectMenuSuggestion(id);
      await onMutate(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.rejectFailed"));
    } finally {
      setCardBusy(id, false);
    }
  };

  const handleRefine = async (id: string) => {
    setError(null);
    setCardBusy(id, true);
    try {
      await refineMenuSuggestion(id);
      await onMutate(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.refineFailed"));
    } finally {
      setCardBusy(id, false);
    }
  };

  return (
    <div>
      {/* Top-rij: pending-mode toont de generate-knop en uitleg.
          Rejected-mode toont alleen een korte intro, geen knop,
          want afgewezen voorstellen worden niet opnieuw gegenereerd. */}
      {mode === "pending" ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            padding: "12px 14px",
            marginBottom: 16,
            background: "var(--brand-soft, #EDF2EE)",
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 13, color: "var(--text, #1a1a1a)" }}>
            {t.rich("pendingIntro", {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </div>
          <Button
            variant="primary"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? t("generating") : t("askFilly")}
          </Button>
        </div>
      ) : (
        <div
          style={{
            padding: "12px 14px",
            marginBottom: 16,
            background: "var(--bg-soft, #F5F3EE)",
            color: "var(--tl, #6B6F71)",
            borderRadius: 8,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {t.rich("rejectedIntro", {
            em: (chunks) => <em>{chunks}</em>,
          })}
        </div>
      )}

      {error && (
        <div
          style={{
            padding: "10px 12px",
            marginBottom: 16,
            background: "var(--danger-soft, #FEEAEA)",
            color: "var(--danger, #B3261E)",
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 16,
          }}
        >
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={220} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={
            mode === "pending"
              ? t("empty.pendingTitle")
              : t("empty.rejectedTitle")
          }
          description={
            mode === "pending"
              ? t("empty.pendingDescription")
              : t("empty.rejectedDescription")
          }
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 16,
          }}
        >
          {items.map((s) => (
            <SuggestionCard
              key={s.id}
              mode={mode}
              item={s}
              busy={!!busy[s.id]}
              onAccept={() => handleAccept(s.id)}
              onReject={() => handleReject(s.id)}
              onRefine={() => handleRefine(s.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// SuggestionCard
// ============================================================

type CardProps = {
  mode: "pending" | "rejected";
  item: SuggestedMenuItem;
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
  onRefine: () => void;
};

function SuggestionCard({
  mode,
  item,
  busy,
  onAccept,
  onReject,
  onRefine,
}: CardProps) {
  const t = useTranslations("dash_menu_components_menu_suggestions_tab");
  // Refines beperkt tot 3, toon de teller zodat eigenaar weet hoeveel
  // er nog over zijn. Cap-bereikt = button disabled met tooltip.
  const refineCapReached = item.refine_count >= 3;
  // Alleen het wortel-voorstel (geen refined_from_id) of de meest
  // recente variant kan opnieuw geverfijnd. Backend pakt dit ook af
  // maar we tonen 't visueel zodat de UI consistent is.

  return (
    <div
      style={{
        background: "white",
        border: "1px solid var(--border, #e5e5e5)",
        borderRadius: 12,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        opacity: busy ? 0.6 : 1,
        transition: "opacity 0.15s",
      }}
    >
      {/* Header: source-badge linksboven (gap_analysis = "Gat" etc.),
          confidence-dot rechts. Kleine onopvallende metadata. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <SourceBadge source={item.source_type} />
        <ConfidenceDot confidence={item.confidence} />
      </div>

      <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>
        {item.name}
      </div>

      {item.description && (
        <div
          style={{
            fontSize: 13,
            color: "var(--tl, #6B6F71)",
            lineHeight: 1.5,
          }}
        >
          {item.description}
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginTop: 2,
        }}
      >
        {item.category && <MetaChip>{capitalize(item.category)}</MetaChip>}
        {item.dietary_tags.map((tag) => (
          <MetaChip key={tag}>{tag.replace(/_/g, " ")}</MetaChip>
        ))}
        <PriceRange
          low={item.price_cents_low}
          high={item.price_cents_high}
        />
      </div>

      {item.reasoning && (
        <div
          style={{
            background: "var(--brand-soft, #EDF2EE)",
            color: "var(--brand, #1F4A2D)",
            padding: "8px 10px",
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 1.5,
            fontStyle: "italic",
          }}
        >
          ✨ {item.reasoning}
        </div>
      )}

      {/* Acties onderaan. Pending: primary "Toevoegen" + ghost
          "Andere variant" + ghost "✕". Rejected: alleen één
          "Toch toevoegen"-actie, geen variant (al rejected, niet
          de moeite waard om er Claude-tokens aan te verbranden) en
          geen verwijder-knop (al rejected). */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: "auto",
          paddingTop: 4,
        }}
      >
        <Button
          variant="primary"
          size="sm"
          onClick={onAccept}
          disabled={busy}
        >
          {mode === "rejected" ? t("actions.addAnyway") : t("actions.addToMenu")}
        </Button>
        {mode === "pending" && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefine}
              disabled={busy || refineCapReached}
              title={
                refineCapReached
                  ? t("actions.refineCapTitle")
                  : t("actions.refineTitle")
              }
            >
              {t("actions.refine")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onReject}
              disabled={busy}
              title={t("actions.rejectTitle")}
            >
              ✕
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Subcomponents
// ============================================================

function SourceBadge({
  source,
}: {
  source: SuggestedMenuItem["source_type"];
}) {
  const t = useTranslations("dash_menu_components_menu_suggestions_tab");
  const config: Record<
    SuggestedMenuItem["source_type"],
    { label: string; bg: string; fg: string }
  > = {
    gap_analysis: { label: t("source.gapAnalysis"), bg: "#FEF3E0", fg: "#8A5300" },
    profile_based: { label: t("source.profileBased"), bg: "#EDF2EE", fg: "#1F4A2D" },
    seasonal: { label: t("source.seasonal"), bg: "#E8F0FE", fg: "#0F4C81" },
    refined: { label: t("source.refined"), bg: "#F2EAFD", fg: "#5C2D9C" },
  };
  const c = config[source];
  return (
    <span
      style={{
        background: c.bg,
        color: c.fg,
        padding: "3px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 500,
      }}
    >
      {c.label}
    </span>
  );
}

function ConfidenceDot({
  confidence,
}: {
  confidence: SuggestedMenuItem["confidence"];
}) {
  const t = useTranslations("dash_menu_components_menu_suggestions_tab");
  // 'low' is bewust hernoemd naar "Out of the box" (positief
  // avontuurlijk, geen twijfel), Filly krijgt daar in de prompt
  // ook expliciet over uitleg. Paarse kleur in plaats van grijs
  // zodat 't visueel als "interessant ander idee" leest, niet als
  // "minder waardevol".
  const config: Record<
    SuggestedMenuItem["confidence"],
    { color: string; label: string }
  > = {
    high: { color: "var(--brand, #1F4A2D)", label: t("confidence.high") },
    medium: { color: "#9C7400", label: t("confidence.medium") },
    low: { color: "#7C3AED", label: t("confidence.low") },
  };
  const c = config[confidence];
  return (
    <span
      title={c.label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        color: "var(--tl, #6B6F71)",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: c.color,
        }}
        aria-hidden
      />
      {c.label}
    </span>
  );
}

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        background: "var(--bg-soft, #F5F3EE)",
        color: "var(--text, #1a1a1a)",
        padding: "3px 8px",
        borderRadius: 6,
        fontSize: 11,
      }}
    >
      {children}
    </span>
  );
}

function PriceRange({
  low,
  high,
}: {
  low: number | null;
  high: number | null;
}) {
  if (low == null && high == null) return null;
  const fmt = (cents: number) => `€${(cents / 100).toFixed(2).replace(".", ",")}`;
  if (low != null && high != null && low !== high) {
    return <MetaChip>{`${fmt(low)} – ${fmt(high)}`}</MetaChip>;
  }
  const single = (low ?? high) as number;
  return <MetaChip>{fmt(single)}</MetaChip>;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
