"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  approveSuggestion,
  deleteCampaign,
  fetchCampaigns,
  fetchSuggestions,
  generateSuggestions,
  updateCampaignStatus,
  updateSuggestion,
  type AiSuggestion,
  type Campaign,
} from "../../../lib/api";
import { Skeleton } from "../_components/skeleton";
import { TasksStrip } from "../_components/tasks-strip";
import { SuggestionDetailModal } from "../_components/suggestion-detail-modal";
import { Badge, type BadgeVariant } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { PageHeader } from "../../../components/ui/page-header";
import { EmptyState } from "../../../components/ui/empty-state";
import { Tabs } from "../../../components/ui/tabs";
import { Chips } from "../../../components/ui/chips";

// Map campagne-status → semantische Badge-variant. Eén plek waar
// "wat betekent deze status visueel" beslist wordt — als we later
// kleur-mapping willen wijzigen (bv. ingepland van neutral naar info)
// hoeft dat hier maar 1 keer.
const statusBadgeVariant: Record<Campaign["status"], BadgeVariant> = {
  concept: "neutral",
  ingepland: "info",
  actief: "success",
  afgerond: "brand",
};

const statusLabel: Record<Campaign["status"], string> = {
  concept: "Concept",
  ingepland: "Ingepland",
  actief: "Actief",
  afgerond: "Afgerond",
};

type StatusFilter = "alle" | "actief" | "ingepland" | "concept" | "afgerond";
type TypeFilter = "alle" | Campaign["type"];

const statusFilters: { key: StatusFilter; label: string }[] = [
  { key: "alle", label: "Alle" },
  { key: "actief", label: "Actief" },
  { key: "ingepland", label: "Ingepland" },
  { key: "concept", label: "Concept" },
  { key: "afgerond", label: "Afgerond" },
];

const typeFilterOptions: { key: TypeFilter; label: string; icon: string }[] = [
  { key: "alle", label: "Alle types", icon: "·" },
  { key: "mail", label: "Mail", icon: "✉️" },
  { key: "social", label: "Social", icon: "📱" },
  { key: "whatsapp", label: "WhatsApp", icon: "💬" },
];

const typeIcon: Record<Campaign["type"], string> = {
  mail: "✉️",
  social: "📱",
  whatsapp: "💬",
};

// Vertaling van ai_suggestions.trigger_type naar een herkenbare
// visuele context. Emoji + korte label. 'chat' = voortgekomen uit
// een gesprek met Filly, rest komt uit Filly's auto-detectie.
const triggerLabel: Record<string, { icon: string; text: string }> = {
  chat: { icon: "💬", text: "Uit chat" },
  low_occupancy: { icon: "📉", text: "Lage bezetting" },
  weather: { icon: "🌧️", text: "Weer" },
  seasonal: { icon: "📅", text: "Seizoen" },
  birthday: { icon: "🎂", text: "Verjaardag" },
  retention: { icon: "💔", text: "Retentie" },
};

function formatEuroShort(cents?: number): string {
  if (!cents) return "—";
  return `€${Math.round(cents / 100).toLocaleString("nl-NL")}`;
}

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

// Gemiddelde besteding per gast — gebruikt om een omzet-schatting te maken
// als de campagne geen concrete extra_revenue_cents heeft.
const AVG_SPEND_CENTS = 4500;

function formatEuroFromCents(cents: number): string {
  return `€${(cents / 100).toLocaleString("nl-NL", { maximumFractionDigits: 0 })}`;
}

function campaignImpactEuro(c: Campaign): number {
  const stats = c.result_stats ?? {};
  if (typeof stats.extra_revenue_cents === "number") {
    return stats.extra_revenue_cents;
  }
  const res = stats.extra_reservations ?? 0;
  return res * AVG_SPEND_CENTS;
}

// Lokale status per suggestie-kaartje zodat de UI kan laten zien dat
// er iets in behandeling is (goedkeuren duurt een korte moment omdat
// de backend ook een campagne aanmaakt).
type SuggestionActionState =
  | { state: "idle" }
  | { state: "approving" }
  | { state: "rejecting" }
  | { state: "restoring" }
  | { state: "error"; message: string };

// Tabs binnen de suggesties-strip:
//   - 'open'     = pending én nog niet verlopen (wachten op actie)
//   - 'expired'  = pending maar de target-datum is voorbij
//   - 'rejected' = eerder afgewezen, herstelbaar via "Terugzetten"
// Zo kan de eigenaar weggeklikte of te-laat-bekeken voorstellen terug-
// vinden zonder de active "open"-lijst te vervuilen.
type SuggestionTab = "open" | "expired" | "rejected";

/**
 * Detecteer of een pending suggestie inmiddels verlopen is op basis van
 * de target-datum in trigger_context. We gebruiken `target_date` (ISO
 * yyyy-mm-dd, gebruikt door low_occupancy-trigger). Als die ontbreekt
 * vallen we terug op `created_at + 14 dagen` als veilige default.
 *
 * Frontend-detectie i.p.v. wachten op een backend-job: zo zijn de tabs
 * meteen correct, ook als er nog geen cron-marker draait. Wanneer de
 * api `status: "expired"` daadwerkelijk gaat schrijven, blijft deze
 * functie kloppen — we kijken naar pending én expired-status hieronder.
 */
function isSuggestionExpired(s: AiSuggestion): boolean {
  const ctx = s.trigger_context as { target_date?: string } | null;
  const target = ctx?.target_date;
  const todayStr = new Date().toISOString().slice(0, 10);
  if (target) return target < todayStr;
  // Geen target-datum: zacht-verloop na 14 dagen om de open-lijst niet
  // oneindig vol te laten lopen met oude voorstellen.
  const created = new Date(s.created_at);
  const expireAt = new Date(created);
  expireAt.setDate(created.getDate() + 14);
  return expireAt < new Date();
}

export default function CampagnesPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  // Alle pending suggesties uit de backend; we splitsen ze hieronder
  // lokaal in "open" (target-datum nog actueel) en "expired" (datum
  // voorbij) via isSuggestionExpired.
  const [pendingSuggestions, setPendingSuggestions] = useState<AiSuggestion[]>(
    [],
  );
  // Suggesties die backend zélf op status="expired" heeft gezet (via
  // toekomstige cron). Worden bij de lokaal-verlopen pending's gevoegd
  // op de Verlopen-tab.
  const [expiredFromBackend, setExpiredFromBackend] = useState<AiSuggestion[]>(
    [],
  );
  const [rejectedSuggestions, setRejectedSuggestions] = useState<
    AiSuggestion[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("alle");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("alle");
  const [query, setQuery] = useState("");
  const [suggestionAction, setSuggestionAction] = useState<
    Record<string, SuggestionActionState>
  >({});
  const [suggestionTab, setSuggestionTab] = useState<SuggestionTab>("open");
  // Welke suggestie staat open in de detail-modal? Null = dicht.
  const [detailSuggestion, setDetailSuggestion] =
    useState<AiSuggestion | null>(null);
  // Welke campagnes ondergaan op dit moment een quick-action zodat
  // we de knoppen kunnen disablen tijdens de roundtrip naar de server.
  const [campaignAction, setCampaignAction] = useState<
    Record<string, "saving" | "deleting">
  >({});

  // "Vraag Filly om voorstellen"-state. Loading = knop disabled +
  // spinner-tekst. Error = niet-modaal flash bij fout (bv. "vul
  // eerst je menu in").
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const handleGenerateSuggestions = async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      await generateSuggestions();
      // Pendings opnieuw ophalen zodat de strip direct bijwerkt.
      const fresh = await fetchSuggestions("pending", ["chat_bundle"]);
      setPendingSuggestions(fresh);
    } catch (e) {
      setGenerateError(
        e instanceof Error
          ? e.message
          : "Voorstellen genereren mislukt. Probeer het zo opnieuw.",
      );
    } finally {
      setGenerating(false);
    }
  };

  // Bij mount halen we campagnes + alle 3 suggestion-emmers parallel
  // op. Rejected en expired hebben we vooraf nodig zodat we de tab-
  // counts direct kunnen tonen, niet pas na tab-click. fetchSuggestions
  // met "expired" geeft alleen wat backend zelf op die status heeft
  // gezet; lokaal-verlopen pending's voegen we hieronder toe.
  useEffect(() => {
    // chat_bundle-suggesties uitsluiten: die horen alleen in de chat-
    // flow (bundle-card), niet als losse suggestie op deze pagina.
    Promise.all([
      fetchCampaigns(),
      fetchSuggestions("pending", ["chat_bundle"]),
      fetchSuggestions("expired", ["chat_bundle"]),
      fetchSuggestions("rejected", ["chat_bundle"]),
    ])
      .then(([c, pend, exp, rej]) => {
        setCampaigns(c);
        setPendingSuggestions(pend);
        setExpiredFromBackend(exp);
        setRejectedSuggestions(rej);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  // Splits pending in echt-open vs lokaal-verlopen (target-datum
  // voorbij). Combineer lokaal-verlopen met backend-expired voor de
  // Verlopen-tab.
  const openSuggestions = useMemo(
    () => pendingSuggestions.filter((s) => !isSuggestionExpired(s)),
    [pendingSuggestions],
  );
  const expiredSuggestions = useMemo(
    () => [
      ...pendingSuggestions.filter(isSuggestionExpired),
      ...expiredFromBackend,
    ],
    [pendingSuggestions, expiredFromBackend],
  );

  // Welke suggesties we nú tonen hangt af van de actieve tab.
  const visibleSuggestions =
    suggestionTab === "open"
      ? openSuggestions
      : suggestionTab === "expired"
        ? expiredSuggestions
        : rejectedSuggestions;

  const filtered = useMemo(() => {
    let out = campaigns;
    if (statusFilter !== "alle") {
      out = out.filter((c) => c.status === statusFilter);
    }
    if (typeFilter !== "alle") {
      out = out.filter((c) => c.type === typeFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      out = out.filter((c) =>
        `${c.name} ${c.meta ?? ""}`.toLowerCase().includes(q),
      );
    }
    return out;
  }, [campaigns, statusFilter, typeFilter, query]);

  const count = (status: StatusFilter) =>
    status === "alle"
      ? campaigns.length
      : campaigns.filter((c) => c.status === status).length;

  const totalImpact = useMemo(() => {
    return campaigns.reduce(
      (acc, c) => {
        const stats = c.result_stats ?? {};
        acc.reservations += stats.extra_reservations ?? 0;
        acc.revenue += campaignImpactEuro(c);
        acc.retention += stats.retention_guests ?? 0;
        return acc;
      },
      { reservations: 0, revenue: 0, retention: 0 },
    );
  }, [campaigns]);

  // Goedkeur-handler: ai_suggestion → campagne. Backend regelt de
  // volledige flow (create campaign + update suggestion status +
  // link approved_campaign_id). Na succes: suggestie uit de lijst,
  // refetch campagnes zodat de nieuwe direct in de tabel staat.
  const handleApprove = async (s: AiSuggestion) => {
    setSuggestionAction((m) => ({ ...m, [s.id]: { state: "approving" } }));
    try {
      const { campaignId } = await approveSuggestion(s.id);
      setPendingSuggestions((prev) => prev.filter((x) => x.id !== s.id));
      // Refetch zodat de nieuwe campagne in de lijst en stats verschijnt.
      const fresh = await fetchCampaigns();
      setCampaigns(fresh);
      // Direct door naar de nieuwe campagne zodat de eigenaar 'm
      // kan checken / editen vóór verzending.
      router.push(`/dashboard/campagnes/${campaignId}`);
    } catch (e) {
      setSuggestionAction((m) => ({
        ...m,
        [s.id]: {
          state: "error",
          message: e instanceof Error ? e.message : "Goedkeuren mislukt.",
        },
      }));
    }
  };

  const handleReject = async (s: AiSuggestion) => {
    setSuggestionAction((m) => ({ ...m, [s.id]: { state: "rejecting" } }));
    try {
      const updated = await updateSuggestion(s.id, "rejected");
      setPendingSuggestions((prev) => prev.filter((x) => x.id !== s.id));
      // Direct naar de "afgewezen"-emmer verplaatsen zodat user
      // via de tab kan terugvinden wat hij net weggeklikt heeft.
      setRejectedSuggestions((prev) => [updated, ...prev]);
    } catch (e) {
      setSuggestionAction((m) => ({
        ...m,
        [s.id]: {
          state: "error",
          message: e instanceof Error ? e.message : "Afwijzen mislukt.",
        },
      }));
    }
  };

  // Quick-action: campagne van status veranderen (concept → ingepland,
  // ingepland → actief, etc). Optimistisch updaten in lokale state na
  // succes — server is bron van waarheid maar refetch kost een extra
  // roundtrip die we hier kunnen besparen.
  const handleCampaignStatus = async (
    c: Campaign,
    next: Campaign["status"],
  ) => {
    setCampaignAction((m) => ({ ...m, [c.id]: "saving" }));
    try {
      await updateCampaignStatus(c.id, next);
      setCampaigns((prev) =>
        prev.map((x) => (x.id === c.id ? { ...x, status: next } : x)),
      );
    } catch (e) {
      console.error(e);
      // Eenvoudige feedback voor nu — alert is niet mooi maar
      // duidelijk; later vervangen door inline toast-systeem.
      alert(
        e instanceof Error
          ? e.message
          : "Status-wijziging mislukt. Probeer opnieuw.",
      );
    } finally {
      setCampaignAction((m) => {
        const copy = { ...m };
        delete copy[c.id];
        return copy;
      });
    }
  };

  // Hard-delete vraagt expliciete bevestiging — dit is onomkeerbaar.
  // Backend laat alleen concept-campagnes wissen, dus de bevestiging
  // kan kort blijven.
  const handleCampaignDelete = async (c: Campaign) => {
    if (
      !confirm(
        `Weet je zeker dat je '${c.name}' wilt verwijderen? Dit kan niet ongedaan worden.`,
      )
    ) {
      return;
    }
    setCampaignAction((m) => ({ ...m, [c.id]: "deleting" }));
    try {
      await deleteCampaign(c.id);
      setCampaigns((prev) => prev.filter((x) => x.id !== c.id));
    } catch (e) {
      console.error(e);
      alert(
        e instanceof Error
          ? e.message
          : "Verwijderen mislukt. Probeer opnieuw.",
      );
    } finally {
      setCampaignAction((m) => {
        const copy = { ...m };
        delete copy[c.id];
        return copy;
      });
    }
  };

  // Herstel-handler: afgewezen → pending. Gebruikt voor "per ongeluk
  // afgewezen"-gevallen. Endpoint is dezelfde updateSuggestion-PATCH
  // zodat we geen apart restore-endpoint nodig hebben.
  const handleRestore = async (s: AiSuggestion) => {
    setSuggestionAction((m) => ({ ...m, [s.id]: { state: "restoring" } }));
    try {
      const updated = await updateSuggestion(s.id, "pending");
      setRejectedSuggestions((prev) => prev.filter((x) => x.id !== s.id));
      setPendingSuggestions((prev) => [updated, ...prev]);
      // Automatisch terug naar de open-tab zodat user de herstelde
      // suggestie meteen ziet — anders lijkt het alsof er niks is
      // gebeurd.
      setSuggestionTab("open");
    } catch (e) {
      setSuggestionAction((m) => ({
        ...m,
        [s.id]: {
          state: "error",
          message: e instanceof Error ? e.message : "Terugzetten mislukt.",
        },
      }));
    }
  };

  return (
    <div className="page-full">
      {/* Titel-rij met "Nieuwe campagne"-CTA rechts zodat de primaire
          actie altijd zichtbaar is op de overzichtspagina. */}
      <PageHeader
        title="Campagnes"
        subtitle="Voorstellen van Filly én actieve campagnes — op één plek."
        actions={
          <>
            {/* Filly aan het werk-knop. Werkt zodra er ≥3 menu-items zijn
                (anders BadRequest met helpende tekst). Per 2026-05-05:
                primary-variant (brand-groen) + zonder ✨-emoji voor
                een schonere look. */}
            <Button
              variant="primary"
              loading={generating}
              onClick={handleGenerateSuggestions}
              title="Filly bekijkt je profiel + menu en genereert 3-5 nieuwe voorstellen"
            >
              Vraag Filly om voorstellen
            </Button>
            <Button variant="secondary">＋ Nieuwe campagne</Button>
          </>
        }
      />
      {generateError && (
        <div
          style={{
            marginTop: 8,
            padding: "10px 12px",
            background: "var(--surface, #efe8d8)",
            border: "1px solid var(--border, #e5dfd0)",
            borderRadius: 6,
            fontSize: 13,
            color: "var(--text-secondary, #52525B)",
          }}
        >
          {generateError}
        </div>
      )}

      {/* Impact-blok — de twee belangrijkste Filly-metrics krijgen de
          stat-card-filly variant (groene rand links + groene waarde)
          zodat attributie visueel consistent is met andere pagina's.
          marginBottom 20: ruimte tussen KPI's en de Voorstellen-strip
          die matcht met de andere section-marges op deze pagina. */}
      <div className="stats-row" style={{ marginBottom: 20 }}>
        <div className="stat-card stat-card-filly">
          <div className="stat-card-label">Extra reserveringen</div>
          <div className="stat-card-val">
            {loading ? (
              <Skeleton height={22} width="50%" />
            ) : (
              `+${totalImpact.reservations}`
            )}
          </div>
        </div>
        <div className="stat-card stat-card-filly">
          <div className="stat-card-label">Extra omzet</div>
          <div className="stat-card-val">
            {loading ? (
              <Skeleton height={22} width="60%" />
            ) : (
              formatEuroFromCents(totalImpact.revenue)
            )}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Slapende gasten terug</div>
          <div className="stat-card-val">
            {loading ? (
              <Skeleton height={22} width="40%" />
            ) : (
              totalImpact.retention
            )}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Voorstellen open</div>
          <div className="stat-card-val">
            {loading ? (
              <Skeleton height={22} width="30%" />
            ) : (
              openSuggestions.length
            )}
          </div>
        </div>
      </div>

      {/* Suggesties-sectie — tonen zodra er ergens een voorstel zit
          (open, verlopen, of afgewezen). Anders verbergen we de hele
          strip zodat nieuwe klanten met een leeg dashboard niet tegen
          "0 voorstellen" aanlopen. */}
      {!loading &&
        (openSuggestions.length > 0 ||
          expiredSuggestions.length > 0 ||
          rejectedSuggestions.length > 0) && (
          <section style={{ marginTop: 0, marginBottom: 10 }}>
            <div style={{ marginBottom: 6 }}>
              {/* Sub-kop: zelfde stijl als "Overige acties" en
                  "Campagnes" hieronder — zwart, fontSize 15, geen
                  emoji. Visuele uniformiteit tussen de drie blokken
                  op deze pagina. */}
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--text, #18181B)",
                  marginBottom: 2,
                }}
              >
                Voorstellen van Filly
              </div>
              <div style={{ fontSize: 12, color: "var(--tl)" }}>
                {suggestionTab === "open"
                  ? openSuggestions.length === 0
                    ? "Geen open voorstellen — alles is afgehandeld."
                    : openSuggestions.length === 1
                      ? "1 voorstel wacht op jouw goedkeuring."
                      : `${openSuggestions.length} voorstellen wachten op jouw goedkeuring.`
                  : suggestionTab === "expired"
                    ? expiredSuggestions.length === 0
                      ? "Geen verlopen voorstellen."
                      : "Voorbije datum — niet meer goedkeurbaar maar bewaard ter referentie."
                    : rejectedSuggestions.length === 0
                      ? "Nog geen afgewezen voorstellen."
                      : "Eerder afgewezen. Klik 'Terugzetten' om er alsnog mee door te gaan."}
              </div>
            </div>

            {/* Tabs — Open / Verlopen / Afgewezen altijd zichtbaar zodat
                de structuur stabiel blijft, ook als één emmer (tijdelijk)
                leeg is. Active-state via groene onderlijn. */}
            <div className="suggestion-tabs">
              {(
                [
                  { key: "open", label: "Open", count: openSuggestions.length },
                  {
                    key: "expired",
                    label: "Verlopen",
                    count: expiredSuggestions.length,
                  },
                  {
                    key: "rejected",
                    label: "Afgewezen",
                    count: rejectedSuggestions.length,
                  },
                ] as { key: SuggestionTab; label: string; count: number }[]
              ).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setSuggestionTab(t.key)}
                  className={`suggestion-tab ${
                    suggestionTab === t.key ? "active" : ""
                  }`}
                >
                  {t.label} ({t.count})
                </button>
              ))}
            </div>

            {visibleSuggestions.length > 0 ? (
              <div
                style={{
                  display: "grid",
                  // 1fr-max zodat kaarten de volle beschikbare breedte
                  // vullen — bij brede schermen geen lege ruimte rechts
                  // meer doordat de oude max van 480px begrenste.
                  gridTemplateColumns:
                    "repeat(auto-fill, minmax(380px, 1fr))",
                  gap: 12,
                  // Max ~2 rijen zichtbaar (kaart ~360px + 12px gap),
                  // daarna interne scroll. Voorkomt dat de hele pagina
                  // mee scrollt door 8+ voorstellen — overzichtelijker
                  // én de KPI-rij blijft in beeld bij scrollen door de
                  // lijst.
                  maxHeight: 760,
                  overflowY: "auto",
                  // Ruimte rechts voor de scrollbar zodat 'ie niet
                  // over de card-content valt.
                  paddingRight: 8,
                }}
              >
                {visibleSuggestions.map((s) => (
                  <SuggestionCard
                    key={s.id}
                    suggestion={s}
                    action={suggestionAction[s.id] ?? { state: "idle" }}
                    mode={suggestionTab}
                    onApprove={() => handleApprove(s)}
                    onReject={() => handleReject(s)}
                    onRestore={() => handleRestore(s)}
                    onDetails={() => setDetailSuggestion(s)}
                  />
                ))}
              </div>
            ) : (
              <div
                style={{
                  padding: "20px 16px",
                  color: "var(--tl)",
                  fontSize: 13,
                  textAlign: "center",
                  border: "1px dashed var(--border, #E5DFD0)",
                  borderRadius: 8,
                }}
              >
                {suggestionTab === "open"
                  ? "Geen voorstellen open."
                  : "Geen afgewezen voorstellen."}
              </div>
            )}
          </section>
        )}

      {/* Overige acties — reviews, reserverings-attenties, inzichten.
          Eerder op /dashboard/taken, nu onder dezelfde hub als de
          Filly-voorstellen zodat alle "wat moet ik doen"-items op één
          plek staan. Component verbergt zichzelf als er niks is. */}
      <TasksStrip />

      {/* Campagnes-kop. Alleen als tekst-separator tussen acties
          (die boven staan als er zijn) en de campagne-tabel zelf. */}
      <div
        style={{
          marginTop: 0,
          marginBottom: 8,
          fontSize: 15,
          fontWeight: 600,
          color: "var(--text, #18181B)",
        }}
      >
        Campagnes
      </div>

      {/* Filters-rij: status-tabs (links) + type-chips (rechts). */}
      <div className="campagnes-filters">
        <Tabs
          items={statusFilters.map((f) => ({
            key: f.key,
            label: f.label,
            count: count(f.key),
          }))}
          active={statusFilter}
          onChange={setStatusFilter}
        />
        <Chips
          items={typeFilterOptions}
          active={typeFilter}
          onChange={setTypeFilter}
        />
      </div>

      {/* Zoekveld: snel op naam of meta filteren — zelfde stijl als op
          gasten-pagina zodat dashboard consistent voelt. */}
      <input
        type="search"
        placeholder="Zoek op campagne-naam..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="search-input"
      />

      {loading ? (
        <div className="data-table" style={{ padding: 16 }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{ display: "flex", gap: 16, padding: "10px 0" }}
            >
              <Skeleton height={18} width={18} />
              <Skeleton height={18} width="30%" />
              <Skeleton height={18} width="15%" />
              <Skeleton height={18} width="20%" />
              <Skeleton height={18} width="15%" />
              <Skeleton height={18} width="10%" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        statusFilter === "alle" && typeFilter === "alle" && !query.trim() ? (
          <EmptyState
            icon="📣"
            title={error ? "Campagnes niet geladen" : "Nog geen campagnes"}
            description={
              error
                ? "We konden de lijst niet ophalen. Probeer de pagina te herladen."
                : "Laat Filly een voorstel maken of start zelf een campagne — voor mail, social of WhatsApp."
            }
            action={
              !error && <Button variant="primary">Nieuwe campagne</Button>
            }
          />
        ) : (
          <div className="table-empty">
            Geen campagnes gevonden met deze filters.
          </div>
        )
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}></th>
              <th>Naam</th>
              <th>Type</th>
              <th>Details</th>
              <th>Impact</th>
              <th>Status</th>
              <th style={{ width: 220 }}>Actie</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const stats = c.result_stats ?? {};
              const extraRes = stats.extra_reservations;
              const revenueCents = campaignImpactEuro(c);
              const action = campaignAction[c.id];
              const busy = action !== undefined;
              return (
                <tr
                  key={c.id}
                  onClick={() => router.push(`/dashboard/campagnes/${c.id}`)}
                  style={{ cursor: "pointer" }}
                >
                  <td style={{ fontSize: 18 }}>{typeIcon[c.type]}</td>
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
                  <td style={{ color: "var(--ts)", textTransform: "capitalize" }}>
                    {c.type}
                  </td>
                  <td style={{ color: "var(--tl)", fontSize: 12 }}>{c.meta}</td>
                  <td style={{ fontSize: 12 }}>
                    {extraRes ? (
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--accent)" }}>
                          +{extraRes} reserveringen
                        </div>
                        <div style={{ color: "var(--tl)" }}>
                          {formatEuroFromCents(revenueCents)} extra
                        </div>
                      </div>
                    ) : c.status === "ingepland" ? (
                      <span style={{ color: "var(--tl)" }}>
                        Nog niet verstuurd
                      </span>
                    ) : c.status === "concept" ? (
                      <span style={{ color: "var(--tl)" }}>—</span>
                    ) : (
                      <span style={{ color: "var(--tl)" }}>Nog niet gemeten</span>
                    )}
                  </td>
                  <td>
                    <Badge
                      variant={statusBadgeVariant[c.status]}
                      withDot
                    >
                      {statusLabel[c.status]}
                    </Badge>
                  </td>
                  {/* Quick-actions per status. stopPropagation zodat
                      de row-klik (naar detail-page) niet ook afvuurt
                      bij elke knop-klik. */}
                  <td onClick={(e) => e.stopPropagation()}>
                    <CampaignActions
                      status={c.status}
                      busy={busy}
                      action={action}
                      onSchedule={() =>
                        handleCampaignStatus(c, "ingepland")
                      }
                      onActivate={() =>
                        handleCampaignStatus(c, "actief")
                      }
                      onComplete={() =>
                        handleCampaignStatus(c, "afgerond")
                      }
                      onDelete={() => handleCampaignDelete(c)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Detail-modal voor een suggestie. Chat-editflow + actieknoppen
          zitten in de modal zelf; hier koppelen we alleen de side-
          effects (campagne aangemaakt, afgewezen, of inhoud bijgewerkt). */}
      {detailSuggestion && (
        <SuggestionDetailModal
          suggestion={detailSuggestion}
          onClose={() => setDetailSuggestion(null)}
          onApproved={async (campaignId) => {
            // Approved → suggestie uit pending-lijst, refetch
            // campagnes, door naar de nieuwe concept-campagne.
            setPendingSuggestions((prev) =>
              prev.filter((x) => x.id !== detailSuggestion.id),
            );
            setDetailSuggestion(null);
            const fresh = await fetchCampaigns();
            setCampaigns(fresh);
            router.push(`/dashboard/campagnes/${campaignId}`);
          }}
          onRejected={(id) => {
            setPendingSuggestions((prev) => prev.filter((x) => x.id !== id));
            setDetailSuggestion(null);
          }}
          onUpdated={(updated) => {
            // Vervang in de pending-lijst zodat de kaart buiten de
            // modal ook de nieuwe titel/preview toont.
            setPendingSuggestions((prev) =>
              prev.map((s) => (s.id === updated.id ? updated : s)),
            );
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// SuggestionCard — compacte kaart bovenaan de campagnes-pagina
// ============================================================
// Toont één voorstel van Filly met genoeg context om direct te
// kunnen beslissen zonder door te klikken:
//   - bron (chat / lage bezetting / weer / ...)
//   - type (mail / social / whatsapp)
//   - titel + optionele onderwerp-regel + body-preview
//   - urgentie
//   - 3 acties: Goedkeuren / Details / Afwijzen
// Goedkeuren maakt direct een campagne aan en navigeert erheen;
// Details opent /dashboard/suggesties (voorlopig, tot chat-edit
// inline beschikbaar is in blok 3).
function SuggestionCard({
  suggestion,
  action,
  mode,
  onApprove,
  onReject,
  onRestore,
  onDetails,
}: {
  suggestion: AiSuggestion;
  action: SuggestionActionState;
  // 'open' = pending, toont Goedkeur/Afwijs-knoppen.
  // 'rejected' = toont alleen 'Terugzetten'-knop zodat de user
  // per ongeluk weggeklikte voorstellen kan herstellen.
  mode: SuggestionTab;
  onApprove: () => void;
  onReject: () => void;
  onRestore: () => void;
  onDetails: () => void;
}) {
  const sc = suggestion.suggested_campaign ?? {};
  const type = sc.type ?? "mail";
  const name = sc.name ?? "Naamloos voorstel";

  // Multi-variant shape (3-varianten-flow) heeft prioriteit; we
  // pakken de geselecteerde variant voor de preview. Legacy single-
  // body blijft werken via fallback. Zo blijven oude seed-suggesties
  // én nieuwe chat-proposals beide netjes renderen op de kaart.
  const variants =
    Array.isArray(sc.variants) && sc.variants.length > 0
      ? sc.variants
      : null;
  const selectedVariantIdx =
    typeof sc.selected_index === "number" &&
    variants &&
    sc.selected_index >= 0 &&
    sc.selected_index < variants.length
      ? sc.selected_index
      : 0;
  const selectedVariant = variants ? variants[selectedVariantIdx] : null;

  const subject =
    selectedVariant?.subject_line ?? sc.subject_line ?? sc.subject;
  const body =
    selectedVariant?.body ?? sc.body ?? sc.caption ?? "";
  const bodyPreview = body.length > 220 ? body.slice(0, 220) + "…" : body;
  const impact = suggestion.expected_impact ?? {};
  const confidence = suggestion.confidence_score
    ? Math.round(suggestion.confidence_score * 100)
    : null;

  const typeLabel =
    type === "mail" ? "E-mail" : type === "social" ? "Social" : "WhatsApp";
  const trigger = triggerLabel[suggestion.trigger_type] ?? {
    icon: "💡",
    text: suggestion.trigger_type,
  };

  const busy =
    action.state === "approving" ||
    action.state === "rejecting" ||
    action.state === "restoring";
  const hasImpact = Boolean(
    impact.extra_reservations || impact.extra_revenue_cents,
  );

  const isRejected = mode === "rejected";
  const isExpired = mode === "expired";
  // Beide inactieve states krijgen dezelfde gedimde achtergrond zodat
  // de eigenaar in één oogopslag ziet welke kaarten geen actie meer
  // vragen (zonder ze te verbergen — soms wil je zien wat je miste).
  const isInactive = isRejected || isExpired;

  return (
    <div
      style={{
        padding: 16,
        border: "1px solid var(--border, #E5DFD0)",
        borderRadius: 10,
        background: isInactive ? "var(--bg, #FAF7F1)" : "var(--white, #FFFFFF)",
        // Expired iets sterker gedimd dan rejected (verlopen = 100% niet
        // meer actionable, afgewezen = nog wel via Terugzetten).
        opacity: isExpired ? 0.7 : isRejected ? 0.75 : 1,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Header: trigger (emoji + label) links, urgency-dot rechts */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: "var(--accent, #1F4A2D)",
          }}
        >
          <span style={{ fontSize: 14 }}>{trigger.icon}</span>
          <span>{trigger.text}</span>
          <span
            style={{
              padding: "1px 8px",
              background: "var(--accent, #1F4A2D)",
              color: "white",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "normal",
              textTransform: "none",
              marginLeft: 4,
            }}
          >
            {typeLabel}
          </span>
        </div>
        {suggestion.urgency && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 11,
              color: urgencyColor[suggestion.urgency],
              fontWeight: 500,
            }}
          >
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: urgencyColor[suggestion.urgency],
              }}
            />
            {urgencyLabel[suggestion.urgency]}
          </div>
        )}
      </div>

      {/* Titel + onderwerp */}
      <div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
          {name}
        </div>
        {subject && (
          <div
            style={{
              fontSize: 12,
              color: "var(--ts)",
            }}
          >
            Onderwerp: {subject}
          </div>
        )}
      </div>

      {/* Body-preview (altijd tonen als er body is) */}
      {bodyPreview && (
        <div
          style={{
            fontSize: 13,
            color: "var(--tl)",
            lineHeight: 1.55,
            flex: 1,
          }}
        >
          {bodyPreview}
        </div>
      )}

      {/* Expected-impact blok — alleen tonen als we cijfers hebben.
          Op open-kaart: groen (brand-groen = "wat Filly belooft").
          Op afgewezen/verlopen-kaart: neutraal grijs zodat de cijfers
          niet meer alsof het nog gaat gebeuren ogen — dat is moot
          want de eigenaar heeft de campagne afgewezen of de datum is
          voorbij. */}
      {hasImpact && (
        <div
          style={{
            padding: "8px 10px",
            background: isInactive
              ? "var(--white, #FFFFFF)"
              : "var(--accent-light, #D6E0D8)",
            borderLeft: `3px solid ${
              isInactive ? "var(--border, #E5DFD0)" : "var(--accent, #1F4A2D)"
            }`,
            borderRadius: 4,
            display: "flex",
            flexWrap: "wrap",
            gap: 14,
            fontSize: 11,
          }}
        >
          {typeof impact.extra_reservations === "number" && (
            <div>
              <div
                style={{
                  color: "var(--ts)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  fontSize: 9,
                  fontWeight: 600,
                  marginBottom: 2,
                }}
              >
                Verwacht extra
              </div>
              <div
                style={{
                  fontWeight: 600,
                  color: isInactive
                    ? "var(--text-secondary, #52525B)"
                    : "var(--accent, #1F4A2D)",
                  fontSize: 13,
                }}
              >
                +{impact.extra_reservations} reserveringen
              </div>
            </div>
          )}
          {typeof impact.extra_revenue_cents === "number" && (
            <div>
              <div
                style={{
                  color: "var(--ts)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  fontSize: 9,
                  fontWeight: 600,
                  marginBottom: 2,
                }}
              >
                Geschatte omzet
              </div>
              <div
                style={{
                  fontWeight: 600,
                  color: isInactive
                    ? "var(--text-secondary, #52525B)"
                    : "var(--accent, #1F4A2D)",
                  fontSize: 13,
                }}
              >
                +{formatEuroShort(impact.extra_revenue_cents)}
              </div>
            </div>
          )}
          {confidence !== null && (
            <div style={{ marginLeft: "auto" }}>
              <div
                style={{
                  color: "var(--ts)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  fontSize: 9,
                  fontWeight: 600,
                  marginBottom: 2,
                }}
              >
                Confidence
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 4,
                    background: "var(--border, #E5DFD0)",
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${confidence}%`,
                      height: "100%",
                      background: "var(--accent, #1F4A2D)",
                    }}
                  />
                </div>
                <span style={{ fontWeight: 600, fontSize: 12 }}>
                  {confidence}%
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reasoning — Filly's uitleg waarom hij dit voorstelt. Cursief
          + borderTop markeert dat het de "waarom" is, niet campagne-
          content. */}
      {suggestion.reasoning && (
        <div
          style={{
            fontSize: 12,
            color: "var(--ts)",
            fontStyle: "italic",
            lineHeight: 1.5,
            paddingTop: 8,
            borderTop: "1px solid var(--border-soft, #EFE8D8)",
          }}
        >
          {suggestion.reasoning}
        </div>
      )}

      {/* Actie-knoppen — afhankelijk van mode:
            open     = Goedkeuren / Details / Afwijzen
            rejected = Terugzetten / Details
            expired  = alleen Details — voorbije datum kun je niet meer
                       goedkeuren, en terugzetten heeft geen zin */}
      {mode === "open" && (
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <Button
            size="sm"
            variant="primary"
            onClick={onApprove}
            loading={action.state === "approving"}
            disabled={busy}
            style={{ flex: 1 }}
          >
            ✓ Goedkeuren
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onDetails}
            disabled={busy}
          >
            Details
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onReject}
            loading={action.state === "rejecting"}
            disabled={busy}
            style={{ color: "var(--color-danger)" }}
          >
            ✕ Afwijzen
          </Button>
        </div>
      )}
      {mode === "rejected" && (
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <Button
            size="sm"
            variant="secondary"
            onClick={onRestore}
            loading={action.state === "restoring"}
            disabled={busy}
            style={{ flex: 1 }}
          >
            ↩ Terugzetten op open
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onDetails}
            disabled={busy}
          >
            Details
          </Button>
        </div>
      )}
      {mode === "expired" && (
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <Button
            size="sm"
            variant="secondary"
            onClick={onDetails}
            style={{ flex: 1 }}
          >
            Details bekijken
          </Button>
        </div>
      )}

      {action.state === "error" && (
        <div
          style={{
            padding: "6px 10px",
            background: "var(--red-soft, #fee)",
            color: "var(--red, #b00)",
            borderRadius: 6,
            fontSize: 12,
          }}
        >
          {action.message}
        </div>
      )}
    </div>
  );
}

// ============================================================
// CampaignActions — quick-action knoppen per row in de campagnes-tabel
// ============================================================
// Lineaire flow per status, geen zijpaden:
//   concept    → ✓ Inplannen   + ✕ Verwijder
//   ingepland  → ▶ Activeer    + ✕ Verwijder
//   actief     → ⏹ Stop        (zet 'm op afgerond)
//   afgerond   → (geen actie — eindstaat, blijft staan voor historie)
//
// Verwijderen mag tot en met "ingepland" omdat de campagne dan nog
// niet daadwerkelijk uitgegaan is. Daarna (actief/afgerond) is de
// data audit-relevant en blijft de campagne staan.
//
// Visueel: kleine pill-knoppen, primaire actie groen (brand),
// destructieve actie rood-tinted. Buttons zijn klein zodat de tabel
// compact blijft.
function CampaignActions({
  status,
  busy,
  action,
  onSchedule,
  onActivate,
  onComplete,
  onDelete,
}: {
  status: Campaign["status"];
  busy: boolean;
  action: "saving" | "deleting" | undefined;
  onSchedule: () => void;
  onActivate: () => void;
  onComplete: () => void;
  onDelete: () => void;
}) {
  const baseBtn: React.CSSProperties = {
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 500,
    borderRadius: 5,
    cursor: busy ? "not-allowed" : "pointer",
    border: "1px solid var(--border, #E5DFD0)",
    whiteSpace: "nowrap",
  };
  const primary: React.CSSProperties = {
    ...baseBtn,
    background: "var(--accent, #1F4A2D)",
    color: "white",
    border: "1px solid var(--accent, #1F4A2D)",
  };
  const danger: React.CSSProperties = {
    ...baseBtn,
    background: "transparent",
    color: "var(--red, #DC2626)",
  };

  const isSaving = action === "saving";
  const isDeleting = action === "deleting";

  if (status === "concept") {
    return (
      <div style={{ display: "flex", gap: 4 }}>
        <button onClick={onSchedule} disabled={busy} style={primary}>
          {isSaving ? "…" : "✓ Inplannen"}
        </button>
        <button onClick={onDelete} disabled={busy} style={danger}>
          {isDeleting ? "…" : "✕ Verwijder"}
        </button>
      </div>
    );
  }
  if (status === "ingepland") {
    return (
      <div style={{ display: "flex", gap: 4 }}>
        <button onClick={onActivate} disabled={busy} style={primary}>
          {isSaving ? "…" : "▶ Activeer"}
        </button>
        <button onClick={onDelete} disabled={busy} style={danger}>
          {isDeleting ? "…" : "✕ Verwijder"}
        </button>
      </div>
    );
  }
  if (status === "actief") {
    return (
      <div style={{ display: "flex", gap: 4 }}>
        <button onClick={onComplete} disabled={busy} style={primary}>
          {isSaving ? "…" : "⏹ Stop"}
        </button>
      </div>
    );
  }
  // Afgerond = eindstaat: geen actie-knop. Inhoud is wel nog te
  // bekijken via row-klik op de detail-pagina.
  return null;
}
