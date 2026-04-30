"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchSuggestions,
  updateSuggestion,
  fetchProposalDetails,
  type AiSuggestion,
  type ProposalDetails,
  type SuggestionStatus,
} from "../../../lib/api";
import { Skeleton } from "../_components/skeleton";
import { EmptyState } from "../../../components/ui/empty-state";

type Tab = "pending" | "approved" | "rejected";

const tabs: { key: Tab; label: string }[] = [
  { key: "pending", label: "Wachtend" },
  { key: "approved", label: "Goedgekeurd" },
  { key: "rejected", label: "Afgewezen" },
];

const triggerLabel: Record<string, { icon: string; text: string }> = {
  low_occupancy: { icon: "📉", text: "Lage bezetting" },
  weather: { icon: "🌧️", text: "Weer" },
  seasonal: { icon: "📅", text: "Seizoen" },
  birthday: { icon: "🎂", text: "Verjaardag" },
  retention: { icon: "💔", text: "Retentie" },
};

const urgencyColor: Record<string, string> = {
  high: "#DC2626",
  medium: "#F97316",
  low: "#A1A1AA",
};

const urgencyLabel: Record<string, string> = {
  high: "Hoge urgentie",
  medium: "Deze week",
  low: "Planning",
};

function typeChipClass(type?: string) {
  if (type === "mail") return "sg-chip type-mail";
  if (type === "social") return "sg-chip type-social";
  return "sg-chip";
}

function formatEuro(cents?: number): string {
  if (!cents) return "—";
  return `€${Math.round(cents / 100).toLocaleString("nl-NL")}`;
}

// Concreet prijsformaat met decimalen — voor gerecht-kaartjes.
function formatPrice(cents?: number): string {
  if (!cents) return "—";
  const euros = (cents / 100).toFixed(2).replace(".", ",");
  return `€${euros}`;
}

// Proposal-shape (hoofdgerecht/bijgerechten/timing/bundle-prijs/foto)
// komt uit `lib/api.ts` als ProposalDetails — zelfde shape als wat
// Claude via tool-use teruggeeft. Laden gebeurt via fetchProposalDetails
// op het moment dat de detail-modal opent (zie useEffect op `selected`).


export default function SuggestiesPage() {
  const [tab, setTab] = useState<Tab>("pending");
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  // Count van pending-voorstellen voor de stats-row — blijft zichtbaar
  // ook wanneer de gebruiker naar "Goedgekeurd/Afgewezen" tab wisselt.
  const [pendingCount, setPendingCount] = useState<number>(0);
  // Geselecteerde suggestie voor detail-modal. Null = modal dicht.
  const [selected, setSelected] = useState<AiSuggestion | null>(null);
  // Proposal-details: hoofdgerecht/bijgerechten/etc. Wordt bij open
  // van de modal opgehaald — eerste call ~2s (Claude), daarna gecachet
  // op de suggestie. Loading-state om de skeleton te tonen.
  const [proposal, setProposal] = useState<ProposalDetails | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);

  // Bij elke nieuwe `selected`: reset proposal-state en fetch opnieuw.
  // Race-condition-bescherming via een `cancelled`-flag — als de
  // gebruiker snel klikt naar een andere suggestie wordt de oude
  // response genegeerd.
  useEffect(() => {
    if (!selected) {
      setProposal(null);
      setProposalLoading(false);
      setProposalError(null);
      return;
    }
    let cancelled = false;
    setProposal(null);
    setProposalError(null);
    setProposalLoading(true);
    fetchProposalDetails(selected.id)
      .then((p) => {
        if (cancelled) return;
        setProposal(p);
        setProposalLoading(false);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setProposalError(e.message);
        setProposalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  useEffect(() => {
    setLoading(true);
    fetchSuggestions(tab)
      .then((d) => {
        setSuggestions(d);
        if (tab === "pending") {
          setPendingCount(d.length);
        }
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, [tab]);

  // Totaal verwachte extra omzet en reserveringen van alle voorstellen
  // die op dit moment in beeld zijn (in de actieve tab).
  const expectedTotals = useMemo(() => {
    let res = 0;
    let rev = 0;
    for (const s of suggestions) {
      res += s.expected_impact?.extra_reservations ?? 0;
      rev += s.expected_impact?.extra_revenue_cents ?? 0;
    }
    return { reservations: res, revenue: rev };
  }, [suggestions]);

  const act = async (id: string, status: SuggestionStatus) => {
    setActingId(id);
    try {
      await updateSuggestion(id, status);
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
      // Modal sluiten als we de actief-geselecteerde net afgehandeld hebben.
      if (selected?.id === id) setSelected(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActingId(null);
    }
  };

  // Escape-toets sluit de detail-modal — handige keyboard-affordance
  // bij popovers en drawers.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected]);

  return (
    <div className="page-full">
      <div className="page-title">Suggesties</div>
      <div className="page-subtitle">
        Voorstellen van Filly — met onderbouwing én verwachte impact. Keur goed
        → wordt een campagne.
      </div>

      {/* Stats-row: drie getallen die direct laten zien wat er aan
          actie klaarligt. Wachtend-count is brand-groen omdat dat het
          getal is waar de gebruiker actief iets mee moet. */}
      <div className="stats-row">
        <div className="stat-card stat-card-filly">
          <div className="stat-card-label">Wachtend op goedkeuring</div>
          <div className="stat-card-val">
            {loading ? <Skeleton height={22} width="40%" /> : pendingCount}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">
            Verwacht extra (deze {tab === "pending" ? "stapel" : "tab"})
          </div>
          <div className="stat-card-val">
            {loading ? (
              <Skeleton height={22} width="50%" />
            ) : (
              `+${expectedTotals.reservations} reserveringen`
            )}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Verwachte extra omzet</div>
          <div className="stat-card-val">
            {loading ? (
              <Skeleton height={22} width="50%" />
            ) : (
              formatEuro(expectedTotals.revenue)
            )}
          </div>
        </div>
      </div>

      <div className="tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`tab-btn ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="suggestions-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="suggestion-card">
              <Skeleton height={10} width="40%" />
              <Skeleton height={20} width="80%" />
              <Skeleton height={60} width="100%" />
              <Skeleton height={14} width="60%" />
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <Skeleton height={28} width={90} />
                <Skeleton height={28} width={90} />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon="✨"
          title="Voorstellen niet beschikbaar"
          description="We konden de voorstellen niet ophalen. Probeer de pagina te herladen."
        />
      ) : suggestions.length === 0 ? (
        tab === "pending" ? (
          <EmptyState
            icon="✨"
            title="Alles bijgewerkt"
            description="Geen voorstellen wachtend. Filly laat het weten zodra er wat opduikt."
          />
        ) : (
          <div className="table-empty">
            Geen {tab === "approved" ? "goedgekeurde" : "afgewezen"}{" "}
            voorstellen.
          </div>
        )
      ) : (
        <div className="suggestions-grid">
          {suggestions.map((s) => {
            const t = triggerLabel[s.trigger_type] ?? {
              icon: "💡",
              text: s.trigger_type,
            };
            const sc = s.suggested_campaign;
            const isActing = actingId === s.id;
            const confidence = s.confidence_score
              ? Math.round(s.confidence_score * 100)
              : null;
            const impact = s.expected_impact ?? {};

            return (
              <div
                key={s.id}
                className="suggestion-card suggestion-card-clickable"
                onClick={() => setSelected(s)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(s);
                  }
                }}
              >
                {/* Header: trigger + urgency-dot */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div className="sg-trigger">
                    <span>{t.icon}</span>
                    <span>{t.text}</span>
                  </div>
                  {s.urgency && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 11,
                        color: urgencyColor[s.urgency],
                        fontWeight: 500,
                      }}
                    >
                      <div
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: urgencyColor[s.urgency],
                        }}
                      />
                      {urgencyLabel[s.urgency]}
                    </div>
                  )}
                </div>

                <div className="sg-title">
                  {sc.name ?? "Campagne-voorstel"}
                </div>

                {(sc.subject || sc.caption || sc.body) && (
                  <div className="sg-body">
                    {sc.subject ?? sc.caption ?? sc.body}
                  </div>
                )}

                {/* Expected Impact box — brand-styling met groene rand
                    links zodat visueel duidelijk is dat dit Filly's
                    voorspelling is (consistent met andere Filly-elementen). */}
                {(impact.extra_reservations || impact.extra_revenue_cents) && (
                  <div className="sg-impact">
                    <div className="sg-impact-item">
                      <div className="sg-impact-label">Verwacht extra</div>
                      <div className="sg-impact-val">
                        +{impact.extra_reservations} reserveringen
                      </div>
                    </div>
                    <div className="sg-impact-item">
                      <div className="sg-impact-label">Geschatte omzet</div>
                      <div className="sg-impact-val">
                        +{formatEuro(impact.extra_revenue_cents)}
                      </div>
                    </div>
                    {confidence !== null && (
                      <div className="sg-impact-item sg-impact-confidence">
                        <div className="sg-impact-label">Confidence</div>
                        <div className="sg-impact-val">{confidence}%</div>
                        <div className="sg-conf-bar">
                          <div
                            className="sg-conf-fill"
                            style={{ width: `${confidence}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Reasoning */}
                {s.reasoning && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--ts)",
                      fontStyle: "italic",
                      lineHeight: 1.5,
                      padding: "6px 0",
                      borderTop: "1px solid var(--border-soft)",
                    }}
                  >
                    <strong style={{ fontStyle: "normal" }}>Waarom nú:</strong>{" "}
                    {s.reasoning}
                  </div>
                )}

                <div className="sg-meta">
                  {sc.type && (
                    <span className={typeChipClass(sc.type)}>{sc.type}</span>
                  )}
                  {sc.segment && <span className="sg-chip">{sc.segment}</span>}
                </div>

                {tab === "pending" && (
                  <div
                    className="sg-actions"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      className="sg-btn primary"
                      onClick={() => act(s.id, "approved")}
                      disabled={isActing}
                    >
                      {isActing ? "Bezig..." : "Goedkeuren"}
                    </button>
                    <button className="sg-btn" disabled>
                      Aanpassen
                    </button>
                    <button
                      className="sg-btn danger"
                      onClick={() => act(s.id, "rejected")}
                      disabled={isActing}
                    >
                      Afwijzen
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Detail-modal — opent bij klik op een kaart. Toont ALLE velden
          (volledige campagne-body, trigger-context, segment, timing,
          reasoning en impact) plus een concrete invulling (hoofdgerecht
          + bijgerechten) zodat "brunch" of "stoofschotel" tastbaar wordt. */}
      {selected && (() => {
        const s = selected;
        const t = triggerLabel[s.trigger_type] ?? {
          icon: "💡",
          text: s.trigger_type,
        };
        const sc = s.suggested_campaign;
        const impact = s.expected_impact ?? {};
        const confidence = s.confidence_score
          ? Math.round(s.confidence_score * 100)
          : null;
        const isActing = actingId === s.id;
        const typeLabel = sc.type
          ? sc.type.charAt(0).toUpperCase() + sc.type.slice(1)
          : null;
        return (
          <div
            className="sg-modal-overlay"
            onClick={() => setSelected(null)}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="sg-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="sg-modal-close"
                onClick={() => setSelected(null)}
                aria-label="Sluiten"
              >
                ×
              </button>

              <div className="sg-modal-header">
                <div className="sg-trigger">
                  <span>{t.icon}</span>
                  <span>{t.text}</span>
                </div>
                {s.urgency && (
                  <span
                    className="sg-urgency-pill"
                    style={{ color: urgencyColor[s.urgency] }}
                  >
                    <span
                      className="sg-urgency-dot"
                      style={{ background: urgencyColor[s.urgency] }}
                    />
                    {urgencyLabel[s.urgency]}
                  </span>
                )}
              </div>

              <h2 className="sg-modal-title">
                {sc.name ?? "Campagne-voorstel"}
              </h2>

              <div className="sg-modal-meta">
                {typeLabel && (
                  <span className={typeChipClass(sc.type)}>{typeLabel}</span>
                )}
                {sc.segment && (
                  <span className="sg-chip">Doelgroep: {sc.segment}</span>
                )}
              </div>

              {/* Impact-box (zelfde component als in de kaart) */}
              {(impact.extra_reservations || impact.extra_revenue_cents) && (
                <div className="sg-impact">
                  <div className="sg-impact-item">
                    <div className="sg-impact-label">Verwacht extra</div>
                    <div className="sg-impact-val">
                      +{impact.extra_reservations} reserveringen
                    </div>
                  </div>
                  <div className="sg-impact-item">
                    <div className="sg-impact-label">Geschatte omzet</div>
                    <div className="sg-impact-val">
                      +{formatEuro(impact.extra_revenue_cents)}
                    </div>
                  </div>
                  {confidence !== null && (
                    <div className="sg-impact-item sg-impact-confidence">
                      <div className="sg-impact-label">Confidence</div>
                      <div className="sg-impact-val">{confidence}%</div>
                      <div className="sg-conf-bar">
                        <div
                          className="sg-conf-fill"
                          style={{ width: `${confidence}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Voorgestelde invulling — concreet: welk hoofdgerecht,
                  welke bijgerechten, wanneer, voor welke prijs. Dit is
                  het verschil tussen "brunch"-idee en een actieklaar
                  voorstel dat de eigenaar meteen kan goedkeuren.
                  Wordt door Filly via tool-use gegenereerd op basis
                  van het profiel + actueel menu — eerste open ~2s,
                  daarna gecachet. */}
              {proposalLoading && (
                <div className="sg-modal-section">
                  <div className="sg-modal-section-title">
                    Voorgestelde invulling
                  </div>
                  <div
                    style={{
                      padding: 16,
                      background: "var(--surface, #efe8d8)",
                      borderRadius: 8,
                      fontSize: 13,
                      color: "var(--text-secondary, #52525B)",
                    }}
                  >
                    🍳 Filly bedenkt een tastbare invulling op basis
                    van je menu en sfeer…
                  </div>
                </div>
              )}
              {proposalError && !proposalLoading && (
                <div className="sg-modal-section">
                  <div className="sg-modal-section-title">
                    Voorgestelde invulling
                  </div>
                  <div
                    style={{
                      padding: 12,
                      background: "var(--surface, #efe8d8)",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "var(--text-secondary, #52525B)",
                    }}
                  >
                    Filly kon nu geen tastbare invulling bedenken
                    ({proposalError}). De campagne-tekst hierboven
                    blijft gewoon bruikbaar.
                  </div>
                </div>
              )}
              {proposal && (
                <div className="sg-modal-section">
                  <div className="sg-modal-section-title">
                    Voorgestelde invulling
                  </div>

                  {proposal.mainDish && (
                    <div className="dish-card dish-card-main">
                      <div className="dish-card-head">
                        <div className="dish-card-label">Hoofdgerecht</div>
                        <span
                          className={`dish-source dish-source-${proposal.mainDish.source}`}
                        >
                          {proposal.mainDish.source === "menu"
                            ? "Uit je menu"
                            : "Nieuw voorstel"}
                        </span>
                      </div>
                      <div className="dish-card-name">
                        {proposal.mainDish.name}
                      </div>
                      <div className="dish-card-desc">
                        {proposal.mainDish.description}
                      </div>
                      {proposal.mainDish.priceCents && (
                        <div className="dish-card-price">
                          {formatPrice(proposal.mainDish.priceCents)}
                        </div>
                      )}
                    </div>
                  )}

                  {proposal.sides && proposal.sides.length > 0 && (
                    <>
                      <div className="sg-modal-field-label" style={{ marginTop: 14 }}>
                        Bijgerechten
                      </div>
                      <div className="dish-cards-row">
                        {proposal.sides.map((d, i) => (
                          <div key={i} className="dish-card dish-card-side">
                            <div className="dish-card-head">
                              <span
                                className={`dish-source dish-source-${d.source}`}
                              >
                                {d.source === "menu"
                                  ? "Uit menu"
                                  : "Nieuw"}
                              </span>
                              {d.priceCents && (
                                <span className="dish-card-price-inline">
                                  {formatPrice(d.priceCents)}
                                </span>
                              )}
                            </div>
                            <div className="dish-card-name-small">{d.name}</div>
                            <div className="dish-card-desc-small">
                              {d.description}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {(proposal.timing || proposal.priceBundleCents) && (
                    <div className="dish-meta-row">
                      {proposal.timing && (
                        <div className="dish-meta-item">
                          <span className="dish-meta-icon">🕐</span>
                          <span>{proposal.timing}</span>
                        </div>
                      )}
                      {proposal.priceBundleCents && (
                        <div className="dish-meta-item">
                          <span className="dish-meta-icon">💰</span>
                          <span>
                            <strong>
                              {formatPrice(proposal.priceBundleCents)}
                            </strong>
                            {proposal.priceBundleLabel
                              ? ` · ${proposal.priceBundleLabel}`
                              : ""}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Hoe Filly dit plaatst — kanaal-specifieke preview +
                  foto-selector. De gebruiker ziet hier concreet wat er
                  verstuurd of gepost wordt, en kan kiezen tussen Filly's
                  voorgestelde foto of een eigen upload. */}
              {sc.type && (
                <div className="sg-modal-section">
                  <div className="sg-modal-section-title">
                    Hoe Filly dit plaatst
                  </div>

                  {/* Foto-selector: Filly's voorstel links, upload-knop rechts.
                      Upload is nu mock/niet-actief — komt later met een
                      echte file-picker en image-storage. */}
                  {proposal?.heroImage && (
                    <div className="photo-picker">
                      <div className="photo-option photo-option-active">
                        <div className="photo-option-label">
                          <span className="photo-check">✓</span>
                          Voorgesteld door Filly
                        </div>
                        <div className="photo-frame">
                          {proposal.heroImage.emoji}
                        </div>
                        <div className="photo-caption-text">
                          {proposal.heroImage.description}
                        </div>
                      </div>
                      <button className="photo-option photo-option-upload" disabled>
                        <div className="photo-option-label">
                          <span className="photo-upload-icon">📷</span>
                          Upload je eigen foto
                        </div>
                        <div className="photo-frame photo-frame-empty">
                          <span className="photo-upload-hint">
                            Sleep of klik
                          </span>
                        </div>
                        <div className="photo-caption-text">
                          Vervang Filly&apos;s voorstel door een eigen foto.
                        </div>
                      </button>
                    </div>
                  )}

                  {/* Kanaal-preview: toon hoe het eruit ziet in het gekozen
                      kanaal. Hergebruikt de preview-classes van de campagne-
                      detail-pagina voor visuele consistentie. */}
                  <div className="channel-preview-wrap">
                    {sc.type === "mail" && (
                      <div className="mail-preview">
                        <div className="mail-preview-meta">
                          <div>
                            <span className="mail-preview-label">Van</span>
                            <span className="mail-preview-val">
                              Bistro Get-Filly
                            </span>
                          </div>
                          <div>
                            <span className="mail-preview-label">Aan</span>
                            <span className="mail-preview-val">
                              {sc.segment ?? "Vaste gasten"}
                            </span>
                          </div>
                        </div>
                        {proposal?.heroImage && (
                          <div className="mail-preview-hero">
                            {proposal.heroImage.emoji}
                          </div>
                        )}
                        <div className="mail-preview-subject">
                          {sc.subject ?? sc.name ?? "—"}
                        </div>
                        {sc.body && (
                          <div className="mail-preview-body">{sc.body}</div>
                        )}
                      </div>
                    )}

                    {sc.type === "social" && (
                      <div className="social-preview">
                        <div className="social-preview-header">
                          <div className="social-preview-avatar">B</div>
                          <div>
                            <div className="social-preview-handle">
                              bistro_getfilly
                            </div>
                            <div className="social-preview-sub">
                              Net geplaatst
                            </div>
                          </div>
                        </div>
                        <div className="social-preview-image">
                          {proposal?.heroImage?.emoji ?? "📷"}
                        </div>
                        <div className="social-preview-actions">
                          <span>❤️</span>
                          <span>💬</span>
                          <span>📤</span>
                        </div>
                        <div className="social-preview-caption">
                          {sc.caption ?? sc.body ?? "—"}
                        </div>
                      </div>
                    )}

                    {sc.type === "whatsapp" && (
                      <div className="whatsapp-preview">
                        <div className="whatsapp-preview-bubble">
                          {sc.body ?? sc.caption ?? "—"}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Volledige campagne-inhoud — de tekst waarin je Filly's
                  voorstel leest (onderwerp, caption, body). */}
              <div className="sg-modal-section">
                <div className="sg-modal-section-title">Inhoud van de campagne</div>
                {sc.subject && (
                  <div className="sg-modal-field">
                    <div className="sg-modal-field-label">Onderwerp</div>
                    <div className="sg-modal-field-val">{sc.subject}</div>
                  </div>
                )}
                {sc.caption && (
                  <div className="sg-modal-field">
                    <div className="sg-modal-field-label">Caption</div>
                    <div className="sg-modal-field-val">{sc.caption}</div>
                  </div>
                )}
                {sc.body && (
                  <div className="sg-modal-field">
                    <div className="sg-modal-field-label">Bericht</div>
                    <div className="sg-modal-field-val sg-modal-field-body">
                      {sc.body}
                    </div>
                  </div>
                )}
              </div>

              {s.reasoning && (
                <div className="sg-modal-section">
                  <div className="sg-modal-section-title">Waarom nú?</div>
                  <div className="sg-modal-reasoning">{s.reasoning}</div>
                </div>
              )}

              {tab === "pending" && (
                <div className="sg-actions sg-modal-actions">
                  <button
                    className="sg-btn primary"
                    onClick={() => act(s.id, "approved")}
                    disabled={isActing}
                  >
                    {isActing ? "Bezig..." : "Goedkeuren"}
                  </button>
                  <button className="sg-btn" disabled>
                    Aanpassen
                  </button>
                  <button
                    className="sg-btn danger"
                    onClick={() => act(s.id, "rejected")}
                    disabled={isActing}
                  >
                    Afwijzen
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
