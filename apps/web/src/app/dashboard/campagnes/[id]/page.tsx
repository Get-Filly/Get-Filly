"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  fetchCampaign,
  updateCampaign,
  type CampaignDetail,
} from "../../../../lib/api";
import { Skeleton } from "../../_components/skeleton";
import { CampaignRefinePanel } from "../../_components/campaign-refine-panel";
import { CampaignMediaSlot } from "../../_components/campaign-media-slot";

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

const typeIcon: Record<string, string> = {
  mail: "✉️",
  social: "📱",
  whatsapp: "💬",
};

export default function CampaignDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit-modus: alleen actief wanneer campaign.status === 'concept'.
  // Bewaart de draft-velden lokaal zodat annuleren triviaal is
  // (zet gewoon editMode=false zonder de server-staat aan te raken).
  const [editMode, setEditMode] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

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
        // Onderwerp alleen sturen voor mail — anders heeft het geen
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
        <div
          className="table-empty"
          style={{ color: "var(--red)", marginTop: 16 }}
        >
          {error ?? "Campagne niet gevonden"}
        </div>
      </div>
    );
  }

  const stats = (campaign.content?.stats ?? {}) as Record<string, number>;
  const resultStats = campaign.result_stats ?? {};
  const isMail = campaign.type === "mail";
  const isSocial = campaign.type === "social";

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

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 14,
          marginBottom: 8,
        }}
      >
        <div style={{ fontSize: 28 }}>{typeIcon[campaign.type]}</div>
        <div style={{ flex: 1 }}>
          <div className="page-title" style={{ marginBottom: 4 }}>
            {campaign.name}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className={`badge ${campaign.status}`}>
              {campaign.status}
            </span>
            <span style={{ color: "var(--tl)", fontSize: 12 }}>
              {campaign.meta ?? "—"}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="sg-btn" disabled>
            Dupliceren
          </button>
          {/* Bewerken alleen toegestaan bij 'concept'-status. Na
              ingepland/actief/afgerond moet de inhoud immutable
              blijven voor audit + verzend-consistentie. */}
          {campaign.status === "concept" && !editMode && (
            <button className="sg-btn" onClick={startEdit}>
              ✎ Bewerken
            </button>
          )}
          {editMode && (
            <>
              <button
                className="sg-btn"
                onClick={() => setEditMode(false)}
                disabled={saving}
              >
                Annuleren
              </button>
              <button
                className="btn-primary-dash"
                onClick={saveEdit}
                disabled={saving || !draftName.trim() || !draftBody.trim()}
                style={{ padding: "6px 14px" }}
              >
                {saving ? "Opslaan…" : "Opslaan"}
              </button>
            </>
          )}
        </div>
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

      <div style={{ marginBottom: 24 }} />

      {/* Impact summary — extra reserveringen + extra omzet zijn de
          Filly-attributie-cijfers, krijgen dus stat-card-filly styling
          (groene rand + waarde) zodat visueel direct duidelijk is dat
          dit Filly's bijdrage is. */}
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

      {/* Content preview. In edit-mode vervangen door inline form
          zodat de user direct vanaf de detail-page de velden kan
          wijzigen zonder modal-context-switch. */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h">
          <div>
            <div className="card-t">
              {editMode ? "Inhoud bewerken" : "Inhoud"}
            </div>
            <div className="card-st">
              {isMail
                ? "Mail-preview"
                : isSocial
                  ? "Social-post"
                  : "WhatsApp-bericht"}
            </div>
          </div>
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
          {!editMode && isMail && (
            <div className="mail-preview">
              <div className="mail-preview-meta">
                <div>
                  <span className="mail-preview-label">Van</span>
                  <span className="mail-preview-val">
                    {campaign.content?.from_name ?? "—"}
                  </span>
                </div>
                <div>
                  <span className="mail-preview-label">Reply-to</span>
                  <span className="mail-preview-val">
                    {campaign.content?.reply_to ?? "—"}
                  </span>
                </div>
              </div>
              <div className="mail-preview-subject">
                {campaign.content?.subject_line ??
                  campaign.subject_line ??
                  "—"}
              </div>
              {campaign.content?.preheader && (
                <div className="mail-preview-preheader">
                  {campaign.content.preheader}
                </div>
              )}
              <div className="mail-preview-body">
                {campaign.content?.body_plain ??
                  campaign.body ??
                  "Geen inhoud"}
              </div>
            </div>
          )}
          {!editMode && isSocial && (
            <div className="social-preview">
              <div className="social-preview-header">
                <div className="social-preview-avatar">
                  {campaign.content?.platforms?.[0]?.slice(0, 1).toUpperCase() ??
                    "F"}
                </div>
                <div>
                  <div className="social-preview-handle">
                    get_filly_demo
                  </div>
                  <div className="social-preview-sub">
                    {campaign.content?.platforms?.join(" · ") ?? "social"}
                  </div>
                </div>
              </div>
              {/* Foto-slot vervangt de oude emoji-placeholder. Backend
                  levert een 1-uur signed URL voor een opgeslagen foto;
                  als die er nog niet is toont de slot een drop-zone.
                  Editable alleen bij concept-status — verzonden
                  campagnes zijn immutable. */}
              <CampaignMediaSlot
                campaignId={campaign.id}
                signedUrl={campaign.content?.media_urls?.[0] ?? null}
                editable={campaign.status === "concept"}
                onMediaChanged={async () => {
                  // Refetch zodat de signed URL vers blijft (als
                  // we 'm in lokale state zouden zetten zit er een
                  // tijds-bom in: 1 uur expiry).
                  try {
                    const fresh = await fetchCampaign(id);
                    setCampaign(fresh);
                  } catch (e) {
                    console.error(e);
                  }
                }}
              />
              <div className="social-preview-actions">
                <span>❤️</span>
                <span>💬</span>
                <span>📤</span>
              </div>
              <div className="social-preview-caption">
                {campaign.content?.caption ?? campaign.body ?? "Geen caption"}
              </div>
              {campaign.content?.hashtags &&
                campaign.content.hashtags.length > 0 && (
                  <div className="social-preview-tags">
                    {campaign.content.hashtags.map((t) => (
                      <span key={t}>#{t}</span>
                    ))}
                  </div>
                )}
            </div>
          )}
          {!editMode && !isMail && !isSocial && (
            <div className="whatsapp-preview">
              {/* WhatsApp ondersteunt 1 media-item per bericht. Slot
                  toont voor de tekst zodat het visueel klopt met hoe
                  WhatsApp Business het rendert. Aspect-ratio 4:3
                  past beter bij chat-bericht dan vierkant. */}
              <CampaignMediaSlot
                campaignId={campaign.id}
                signedUrl={campaign.content?.media_url ?? null}
                editable={campaign.status === "concept"}
                aspectRatio="4 / 3"
                onMediaChanged={async () => {
                  try {
                    const fresh = await fetchCampaign(id);
                    setCampaign(fresh);
                  } catch (e) {
                    console.error(e);
                  }
                }}
              />
              <div
                className="whatsapp-preview-bubble"
                style={{ marginTop: 12 }}
              >
                {campaign.content?.message_text ?? campaign.body ?? "—"}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* "Met Filly bewerken"-paneel: 3 alternatieven + AI-instructie.
          Alleen bij concept-status zichtbaar; eenmaal ingepland/actief
          mag de inhoud niet meer wijzigen (audit-veiligheid). */}
      {campaign.status === "concept" && !editMode && (
        <CampaignRefinePanel
          campaignId={campaign.id}
          type={campaign.type}
          onApplied={async () => {
            // Refetch zodat preview de nieuwe inhoud direct toont.
            try {
              const fresh = await fetchCampaign(id);
              setCampaign(fresh);
            } catch (e) {
              console.error(e);
            }
          }}
        />
      )}

      {/* Tijdlijn + metadata */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
        }}
      >
        <div className="card">
          <div className="card-h">
            <div>
              <div className="card-t">Tijdlijn</div>
              <div className="card-st">Belangrijke momenten</div>
            </div>
          </div>
          <div className="card-b">
            <div
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                }}
              >
                <span style={{ color: "var(--tl)" }}>Aangemaakt</span>
                <span>{formatDate(campaign.created_at)}</span>
              </div>
              {campaign.scheduled_for && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: "var(--tl)" }}>Gepland voor</span>
                  <span>{formatDate(campaign.scheduled_for)}</span>
                </div>
              )}
              {campaign.executed_at && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: "var(--tl)" }}>Uitgevoerd op</span>
                  <span>{formatDate(campaign.executed_at)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <div>
              <div className="card-t">Metadata</div>
              <div className="card-st">Tags &amp; eigenschappen</div>
            </div>
          </div>
          <div className="card-b">
            <div
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                }}
              >
                <span style={{ color: "var(--tl)" }}>Type</span>
                <span style={{ textTransform: "capitalize" }}>
                  {campaign.type}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                }}
              >
                <span style={{ color: "var(--tl)" }}>Status</span>
                <span className={`badge ${campaign.status}`}>
                  {campaign.status}
                </span>
              </div>
              {campaign.tags && campaign.tags.length > 0 && (
                <div style={{ fontSize: 13 }}>
                  <span
                    style={{ color: "var(--tl)", display: "block", marginBottom: 4 }}
                  >
                    Tags
                  </span>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {campaign.tags.map((t) => (
                      <span key={t} className="tag-chip">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
