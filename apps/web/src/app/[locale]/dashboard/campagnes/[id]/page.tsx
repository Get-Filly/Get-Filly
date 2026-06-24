"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import {
  deleteCampaign,
  editCampaignVariant,
  fetchCampaignBundle,
  generateMoreCampaignVariants,
  selectCampaignVariant,
  sendCampaign,
  publishCampaign,
  setCampaignSchedule,
  updateCampaignStatus,
  fetchRepetitionCheck,
  type CampaignBundle,
  type CampaignDetail,
  type CampaignStatus,
  type RepetitionWarning,
} from "@/lib/api";
import {
  bundleToView,
  type UnifiedDetailView,
} from "@/lib/campaign-detail-adapter";
import { Skeleton } from "../../_components/skeleton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  SECTION_ID,
  fillySuggestedIso,
  platformToType,
  toDatetimeLocalValue,
} from "../../_components/campaign-detail/types";
import { WaaromCard } from "../../_components/campaign-detail/waarom-card";
import {
  AspectenTabel,
  type AspectRow,
} from "../../_components/campaign-detail/aspecten-tabel";
import { getChannelChecklist } from "@/lib/campaign-checks";
import { InhoudCard } from "../../_components/campaign-detail/inhoud-card";
import { FotoCard } from "../../_components/campaign-detail/foto-card";
import { CampaignPerformanceCard } from "./_components/campaign-performance-card";
import { CampaignSendCard } from "./_components/campaign-send-card";
import { useLocaleTag } from "@/lib/locale-format";

// ============================================================
// UnifiedDetailPage, één pagina voor alle campagne-statussen
// ============================================================
//
// Per 2026-05-13 vervangt deze pagina de aparte single-channel
// (oude /[id]) én multi-channel (oude /bundle/[id]) detail-pages.
// Reden: layout-divergentie tussen Voorstel-detail en Campagne-
// detail leverde "alles verandert na goedkeuren"-syndroom op.
//
// Strategie:
//   - GET /campaigns/bundle/:id smart-detect: id = group_id OF
//     campaign_id, retourneert altijd { group, campaigns[] }.
//   - Adapter (lib/campaign-detail-adapter) zet die om naar
//     UnifiedDetailView in dezelfde shape die de 5 voorstel-
//     componenten al kennen.
//   - Componenten zijn dezelfde als op /voorstel/[id], alleen
//     de wire-up (callbacks → variant-endpoints) verschilt.
//   - canEdit = status === 'concept'. Ingepland/actief = readonly;
//     eigenaar moet eerst 'Terug naar concept' om verder te
//     bewerken (backend handhaaft de regel ook).
//
// Add/remove kanalen op campagne-bundles: nog niet ondersteund
// door backend (zou een nieuwe campaign in dezelfde group moeten
// aanmaken). Voor nu disabled — komt in een latere fase.

/**
 * Status-label dat per campagne-type aanpast wat 'Actief' betekent.
 * Voor mail: 'actief' is dubbelzinnig (geactiveerd vs daadwerkelijk
 * verstuurd). We tonen daarom:
 *   - 'Klaar voor verzending' zolang sent_count = 0
 *   - 'Verstuurd' zodra minimaal 1 recipient een mail heeft gekregen
 * Voor social/whatsapp blijft 'Actief' want daar is push = live.
 */
function getDisplayStatus(
  t: (key: string) => string,
  status: CampaignStatus,
  type: string | null | undefined,
  sentCount: number,
): string {
  if (status === "actief" && type === "mail") {
    return sentCount > 0 ? t("statusSent") : t("statusReadyToSend");
  }
  return t(`status.${status}`);
}

const statusChipStyle = (status: CampaignStatus): React.CSSProperties => {
  const palette: Record<CampaignStatus, { bg: string; fg: string }> = {
    concept: { bg: "#FFFFFF", fg: "#1F4A2D" },
    ingepland: { bg: "#1F4A2D", fg: "#FFFFFF" },
    actief: { bg: "#1F4A2D", fg: "#FFFFFF" },
    afgerond: { bg: "#E5DFD0", fg: "#6B6F71" },
  };
  const c = palette[status];
  return {
    display: "inline-flex",
    alignItems: "center",
    fontSize: 12,
    fontWeight: 500,
    padding: "3px 10px",
    borderRadius: 6,
    background: c.bg,
    color: c.fg,
    border: `1px solid ${c.fg === "#FFFFFF" ? c.bg : c.fg}`,
  };
};

export default function UnifiedDetailPage() {
  const t = useTranslations("campagnes_id_page");
  // De Aspecten-tabel-labels hergebruiken we uit de voorstel-namespace
  // (daar staan ze al), zodat de gedeelde tabel niet z'n eigen keys nodig heeft.
  const tAspect = useTranslations("campagnes_voorstel_id_page");
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const localeTag = useLocaleTag();

  const [bundle, setBundle] = useState<CampaignBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [savingVariant, setSavingVariant] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [refining, setRefining] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);

  // Variant-edit-draftstate. Eigenaar bewerkt de Gekozen versie
  // (of een specifieke index).
  const [editingVariantIdx, setEditingVariantIdx] = useState<number | null>(
    null,
  );
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");

  // Schedule-edit-state.
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [draftDatetime, setDraftDatetime] = useState("");
  // Media via de cel: pop-up met de FotoCard (foto óf video) i.p.v. een
  // losse kaart onderaan. Zo voeg je media toe vanuit de balkjes, net als
  // op de voorstel/"foto"-interface.
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  // Anti-repetitie-waarschuwingen voor de actieve campagne (filly-brein
  // hfst 8.6). Lege array = geen waarschuwing. Faalt stil.
  const [repetitionWarnings, setRepetitionWarnings] = useState<
    RepetitionWarning[]
  >([]);

  // ────────────────────────────────────────────────────────────
  // Initial load + refetch helper
  // ────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const next = await fetchCampaignBundle(id);
      setBundle(next);
      // Active channel intelligent default: behoud current als 'ie
      // nog bestaat, anders eerste kanaal.
      setActiveChannelId((prev) => {
        if (prev && next.campaigns.some((c) => c.id === prev)) return prev;
        return next.campaigns[0]?.id ?? null;
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.notFound"));
    }
  }, [id, t]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  // ────────────────────────────────────────────────────────────
  // Afgeleide view via adapter
  // ────────────────────────────────────────────────────────────
  const view: UnifiedDetailView | null = useMemo(() => {
    if (!bundle) return null;
    try {
      return bundleToView(bundle);
    } catch {
      return null;
    }
  }, [bundle]);

  const activeChannel = useMemo(() => {
    if (!view) return null;
    const found = view.channels.find((c) => c.id === activeChannelId);
    return found ?? view.channels[0] ?? null;
  }, [view, activeChannelId]);

  const activeCampaign: CampaignDetail | null = useMemo(() => {
    if (!view || !activeChannel) return null;
    return view.campaignsByChannelId[activeChannel.id] ?? null;
  }, [view, activeChannel]);

  // Anti-repetitie-check ophalen wanneer de actieve campagne wijzigt.
  // Faalt stil (lege array) zodat een check-fout de page niet blokkeert.
  useEffect(() => {
    const cid = activeCampaign?.id;
    if (!cid) {
      setRepetitionWarnings([]);
      return;
    }
    let cancelled = false;
    fetchRepetitionCheck(cid).then((w) => {
      if (!cancelled) setRepetitionWarnings(w);
    });
    return () => {
      cancelled = true;
    };
  }, [activeCampaign?.id]);

  // Status-derived flags.
  const status = view?.status ?? "concept";
  const canEdit = status === "concept";
  const busy =
    loading ||
    savingVariant ||
    savingSchedule ||
    refining ||
    changingStatus ||
    deleting;

  // ────────────────────────────────────────────────────────────
  // Wanneer-card afgeleiden — analoog aan voorstel-page
  // ────────────────────────────────────────────────────────────
  const activePlatform = activeChannel?.platform ?? "mail";
  const activePlatformType = platformToType(activePlatform);
  // (De losse Wanneer-card-afgeleiden zijn vervallen: datum/tijd zit nu
  // per kanaal in de Aspecten-tabel; de fallback-tijd wordt daar berekend.)

  // ────────────────────────────────────────────────────────────
  // Variant-handlers
  // ────────────────────────────────────────────────────────────
  const variants = activeChannel?.variants ?? [];
  const selectedIndex = activeChannel?.selected_index ?? 0;

  // Rijen voor de gedeelde Aspecten-tabel: één per kanaal. Missende items =
  // VEREISTE openstaande velden (zonder datum, die heeft een eigen kolom).
  const aspectRows: AspectRow[] = useMemo(() => {
    if (!view) return [];
    return view.channels.map((c) => {
      const sel = c.variants[c.selected_index] ?? c.variants[0];
      const checklist = getChannelChecklist(
        c.platform,
        sel?.body,
        sel?.subject_line,
        c.scheduled_for,
        c.media_url ? "x" : null,
      );
      const missing = checklist
        .filter((it) => it.required && it.field !== "date")
        .map((it) => it.field);
      const type = platformToType(c.platform);
      let effective = c.scheduled_for ?? c.filly_scheduled_for ?? null;
      if (!effective) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const ymd = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
        effective = fillySuggestedIso(ymd, type);
      }
      return {
        id: c.id,
        platform: c.platform,
        missing,
        scheduledFor: c.scheduled_for ?? null,
        effectiveIso: effective,
        supportsMedia: c.platform !== "mail",
        mediaUrl: c.media_url ?? null,
        mediaIsVideo: /\.(mp4|mov|webm)(\?|$)/i.test(c.media_url ?? ""),
        subjectLine: sel?.subject_line ?? null,
        bodyPreview: sel?.body ?? "",
      };
    });
  }, [view]);

  const aspectLabels = {
    aspects: tAspect("aspectsTitle"),
    channel: tAspect("colChannel"),
    missing: tAspect("colMissing"),
    when: tAspect("colWhen"),
    photo: tAspect("colPhoto"),
    content: tAspect("colContent"),
    complete: tAspect("rowComplete"),
    addPhoto: tAspect("addPhoto"),
    noPhotoMail: tAspect("noPhotoMail"),
    edit: tAspect("editContent"),
    chooseTime: tAspect("chooseTime"),
    save: tAspect("saveTime"),
    cancel: tAspect("cancelTime"),
    noContentYet: tAspect("noContentYet"),
  };

  const handleSelectVariant = useCallback(
    async (idx: number) => {
      if (!activeChannel || busy || !canEdit) return;
      if (idx === selectedIndex) return;
      setActionError(null);
      setSavingVariant(true);
      try {
        await selectCampaignVariant(activeChannel.id, idx);
        await load();
      } catch (e) {
        setActionError(
          e instanceof Error ? e.message : t("errors.selectVariant"),
        );
      } finally {
        setSavingVariant(false);
      }
    },
    [activeChannel, busy, canEdit, selectedIndex, load, t],
  );

  const handleStartEditVariant = useCallback(
    (idx: number) => {
      if (busy || !canEdit) return;
      const v = variants[idx];
      setDraftSubject(v?.subject_line ?? "");
      setDraftBody(v?.body ?? "");
      setEditingVariantIdx(idx);
      setActionError(null);
    },
    [busy, canEdit, variants],
  );

  const handleCancelEditVariant = useCallback(() => {
    if (savingVariant) return;
    setEditingVariantIdx(null);
    setDraftSubject("");
    setDraftBody("");
  }, [savingVariant]);

  const handleSaveEditVariant = useCallback(async () => {
    if (!activeChannel || editingVariantIdx === null || busy) return;
    if (!draftBody.trim()) {
      setActionError(t("errors.bodyEmpty"));
      return;
    }
    setActionError(null);
    setSavingVariant(true);
    try {
      await editCampaignVariant(activeChannel.id, editingVariantIdx, {
        subject_line: draftSubject.trim() || null,
        body: draftBody.trim(),
      });
      await load();
      setEditingVariantIdx(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t("errors.editFailed"));
    } finally {
      setSavingVariant(false);
    }
  }, [
    activeChannel,
    editingVariantIdx,
    busy,
    draftBody,
    draftSubject,
    load,
    t,
  ]);

  const handleRegenerate = useCallback(async () => {
    if (!activeChannel || busy || !canEdit) return;
    setActionError(null);
    setRefining(true);
    try {
      await generateMoreCampaignVariants(activeChannel.id);
      await load();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : t("errors.generateFailed"),
      );
    } finally {
      setRefining(false);
    }
  }, [activeChannel, busy, canEdit, load, t]);

  // ────────────────────────────────────────────────────────────
  // Schedule-handlers
  // ────────────────────────────────────────────────────────────
  const handleSaveSchedule = useCallback(async () => {
    if (!activeChannel || !draftDatetime || busy) return;
    setActionError(null);
    setSavingSchedule(true);
    try {
      const localIso = new Date(draftDatetime).toISOString();
      await setCampaignSchedule(activeChannel.id, localIso);
      await load();
      setEditingSchedule(false);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : t("errors.saveScheduleFailed"),
      );
    } finally {
      setSavingSchedule(false);
    }
  }, [activeChannel, draftDatetime, busy, load, t]);

  // ────────────────────────────────────────────────────────────
  // Status-transitie + verwijder
  // ────────────────────────────────────────────────────────────
  // Bundle-niveau: alle campaigns krijgen dezelfde status-overgang
  // tegelijk (Promise.all). Bij single-channel = 1 call.
  //
  // Bij activeren (next='actief') versturen we ook de daadwerkelijke
  // mail voor elke mail-channel met sent_count=0. Reden: vroeger deed
  // 'Activeer nu' alleen de status-flip → stille no-send waardoor de
  // confirm-tekst ("Mail wordt direct verstuurd") loog. Volgorde:
  //   1. mail-sends eerst (zwaarste operatie, kan minutenlang duren)
  //   2. status-flip op alle channels
  // Als de send faalt blijft status op concept/ingepland zodat we geen
  // 'actief zonder mail'-toestand krijgen — eigenaar kan dan via de
  // foutmelding bijsturen (bv. opt-in gasten toevoegen) en opnieuw
  // proberen. sent_count>0 = al een keer verstuurd → defensief skippen
  // om dubbele bezorging te voorkomen.
  const handleStatusChange = useCallback(
    async (next: CampaignStatus) => {
      if (!view || busy) return;

      if (next === "actief") {
        // Identificeer welke mail-channels nog nooit verstuurd zijn.
        const mailChannelsToSend = view.channels.filter((c) => {
          if (c.platform !== "mail") return false;
          const campaign = view.campaignsByChannelId[c.id];
          return (campaign?.sent_count ?? 0) === 0;
        });
        const mailCount = mailChannelsToSend.length;

        // Social-kanalen publiceren naar FB/IG bij activeren. We filteren
        // op campagne-type (niet op het granulaire platform-veld); de
        // backend is idempotent, dus al-gepubliceerde kanalen worden
        // overgeslagen.
        const socialChannelsToPublish = view.channels.filter(
          (c) => view.campaignsByChannelId[c.id]?.type === "social",
        );
        const socialCount = socialChannelsToPublish.length;

        // Confirm-tekst opbouwen uit wat er daadwerkelijk gebeurt.
        const actions: string[] = [];
        if (mailCount > 0) {
          actions.push(t("activateConfirm.mailAction", { count: mailCount }));
        }
        if (socialCount > 0) {
          actions.push(
            t("activateConfirm.socialAction", { count: socialCount }),
          );
        }
        const confirmMsg =
          actions.length === 0
            ? t("activateConfirm.base")
            : t("activateConfirm.withActions", {
                actions: actions.join(t("activateConfirm.and")),
              });
        if (!window.confirm(confirmMsg)) return;

        setActionError(null);
        setChangingStatus(true);
        try {
          // Stap 1: mail-sends sequentieel (Resend rate-limits + duidelijke
          // fout-attributie als één campagne in een bundle struikelt).
          for (const c of mailChannelsToSend) {
            await sendCampaign(c.id, "all_opted_in");
          }
          // Stap 1b: social-posts publiceren naar FB/IG. Faalt dit (geen
          // Meta-koppeling / geen pagina gekozen / Meta-fout), dan gooit
          // publishCampaign en blijft de status op concept/ingepland staan.
          for (const c of socialChannelsToPublish) {
            await publishCampaign(c.id);
          }
          // Stap 2: status-flip op alle channels (mail + social).
          await Promise.all(
            view.channels.map((c) => updateCampaignStatus(c.id, next)),
          );
          await load();
        } catch (e) {
          setActionError(
            e instanceof Error ? e.message : t("errors.activateFailed"),
          );
        } finally {
          setChangingStatus(false);
        }
        return;
      }

      // Stop & verwijderen van kanaal (actief → concept): destructief,
      // de gepubliceerde post wordt teruggetrokken. Vraag bevestiging.
      if (view.status === "actief" && next === "concept") {
        if (!window.confirm(t("stopConfirm"))) {
          return;
        }
      }

      // Andere transities (concept↔ingepland, actief→afgerond/concept):
      // alleen status-flip; de backend regelt het terugtrekken van het
      // kanaal bij actief→concept.
      setActionError(null);
      setChangingStatus(true);
      try {
        // Plan-in: een door Filly voorgesteld moment dat de eigenaar niet
        // wijzigde, geldt als geaccepteerd. Persisteer het als scheduled_for
        // voor kanalen die nog geen eigen tijd hebben — anders zou
        // 'ingepland' geen concrete tijd hebben en pakt de cron 'm nooit op.
        if (next === "ingepland") {
          await Promise.all(
            view.channels
              .filter((c) => !c.scheduled_for && c.filly_scheduled_for)
              .map((c) => setCampaignSchedule(c.id, c.filly_scheduled_for!)),
          );
        }
        await Promise.all(
          view.channels.map((c) => updateCampaignStatus(c.id, next)),
        );
        await load();
      } catch (e) {
        setActionError(
          e instanceof Error ? e.message : t("errors.statusChangeFailed"),
        );
      } finally {
        setChangingStatus(false);
      }
    },
    [view, busy, load, t],
  );

  // Delete: alleen op concept (backend handhaaft). Multi-channel:
  // alle campaigns van de bundle weg. Eigenaar krijgt confirmatie.
  const handleDelete = useCallback(async () => {
    if (!view || busy) return;
    if (status !== "concept") return;
    if (
      !window.confirm(
        view.channels.length > 1
          ? t("deleteConfirm.bundle", { count: view.channels.length })
          : t("deleteConfirm.single"),
      )
    ) {
      return;
    }
    setActionError(null);
    setDeleting(true);
    try {
      await Promise.all(view.channels.map((c) => deleteCampaign(c.id)));
      router.push("/dashboard/campagnes");
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : t("errors.deleteFailed"),
      );
      setDeleting(false);
    }
  }, [view, busy, status, router, t]);

  // ────────────────────────────────────────────────────────────
  // Voortgangsbar — uit channelsChecklist
  // ────────────────────────────────────────────────────────────
  const progress = useMemo(() => {
    if (!view) return { total: 0, completed: 0, percentage: 100 };
    let total = 0;
    let missing = 0;
    for (const c of view.channels) {
      total += 2; // datum + body altijd
      if (c.platform === "mail") total += 1;
      if (c.platform === "instagram" || c.platform === "tiktok") total += 1;
    }
    for (const c of view.channelsChecklist) {
      for (const item of c.items) {
        if (item.required) missing += 1;
      }
    }
    const completed = Math.max(0, total - missing);
    return {
      total,
      completed,
      percentage:
        total === 0 ? 100 : Math.round((completed / total) * 100),
    };
  }, [view]);

  // ────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────

  if (loading && !view) {
    return (
      <div className="page-full">
        <Skeleton style={{ height: 32, width: 240, marginBottom: 16 }} />
        <Skeleton style={{ height: 120, marginBottom: 12 }} />
        <Skeleton style={{ height: 320 }} />
      </div>
    );
  }

  if (error || !view) {
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
          title={t("unavailableTitle")}
          description={error ?? t("unavailableDescription")}
        />
      </div>
    );
  }

  const supportsMedia =
    activePlatform === "instagram" ||
    activePlatform === "facebook" ||
    activePlatform === "tiktok" ||
    activePlatform === "whatsapp";

  // Actie-knoppen per status. Volgorde rechts→links: destructief
  // links, primair rechts.
  const renderActions = () => {
    if (status === "concept") {
      return (
        <>
          <Button
            variant="secondary"
            onClick={handleDelete}
            loading={deleting}
            disabled={busy}
            style={{ color: "#B91C1C" }}
          >
            {t("actions.delete")}
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleStatusChange("actief")}
            disabled={busy || progress.percentage < 100}
            title={
              progress.percentage < 100
                ? t("actions.fillRequiredFirst")
                : t("actions.activateNowTitle")
            }
          >
            {t("actions.activateNow")}
          </Button>
          <Button
            variant="primary"
            onClick={() => handleStatusChange("ingepland")}
            loading={changingStatus}
            disabled={busy || progress.percentage < 100}
            title={
              progress.percentage < 100
                ? t("actions.fillRequiredFirst")
                : t("actions.scheduleTitle")
            }
          >
            {t("actions.schedule")}
          </Button>
        </>
      );
    }
    if (status === "ingepland") {
      return (
        <>
          <Button
            variant="secondary"
            onClick={() => handleStatusChange("concept")}
            loading={changingStatus}
            disabled={busy}
            title={t("actions.backToConceptTitle")}
          >
            {t("actions.backToConcept")}
          </Button>
          <Button
            variant="primary"
            onClick={() => handleStatusChange("actief")}
            disabled={busy}
            title={t("actions.activateNowScheduledTitle")}
          >
            {t("actions.activateNow")}
          </Button>
        </>
      );
    }
    if (status === "actief") {
      // Mail kan niet teruggetrokken worden (al verstuurd) → 'Afronden'
      // zet 'm naar afgerond zonder iets te verwijderen. Social/WhatsApp
      // kan wél: 'Stop & verwijderen' trekt de post terug van het kanaal
      // (backend-stub tot Meta/TikTok OAuth) + zet terug naar concept.
      const isMail = activeCampaign?.type === "mail";
      if (isMail) {
        return (
          <Button
            variant="secondary"
            onClick={() => handleStatusChange("afgerond")}
            loading={changingStatus}
            disabled={busy}
            style={{ color: "#B91C1C" }}
            title={t("actions.finishMailTitle")}
          >
            {t("actions.finish")}
          </Button>
        );
      }
      return (
        <>
          <Button
            variant="secondary"
            onClick={() => handleStatusChange("afgerond")}
            loading={changingStatus}
            disabled={busy}
          >
            {t("actions.finish")}
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleStatusChange("concept")}
            loading={changingStatus}
            disabled={busy}
            style={{ color: "#B91C1C" }}
            title={t("actions.stopAndRemoveTitle")}
          >
            {t("actions.stopAndRemove")}
          </Button>
        </>
      );
    }
    // afgerond: geen acties
    return null;
  };

  return (
    // paddingTop: 0 overrulet de standaard 24px van .page-full
    // zodat de sticky-bar hieronder flush onder de dashboard-topbar
    // kan pinnen (top: 0 i.p.v. negatieve offsets die clipping
    // veroorzaken).
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
          {view.name}
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <span style={statusChipStyle(status)}>
            {getDisplayStatus(
              t,
              status,
              activeCampaign?.type ?? null,
              activeCampaign?.sent_count ?? 0,
            )}
          </span>
          {view.bundleName && view.channels.length > 1 && (
            <span style={{ color: "var(--tl)", fontSize: 12 }}>
              {t("channelCount", { count: view.channels.length })}
            </span>
          )}
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: status === "concept" && progress.total > 0 ? 12 : 0,
          }}
        >
          {renderActions()}
        </div>
        {status === "concept" && progress.total > 0 && (
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
                color: "var(--tl)",
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

      {/* Kanaal in deze campagne: read-only overzicht van de kanalen in
          deze (bundel-)campagne. Kanalen kies je bij het aanmaken via de
          "Maak eigen campagne"-builder; toevoegen/verwijderen mid-flight
          zit (nog) niet in de backend, dus puur tonend. */}
      {view.channels.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-h">
            <div>
              <div className="card-t">{tAspect("channelsLabel")}</div>
            </div>
          </div>
          <div className="card-b">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {view.channels.map((c) => {
                const CHANNEL_LABEL: Record<string, string> = {
                  mail: "E-mail",
                  instagram: "Instagram",
                  facebook: "Facebook",
                  tiktok: "TikTok",
                  whatsapp: "WhatsApp",
                  google_business: "Google Business",
                };
                return (
                  <span
                    key={c.id}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "5px 12px",
                      borderRadius: 999,
                      background: "var(--accent-soft, #EAF3ED)",
                      color: "var(--accent, #1F4A2D)",
                      border: "1px solid var(--border, #E5DFD0)",
                      fontSize: 13,
                    }}
                  >
                    {CHANNEL_LABEL[c.platform] ?? c.platform}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 24 }} />

      {/* Aspecten-tabel: overzicht per kanaal (missende items, datum/tijd,
          foto's, inhoud). Vervangt de losse Missende-, Kanalen- en Wanneer-
          kaarten; foto bewerk je in de FotoCard en tekst in de InhoudCard
          hieronder (klik 'Bewerk'/de cel → scrollt erheen), datum inline. */}
      <AspectenTabel
        rows={aspectRows}
        canEdit={canEdit}
        busy={busy}
        activeChannelId={activeChannel?.id ?? null}
        scheduleEditChannelId={
          editingSchedule ? (activeChannel?.id ?? null) : null
        }
        draftDatetime={draftDatetime}
        savingSchedule={savingSchedule}
        localeTag={localeTag}
        labels={aspectLabels}
        onSelectChannel={(channelId) => {
          setEditingVariantIdx(null);
          setEditingSchedule(false);
          setActiveChannelId(channelId);
        }}
        onOpenMedia={(channelId) => {
          setActiveChannelId(channelId);
          setMediaModalOpen(true);
        }}
        onStartSchedule={(channelId, eff) => {
          setActiveChannelId(channelId);
          setDraftDatetime(
            toDatetimeLocalValue(eff ?? new Date().toISOString()),
          );
          setEditingSchedule(true);
        }}
        onSaveSchedule={handleSaveSchedule}
        onCancelSchedule={() => setEditingSchedule(false)}
        onDraftDatetimeChange={setDraftDatetime}
        onEditContent={(channelId) => {
          const ch = view.channels.find((c) => c.id === channelId);
          const idx = ch?.selected_index ?? 0;
          const v = ch?.variants[idx];
          setActiveChannelId(channelId);
          setDraftSubject(v?.subject_line ?? "");
          setDraftBody(v?.body ?? "");
          setEditingVariantIdx(idx);
          document
            .getElementById(SECTION_ID.inhoud)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />

      <InhoudCard
        sectionId={SECTION_ID.inhoud}
        variants={variants}
        selectedIndex={selectedIndex}
        type={activePlatformType}
        canEdit={canEdit}
        busy={busy}
        editingVariantIdx={editingVariantIdx}
        draftSubject={draftSubject}
        draftBody={draftBody}
        savingEdit={savingVariant}
        refining={refining}
        onSelectVariant={handleSelectVariant}
        onStartEditVariant={handleStartEditVariant}
        onCancelEditVariant={handleCancelEditVariant}
        onSaveEditVariant={handleSaveEditVariant}
        onDraftSubjectChange={setDraftSubject}
        onDraftBodyChange={setDraftBody}
        onRegenerate={handleRegenerate}
      />

      {repetitionWarnings.length > 0 && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            background: "var(--warning-soft, #FEF3C7)",
            border: "1px solid var(--warning, #D97706)",
            borderRadius: 8,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text, #18181B)",
              marginBottom: 4,
            }}
          >
            {t("repetitionTipTitle")}
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {repetitionWarnings.map((w, i) => (
              <li
                key={i}
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary, #52525B)",
                  lineHeight: 1.5,
                }}
              >
                {w.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Waarom dit voorstel — Filly's redenering als context onderaan,
          ná de inhoud. Hier eindigt het concept-scherm: geen losse
          foto/video-card en geen performance-card op een concept. */}
      <WaaromCard reasoning={view.reasoning} />

      {/* Mail-verstuur + performance horen bij een lopende campagne, niet
          bij een concept. Daarom pas tonen zodra de campagne uit de
          concept-fase is (ingepland/actief). */}
      {status !== "concept" && activeCampaign?.type === "mail" && (
        <CampaignSendCard campaignId={activeCampaign.id} />
      )}
      {status !== "concept" && <CampaignPerformanceCard campaignId={id} />}

      {/* Media-pop-up: foto óf video toevoegen vanuit de cel in de
          Aspecten-tabel (de "balkjes"). De FotoCard regelt zelf de
          bibliotheek-keuze, upload en verwijderen. Vervangt de losse
          foto-card die voorheen onderaan stond. */}
      {mediaModalOpen && supportsMedia && activeCampaign && (
        <div
          onClick={() => setMediaModalOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(14,43,23,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--white, #FFFFFF)",
              borderRadius: 12,
              padding: 20,
              maxWidth: 520,
              width: "100%",
            }}
          >
            <FotoCard
              campaignId={activeCampaign.id}
              signedUrl={activeChannel?.media_url ?? null}
              canEdit={canEdit}
              allowVideo={activeChannel?.platform !== "mail"}
              onMediaChanged={() => {
                void load();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
