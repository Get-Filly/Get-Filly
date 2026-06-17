"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
} from "../../../../lib/api";
import {
  bundleToView,
  type UnifiedDetailView,
} from "../../../../lib/campaign-detail-adapter";
import { Skeleton } from "../../_components/skeleton";
import { Button } from "../../../../components/ui/button";
import { EmptyState } from "../../../../components/ui/empty-state";
import {
  SECTION_ID,
  fillySuggestedIso,
  platformToType,
  timesEqualToMinute,
  toDatetimeLocalValue,
} from "../../_components/campaign-detail/types";
import { WaaromCard } from "../../_components/campaign-detail/waarom-card";
import { MissendeAspectenCard } from "../../_components/campaign-detail/missende-aspecten-card";
import { KanalenCard } from "../../_components/campaign-detail/kanalen-card";
import { InhoudCard } from "../../_components/campaign-detail/inhoud-card";
import { WanneerCard } from "../../_components/campaign-detail/wanneer-card";
import { FotoCard } from "../../_components/campaign-detail/foto-card";
import { CampaignPerformanceCard } from "./_components/campaign-performance-card";
import { CampaignSendCard } from "./_components/campaign-send-card";
import type { MissingField } from "../../../../lib/campaign-checks";

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

const STATUS_LABEL: Record<CampaignStatus, string> = {
  concept: "Concept",
  ingepland: "Ingepland",
  actief: "Actief",
  afgerond: "Afgerond",
};

/**
 * Status-label dat per campagne-type aanpast wat 'Actief' betekent.
 * Voor mail: 'actief' is dubbelzinnig (geactiveerd vs daadwerkelijk
 * verstuurd). We tonen daarom:
 *   - 'Klaar voor verzending' zolang sent_count = 0
 *   - 'Verstuurd' zodra minimaal 1 recipient een mail heeft gekregen
 * Voor social/whatsapp blijft 'Actief' want daar is push = live.
 */
function getDisplayStatus(
  status: CampaignStatus,
  type: string | null | undefined,
  sentCount: number,
): string {
  if (status === "actief" && type === "mail") {
    return sentCount > 0 ? "Verstuurd" : "Klaar voor verzending";
  }
  return STATUS_LABEL[status];
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
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

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
      setError(
        e instanceof Error
          ? e.message
          : "Campagne niet gevonden of niet meer beschikbaar.",
      );
    }
  }, [id]);

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

  // Filly's voorgestelde tijd voor het actieve kanaal.
  const fillyIso = useMemo(() => {
    if (!activeChannel) return null;
    if (activeChannel.filly_scheduled_for) {
      return activeChannel.filly_scheduled_for;
    }
    // Geen Filly-tijd → fallback: morgen + standaard uur per type.
    // Zelfde patroon als voorstel-page om de WanneerCard altijd
    // betekenisvol te laten zijn.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const ymd = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    return fillySuggestedIso(ymd, activePlatformType);
  }, [activeChannel, activePlatformType]);
  const fillyReasoning =
    activeChannel?.filly_scheduled_reasoning ?? null;
  const customIso = activeChannel?.scheduled_for ?? null;
  const effectiveIso = customIso ?? fillyIso;
  const isCustomTime =
    !!customIso && !timesEqualToMinute(customIso, fillyIso);

  // ────────────────────────────────────────────────────────────
  // Variant-handlers
  // ────────────────────────────────────────────────────────────
  const variants = activeChannel?.variants ?? [];
  const selectedIndex = activeChannel?.selected_index ?? 0;

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
          e instanceof Error ? e.message : "Versie-selectie mislukt.",
        );
      } finally {
        setSavingVariant(false);
      }
    },
    [activeChannel, busy, canEdit, selectedIndex, load],
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
      setActionError("Body mag niet leeg zijn.");
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
      setActionError(e instanceof Error ? e.message : "Bewerken mislukt.");
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
        e instanceof Error ? e.message : "Genereren mislukt.",
      );
    } finally {
      setRefining(false);
    }
  }, [activeChannel, busy, canEdit, load]);

  // ────────────────────────────────────────────────────────────
  // Schedule-handlers
  // ────────────────────────────────────────────────────────────
  const handleStartEditSchedule = useCallback(() => {
    if (busy || !canEdit) return;
    setActionError(null);
    setDraftDatetime(
      toDatetimeLocalValue(effectiveIso ?? new Date().toISOString()),
    );
    setEditingSchedule(true);
  }, [busy, canEdit, effectiveIso]);

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
        e instanceof Error ? e.message : "Verzendmoment opslaan mislukt.",
      );
    } finally {
      setSavingSchedule(false);
    }
  }, [activeChannel, draftDatetime, busy, load]);

  const handleResetToFilly = useCallback(async () => {
    if (!activeChannel || !fillyIso || busy) return;
    setActionError(null);
    setSavingSchedule(true);
    try {
      await setCampaignSchedule(activeChannel.id, fillyIso);
      await load();
      setEditingSchedule(false);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Reset naar Filly's voorstel mislukt.",
      );
    } finally {
      setSavingSchedule(false);
    }
  }, [activeChannel, fillyIso, busy, load]);

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
          actions.push(
            mailCount === 1
              ? "de mail wordt direct verstuurd naar alle opt-in gasten"
              : `${mailCount} mails worden direct verstuurd naar alle opt-in gasten`,
          );
        }
        if (socialCount > 0) {
          actions.push(
            socialCount === 1
              ? "de social-post wordt direct op Facebook/Instagram geplaatst"
              : `${socialCount} social-posts worden direct op Facebook/Instagram geplaatst`,
          );
        }
        const confirmMsg =
          actions.length === 0
            ? "Weet je zeker dat je deze campagne nu wil activeren?"
            : `Weet je zeker dat je deze campagne nu wil activeren? ${actions.join(" en ")}.`;
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
            e instanceof Error ? e.message : "Activeren mislukt.",
          );
        } finally {
          setChangingStatus(false);
        }
        return;
      }

      // Stop & verwijderen van kanaal (actief → concept): destructief,
      // de gepubliceerde post wordt teruggetrokken. Vraag bevestiging.
      if (view.status === "actief" && next === "concept") {
        if (
          !window.confirm(
            "Weet je zeker dat je deze campagne wil stoppen? De Facebook-post wordt verwijderd en de campagne gaat terug naar concept. Een eventuele Instagram-post moet je handmatig in de Instagram-app verwijderen, want Instagram staat verwijderen via de API niet toe.",
          )
        ) {
          return;
        }
      }

      // Andere transities (concept↔ingepland, actief→afgerond/concept):
      // alleen status-flip; de backend regelt het terugtrekken van het
      // kanaal bij actief→concept.
      setActionError(null);
      setChangingStatus(true);
      try {
        await Promise.all(
          view.channels.map((c) => updateCampaignStatus(c.id, next)),
        );
        await load();
      } catch (e) {
        setActionError(
          e instanceof Error ? e.message : "Status-overgang mislukt.",
        );
      } finally {
        setChangingStatus(false);
      }
    },
    [view, busy, load],
  );

  // Delete: alleen op concept (backend handhaaft). Multi-channel:
  // alle campaigns van de bundle weg. Eigenaar krijgt confirmatie.
  const handleDelete = useCallback(async () => {
    if (!view || busy) return;
    if (status !== "concept") return;
    if (
      !window.confirm(
        view.channels.length > 1
          ? `Weet je zeker dat je deze bundle (${view.channels.length} kanalen) wil verwijderen?`
          : "Weet je zeker dat je deze concept-campagne wil verwijderen?",
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
        e instanceof Error ? e.message : "Verwijderen mislukt.",
      );
      setDeleting(false);
    }
  }, [view, busy, status, router]);

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

  // Jump-to-fix vanuit Missende aspecten → activeer kanaal + scroll.
  const handleJumpToFix = useCallback(
    (field: MissingField, channelId: string) => {
      setActiveChannelId(channelId);
      const targetId =
        field === "date"
          ? SECTION_ID.schedule
          : field === "photo"
            ? SECTION_ID.foto
            : SECTION_ID.inhoud;
      setTimeout(() => {
        const el = document.getElementById(targetId);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    },
    [],
  );

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
          ← Terug naar campagnes
        </Link>
        <EmptyState
          icon="—"
          title="Campagne niet beschikbaar"
          description={error ?? "Deze campagne bestaat niet meer."}
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
            Verwijderen
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleStatusChange("actief")}
            disabled={busy || progress.percentage < 100}
            title={
              progress.percentage < 100
                ? "Vul eerst alle vereiste velden in"
                : "Activeer nu — direct versturen"
            }
          >
            Activeer nu
          </Button>
          <Button
            variant="primary"
            onClick={() => handleStatusChange("ingepland")}
            loading={changingStatus}
            disabled={busy || progress.percentage < 100}
            title={
              progress.percentage < 100
                ? "Vul eerst alle vereiste velden in"
                : "Plan in voor het ingestelde verzendmoment"
            }
          >
            Plan in
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
            title="Annuleer planning, terug naar concept zodat je weer kan bewerken"
          >
            Terug naar concept
          </Button>
          <Button
            variant="primary"
            onClick={() => handleStatusChange("actief")}
            disabled={busy}
            title="Activeer nu — vervroeg de planning en stuur direct"
          >
            Activeer nu
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
            title="Mail is al verstuurd en kan niet teruggetrokken worden — alleen afronden."
          >
            Afronden
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
            Afronden
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleStatusChange("concept")}
            loading={changingStatus}
            disabled={busy}
            style={{ color: "#B91C1C" }}
            title="Verwijder de post van het kanaal en zet de campagne terug naar concept."
          >
            Stop & verwijderen van kanaal
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
          ← Terug naar campagnes
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
              status,
              activeCampaign?.type ?? null,
              activeCampaign?.sent_count ?? 0,
            )}
          </span>
          {view.bundleName && view.channels.length > 1 && (
            <span style={{ color: "var(--tl)", fontSize: 12 }}>
              {view.channels.length} kanalen
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
              {progress.completed} van {progress.total} velden compleet
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

      <WaaromCard reasoning={view.reasoning} />

      {/* Missende aspecten alleen in concept-fase: in latere fases
          is de campagne immutable, een lijst missende velden is
          dan moot. */}
      {status === "concept" && (
        <MissendeAspectenCard
          channels={view.channelsChecklist}
          onJumpTo={handleJumpToFix}
        />
      )}

      {/* Kanalen-card: toont actieve kanalen + 'bewerken-voor'-tabs.
          canEdit=false → add/remove disabled. Komt later. */}
      <KanalenCard
        channels={view.channels.map((c) => ({
          id: c.id,
          platform: c.platform,
        }))}
        activeChannelId={activeChannel?.id}
        busy={busy}
        canEdit={false}
        onAddChannel={() => {
          // No-op tot fase 'channel add/remove op campagnes' geland is.
        }}
        onRemoveChannel={() => {
          // No-op tot fase 'channel add/remove op campagnes' geland is.
        }}
        onSetActive={(channelId) => {
          setEditingVariantIdx(null);
          setEditingSchedule(false);
          setActiveChannelId(channelId);
        }}
      />

      {/* Foto-card. Alleen non-mail. Editable als concept. Compacte
          variant (thumbnail + knoppen) zodat de pagina niet
          gedomineerd wordt door een grote dropzone. */}
      {supportsMedia && activeCampaign && (
        <div id={SECTION_ID.foto} style={{ scrollMarginTop: 120 }}>
          <FotoCard
            campaignId={activeCampaign.id}
            signedUrl={activeChannel?.media_url ?? null}
            canEdit={canEdit}
            onMediaChanged={() => {
              void load();
            }}
          />
        </div>
      )}

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
            Variatie-tip van Filly
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

      <WanneerCard
        sectionId={SECTION_ID.schedule}
        effectiveIso={effectiveIso}
        fillyIso={fillyIso}
        isCustomTime={isCustomTime}
        fillyReasoning={fillyReasoning}
        canEdit={canEdit}
        busy={busy}
        editingSchedule={editingSchedule}
        draftDatetime={draftDatetime}
        savingSchedule={savingSchedule}
        onStartEditSchedule={handleStartEditSchedule}
        onCancelEditSchedule={() => setEditingSchedule(false)}
        onSaveSchedule={handleSaveSchedule}
        onResetToFilly={handleResetToFilly}
        onDraftDatetimeChange={setDraftDatetime}
      />

      {/* Mail-verstuur: test-mail + verstuur-naar-iedereen. Toont
          alleen op mail-campagnes (andere kanalen gaan via eigen
          publish-flow). */}
      {activeCampaign?.type === "mail" && (
        <CampaignSendCard campaignId={activeCampaign.id} />
      )}

      {/* Performance: score + breakdown + outlier-knop. Toont alleen
          relevante info na status→'actief'; daarvóór "Nog geen meet-data". */}
      <CampaignPerformanceCard campaignId={id} />
    </div>
  );
}
