"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  deleteCampaign,
  fetchCampaign,
  fetchCampaignBundle,
  updateCampaign,
  updateCampaignStatus,
  type Campaign,
  type CampaignDetail,
} from "../../../../lib/api";
import { Skeleton } from "../../_components/skeleton";
import { Button } from "../../../../components/ui/button";
import { EmptyState } from "../../../../components/ui/empty-state";
import { CampaignRefinePanel } from "../../_components/campaign-refine-panel";
import { CampaignMediaSlot } from "../../_components/campaign-media-slot";
import { CampaignSchedulePanel } from "../../_components/campaign-schedule-panel";
import { CampaignSendModal } from "../../_components/campaign-send-modal";
import {
  getMissingLabel,
  type ChecklistItem,
} from "../../../../lib/campaign-checks";

function formatEuroFromCents(cents: number): string {
  return `€${Math.round(cents / 100).toLocaleString("nl-NL")}`;
}

function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeDays(iso: string): string {
  const target = new Date(iso);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (Math.abs(diffDays) < 1) {
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) return "nu";
    return diffHours > 0
      ? `over ${diffHours} uur`
      : `${Math.abs(diffHours)} uur geleden`;
  }
  if (diffDays === 1) return "morgen";
  if (diffDays === -1) return "gisteren";
  return diffDays > 0
    ? `over ${diffDays} dagen`
    : `${Math.abs(diffDays)} dagen geleden`;
}

// Wat is er nog niet ingevuld op deze campagne? Gebruikt door de
// progress-bar + Missende aspecten-card op concept-detail. Lichtere
// variant van getChannelChecklist uit lib/campaign-checks omdat we
// hier met CampaignDetail (al opgesplitst per kanaal) werken.
function getCampaignChecklist(c: CampaignDetail): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  if (!c.scheduled_for) items.push({ field: "date", required: true });
  const body =
    c.body ??
    c.content?.body_plain ??
    c.content?.caption ??
    c.content?.message_text;
  if (!body || (typeof body === "string" && !body.trim())) {
    items.push({ field: "body", required: true });
  }
  if (c.type === "mail") {
    const subject = c.subject_line ?? c.content?.subject_line;
    if (!subject || (typeof subject === "string" && !subject.trim())) {
      items.push({ field: "subject", required: true });
    }
  }
  if (c.type === "social") {
    const hasMedia = (c.content?.media_urls?.length ?? 0) > 0;
    if (!hasMedia) {
      // Platforms-array uit content bepaalt of foto vereist (IG/TikTok)
      // of optioneel (FB/GB). Geen platforms = unknown, default vereist.
      const platforms = c.content?.platforms ?? [];
      const required =
        platforms.length === 0 ||
        platforms.some((p) => p === "instagram" || p === "tiktok");
      items.push({ field: "photo", required });
    }
  }
  return items;
}

// Status-chip in de header. Voor concept/ingepland/actief: brand-soft-
// stijl (witte bg + brand-border). Voor afgerond: neutraal grijs.
function statusChipLabel(status: CampaignDetail["status"]): string {
  switch (status) {
    case "concept":
      return "Concept";
    case "ingepland":
      return "Ingepland";
    case "actief":
      return "Actief";
    case "afgerond":
      return "Afgerond";
    default:
      return status;
  }
}

function detailStatusChip(
  status: CampaignDetail["status"],
): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    fontSize: 12,
    fontWeight: 500,
    padding: "3px 10px",
    borderRadius: 6,
  };
  if (status === "afgerond") {
    return {
      ...base,
      background: "var(--color-white, #FFFFFF)",
      color: "#52525B",
      border: "1px solid #D4D4D8",
    };
  }
  // concept / ingepland / actief / overige → brand-stijl
  return {
    ...base,
    background: "var(--color-white, #FFFFFF)",
    color: "var(--color-brand-deep, #1F4A2D)",
    border: "1px solid var(--color-brand, #1F4A2D)",
  };
}

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Sibling-campagnes — andere kanalen onder dezelfde bundle (group_id).
  // Wordt boven de header als chip-rij gerenderd zodat eigenaar tussen
  // kanalen kan switchen (zoals de multi-channel-toggle op voorstel).
  const [siblings, setSiblings] = useState<Campaign[]>([]);

  // Edit-modus: alleen actief wanneer campaign.status === 'concept'.
  // Bewaart de draft-velden lokaal zodat annuleren triviaal is
  // (zet gewoon editMode=false zonder de server-staat aan te raken).
  const [editMode, setEditMode] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  // Status-actie (bv. concept → ingepland). Aparte state zodat we de
  // knop kunnen disablen tijdens de roundtrip én een nette spinner-
  // tekst kunnen tonen.
  const [statusActing, setStatusActing] = useState(false);
  // Send-modal: open/dicht voor de "Verstuur"-flow (mail-campagnes,
  // via Resend). Toont test- of all-opted-in-mode.
  const [sendModalOpen, setSendModalOpen] = useState(false);

  // Schakelt status van concept naar ingepland. Vereist dat
  // scheduled_for is gezet (anders weigert de UI met een uitleg).
  // Voor onmiddelijke verzending kan dezelfde flow ingepland → actief
  // doen, dat is een aparte transitie die we hier later toevoegen.
  const handlePlanCampaign = async () => {
    if (!campaign) return;
    if (!campaign.scheduled_for) {
      window.alert(
        "Stel eerst een tijdstip in via 'Wanneer plaatsen' voordat je inplant.",
      );
      return;
    }
    setStatusActing(true);
    try {
      await updateCampaignStatus(campaign.id, "ingepland");
      const fresh = await fetchCampaign(id);
      setCampaign(fresh);
    } catch (e) {
      window.alert(
        e instanceof Error
          ? e.message
          : "Inplannen mislukt. Probeer het opnieuw.",
      );
    } finally {
      setStatusActing(false);
    }
  };

  useEffect(() => {
    fetchCampaign(id)
      .then((d) => {
        setCampaign(d);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, [id]);

  // Bundle-siblings ophalen wanneer group_id niet null. Fail-soft: bij
  // API-fout blijft de Kanalen-card verborgen.
  useEffect(() => {
    const groupId = campaign?.group_id;
    if (!groupId) {
      setSiblings([]);
      return;
    }
    let cancelled = false;
    fetchCampaignBundle(groupId)
      .then((b) => {
        if (cancelled) return;
        setSiblings(b.campaigns);
      })
      .catch(() => {
        if (!cancelled) setSiblings([]);
      });
    return () => {
      cancelled = true;
    };
  }, [campaign?.group_id]);

  // Bij overgang naar edit-mode vullen we de draft-velden met de
  // huidige waardes zodat de user vanuit de bestaande content werkt
  // in plaats van vanuit een leeg formulier.
  const startEdit = () => {
    if (!campaign) return;
    setDraftName(campaign.name);
    setDraftSubject(
      campaign.content?.subject_line ?? campaign.subject_line ?? "",
    );
    setDraftBody(
      campaign.content?.body_plain ??
        campaign.content?.caption ??
        campaign.content?.message_text ??
        campaign.body ??
        "",
    );
    setEditError(null);
    setEditMode(true);
  };

  const saveEdit = async () => {
    if (!campaign) return;
    setSaving(true);
    setEditError(null);
    try {
      await updateCampaign(id, {
        name: draftName,
        // Onderwerp alleen sturen voor mail, anders heeft het geen
        // betekenis en overschrijven we onnodig.
        subject_line: campaign.type === "mail" ? draftSubject : undefined,
        body: draftBody,
      });
      // Refetch voor verse state (incl. stats + updated_at). Eenvoudiger
      // dan de local state handmatig patchen voor elke content-variant.
      const fresh = await fetchCampaign(id);
      setCampaign(fresh);
      setEditMode(false);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Opslaan mislukt.");
    } finally {
      setSaving(false);
    }
  };

  // Generieke status-actie-wrapper: refetch na succes, error in
  // editError tonen (zelfde banner als edit-fouten).
  const runStatusAction = async (
    fn: () => Promise<unknown>,
    failMessage: string,
  ) => {
    setStatusActing(true);
    setEditError(null);
    try {
      await fn();
      const fresh = await fetchCampaign(id);
      setCampaign(fresh);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : failMessage);
    } finally {
      setStatusActing(false);
    }
  };

  // Direct activeren: concept → actief (backend staat dit toe sinds
  // mig 0040). Slaat ingepland over zodat eigenaar niet via 2 calls
  // hoeft. Voor concept met missende vereiste velden is de knop
  // disabled, dus we hoeven hier geen extra check te doen.
  const handleActivate = () => {
    if (!campaign) return;
    if (
      !window.confirm(
        campaign.type === "mail"
          ? "Campagne nu direct activeren? De mail wordt zo snel mogelijk verstuurd."
          : "Campagne nu direct activeren? De post gaat zo snel mogelijk live.",
      )
    ) {
      return;
    }
    runStatusAction(
      () => updateCampaignStatus(campaign.id, "actief"),
      "Activeren mislukt. Probeer het opnieuw.",
    );
  };

  // Ingepland → terug naar concept (sinds mig 0040). Eigenaar wil
  // 'm aanpassen of verwijderen.
  const handleRetract = () => {
    if (!campaign) return;
    runStatusAction(
      () => updateCampaignStatus(campaign.id, "concept"),
      "Terugtrekken mislukt. Probeer het opnieuw.",
    );
  };

  // Actief → afgerond (Stop-knop). Confirm + status-transitie.
  const handleStop = () => {
    if (!campaign) return;
    if (
      !window.confirm(
        "Campagne stoppen? Hij wordt naar 'afgerond' verplaatst en verdwijnt uit het actieve overzicht.",
      )
    ) {
      return;
    }
    runStatusAction(
      () => updateCampaignStatus(campaign.id, "afgerond"),
      "Stoppen mislukt. Probeer het opnieuw.",
    );
  };

  // Soft-delete (mig 0040): UPDATE deleted_at=NOW(). Daarna terug
  // naar /campagnes — campagne is daar niet meer zichtbaar, vindt 'm
  // terug in /campagnes/history → Verwijderd-tab.
  const handleDelete = async () => {
    if (!campaign) return;
    if (
      !window.confirm(
        "Campagne verwijderen? Hij wordt verplaatst naar de Verwijderd-tab in de campagne-historie.",
      )
    ) {
      return;
    }
    setStatusActing(true);
    setEditError(null);
    try {
      await deleteCampaign(campaign.id);
      router.push("/dashboard/campagnes");
    } catch (e) {
      setEditError(
        e instanceof Error ? e.message : "Verwijderen mislukt.",
      );
      setStatusActing(false);
    }
  };

  if (loading) {
    return (
      <div className="page-full">
        <Link
          href="/dashboard/campagnes"
          style={{
            fontSize: 13,
            color: "var(--ts)",
            textDecoration: "none",
            marginBottom: 16,
            display: "inline-block",
          }}
        >
          ← Terug naar campagnes
        </Link>
        <Skeleton height={28} width="40%" style={{ marginBottom: 12 }} />
        <Skeleton height={14} width="60%" style={{ marginBottom: 24 }} />
        <Skeleton height={240} />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="page-full">
        <Link
          href="/dashboard/campagnes"
          style={{ fontSize: 13, color: "var(--ts)" }}
        >
          ← Terug
        </Link>
        <EmptyState
          topGap
          icon="📣"
          title="Campagne niet gevonden"
          description="Deze campagne bestaat niet meer of je hebt geen toegang. Ga terug naar het overzicht en kies een andere."
        />
      </div>
    );
  }

  const stats = (campaign.content?.stats ?? {}) as Record<string, number>;
  const resultStats = campaign.result_stats ?? {};
  const isMail = campaign.type === "mail";
  const isSocial = campaign.type === "social";
  const isConcept = campaign.status === "concept";
  const isPlanned = campaign.status === "ingepland";
  const isActive = campaign.status === "actief";
  const isDone = campaign.status === "afgerond";

  // Missende velden + voortgang (alleen relevant voor concept).
  const checklist = getCampaignChecklist(campaign);
  const missingRequired = checklist.filter((c) => c.required).length;
  // Totaal vereiste velden per type: mail = 3 (date/body/subject),
  // social = 3 (date/body + foto-required-mits-IG/TT), whatsapp = 2.
  const totalRequired = (() => {
    if (campaign.type === "mail") return 3;
    if (campaign.type === "social") return 3;
    return 2;
  })();
  const completedRequired = Math.max(0, totalRequired - missingRequired);
  const progressPct = Math.round(
    (completedRequired / totalRequired) * 100,
  );
  const allReady = missingRequired === 0;

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

      {/* Sticky header: titel + status-chip + actie-knoppen rechts.
          Layout en gedrag spiegelen de voorstel-detail-pagina zodat
          de campagne visueel doorloopt van Voorstel → Concept zonder
          een ander template. Voor ingepland/actief/afgerond is alles
          read-only, alleen de status-acties zijn nog beschikbaar. */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "var(--bg, #FAF7F1)",
          paddingTop: 8,
          paddingBottom: 12,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="page-title" style={{ marginBottom: 6 }}>
              {campaign.name}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={detailStatusChip(campaign.status)}>
                {statusChipLabel(campaign.status)}
              </span>
              {campaign.meta && (
                <span style={{ color: "var(--tl)", fontSize: 12 }}>
                  {campaign.meta}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {/* Concept (niet edit): Verwijderen · Activeer nu · Plan in */}
            {isConcept && !editMode && (
              <>
                <Button
                  variant="secondary"
                  onClick={handleDelete}
                  disabled={statusActing}
                  style={{ color: "#B91C1C" }}
                >
                  Verwijderen
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleActivate}
                  disabled={statusActing || !allReady}
                  loading={statusActing}
                  title={
                    !allReady
                      ? "Vul eerst de ontbrekende velden in"
                      : "Direct activeren — campagne gaat zo snel mogelijk uit"
                  }
                >
                  Activeer nu
                </Button>
                <Button
                  variant="primary"
                  onClick={handlePlanCampaign}
                  loading={statusActing}
                  disabled={statusActing || !allReady}
                  title={
                    !allReady
                      ? "Vul eerst de ontbrekende velden in"
                      : `Plan in voor ${formatDate(campaign.scheduled_for)}`
                  }
                >
                  Plan in
                </Button>
              </>
            )}
            {/* Concept (edit-mode): Annuleren + Opslaan */}
            {isConcept && editMode && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => setEditMode(false)}
                  disabled={saving}
                >
                  Annuleren
                </Button>
                <Button
                  onClick={saveEdit}
                  loading={saving}
                  disabled={!draftName.trim() || !draftBody.trim()}
                >
                  Opslaan
                </Button>
              </>
            )}
            {/* Ingepland: Terugtrekken · Activeer nu */}
            {isPlanned && (
              <>
                <Button
                  variant="secondary"
                  onClick={handleRetract}
                  disabled={statusActing}
                  loading={statusActing}
                  title="Terug naar concept zodat je 'm kunt aanpassen of verwijderen"
                >
                  Terugtrekken
                </Button>
                <Button
                  variant="primary"
                  onClick={handleActivate}
                  disabled={statusActing}
                  loading={statusActing}
                >
                  Activeer nu
                </Button>
              </>
            )}
            {/* Actief: Stop */}
            {isActive && (
              <Button
                variant="secondary"
                onClick={handleStop}
                disabled={statusActing}
                loading={statusActing}
                style={{ color: "#B91C1C" }}
              >
                Stop campagne
              </Button>
            )}
            {/* Afgerond: geen knoppen */}
          </div>
        </div>
        {/* Voortgangsbalk — alleen op concept, niet in edit-mode. */}
        {isConcept && !editMode && (
          <div
            style={{
              marginTop: 12,
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
                  width: `${progressPct}%`,
                  height: "100%",
                  background: allReady
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
                minWidth: 130,
                textAlign: "right",
              }}
            >
              {completedRequired} van {totalRequired} velden compleet
            </div>
          </div>
        )}
        {/* "Verstuur"-quick-action (mail) — als secundaire optie naast
            de status-knoppen. Voor concept/ingepland/actief beschikbaar
            (test-mail of echt-verzenden). */}
        {isMail && !isDone && !editMode && (
          <div style={{ marginTop: 10 }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSendModalOpen(true)}
            >
              ✉️ Verstuur (test of echt)
            </Button>
          </div>
        )}
      </div>

      {editError && (
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
          {editError}
        </div>
      )}

      {/* Waarom dit voorstel — Filly's reasoning uit het oorspronkelijke
          voorstel. Identiek aan de voorstel-detail-pagina. Toon op
          concept + ingepland zodat eigenaar de context van Filly's
          keuze ook na approve nog kan teruglezen. */}
      {campaign.reasoning && !editMode && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-h">
            <div>
              <div className="card-t">Waarom dit voorstel</div>
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
              {campaign.reasoning}
            </div>
          </div>
        </div>
      )}

      {/* Missende aspecten — alleen op concept en buiten edit-mode.
          Platte tabel zonder kleurige sub-blokken; ●/○-markering toont
          vereist vs. optioneel. Klik op item navigeert intern naar
          de Bewerken-knop zodat eigenaar in 1 klik aan de slag kan. */}
      {isConcept && !editMode && checklist.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-h">
            <div>
              <div className="card-t">Missende aspecten</div>
            </div>
          </div>
          <div className="card-b">
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 14,
                fontSize: 13,
              }}
            >
              {checklist.map((item) => (
                <span
                  key={item.field}
                  title={
                    item.required
                      ? "Vereist veld"
                      : "Optioneel — aanbeveling"
                  }
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    color: item.required
                      ? "var(--text, #18181B)"
                      : "var(--tl, #6B6F71)",
                    fontWeight: item.required ? 500 : 400,
                  }}
                >
                  <span style={{ fontSize: 8, lineHeight: 1 }}>
                    {item.required ? "●" : "○"}
                  </span>
                  {getMissingLabel(item.field, campaign.type)}
                </span>
              ))}
            </div>
            <div
              style={{
                marginTop: 10,
                paddingTop: 10,
                borderTop: "1px solid var(--border, #E5DFD0)",
                fontSize: 11,
                color: "var(--tl)",
                display: "flex",
                gap: 16,
              }}
            >
              <span>
                <span style={{ color: "var(--text)", fontSize: 12 }}>●</span>{" "}
                vereist
              </span>
              <span>
                <span style={{ color: "var(--tl)", fontSize: 12 }}>○</span>{" "}
                optioneel
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Schedule-banner voor ingepland (read-only). Toont wanneer
          'ie eruit gaat + relatieve tijd. */}
      {isPlanned && campaign.scheduled_for && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-b">
            <div style={{ fontSize: 12, color: "var(--tl)", marginBottom: 4 }}>
              Wordt verstuurd op
            </div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>
              {formatDate(campaign.scheduled_for)}
            </div>
            <div style={{ fontSize: 12, color: "var(--tl)", marginTop: 2 }}>
              {relativeDays(campaign.scheduled_for)}
            </div>
          </div>
        </div>
      )}

      {/* Schedule-banner voor actief + afgerond (read-only). Toont
          verstuur-moment + relatieve tijd. */}
      {(isActive || isDone) && campaign.executed_at && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-b">
            <div style={{ fontSize: 12, color: "var(--tl)", marginBottom: 4 }}>
              {isActive ? "Verstuurd op" : "Afgerond op"}
            </div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>
              {formatDate(campaign.executed_at)}
            </div>
            <div style={{ fontSize: 12, color: "var(--tl)", marginTop: 2 }}>
              {relativeDays(campaign.executed_at)}
            </div>
          </div>
        </div>
      )}

      {/* Stats-row — alleen tonen bij actief + afgerond (waar verzending
          heeft plaatsgevonden). Voor concept/ingepland is alles nog 0 dus
          ruis. */}
      {(isActive || isDone) && (
        <div className="stats-row">
          <div className="stat-card stat-card-filly">
            <div className="stat-card-label">Extra reserveringen</div>
            <div className="stat-card-val">
              +{resultStats.extra_reservations ?? 0}
            </div>
          </div>
          <div className="stat-card stat-card-filly">
            <div className="stat-card-label">Extra omzet (schatting)</div>
            <div className="stat-card-val">
              {formatEuroFromCents(
                resultStats.extra_revenue_cents ??
                  (resultStats.extra_reservations ?? 0) * 4500,
              )}
            </div>
          </div>
          {isMail && (
            <>
              <div className="stat-card">
                <div className="stat-card-label">Verstuurd</div>
                <div className="stat-card-val">{stats.sent ?? "—"}</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-label">Geopend</div>
                <div className="stat-card-val">
                  {stats.opened ?? 0}
                  {stats.sent ? (
                    <span
                      style={{
                        fontSize: 13,
                        color: "var(--tl)",
                        marginLeft: 6,
                        fontWeight: 400,
                      }}
                    >
                      ({Math.round(((stats.opened ?? 0) / stats.sent) * 100)}%)
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-card-label">Geklikt</div>
                <div className="stat-card-val">
                  {stats.clicked ?? 0}
                  {stats.sent ? (
                    <span
                      style={{
                        fontSize: 13,
                        color: "var(--tl)",
                        marginLeft: 6,
                        fontWeight: 400,
                      }}
                    >
                      ({Math.round(((stats.clicked ?? 0) / stats.sent) * 100)}%)
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-card-label">Afmeldingen</div>
                <div className="stat-card-val">{stats.unsubscribed ?? 0}</div>
              </div>
            </>
          )}
          {isSocial && (
            <>
              <div className="stat-card">
                <div className="stat-card-label">Impressies</div>
                <div className="stat-card-val">{stats.impressions ?? "—"}</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-label">Likes</div>
                <div className="stat-card-val">{stats.likes ?? 0}</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-label">Reacties</div>
                <div className="stat-card-val">{stats.comments ?? 0}</div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Kanalen — chip-rij met sibling-campagnes uit dezelfde bundle.
          Voor single-campagne (geen group_id) tonen we 1 read-only chip
          met het eigen platform. Voor bundle: alle kanalen klikbaar,
          actief = vol brand-groen. Spiegelt het Kanalen-blok op de
          voorstel-detail. */}
      {!editMode && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-h">
            <div>
              <div className="card-t">Kanalen</div>
            </div>
          </div>
          <div className="card-b">
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
              }}
            >
              {(siblings.length > 1 ? siblings : [campaign]).map((s) => {
                const isActive = s.id === campaign.id;
                const isBundleSibling = siblings.length > 1;
                const inner = (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 14px",
                      fontSize: 13,
                      fontWeight: 500,
                      borderRadius: 6,
                      cursor:
                        isBundleSibling && !isActive ? "pointer" : "default",
                      background: isActive
                        ? "var(--color-brand, #1F4A2D)"
                        : "var(--color-white, #FFFFFF)",
                      color: isActive
                        ? "var(--color-white, #FFFFFF)"
                        : "var(--text, #18181B)",
                      border: isActive
                        ? "1px solid var(--color-brand, #1F4A2D)"
                        : "1px solid var(--border, #E5DFD0)",
                    }}
                  >
                    <span>
                      {s.type === "mail"
                        ? "✉️"
                        : s.type === "whatsapp"
                          ? "💬"
                          : "📱"}
                    </span>
                    <span>
                      {s.type === "mail"
                        ? "E-mail"
                        : s.type === "whatsapp"
                          ? "WhatsApp"
                          : "Social"}
                    </span>
                  </span>
                );
                if (!isBundleSibling || isActive) {
                  return <span key={s.id}>{inner}</span>;
                }
                return (
                  <Link
                    key={s.id}
                    href={`/dashboard/campagnes/${s.id}`}
                    style={{ textDecoration: "none" }}
                  >
                    {inner}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Foto of video — voor social/whatsapp. Mail krijgt nog geen
          media-slot. Wordt vóór Inhoud gerenderd zodat eigenaar eerst
          de visual ziet en daarna de tekst (volgorde uit voorstel-
          detail). */}
      {!isMail && !editMode && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-h">
            <div>
              <div className="card-t">Foto of video</div>
            </div>
          </div>
          <div className="card-b">
            <CampaignMediaSlot
              campaignId={campaign.id}
              signedUrl={
                isSocial
                  ? campaign.content?.media_urls?.[0] ?? null
                  : campaign.content?.media_url ?? null
              }
              editable={campaign.status === "concept"}
              aspectRatio={isSocial ? undefined : "4 / 3"}
              onMediaChanged={async () => {
                try {
                  const fresh = await fetchCampaign(id);
                  setCampaign(fresh);
                } catch (e) {
                  console.error(e);
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Inhoud (subject + tekst voor mail; caption voor social;
          bericht voor whatsapp). In edit-mode vervangen door inline
          form. */}
      <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div
          className="card-h"
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div className="card-t">
              {editMode ? "Inhoud bewerken" : "Inhoud"}
            </div>
          </div>
          {isConcept && !editMode && (
            <Button variant="secondary" size="sm" onClick={startEdit}>
              ✎ Bewerken
            </Button>
          )}
        </div>
        <div className="card-b">
          {editMode && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
                padding: "4px 2px",
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
                <span>Campagne-naam</span>
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    border: "1px solid var(--border, #E5DFD0)",
                    borderRadius: 6,
                    fontSize: 14,
                    fontFamily: "inherit",
                    background: "var(--white, #FFFFFF)",
                  }}
                />
              </label>
              {isMail && (
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
                  <span>Onderwerp</span>
                  <input
                    type="text"
                    value={draftSubject}
                    onChange={(e) => setDraftSubject(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      border: "1px solid var(--border, #E5DFD0)",
                      borderRadius: 6,
                      fontSize: 14,
                      fontFamily: "inherit",
                      background: "var(--white, #FFFFFF)",
                    }}
                  />
                </label>
              )}
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
                <span>
                  {isMail
                    ? "Mail-inhoud"
                    : isSocial
                      ? "Caption"
                      : "Bericht"}
                </span>
                <textarea
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  rows={12}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid var(--border, #E5DFD0)",
                    borderRadius: 6,
                    fontSize: 14,
                    lineHeight: 1.6,
                    fontFamily: "inherit",
                    resize: "vertical",
                    background: "var(--white, #FFFFFF)",
                  }}
                />
              </label>
            </div>
          )}
          {/* Read-only inhoud. Geen mock-mail/IG/WhatsApp-frame meer
              (Floris-feedback: de tekst + foto spreken voor zich). Voor
              mail tonen we onderwerp + body, voor social/whatsapp alleen
              de caption/bericht-tekst. De Foto-card komt apart eronder
              voor social/whatsapp (zie volgende sectie). */}
          {!editMode && isMail && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--tl)",
                    marginBottom: 4,
                  }}
                >
                  Onderwerp
                </div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: "var(--text)",
                  }}
                >
                  {campaign.content?.subject_line ??
                    campaign.subject_line ??
                    "—"}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--tl)",
                    marginBottom: 4,
                  }}
                >
                  Tekst
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: "var(--text)",
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {campaign.content?.body_plain ??
                    campaign.body ??
                    "Geen inhoud"}
                </div>
              </div>
            </div>
          )}
          {!editMode && isSocial && (
            <div
              style={{
                fontSize: 14,
                color: "var(--text)",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
              }}
            >
              {campaign.content?.caption ?? campaign.body ?? "Geen caption"}
            </div>
          )}
          {!editMode && !isMail && !isSocial && (
            <div
              style={{
                fontSize: 14,
                color: "var(--text)",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
              }}
            >
              {campaign.content?.message_text ?? campaign.body ?? "—"}
            </div>
          )}
        </div>
      </div>

      </div>{/* /Inhoud-wrapper */}

      {/* "Met Filly bewerken"-paneel direct onder de Inhoud — zelfde
          volgorde als op voorstel-detail (Inhoud → variants → Wanneer
          plaatsen). Alleen op concept zichtbaar; ingepland/actief is
          inhoud immutable voor audit. */}
      {campaign.status === "concept" && !editMode && (
        <CampaignRefinePanel
          campaignId={campaign.id}
          type={campaign.type}
          currentBody={campaign.body}
          onApplied={async () => {
            try {
              const fresh = await fetchCampaign(id);
              setCampaign(fresh);
            } catch (e) {
              console.error(e);
            }
          }}
        />
      )}

      {/* Wanneer plaatsen: voor concept én ingepland zichtbaar zodat
          eigenaar het tijdstip kan accepteren/wijzigen. Voor afgeronde
          campagnes verbergen we 'm, die hebben executed_at en geen
          aanpassing meer nodig. */}
      {(campaign.status === "concept" || campaign.status === "ingepland") &&
        !editMode && (
          <CampaignSchedulePanel
            campaignId={campaign.id}
            status={campaign.status}
            scheduledFor={campaign.scheduled_for}
            suggestedFor={campaign.suggested_scheduled_for}
            suggestedReasoning={campaign.suggested_scheduled_reasoning}
            onChanged={async () => {
              try {
                const fresh = await fetchCampaign(id);
                setCampaign(fresh);
              } catch (e) {
                console.error(e);
              }
            }}
          />
        )}

      {/* Tijdlijn + Metadata-cards bewust weggehaald (2026-05-12) —
          voorstel-detail heeft die ook niet. Aangemaakt-datum + status
          zijn al zichtbaar via de chip en de schedule-banner. */}

      {/* Send-modal, alleen gerenderd bij open. Sluiten via Esc/klik-
          buiten/Annuleren-knop in de modal. Bij succes blijft modal
          open zodat de eigenaar het resultaat ziet, en sluit via "Klaar". */}
      {sendModalOpen && (
        <CampaignSendModal
          campaignId={campaign.id}
          campaignName={campaign.name}
          campaignType={campaign.type}
          onClose={() => setSendModalOpen(false)}
        />
      )}
    </div>
  );
}
