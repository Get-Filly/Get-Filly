"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import {
  addSuggestionChannel,
  approveBundleSuggestion,
  approveSuggestion,
  editSuggestionVariant,
  fetchRestaurantMedia,
  fetchSuggestion,
  refineSuggestion,
  removeSuggestionChannel,
  selectSuggestionVariant,
  setSuggestionMedia,
  setSuggestionScheduled,
  updateCampaignStatus,
  updateSuggestion,
  type AiSuggestion,
  type BundleChannel,
  type RestaurantMediaItem,
} from "@/lib/api";
import { Skeleton } from "../../../_components/skeleton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MediaLibraryPicker } from "../../../_components/media-library-picker";
import {
  getChannelChecklist,
  getMissingLabel,
  toBundleChannel,
  type MissingField,
} from "@/lib/campaign-checks";
// Per 2026-05-13: 5 building-blocks extract zodat de concept-
// detail-pagina dezelfde UX kan tonen (stap 1 van het 'unified
// detail-view'-traject).
import {
  PLATFORM_ICON,
  SECTION_ID,
  fillySuggestedIso,
  formatDutchDateTime,
  platformToType,
  shortPlatformName,
  toDatetimeLocalValue,
  type Platform,
} from "../../../_components/campaign-detail/types";
import { WaaromCard } from "../../../_components/campaign-detail/waarom-card";
import { InhoudCard } from "../../../_components/campaign-detail/inhoud-card";
import { useLocaleTag } from "@/lib/locale-format";

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

// Platform-type, label-maps, format-helpers, fillySuggestedIso,
// SECTION_ID en timesEqualToMinute zijn per 2026-05-13 verhuisd
// naar _components/campaign-detail/types.ts zodat de concept-
// detail-pagina dezelfde helpers kan hergebruiken.

// Voorstel-pill onder de titel. Subtiel: witte bg + dunne brand-border
// + donkergroene tekst, geen UPPERCASE. Maakt duidelijk dat 't een
// voorstel is zonder het scherm te overschreeuwen.
const voorstelChipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  fontSize: 12,
  fontWeight: 500,
  padding: "3px 10px",
  borderRadius: 6,
  background: "var(--color-white, #FFFFFF)",
  color: "var(--color-brand-deep, #1F4A2D)",
  border: "1px solid var(--color-brand, #1F4A2D)",
};

export default function VoorstelDetailPage() {
  const t = useTranslations("campagnes_voorstel_id_page");
  const params = useParams();
  const router = useRouter();
  const localeTag = useLocaleTag();
  const id = params.id as string;

  const [suggestion, setSuggestion] = useState<AiSuggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Acties die de hele pagina kunnen blokkeren tijdens de roundtrip.
  const [refining, setRefining] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [planning, setPlanning] = useState(false);
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
  // ('Nieuw'-badge per 2026-05-13 weg met de InhoudCard-refactor;
  //  alternatieven hebben hun eigen rij, geen aparte markering.)

  // Foto-koppeling: bibliotheek + picker-modal-state.
  const [mediaLibrary, setMediaLibrary] = useState<RestaurantMediaItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Per 2026-05-07 fase 2b: multi-channel-toggle. Eigenaar kan extra
  // kanalen aan een voorstel toevoegen via add/remove-endpoints.
  const [savingChannel, setSavingChannel] = useState(false);
  // Per 2026-05-07 fase 2d: actief kanaal voor de inhoud/foto/schedule-
  // sectie. Default = eerste kanaal. Bij multi-channel zijn er pillen
  // onder de Kanalen-card waarmee eigenaar kan switchen; alle sectie-
  // edits onder gaan over het actieve kanaal.
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);

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
          e instanceof Error ? e.message : t("errors.notFound"),
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
  // 'type' (mail/social/whatsapp) is wat de variant-rendering en de
  // foto-flow nog gebruiken; mappen vanuit platform.
  const type: "mail" | "social" | "whatsapp" = platformToType(platform);
  const name = sc.name ?? t("untitledProposal");

  // Per 2026-05-07 fase 2d: channels[]-array. Backwards-compat:
  // synthesize 1 kanaal uit legacy fields als channels[] niet bestaat.
  // Hier vroeg in de component gedefinieerd zodat de afgeleide
  // (variants/scheduled/media) verder beneden naar activeChannel
  // kunnen verwijzen.
  const fullChannels = useMemo(() => {
    if (Array.isArray(sc.channels) && sc.channels.length > 0) {
      return sc.channels;
    }
    return [
      {
        id: `${platform}-0`,
        platform,
        variants:
          Array.isArray(sc.variants) && sc.variants.length > 0
            ? sc.variants
            : [
                {
                  body: sc.body ?? sc.caption ?? "",
                  subject_line: sc.subject_line ?? sc.subject,
                },
              ],
        selected_index:
          typeof sc.selected_index === "number" ? sc.selected_index : 0,
        scheduled_for: sc.scheduled_for,
        restaurant_media_id: sc.restaurant_media_id ?? null,
      },
    ];
  }, [
    sc.channels,
    platform,
    sc.variants,
    sc.body,
    sc.caption,
    sc.subject_line,
    sc.subject,
    sc.selected_index,
    sc.scheduled_for,
    sc.restaurant_media_id,
  ]);

  const channels = fullChannels.map((c) => ({
    id: c.id,
    platform: c.platform,
  }));

  // Missing-status per kanaal: checklist met vereiste + optionele
  // items die nog actie nodig hebben. Compleet ingevulde velden worden
  // niet teruggegeven.
  const perChannelChecklist = useMemo(() => {
    return fullChannels.map((c) => {
      const v = c.variants[c.selected_index] ?? c.variants[0];
      const items = getChannelChecklist(
        c.platform,
        v?.body,
        v?.subject_line,
        // Alleen een vastgelegd moment telt; Filly's voorstel accepteert de
        // eigenaar via de "Akkoord"-knop (legt scheduled_for vast).
        c.scheduled_for,
        c.restaurant_media_id,
      );
      return { id: c.id, platform: c.platform, items };
    });
  }, [fullChannels]);
  // Voor de blokkering (Goedkeur/Direct inplannen disabled) tellen
  // alleen de VEREISTE missende velden — optionele zijn aanbevelingen.
  const allMissing: MissingField[] = useMemo(() => {
    const order: MissingField[] = ["date", "body", "subject", "photo"];
    const set = new Set<MissingField>();
    for (const c of perChannelChecklist) {
      for (const item of c.items) {
        if (item.required) set.add(item.field);
      }
    }
    return order.filter((f) => set.has(f));
  }, [perChannelChecklist]);

  // Voortgang voor de progress-bar bovenaan. Telt alleen VEREISTE
  // velden per kanaal (datum, tekst, onderwerp voor mail, foto voor
  // IG/TT). Optionele velden tellen niet mee — die zouden 100%-streven
  // verstoren ook als eigenaar legitiem geen foto toevoegt op Facebook.
  const progress = useMemo(() => {
    let total = 0;
    let missing = 0;
    for (const c of fullChannels) {
      total += 2; // datum + tekst voor elk kanaal
      if (c.platform === "mail") total += 1; // onderwerp
      if (c.platform === "instagram" || c.platform === "tiktok") total += 1; // foto
    }
    for (const c of perChannelChecklist) {
      for (const item of c.items) {
        if (item.required) missing += 1;
      }
    }
    const completed = Math.max(0, total - missing);
    const percentage =
      total === 0 ? 100 : Math.round((completed / total) * 100);
    return { total, completed, percentage };
  }, [fullChannels, perChannelChecklist]);

  // Actieve kanaal-resolution: door eigenaar gekozen via tab-pill,
  // val terug op eerste kanaal als de keuze niet meer in channels[]
  // bestaat (bv. door remove-actie).
  const activeChannel = useMemo(() => {
    const found = fullChannels.find((c) => c.id === activeChannelId);
    return found ?? fullChannels[0];
  }, [fullChannels, activeChannelId]);
  const activeId = activeChannel?.id;
  const activePlatform = activeChannel?.platform ?? platform;

  const targetDate =
    typeof suggestion?.trigger_context?.target_date === "string"
      ? (suggestion.trigger_context.target_date as string)
      : undefined;
  // Filly's voorgestelde tijd per kanaal wordt nu in de Aspecten-tabel
  // zelf berekend (per rij), zodat elke datum/tijd-cel z'n eigen
  // voorstel + inline-akkoord toont. De losse Wanneer-card is daarmee
  // vervallen.

  // Variants/selected_index van het actieve kanaal. Multi-channel:
  // elk kanaal heeft eigen variants en eigen selected_index.
  const variants = activeChannel?.variants ?? [];
  const selectedIndex =
    typeof activeChannel?.selected_index === "number" &&
    activeChannel.selected_index >= 0 &&
    activeChannel.selected_index < variants.length
      ? activeChannel.selected_index
      : 0;

  // Foto-koppeling per kanaal. Mail-kanalen ondersteunen geen foto.
  const supportsMedia =
    activePlatform === "instagram" ||
    activePlatform === "facebook" ||
    activePlatform === "tiktok" ||
    activePlatform === "whatsapp";

  const busy =
    loading ||
    refining ||
    approving ||
    rejecting ||
    planning ||
    savingSchedule ||
    savingEdit ||
    savingMedia ||
    savingChannel;

  const handleAddChannel = async (newPlatform: Platform) => {
    if (!suggestion || busy) return;
    setActionError(null);
    setSavingChannel(true);
    try {
      const updated = await addSuggestionChannel(suggestion.id, newPlatform);
      refresh(updated);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : t("errors.addChannel"),
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
        e instanceof Error ? e.message : t("errors.removeChannel"),
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
      const updated = await selectSuggestionVariant(
        suggestion.id,
        idx,
        activeId,
      );
      refresh(updated);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : t("errors.selectVariant"),
      );
    }
  };

  const handleRegenerate = async () => {
    if (!suggestion || busy) return;
    setActionError(null);
    setRefining(true);
    try {
      // Multi-channel: backend moet weten welk kanaal de nieuwe
      // varianten moet krijgen (anders raakt 't de eerste of de
      // verkeerde). activeChannel.id wordt door de voorstel-route
      // gesynced met de 'Bewerken voor:'-tab in de UI.
      const updated = await refineSuggestion(
        suggestion.id,
        "",
        activeChannel?.id,
      );
      refresh(updated);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t("errors.regenerate"));
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
        e instanceof Error ? e.message : t("errors.approve"),
      );
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!suggestion || busy) return;
    if (!window.confirm(t("confirmReject"))) {
      return;
    }
    setRejecting(true);
    setActionError(null);
    try {
      await updateSuggestion(suggestion.id, "rejected");
      router.push("/dashboard/campagnes");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t("errors.reject"));
      setRejecting(false);
    }
  };

  // Direct inplannen: goedkeuren + status meteen op "ingepland" zetten.
  // Vereist dat alle kanalen compleet zijn (datum, tekst, foto-indien-
  // nodig). Toont 2e-niveau "weet je het zeker?"-confirm omdat dit
  // de campagne in de planning zet zonder verdere bewerking.
  const handleDirectPlan = async () => {
    if (!suggestion || busy) return;
    if (allMissing.length > 0) {
      setActionError(t("errors.fillMissingBeforePlan"));
      return;
    }
    if (!window.confirm(t("confirmDirectPlan"))) {
      return;
    }
    setPlanning(true);
    setActionError(null);
    try {
      const isBundle = suggestion.trigger_type === "chat_bundle";
      if (isBundle) {
        // Alle actieve kanalen meenemen die de bundle-API ondersteunt
        // (mail/instagram/facebook). Tiktok/whatsapp in een bundle
        // ondersteunt de backend nog niet.
        const channels = fullChannels
          .map((c) => toBundleChannel(c.platform))
          .filter((c): c is BundleChannel => c !== null);
        if (channels.length === 0) {
          throw new Error(t("errors.noBundleChannels"));
        }
        const result = await approveBundleSuggestion(
          suggestion.id,
          channels,
        );
        const ids = [
          result.mailCampaignId,
          result.instagramCampaignId,
          result.facebookCampaignId,
        ].filter((id): id is string => !!id);
        await Promise.all(
          ids.map((id) => updateCampaignStatus(id, "ingepland")),
        );
        // Bundle: terug naar kanban; eigenaar kiest zelf welk kanaal
        // hij verder wil afhandelen (geen één-correct detail-page bij
        // multi-channel).
        router.push("/dashboard/campagnes");
      } else {
        const { campaignId } = await approveSuggestion(suggestion.id);
        await updateCampaignStatus(campaignId, "ingepland");
        // Single-channel: direct naar de detail-page van de zojuist
        // ingeplande campagne. Daar staat de Versturen-sectie (voor
        // mail) en kan de eigenaar meteen testen of laten gaan.
        router.push(`/dashboard/campagnes/${campaignId}`);
      }
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : t("errors.plan"),
      );
      setPlanning(false);
    }
  };

  const handleSaveSchedule = async () => {
    if (!suggestion || !draftDatetime || busy) return;
    setActionError(null);
    setSavingSchedule(true);
    try {
      const localIso = new Date(draftDatetime).toISOString();
      const updated = await setSuggestionScheduled(
        suggestion.id,
        localIso,
        activeId,
      );
      refresh(updated);
      setEditingSchedule(false);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : t("errors.saveSchedule"),
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
      setActionError(t("errors.bodyEmpty"));
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
        activeId,
      );
      refresh(updated);
      setEditingVariantIdx(null);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : t("errors.edit"),
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
      const updated = await setSuggestionMedia(
        suggestion.id,
        item.id,
        activeId,
      );
      refresh(updated);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : t("errors.linkMedia"),
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
      <div className="page-full">
        <Skeleton style={{ height: 32, width: 240, marginBottom: 16 }} />
        <Skeleton style={{ height: 120, marginBottom: 12 }} />
        <Skeleton style={{ height: 320 }} />
      </div>
    );
  }

  if (error || !suggestion) {
    return (
      <div className="page-full">
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
          {t("backToCampaigns")}
        </Link>
        <EmptyState
          icon="—"
          title={t("emptyTitle")}
          description={error ?? t("emptyDescription")}
        />
      </div>
    );
  }

  const isPending = suggestion.status === "pending";

  return (
    // paddingTop: 0 overrulet de standaard 24px van .page-full
    // zodat de sticky-bar hieronder flush onder de dashboard-topbar
    // kan pinnen (top: 0 i.p.v. negatieve offsets die clipping
    // veroorzaken). Horizontale padding behouden via paddingLeft/Right.
    <div className="page-full" style={{ paddingTop: 0 }}>
      {/* STICKY-blok: alles van 'Terug naar campagnes' t/m de
          voortgangsbalk blijft kleven onder de dashboard-topbar
          tijdens scrollen (per Floris-feedback 2026-05-21).
          top: 0 pint nu netjes onder de topbar omdat .page-full
          paddingTop op 0 staat (zie wrapper hierboven). */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "var(--bg, #FAF7F1)",
          paddingTop: 16,
          paddingBottom: 12,
          marginBottom: 16,
          borderBottom: "1px solid var(--border, #E5DFD0)",
        }}
      >
        <Link
          href="/dashboard/campagnes"
          style={{
            fontSize: 13,
            color: "var(--ts)",
            textDecoration: "none",
            marginBottom: 10,
            display: "inline-block",
          }}
        >
          {t("backToCampaigns")}
        </Link>
        <div className="page-title" style={{ marginBottom: 6 }}>
          {name}
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <span style={voorstelChipStyle}>{t("proposalChip")}</span>
          {!isPending && (
            <span style={{ color: "var(--ts)", fontSize: 12 }}>
              {suggestion.status === "approved"
                ? t("status.approved")
                : suggestion.status === "rejected"
                  ? t("status.rejected")
                  : suggestion.status === "expired"
                    ? t("status.expired")
                    : suggestion.status}
            </span>
          )}
        </div>
        {isPending && (
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 12,
            }}
          >
            <Button
              variant="secondary"
              onClick={handleReject}
              loading={rejecting}
              disabled={busy}
              style={{ color: "#B91C1C" }}
            >
              {t("reject")}
            </Button>
            <Button
              variant="secondary"
              onClick={handleDirectPlan}
              loading={planning}
              disabled={busy || allMissing.length > 0}
              title={
                allMissing.length > 0
                  ? t("directPlanTitleMissing")
                  : t("directPlanTitle")
              }
            >
              {t("directPlan")}
            </Button>
            <Button
              variant="primary"
              onClick={handleApprove}
              loading={approving}
              disabled={busy || allMissing.length > 0}
              title={
                allMissing.length > 0
                  ? t("approveTitleMissing")
                  : channels.length > 1
                    ? t("approveTitleBundle", { count: channels.length })
                    : t("approveTitleSingle")
              }
            >
              {channels.length > 1
                ? t("approveBundle", { count: channels.length })
                : t("approve")}
            </Button>
          </div>
        )}
        {isPending && progress.total > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div
              style={{
                flex: 1,
                height: 6,
                background: "var(--border, #E5DFD0)",
                borderRadius: 999,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${progress.percentage}%`,
                  height: "100%",
                  background:
                    progress.percentage === 100
                      ? "var(--color-brand, #1F4A2D)"
                      : "#F59E0B",
                  transition: "width 200ms ease, background 200ms ease",
                }}
              />
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--ts)",
                fontVariantNumeric: "tabular-nums",
                minWidth: 110,
                textAlign: "right",
              }}
            >
              {t("progressFields", {
                completed: progress.completed,
                total: progress.total,
              })}
            </div>
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

      {/* Kanaal in deze campagne: aan/uit-toggle per kanaal. Geen aparte
          "bewerken voor"-tabs meer — het actieve kanaal kies je door op een
          rij in de Aspecten-tabel te klikken. */}
      {isPending && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-h">
            <div>
              <div className="card-t">{t("channelsLabel")}</div>
            </div>
          </div>
          <div className="card-b">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(
                [
                  "mail",
                  "whatsapp",
                  "instagram",
                  "facebook",
                  "tiktok",
                  "google_business",
                ] as Platform[]
              ).map((p) => {
                const ch = channels.find((c) => c.platform === p);
                const isActive = !!ch;
                // Laatste actieve kanaal mag niet verwijderd worden.
                const isLast = isActive && channels.length <= 1;
                const disabled = busy || isLast;
                return (
                  <button
                    key={p}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (disabled) return;
                      if (isActive && ch) handleRemoveChannel(ch.id);
                      else handleAddChannel(p);
                    }}
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
                      cursor: disabled ? "default" : "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    <span>{PLATFORM_ICON[p]}</span>
                    <span>{shortPlatformName(p)}</span>
                    {isActive && !isLast && (
                      <span style={{ fontSize: 10, opacity: 0.8 }}>✕</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Aspecten-tabel: één rij per kanaal met missende items,
          datum/tijd, foto's en inhoud. Vervangt de losse Missende-,
          Foto- en Wanneer-kaarten; foto opent de bibliotheek-modal,
          datum bewerkt inline, inhoud-bewerken opent de InhoudCard
          (suggesties) hieronder. */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h">
          <div>
            <div className="card-t">{t("aspectsTitle")}</div>
          </div>
        </div>
        <div className="card-b" style={{ padding: 0, overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
            }}
          >
            <thead>
              <tr style={{ textAlign: "left" }}>
                {[
                  t("colChannel"),
                  t("colMissing"),
                  t("colWhen"),
                  t("colPhoto"),
                  t("colContent"),
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 14px",
                      borderBottom: "1px solid var(--border, #E5DFD0)",
                      fontWeight: 600,
                      fontSize: 13,
                      color: "var(--text)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fullChannels.map((ch) => {
                const chVariants = ch.variants ?? [];
                const chSel = Math.min(
                  Math.max(ch.selected_index ?? 0, 0),
                  Math.max(chVariants.length - 1, 0),
                );
                const sv = chVariants[chSel] ?? chVariants[0];
                const checklist = getChannelChecklist(
                  ch.platform,
                  sv?.body,
                  sv?.subject_line,
                  ch.scheduled_for,
                  ch.restaurant_media_id,
                );
                // Datum heeft een eigen kolom (haal 'm eruit). Toon alleen
                // VEREISTE items rood — optionele (bv. foto op Facebook/
                // Google) blokkeren niet en horen niet als "missend".
                const missNonDate = checklist.filter(
                  (it) => it.field !== "date" && it.required,
                );
                const chType = platformToType(ch.platform);
                const chEffective =
                  ch.scheduled_for ??
                  ch.filly_scheduled_for ??
                  fillySuggestedIso(targetDate, chType);
                const chMedia =
                  mediaLibrary.find((m) => m.id === ch.restaurant_media_id) ??
                  null;
                const chSupportsMedia = ch.platform !== "mail";
                const isRow = ch.id === activeId;
                const isEditingThisSchedule =
                  editingSchedule && activeId === ch.id;
                const tdStyle: React.CSSProperties = {
                  padding: "14px",
                  borderBottom: "1px solid var(--border, #E5DFD0)",
                  verticalAlign: "top",
                };
                const openPicker = () => {
                  setActiveChannelId(ch.id);
                  setPickerOpen(true);
                };
                const startSchedule = () => {
                  setActiveChannelId(ch.id);
                  setDraftDatetime(
                    toDatetimeLocalValue(
                      chEffective ?? new Date().toISOString(),
                    ),
                  );
                  setEditingSchedule(true);
                };
                const startContent = () => {
                  setActiveChannelId(ch.id);
                  handleStartEditVariant(chSel);
                  document
                    .getElementById(SECTION_ID.inhoud)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                };
                const redLink: React.CSSProperties = {
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: isPending ? "pointer" : "default",
                  color: "var(--danger, #DC2626)",
                  fontWeight: 500,
                  fontSize: 13,
                  textDecoration: "underline",
                  textUnderlineOffset: 2,
                };
                return (
                  <tr
                    key={ch.id}
                    onClick={() => {
                      if (isPending) setActiveChannelId(ch.id);
                    }}
                    style={{
                      cursor: isPending ? "pointer" : "default",
                      background: isRow
                        ? "var(--accent-light, #D6E0D8)"
                        : "transparent",
                    }}
                  >
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                      <span style={{ marginRight: 6 }}>
                        {PLATFORM_ICON[ch.platform]}
                      </span>
                      <span style={{ fontWeight: 600 }}>
                        {shortPlatformName(ch.platform)}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {missNonDate.length === 0 ? (
                        <span style={{ color: "#15703A", fontSize: 13 }}>
                          ✓ {t("rowComplete")}
                        </span>
                      ) : (
                        <span style={{ lineHeight: 1.7 }}>
                          {missNonDate.map((it, idx) => (
                            <span key={it.field}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!isPending) return;
                                  if (it.field === "photo") openPicker();
                                  else startContent();
                                }}
                                disabled={!isPending}
                                style={redLink}
                              >
                                {getMissingLabel(
                                  it.field,
                                  ch.platform,
                                ).toLowerCase()}
                              </button>
                              {idx < missNonDate.length - 1 ? ", " : ""}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                      {isEditingThisSchedule ? (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="datetime-local"
                            value={draftDatetime}
                            onChange={(e) => setDraftDatetime(e.target.value)}
                            style={{
                              padding: "6px 8px",
                              border: "1px solid var(--border, #E5DFD0)",
                              borderRadius: 6,
                              fontSize: 13,
                              fontFamily: "inherit",
                            }}
                          />
                          <div style={{ display: "flex", gap: 6 }}>
                            <Button
                              size="sm"
                              onClick={handleSaveSchedule}
                              loading={savingSchedule}
                              disabled={busy && !savingSchedule}
                            >
                              {t("saveTime")}
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setEditingSchedule(false)}
                              disabled={savingSchedule}
                            >
                              {t("cancelTime")}
                            </Button>
                          </div>
                        </div>
                      ) : ch.scheduled_for ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isPending) startSchedule();
                          }}
                          disabled={!isPending}
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            textAlign: "left",
                            cursor: isPending ? "pointer" : "default",
                            color: "var(--text)",
                            fontSize: 13,
                          }}
                        >
                          {formatDutchDateTime(ch.scheduled_for, localeTag)}{" "}
                          {isPending && (
                            <span style={{ color: "var(--ts)" }}>✎</span>
                          )}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isPending) startSchedule();
                          }}
                          disabled={!isPending}
                          style={redLink}
                        >
                          {t("chooseTime")}
                        </button>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {!chSupportsMedia ? (
                        <span style={{ color: "var(--text)", fontSize: 13 }}>
                          {t("noPhotoMail")}
                        </span>
                      ) : chMedia ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isPending) openPicker();
                          }}
                          disabled={!isPending}
                          style={{
                            padding: 0,
                            border: "1px solid var(--border, #E5DFD0)",
                            borderRadius: 8,
                            overflow: "hidden",
                            cursor: isPending ? "pointer" : "default",
                            background: "var(--surface)",
                            display: "block",
                          }}
                        >
                          {chMedia.mime_type.startsWith("video/") ? (
                            <video
                              src={chMedia.url}
                              muted
                              playsInline
                              preload="metadata"
                              style={{
                                width: 56,
                                height: 56,
                                objectFit: "cover",
                                display: "block",
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 56,
                                height: 56,
                                backgroundImage: `url(${chMedia.url})`,
                                backgroundSize: "cover",
                                backgroundPosition: "center",
                              }}
                            />
                          )}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isPending) openPicker();
                          }}
                          disabled={!isPending}
                          style={{
                            width: 130,
                            height: 50,
                            border: "1px dashed var(--border, #E5DFD0)",
                            borderRadius: 8,
                            background: "transparent",
                            color: "var(--text)",
                            fontSize: 13,
                            cursor: isPending ? "pointer" : "default",
                          }}
                        >
                          + {t("addPhoto")}
                        </button>
                      )}
                    </td>
                    <td style={{ ...tdStyle, maxWidth: 340 }}>
                      {ch.platform === "mail" && (
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--ts)",
                            marginBottom: 4,
                          }}
                        >
                          {sv?.subject_line ? (
                            sv.subject_line
                          ) : (
                            <span style={{ color: "var(--danger, #DC2626)" }}>
                              {getMissingLabel("subject", ch.platform)}
                            </span>
                          )}
                        </div>
                      )}
                      <div
                        style={{
                          fontSize: 13,
                          lineHeight: 1.5,
                          color: "var(--text)",
                          whiteSpace: "pre-line",
                        }}
                      >
                        {sv?.body ? (
                          sv.body.length > 160 ? (
                            sv.body.slice(0, 160) + "…"
                          ) : (
                            sv.body
                          )
                        ) : (
                          <em style={{ color: "var(--ts)" }}>
                            {t("noContentYet")}
                          </em>
                        )}
                      </div>
                      {isPending && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            startContent();
                          }}
                          style={{
                            marginTop: 8,
                            fontSize: 12,
                            fontWeight: 500,
                            padding: "4px 10px",
                            borderRadius: 6,
                            border: "1px solid var(--border, #E5DFD0)",
                            background: "var(--white, #FFFFFF)",
                            cursor: "pointer",
                          }}
                        >
                          {t("editContent")}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inhoud-card: variants-grid + bewerken + genereer nieuwe.
          Component bevat de hele edit-flow (textarea/onderwerp/save/
          cancel) maar laat state aan ons over zodat we kanaal-switch
          de drafts kunnen resetten. */}
      <InhoudCard
        sectionId={SECTION_ID.inhoud}
        variants={variants}
        selectedIndex={selectedIndex}
        type={type}
        canEdit={isPending}
        busy={busy}
        editingVariantIdx={editingVariantIdx}
        draftSubject={draftSubject}
        draftBody={draftBody}
        savingEdit={savingEdit}
        refining={refining}
        onSelectVariant={handleSelectVariant}
        onStartEditVariant={handleStartEditVariant}
        onCancelEditVariant={handleCancelEditVariant}
        onSaveEditVariant={handleSaveEditVariant}
        onDraftSubjectChange={setDraftSubject}
        onDraftBodyChange={setDraftBody}
        onRegenerate={handleRegenerate}
      />

      {/* Waarom dit voorstel — Filly's redenering als context onderaan,
          ná de actie-kaarten (kanalen/inhoud/foto/timing). */}
      <WaaromCard reasoning={suggestion.reasoning} />

      <MediaLibraryPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={handlePickMedia}
      />
    </div>
  );
}

// ChecklistButton verhuisd naar
// _components/campaign-detail/missende-aspecten-card.tsx
// (per 2026-05-13, extract als onderdeel van stap 1).
