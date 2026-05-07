"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  addSuggestionChannel,
  approveSuggestion,
  editSuggestionVariant,
  fetchRestaurantMedia,
  fetchSuggestion,
  refineSuggestion,
  removeSuggestionChannel,
  selectSuggestionVariant,
  setSuggestionMedia,
  setSuggestionScheduled,
  updateSuggestion,
  type AiSuggestion,
  type RestaurantMediaItem,
} from "../../../../../lib/api";
import { Skeleton } from "../../../_components/skeleton";
import { Button } from "../../../../../components/ui/button";
import { EmptyState } from "../../../../../components/ui/empty-state";
import { MediaLibraryPicker } from "../../../_components/media-library-picker";

// ============================================================
// VoorstelDetailPage, eigen pagina voor een Filly-voorstel
// ============================================================
//
// Per 2026-05-07 vervangt deze pagina de SuggestionDetailModal. Reden:
// de modal had een totaal andere UX dan de campagne-detail-pagina,
// terwijl beide eigenlijk dezelfde building-blocks delen (header met
// KPI-row, Inhoud-card, Wanneer-plaatsen, foto). Door beide op
// dezelfde lay-out te zetten voelt het 'Goedkeuren' minder als een
// sprong en zien klanten dat een voorstel feitelijk al een concept-
// campagne is.
//
// Fase 1: single-channel-equivalent. Multi-channel + per-kanaal-timing
// volgt in fase 2 (data-model uitbreiding + channel-tabs).

// Per 2026-05-07 fase 2: specifieker platform-label gebaseerd op
// suggested_campaign.platform. Backwards-compat: oude suggesties zonder
// platform-veld vallen terug op 'type' met 'social' → 'Social-post'.
type Platform =
  | "mail"
  | "whatsapp"
  | "instagram"
  | "facebook"
  | "tiktok";

const PLATFORM_ICON: Record<Platform, string> = {
  mail: "✉️",
  whatsapp: "💬",
  instagram: "📷",
  facebook: "👥",
  tiktok: "🎬",
};

const PLATFORM_LABEL: Record<Platform, string> = {
  mail: "E-mail",
  whatsapp: "WhatsApp-bericht",
  instagram: "Instagram-post",
  facebook: "Facebook-post",
  tiktok: "TikTok-video",
};

// Filly's voorgestelde tijdstip = trigger_context.target_date + standaard
// uur per type. Mail/whatsapp 11:00 (lunch-bel-momentum), social 17:00
// (after-work attention-window). Klanten zijn NL-only, dus we werken
// in browser-locale (de facto Europe/Amsterdam).
function fillySuggestedIso(
  targetDate: string | undefined,
  type: "mail" | "social" | "whatsapp",
): string | null {
  if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return null;
  const hour = type === "social" ? 17 : 11;
  const [y, m, d] = targetDate.split("-").map((s) => parseInt(s, 10));
  const dt = new Date(y, m - 1, d, hour, 0, 0, 0);
  return dt.toISOString();
}

function formatDutchDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Vergelijk op MINUUT-precisie (datetime-local gaat niet dieper, dus
// seconden-verschil zou een vals-positieve afwijking-banner triggeren).
function timesEqualToMinute(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const da = new Date(a);
  const db = new Date(b);
  return (
    Math.floor(da.getTime() / 60000) === Math.floor(db.getTime() / 60000)
  );
}

export default function VoorstelDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [suggestion, setSuggestion] = useState<AiSuggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Acties die de hele pagina kunnen blokkeren tijdens de roundtrip.
  const [refining, setRefining] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [savingMedia, setSavingMedia] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Schedule-edit-state.
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [draftDatetime, setDraftDatetime] = useState("");

  // Variant-edit-state. Eigenaar kan alleen de geselecteerde variant
  // bewerken; switchen tussen varianten = klikken op variant-kaart.
  const [editingVariantIdx, setEditingVariantIdx] = useState<number | null>(
    null,
  );
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");

  // 'Nieuw'-badges: na een Genereer-actie onthouden we vanaf welke
  // index de varianten net door Filly zijn toegevoegd. Eigenaar moet
  // zelf op een nieuwe versie klikken om die te selecteren, anders
  // blijft de oorspronkelijke selectie staan.
  const [newVariantsFromIndex, setNewVariantsFromIndex] = useState<
    number | null
  >(null);

  // Foto-koppeling: bibliotheek + picker-modal-state.
  const [mediaLibrary, setMediaLibrary] = useState<RestaurantMediaItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Per 2026-05-07 fase 2b: multi-channel-toggle. Eigenaar kan extra
  // kanalen aan een voorstel toevoegen via add/remove-endpoints.
  // Per-kanaal editing van inhoud/tijd volgt in fase 2c.
  const [savingChannel, setSavingChannel] = useState(false);

  // ────────────────────────────────────────────────────────────
  // Initial load
  // ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSuggestion(id)
      .then((s) => {
        if (cancelled) return;
        setSuggestion(s);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          e instanceof Error
            ? e.message
            : "Voorstel niet gevonden of niet meer beschikbaar.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // ────────────────────────────────────────────────────────────
  // Afgeleide waarden (memo waar zinnig om re-renders te beperken)
  // ────────────────────────────────────────────────────────────
  const sc = suggestion?.suggested_campaign ?? {};
  // Backwards-compat: gebruik 'platform' als die gezet is, anders val
  // terug op 'type'. 'type=social' zonder platform → instagram (default)
  // zodat oude suggesties niet als generic 'social' blijven hangen.
  const platform: Platform = (() => {
    if (
      sc.platform === "mail" ||
      sc.platform === "whatsapp" ||
      sc.platform === "instagram" ||
      sc.platform === "facebook" ||
      sc.platform === "tiktok"
    ) {
      return sc.platform;
    }
    if (sc.type === "mail" || sc.type === "whatsapp") return sc.type;
    if (sc.type === "social") return "instagram";
    return "mail";
  })();
  const platformLabel = PLATFORM_LABEL[platform];
  // 'type' (mail/social/whatsapp) is wat de variant-rendering en de
  // foto-flow nog gebruiken; mappen vanuit platform.
  const type: "mail" | "social" | "whatsapp" =
    platform === "mail" || platform === "whatsapp" ? platform : "social";
  const name = sc.name ?? "Naamloos voorstel";

  const targetDate =
    typeof suggestion?.trigger_context?.target_date === "string"
      ? (suggestion.trigger_context.target_date as string)
      : undefined;
  // Filly's voorstel: target_date + standaard-uur, of fallback naar
  // morgen + standaard-uur als de suggestie geen target_date heeft.
  // Zo verschijnt de Wanneer plaatsen-card altijd, eigenaar kan dan
  // alsnog een tijd kiezen.
  const fillyIso = useMemo(() => {
    const fromTarget = fillySuggestedIso(targetDate, type);
    if (fromTarget) return fromTarget;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const ymd = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    return fillySuggestedIso(ymd, type);
  }, [targetDate, type]);
  const customIso = sc.scheduled_for ?? null;
  const effectiveIso = customIso ?? fillyIso;
  const isCustomTime =
    !!customIso && !timesEqualToMinute(customIso, fillyIso);

  const variants =
    Array.isArray(sc.variants) && sc.variants.length > 0
      ? sc.variants
      : [
          {
            subject_line: sc.subject_line ?? sc.subject,
            body: sc.body ?? sc.caption ?? "",
          },
        ];
  const selectedIndex =
    typeof sc.selected_index === "number" &&
    sc.selected_index >= 0 &&
    sc.selected_index < variants.length
      ? sc.selected_index
      : 0;

  const supportsMedia = type === "social" || type === "whatsapp";
  const mediaId = sc.restaurant_media_id ?? null;
  const currentMediaItem = useMemo(
    () => mediaLibrary.find((m) => m.id === mediaId) ?? null,
    [mediaLibrary, mediaId],
  );

  const busy =
    loading ||
    refining ||
    approving ||
    rejecting ||
    savingSchedule ||
    savingEdit ||
    savingMedia ||
    savingChannel;

  // Channels-array uit suggested_campaign halen (multi-channel).
  // Backwards-compat: synthesize 1 kanaal uit legacy fields als
  // channels[] niet bestaat.
  const channels = useMemo(() => {
    if (Array.isArray(sc.channels) && sc.channels.length > 0) {
      return sc.channels.map((c) => ({
        id: c.id,
        platform: c.platform,
      }));
    }
    return [{ id: `${platform}-0`, platform }];
  }, [sc.channels, platform]);
  const activePlatforms = new Set(channels.map((c) => c.platform));

  const handleAddChannel = async (newPlatform: Platform) => {
    if (!suggestion || busy) return;
    setActionError(null);
    setSavingChannel(true);
    try {
      const updated = await addSuggestionChannel(suggestion.id, newPlatform);
      refresh(updated);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Kanaal toevoegen mislukt.",
      );
    } finally {
      setSavingChannel(false);
    }
  };

  const handleRemoveChannel = async (channelId: string) => {
    if (!suggestion || busy) return;
    setActionError(null);
    setSavingChannel(true);
    try {
      const updated = await removeSuggestionChannel(suggestion.id, channelId);
      refresh(updated);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Kanaal verwijderen mislukt.",
      );
    } finally {
      setSavingChannel(false);
    }
  };

  // Bibliotheek lazy laden zodra we weten dat dit voorstel media
  // ondersteunt. Mail-suggesties slaan we over.
  useEffect(() => {
    if (!supportsMedia) return;
    let cancelled = false;
    fetchRestaurantMedia()
      .then((items) => {
        if (!cancelled) setMediaLibrary(items);
      })
      .catch(() => {
        // Stille fail: zonder bibliotheek werkt de picker niet, maar
        // de rest van de pagina blijft bruikbaar.
      });
    return () => {
      cancelled = true;
    };
  }, [supportsMedia]);

  // ────────────────────────────────────────────────────────────
  // Actie-handlers
  // ────────────────────────────────────────────────────────────

  const refresh = (next: AiSuggestion) => {
    setSuggestion(next);
  };

  const handleSelectVariant = async (idx: number) => {
    if (!suggestion || busy || idx === selectedIndex) return;
    try {
      const updated = await selectSuggestionVariant(suggestion.id, idx);
      refresh(updated);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Variant-selectie mislukt.",
      );
    }
  };

  const handleRegenerate = async () => {
    if (!suggestion || busy) return;
    setActionError(null);
    setRefining(true);
    try {
      const beforeCount = variants.length;
      const updated = await refineSuggestion(suggestion.id, "");
      refresh(updated);
      setNewVariantsFromIndex(beforeCount);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Genereren mislukt.");
    } finally {
      setRefining(false);
    }
  };

  const handleApprove = async () => {
    if (!suggestion || busy) return;
    setApproving(true);
    setActionError(null);
    try {
      const { campaignId } = await approveSuggestion(suggestion.id);
      // Direct doornavigeren naar de nieuwe campagne-edit zodat eigenaar
      // 'm verder kan finetunen of inplannen.
      router.push(`/dashboard/campagnes/${campaignId}`);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Goedkeuren mislukt.",
      );
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!suggestion || busy) return;
    if (
      !window.confirm(
        "Voorstel afwijzen? Je kunt 'm later terugzetten via de Afgewezen-tab.",
      )
    ) {
      return;
    }
    setRejecting(true);
    setActionError(null);
    try {
      await updateSuggestion(suggestion.id, "rejected");
      router.push("/dashboard/campagnes");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Afwijzen mislukt.");
      setRejecting(false);
    }
  };

  const handleStartEditSchedule = () => {
    if (busy) return;
    setActionError(null);
    setDraftDatetime(
      toDatetimeLocalValue(effectiveIso ?? new Date().toISOString()),
    );
    setEditingSchedule(true);
  };

  const handleSaveSchedule = async () => {
    if (!suggestion || !draftDatetime || busy) return;
    setActionError(null);
    setSavingSchedule(true);
    try {
      const localIso = new Date(draftDatetime).toISOString();
      const updated = await setSuggestionScheduled(suggestion.id, localIso);
      refresh(updated);
      setEditingSchedule(false);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Verzendmoment opslaan mislukt.",
      );
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleResetToFilly = async () => {
    if (!suggestion || !fillyIso || busy) return;
    setActionError(null);
    setSavingSchedule(true);
    try {
      const updated = await setSuggestionScheduled(suggestion.id, fillyIso);
      refresh(updated);
      setEditingSchedule(false);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Resetten naar Filly mislukt.",
      );
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleStartEditVariant = (idx: number) => {
    if (busy) return;
    const v = variants[idx];
    setDraftSubject(v?.subject_line ?? "");
    setDraftBody(v?.body ?? "");
    setEditingVariantIdx(idx);
    setActionError(null);
  };

  const handleCancelEditVariant = () => {
    if (savingEdit) return;
    setEditingVariantIdx(null);
    setDraftSubject("");
    setDraftBody("");
  };

  const handleSaveEditVariant = async () => {
    if (!suggestion || editingVariantIdx === null || busy) return;
    if (!draftBody.trim()) {
      setActionError("Body mag niet leeg zijn.");
      return;
    }
    setActionError(null);
    setSavingEdit(true);
    try {
      const updated = await editSuggestionVariant(
        suggestion.id,
        editingVariantIdx,
        {
          subject_line: draftSubject.trim() || null,
          body: draftBody.trim(),
        },
      );
      refresh(updated);
      setEditingVariantIdx(null);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Bewerken mislukt.",
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const handlePickMedia = async (item: RestaurantMediaItem) => {
    setPickerOpen(false);
    if (!suggestion || busy) return;
    setActionError(null);
    setSavingMedia(true);
    try {
      const updated = await setSuggestionMedia(suggestion.id, item.id);
      refresh(updated);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Foto koppelen mislukt.",
      );
    } finally {
      setSavingMedia(false);
    }
  };

  const handleRemoveMedia = async () => {
    if (!suggestion || busy) return;
    setActionError(null);
    setSavingMedia(true);
    try {
      const updated = await setSuggestionMedia(suggestion.id, null);
      refresh(updated);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Foto verwijderen mislukt.",
      );
    } finally {
      setSavingMedia(false);
    }
  };

  // ────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="page" style={{ padding: 32 }}>
        <Skeleton style={{ height: 32, width: 240, marginBottom: 16 }} />
        <Skeleton style={{ height: 120, marginBottom: 12 }} />
        <Skeleton style={{ height: 320 }} />
      </div>
    );
  }

  if (error || !suggestion) {
    return (
      <div className="page" style={{ padding: 32 }}>
        <Link
          href="/dashboard/campagnes"
          style={{
            fontSize: 13,
            color: "var(--ts)",
            textDecoration: "none",
            marginBottom: 14,
            display: "inline-block",
          }}
        >
          ← Terug naar campagnes
        </Link>
        <EmptyState
          icon="—"
          title="Voorstel niet beschikbaar"
          description={error ?? "Dit voorstel bestaat niet meer."}
        />
      </div>
    );
  }

  const isPending = suggestion.status === "pending";

  return (
    <div className="page" style={{ padding: 32 }}>
      <Link
        href="/dashboard/campagnes"
        style={{
          fontSize: 13,
          color: "var(--ts)",
          textDecoration: "none",
          marginBottom: 14,
          display: "inline-block",
        }}
      >
        ← Terug naar campagnes
      </Link>

      {/* Header met titel + status + actie-knoppen rechts. Zelfde
          patroon als /dashboard/campagnes/[id] zodat de voorstel-
          pagina visueel een eerstegraads neef is van de campagne-
          pagina, niet een aparte vreemde modal. */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 14,
          marginBottom: 8,
        }}
      >
        <div style={{ fontSize: 28 }}>{PLATFORM_ICON[platform]}</div>
        <div style={{ flex: 1 }}>
          <div className="page-title" style={{ marginBottom: 4 }}>
            {name}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                padding: "3px 8px",
                background: "var(--accent, #1F4A2D)",
                color: "var(--white, #FFFFFF)",
                borderRadius: 999,
              }}
            >
              Voorstel · {platformLabel}
            </span>
            {!isPending && (
              <span style={{ color: "var(--tl)", fontSize: 12 }}>
                {suggestion.status === "approved"
                  ? "Reeds goedgekeurd"
                  : suggestion.status === "rejected"
                    ? "Afgewezen"
                    : suggestion.status === "expired"
                      ? "Verlopen"
                      : suggestion.status}
              </span>
            )}
          </div>
        </div>
        {isPending && (
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              variant="secondary"
              onClick={handleReject}
              loading={rejecting}
              disabled={busy}
              style={{ color: "var(--color-danger)" }}
            >
              ✕ Afwijzen
            </Button>
            <Button
              variant="primary"
              onClick={handleApprove}
              loading={approving}
              disabled={busy}
              title={
                channels.length > 1
                  ? `Maak ${channels.length} concept-campagnes (1 per kanaal) onder 1 bundle`
                  : "Maak een concept-campagne van dit voorstel"
              }
            >
              {channels.length > 1
                ? `✓ Goedkeuren als ${channels.length} campagnes`
                : "✓ Goedkeuren & maak concept"}
            </Button>
          </div>
        )}
      </div>

      {actionError && (
        <div
          style={{
            padding: "8px 12px",
            margin: "12px 0",
            background: "var(--red-soft, #fee)",
            color: "var(--red, #b00)",
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          {actionError}
        </div>
      )}

      <div style={{ marginBottom: 24 }} />

      {/* KPI-row weggehaald per 2026-05-07 — voor een voorstel zijn de
          'verwacht'-cijfers vooral gokwerk. Reasoning + concrete inhoud
          spreken voor zich; eigenaar wil snel kunnen beslissen, niet
          eerst door 5 stat-cards heen lezen. */}

      {/* Kanaal-toggle (fase 2b) — eigenaar kiest welke kanalen dit
          voorstel gebruikt. Active = pill met groene fill, inactive =
          omlijnd. Per-kanaal inhoud-editing volgt in fase 2c; voor nu
          wordt nieuwe content geseed met de body van het primaire
          kanaal en kan eigenaar zelf aanpassen na goedkeuring. */}
      {isPending && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-h">
            <div>
              <div className="card-t">Kanalen</div>
              <div className="card-st">
                Kies via welke kanalen dit voorstel uitgaat. Bij
                goedkeuring wordt elk kanaal een aparte campagne.
              </div>
            </div>
          </div>
          <div className="card-b">
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              {(
                [
                  "mail",
                  "whatsapp",
                  "instagram",
                  "facebook",
                  "tiktok",
                ] as Platform[]
              ).map((p) => {
                const isActive = activePlatforms.has(p);
                const channel = channels.find((c) => c.platform === p);
                const onClick = () => {
                  if (busy) return;
                  if (isActive && channel) {
                    if (channels.length <= 1) return;
                    handleRemoveChannel(channel.id);
                  } else {
                    handleAddChannel(p);
                  }
                };
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={onClick}
                    disabled={busy || (isActive && channels.length <= 1)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 14px",
                      borderRadius: 999,
                      border: isActive
                        ? "2px solid var(--accent, #1F4A2D)"
                        : "1px solid var(--border, #E5DFD0)",
                      background: isActive
                        ? "var(--accent, #1F4A2D)"
                        : "var(--white, #FFFFFF)",
                      color: isActive
                        ? "var(--white, #FFFFFF)"
                        : "var(--text)",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor:
                        busy || (isActive && channels.length <= 1)
                          ? "default"
                          : "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    <span>{PLATFORM_ICON[p]}</span>
                    <span>{PLATFORM_LABEL[p].replace("-post", "").replace("-bericht", "").replace("-video", "")}</span>
                    {isActive && channels.length > 1 && (
                      <span
                        style={{
                          fontSize: 10,
                          opacity: 0.8,
                        }}
                      >
                        ✕
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {channels.length > 1 && (
              <div
                style={{
                  marginTop: 12,
                  fontSize: 12,
                  color: "var(--ts)",
                  lineHeight: 1.5,
                  background: "var(--accent-light, #D6E0D8)",
                  padding: "8px 12px",
                  borderRadius: 6,
                }}
              >
                Bij goedkeuring maakt Filly {channels.length} concept-
                campagnes onder 1 bundle, één per kanaal. Tip: tijd en
                content per kanaal apart aanpassen kan in een volgende
                versie van deze pagina (binnenkort).
              </div>
            )}
          </div>
        </div>
      )}

      {/* Foto-card, alleen voor social/whatsapp. Mail ondersteunt nog
          geen media (consistent met campaigns.uploadMedia). */}
      {supportsMedia && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-h">
            <div>
              <div className="card-t">Foto</div>
              <div className="card-st">
                Wordt bij goedkeuring gekoppeld aan de campagne.
              </div>
            </div>
          </div>
          <div className="card-b">
            {currentMediaItem ? (
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={currentMediaItem.url}
                  alt={currentMediaItem.file_name}
                  style={{
                    width: 96,
                    height: 96,
                    borderRadius: 8,
                    objectFit: "cover",
                    border: "1px solid var(--border, #E5DFD0)",
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      color: "var(--text)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {currentMediaItem.file_name}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--ts)",
                      marginTop: 2,
                    }}
                  >
                    Uit jouw bibliotheek.
                  </div>
                </div>
                {isPending && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button
                      variant="secondary"
                      onClick={() => setPickerOpen(true)}
                      disabled={busy}
                    >
                      Wijzig
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={handleRemoveMedia}
                      disabled={busy}
                      loading={savingMedia}
                      style={{ color: "var(--color-danger)" }}
                    >
                      Verwijder
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ fontSize: 14, color: "var(--ts)" }}>
                  Nog geen foto gekoppeld.
                </div>
                {isPending && (
                  <Button
                    variant="secondary"
                    onClick={() => setPickerOpen(true)}
                    disabled={busy}
                    loading={savingMedia}
                  >
                    Kies uit bibliotheek
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Inhoud-card: variants-grid + bewerken + genereer nieuwe */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h">
          <div>
            <div className="card-t">Inhoud</div>
            <div className="card-st">
              {variants.length === 1
                ? "Voorstel"
                : `Filly bedacht ${variants.length} versies, kies je favoriet`}
            </div>
          </div>
        </div>
        <div className="card-b">
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                variants.length === 1
                  ? "1fr"
                  : "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 12,
            }}
          >
            {variants.map((v, idx) => {
              const isSelected = idx === selectedIndex;
              const isNew =
                newVariantsFromIndex !== null &&
                idx >= newVariantsFromIndex &&
                !isSelected;
              const isEditing = editingVariantIdx === idx;
              const cardStyle: React.CSSProperties = {
                textAlign: "left",
                padding: "14px 16px",
                borderRadius: 8,
                border: isEditing
                  ? "2px solid var(--accent, #1F4A2D)"
                  : isSelected
                    ? "2px solid var(--accent, #1F4A2D)"
                    : isNew
                      ? "1.5px dashed var(--accent, #1F4A2D)"
                      : "1px solid var(--border, #E5DFD0)",
                background: isSelected
                  ? "var(--accent-light, #D6E0D8)"
                  : "var(--white, #FFFFFF)",
                transition: "all 0.15s",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              };

              if (isEditing) {
                return (
                  <div key={idx} style={cardStyle}>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "var(--accent, #1F4A2D)",
                      }}
                    >
                      Versie {idx + 1} bewerken
                    </div>
                    {type === "mail" && (
                      <input
                        type="text"
                        value={draftSubject}
                        onChange={(e) => setDraftSubject(e.target.value)}
                        placeholder="Onderwerp"
                        maxLength={200}
                        style={{
                          padding: "8px 10px",
                          border: "1px solid var(--border, #E5DFD0)",
                          borderRadius: 6,
                          fontSize: 13,
                          fontFamily: "inherit",
                          background: "var(--white, #FFFFFF)",
                        }}
                      />
                    )}
                    <textarea
                      value={draftBody}
                      onChange={(e) => setDraftBody(e.target.value)}
                      placeholder="Bericht-inhoud"
                      maxLength={5000}
                      rows={8}
                      style={{
                        padding: "8px 10px",
                        border: "1px solid var(--border, #E5DFD0)",
                        borderRadius: 6,
                        fontSize: 13,
                        lineHeight: 1.55,
                        fontFamily: "inherit",
                        background: "var(--white, #FFFFFF)",
                        resize: "vertical",
                        minHeight: 140,
                      }}
                    />
                    <div style={{ display: "flex", gap: 6 }}>
                      <Button
                        size="sm"
                        onClick={handleSaveEditVariant}
                        loading={savingEdit}
                        disabled={busy && !savingEdit}
                      >
                        Opslaan
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleCancelEditVariant}
                        disabled={savingEdit}
                      >
                        Annuleren
                      </Button>
                    </div>
                  </div>
                );
              }

              return (
                <button
                  key={idx}
                  onClick={() => handleSelectVariant(idx)}
                  disabled={busy || !isPending}
                  style={{
                    ...cardStyle,
                    cursor:
                      busy || !isPending ? "default" : "pointer",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: isSelected
                          ? "var(--accent, #1F4A2D)"
                          : "var(--tl)",
                      }}
                    >
                      Versie {idx + 1}
                    </span>
                    <div style={{ display: "flex", gap: 6 }}>
                      {isNew && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: "var(--white, #FFFFFF)",
                            padding: "1px 6px",
                            background: "var(--accent, #1F4A2D)",
                            borderRadius: 999,
                          }}
                        >
                          Nieuw
                        </span>
                      )}
                      {isSelected && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: "var(--accent, #1F4A2D)",
                            padding: "1px 6px",
                            background: "var(--white, #FFFFFF)",
                            borderRadius: 999,
                            border: "1px solid var(--accent, #1F4A2D)",
                          }}
                        >
                          ✓ Gekozen
                        </span>
                      )}
                      {isSelected && isPending && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartEditVariant(idx);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              handleStartEditVariant(idx);
                            }
                          }}
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: "var(--accent, #1F4A2D)",
                            padding: "1px 8px",
                            background: "var(--white, #FFFFFF)",
                            borderRadius: 999,
                            border: "1px solid var(--accent, #1F4A2D)",
                            cursor: busy ? "not-allowed" : "pointer",
                            opacity: busy ? 0.5 : 1,
                          }}
                        >
                          ✎ Bewerk
                        </span>
                      )}
                    </div>
                  </div>
                  {v.subject_line && (
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--text)",
                      }}
                    >
                      {v.subject_line}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: 13,
                      lineHeight: 1.55,
                      color: "var(--text)",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {v.body || (
                      <em style={{ color: "var(--tl)" }}>Geen inhoud.</em>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {isPending && (
            <div
              style={{
                marginTop: 16,
                paddingTop: 16,
                borderTop: "1px solid var(--border, #E5DFD0)",
              }}
            >
              <Button
                variant="secondary"
                onClick={handleRegenerate}
                loading={refining}
                disabled={busy || variants.length >= 6}
              >
                {refining
                  ? "Filly schrijft…"
                  : variants.length >= 6
                    ? "Maximum aantal versies bereikt"
                    : "Genereer 3 nieuwe versies"}
              </Button>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--tl)",
                  marginTop: 8,
                  lineHeight: 1.5,
                }}
              >
                {variants.length >= 6
                  ? "Je hebt 6 versies, kies een variant of pas 'm handmatig aan."
                  : "Filly schrijft drie nieuwe varianten naast de bestaande. Klik op een versie om die over te nemen, het origineel blijft beschikbaar."}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Wanneer plaatsen-card. Zelfde patroon als CampaignSchedule-
          Panel maar wired naar suggestion-API. Bij afwijking van Filly's
          voorgestelde tijd verschijnt een rode banner. Per 2026-05-07
          altijd zichtbaar, ook zonder target_date (fillyIso valt dan
          terug op morgen + standaard-uur). */}
      <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-h">
            <div>
              <div className="card-t">📅 Wanneer plaatsen?</div>
              <div className="card-st">
                Filly stelt het beste moment voor op basis van type campagne
                en jouw doelgroep.
              </div>
            </div>
          </div>
          <div className="card-b">
            {editingSchedule ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <label
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--ts)",
                  }}
                >
                  <span>Verzenddatum + tijd</span>
                  <input
                    type="datetime-local"
                    value={draftDatetime}
                    onChange={(e) => setDraftDatetime(e.target.value)}
                    style={{
                      padding: "8px 10px",
                      border: "1px solid var(--border, #E5DFD0)",
                      borderRadius: 6,
                      fontSize: 14,
                      fontFamily: "inherit",
                      background: "var(--white, #FFFFFF)",
                      maxWidth: 280,
                    }}
                  />
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button
                    onClick={handleSaveSchedule}
                    disabled={!draftDatetime}
                    loading={savingSchedule}
                  >
                    Opslaan
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setEditingSchedule(false)}
                    disabled={savingSchedule}
                  >
                    Annuleren
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: "var(--accent, #1F4A2D)",
                    marginBottom: 4,
                  }}
                >
                  {isCustomTime ? "Jouw keuze" : "✨ Filly stelt voor"}
                </div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    marginBottom: 8,
                    color: "var(--text)",
                    textTransform: "capitalize",
                  }}
                >
                  {effectiveIso
                    ? formatDutchDateTime(effectiveIso)
                    : "Nog niet gekozen"}
                </div>
                {isCustomTime && fillyIso && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "#B91C1C",
                      background: "#FEF2F2",
                      border: "1px solid #FECACA",
                      padding: "6px 10px",
                      borderRadius: 6,
                      marginBottom: 12,
                      lineHeight: 1.4,
                    }}
                  >
                    Je wijkt af van Filly&rsquo;s voorstel (
                    {formatDutchDateTime(fillyIso)}).
                  </div>
                )}
                {isPending && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Button
                      variant="secondary"
                      onClick={handleStartEditSchedule}
                      disabled={busy}
                    >
                      ✎ Wijzig
                    </Button>
                    {isCustomTime && (
                      <Button
                        variant="secondary"
                        onClick={handleResetToFilly}
                        disabled={busy}
                        loading={savingSchedule}
                      >
                        ↺ Terug naar Filly&rsquo;s voorstel
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      {/* Waarom dit voorstel-card, transparante motivatie van Filly. */}
      {suggestion.reasoning && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-h">
            <div>
              <div className="card-t">Waarom dit voorstel</div>
              <div className="card-st">Filly&rsquo;s redenering.</div>
            </div>
          </div>
          <div className="card-b">
            <div
              style={{
                fontSize: 14,
                color: "var(--ts)",
                lineHeight: 1.6,
              }}
            >
              {suggestion.reasoning}
            </div>
          </div>
        </div>
      )}

      <MediaLibraryPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={handlePickMedia}
      />
    </div>
  );
}
