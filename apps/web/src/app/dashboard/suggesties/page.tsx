"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchSuggestions,
  updateSuggestion,
  type AiSuggestion,
  type SuggestionStatus,
} from "../../../lib/api";
import { Skeleton } from "../_components/skeleton";

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

// ============================================================
// Mock-proposal generator
// ============================================================
// Op basis van het campagne-voorstel genereren we een concreet voorbeeld:
// hoofdgerecht, bijgerechten, timing en een suggestie-prijs. Dit maakt
// "brunch" of "stoofschotel" tastbaar. Elke dish heeft een `source`:
// "menu" (Uit je menu) of "new" (Nieuw voorstel — out of the box).
// TODO: in productie zou dit uit Claude + menu_items-tabel komen.

type ProposalDish = {
  name: string;
  description: string;
  source: "menu" | "new";
  priceCents?: number;
};

type CampaignProposal = {
  mainDish?: ProposalDish;
  sides?: ProposalDish[];
  timing?: string;
  priceBundleCents?: number;
  priceBundleLabel?: string;
  // Hero-foto die Filly voorstelt. Mock: een emoji + beschrijving als
  // placeholder voor een echte AI-gegenereerde of gematchte foto.
  heroImage?: {
    emoji: string;
    description: string;
  };
};

function getMockProposal(s: AiSuggestion): CampaignProposal | null {
  const sc = s.suggested_campaign;
  const text = `${sc.name ?? ""} ${sc.subject ?? ""} ${sc.body ?? ""} ${sc.caption ?? ""}`.toLowerCase();

  if (text.includes("stoof") || text.includes("comfort")) {
    return {
      mainDish: {
        name: "Rundersukade in rode wijn",
        description:
          "Langzaam gegaard met winterwortelen, pastinaak en rozemarijn — minimaal 4 uur op lage temperatuur.",
        source: "menu",
        priceCents: 1895,
      },
      sides: [
        {
          name: "Aardappelpuree met truffel",
          description: "Romige puree, vleugje truffelolie, gesneden bieslook.",
          source: "menu",
          priceCents: 650,
        },
        {
          name: "Rode kool met appel",
          description: "Klassiek zoetzuur met kaneel en laurier.",
          source: "menu",
          priceCents: 550,
        },
        {
          name: "Spruitjes met pancetta & kastanje",
          description:
            "Krokant gebakken — buiten het menu maar past perfect bij deze winteractie.",
          source: "new",
          priceCents: 750,
        },
      ],
      timing: "Donderdag t/m zondag · 17:00–22:00",
      priceBundleCents: 2450,
      priceBundleLabel: "3-gangen menu",
      heroImage: {
        emoji: "🥘",
        description:
          "Stijlvolle foto van de stoofschotel in een gietijzeren pan, warm belicht — herfstsfeer.",
      },
    };
  }

  if (text.includes("brunch")) {
    return {
      mainDish: {
        name: "Eggs Benedict met wilde zalm",
        description:
          "Pochade eieren, huisgemaakte hollandaise, English muffin, gerookte zalm.",
        source: "menu",
        priceCents: 1650,
      },
      sides: [
        {
          name: "Avocado toast met feta",
          description:
            "Sourdough, geroosterde tomaten, za'atar en olijfolie.",
          source: "menu",
          priceCents: 950,
        },
        {
          name: "Pancakes met bosvruchten",
          description: "Amerikaans-dikke pancakes, mascarpone, ahornsiroop.",
          source: "menu",
          priceCents: 1150,
        },
        {
          name: "Shakshuka voor vegetariërs",
          description:
            "Out-of-the-box optie voor gasten die iets uitdagenders willen.",
          source: "new",
          priceCents: 1395,
        },
      ],
      timing: "Zaterdag & zondag · 10:00–14:00",
      priceBundleCents: 2950,
      priceBundleLabel: "Unlimited brunch",
      heroImage: {
        emoji: "🥞",
        description:
          "Plat-gefotografeerde brunch-tafel met pancakes, eggs benedict en verse bloemen — natuurlijk licht.",
      },
    };
  }

  if (text.includes("lunch")) {
    return {
      mainDish: {
        name: "Gegrilde kip-club sandwich",
        description:
          "Op desembrood met avocado, bacon, tomaat en chipotle-mayo.",
        source: "menu",
        priceCents: 1350,
      },
      sides: [
        {
          name: "Soep van de dag",
          description: "Wisselend — in deze periode pompoen-gember.",
          source: "menu",
          priceCents: 750,
        },
        {
          name: "Geroosterde bietensalade",
          description: "Ziggeitenkaas, walnoten, honing-mosterd dressing.",
          source: "menu",
          priceCents: 1250,
        },
        {
          name: "Grain bowl met falafel",
          description: "Freekeh, hummus, gepickelde rode ui — nieuwe variant.",
          source: "new",
          priceCents: 1450,
        },
      ],
      timing: "Maandag t/m vrijdag · 12:00–15:00",
      priceBundleCents: 1850,
      priceBundleLabel: "Lunch-deal: hoofd + drank + koffie",
      heroImage: {
        emoji: "🥪",
        description:
          "Close-up van de club sandwich met soep ernaast — strak gestyled, zakelijke lunch-vibe.",
      },
    };
  }

  if (text.includes("valentijn") || text.includes("romantisch")) {
    return {
      mainDish: {
        name: "Tournedos Rossini",
        description:
          "Runderhaas met gebraden foie gras, truffeljus en gegrilde brioche.",
        source: "menu",
        priceCents: 3450,
      },
      sides: [
        {
          name: "Gepocheerde peer met blauwkaas",
          description: "Als voorgerecht — rode wijn, walnoten, veldsla.",
          source: "menu",
          priceCents: 1450,
        },
        {
          name: "Chocolade fondant voor twee",
          description: "Warme kern, framboos-sorbet, amandel-crumble.",
          source: "menu",
          priceCents: 1650,
        },
        {
          name: "Welkomstglas champagne",
          description: "Voor elk koppel als extra touch.",
          source: "new",
          priceCents: 850,
        },
      ],
      timing: "Vrijdag 14 februari · 18:00 & 20:30",
      priceBundleCents: 7950,
      priceBundleLabel: "3-gangen Valentijnsmenu voor 2",
      heroImage: {
        emoji: "🌹",
        description:
          "Sfeerfoto: twee wijnglazen, rozen en kaarsen op de tafel — intiem, warm licht.",
      },
    };
  }

  // Geen specifieke match — geen concrete proposal genereren.
  return null;
}

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
        <div className="empty-state">
          <div className="empty-icon">✨</div>
          <div className="empty-title">Voorstellen niet beschikbaar</div>
          <div className="empty-desc">
            We konden de voorstellen niet ophalen. Probeer de pagina te
            herladen.
          </div>
        </div>
      ) : suggestions.length === 0 ? (
        tab === "pending" ? (
          <div className="empty-state">
            <div className="empty-icon">✨</div>
            <div className="empty-title">Alles bijgewerkt</div>
            <div className="empty-desc">
              Geen voorstellen wachtend. Filly laat het weten zodra er wat
              opduikt.
            </div>
          </div>
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
        const proposal = getMockProposal(s);

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
                  voorstel dat de eigenaar meteen kan goedkeuren. */}
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
