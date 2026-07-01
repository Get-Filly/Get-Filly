"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  Sparkles,
  CalendarDays,
  TrendingDown,
  UtensilsCrossed,
  Tag,
  Users,
  Wand2,
  Pencil,
  Check,
} from "lucide-react";
import {
  fetchDayContext,
  generateSuggestionsForDates,
  type ActiveActionDelta,
  type CampaignCreatedCard,
  type DayContext,
  type GenerateForDatesItem,
} from "@/lib/api";
import { useActionableDays } from "@/lib/use-actionable-days";
import { useLocaleTag } from "@/lib/locale-format";
import { logger } from "@/lib/logger";

// ============================================================
// FillyGuidedFlow — detectie-gedreven, hoek-rijke geleide flow
// (redesign 2026-06-13)
// ============================================================
//
// Stappen:
//   1. "opener"  — Filly opent autonoom: "Ik heb een paar dagen
//                  gedetecteerd. Voor welke dag?" → rustige dagen (eerlijk,
//                  geen seeded), speciale dagen, of zelf een dag kiezen.
//   2. "angles"  — Voor die dag: waarop wil je inspelen? Gedetecteerd
//                  (weer/event van die dag) + altijd-beschikbare hoeken
//                  (gerecht, deal, sfeer, doelgroep, iets anders) + een
//                  1-klik "laat Filly de sterkste hoek kiezen".
//   3. "channels"— Kanalen; Filly vinkt de aanbevolen alvast aan.
//   4. genereren → resultaat inline.
//
// Een getypt verzoek met datum slaat de opener over; een getypt thema
// (initialTopic) vult de gerecht-hoek voor.

const QUIET_DAYS_PREVIEW = 4;

function formatDayNl(iso: string, tag: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(tag, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

type PickedDay = {
  date: string;
  kind: "low_occupancy" | "special_day";
  name?: string;
  label: string;
};

type ContextOption = {
  id: string;
  label: string;
  hint: string;
  kind: "event" | "weer";
};

// Gedetecteerde aanknopingen (events + weer) voor de gekozen dag.
function buildContextOptions(ctx: DayContext | null): ContextOption[] {
  if (!ctx) return [];
  const opts: ContextOption[] = [];
  for (const e of ctx.events) {
    opts.push({
      id: `ev-${e.name}-${e.distanceKm}`,
      label: `${e.name} · ${e.distanceKm} km`,
      hint: `${e.name} (${e.category}, ${e.distanceKm} km)`,
      kind: "event",
    });
  }
  if (ctx.weather) {
    opts.push({
      id: "weather",
      label: `${ctx.weather.icon} ${ctx.weather.description}, ${ctx.weather.tempMax}°`,
      hint: `Weer die dag: ${ctx.weather.description}, ${ctx.weather.tempMin}–${ctx.weather.tempMax}°`,
      kind: "weer",
    });
  }
  return opts;
}

type Step =
  | "opener"
  | "angles"
  | "channels"
  | "generating"
  // "idle": rust-stap ná een afgeronde campagne — "Wil je nog een campagne?"
  // i.p.v. meteen weer de dag-keuze tonen.
  | "idle";

// Altijd-beschikbare hoeken (los van wat er die dag gedetecteerd is).
// hasInput === true → de hoek opent een vrij tekstveld. Labels en
// placeholders worden via t() opgehaald op basis van id (i18n).
const ANGLES: {
  id: string;
  Icon: typeof Tag;
  hasInput?: boolean;
}[] = [
  { id: "gerecht", Icon: UtensilsCrossed, hasInput: true },
  { id: "deal", Icon: Tag, hasInput: true },
  { id: "sfeer", Icon: Sparkles },
  { id: "doelgroep", Icon: Users, hasInput: true },
  { id: "anders", Icon: Pencil, hasInput: true },
];

export function FillyGuidedFlow({
  initialDate,
  initialTopic,
  initialChannels,
  initialStep,
  usedDates,
  onDayUsed,
  onActionChange,
  onGenerated,
}: {
  initialDate?: string;
  initialTopic?: string;
  // Kanalen die de eigenaar expliciet noemde ("een tiktok campagne").
  // Wanneer gevuld: alléén die kanalen voor-aanvinken op de kanalen-stap.
  initialChannels?: string[];
  // Bewaarde flow-stap uit active_action. "idle" = de rust-stap na een
  // afgeronde campagne; blijft zo staan als je wegnavigeert en terugkomt.
  initialStep?: string;
  // Dagen waarvoor al een campagne is gemaakt — niet opnieuw aanbieden. Komt
  // van de chat-parent (overleeft de instantie-wissel bij het eerste bericht).
  usedDates?: string[];
  onDayUsed?: (date: string) => void;
  onActionChange?: (delta: ActiveActionDelta) => void;
  // Aangeroepen ná een geslaagde generatie met een korte samenvatting + een
  // klikbare kaart, zodat de chat-parent een Filly-notitie in de historie kan
  // bijschrijven die naar de aangemaakte campagne linkt.
  onGenerated?: (text: string, card?: CampaignCreatedCard) => void;
}) {
  const t = useTranslations("dash__components_filly_guided_flow");
  const localeTag = useLocaleTag();
  const router = useRouter();
  const {
    lowOccupancyDays,
    specialDays,
    occupancyThreshold,
    loading,
    upcomingOpenDays,
    hasOccupancyData,
  } = useActionableDays();

  const [step, setStep] = useState<Step>(
    initialStep === "idle" ? "idle" : initialDate ? "angles" : "opener",
  );
  // Dagen waarvoor al een campagne is gemaakt — die bieden we niet opnieuw aan
  // in de dag-keuze (smart flow). Bron = de chat-parent (prop), zodat het de
  // instantie-wissel bij het eerste bericht overleeft.
  const usedSet = useMemo(() => new Set(usedDates ?? []), [usedDates]);
  const [autoStarted, setAutoStarted] = useState(false);
  const [picked, setPicked] = useState<PickedDay | null>(null);
  const [dayContext, setDayContext] = useState<DayContext | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  // Gedetecteerde aanknopingen (weer/event) die de eigenaar aanvinkt.
  const [selectedContext, setSelectedContext] = useState<Set<string>>(
    new Set(),
  );
  // Eén gekozen hoek (single-select, radio-gedrag) + de vrije tekst per
  // hoek. Een getypt thema (initialTopic) vult de gerecht-hoek alvast voor;
  // de backend stuurt een kanaal-wens NIET als topic mee (die komt via
  // initialChannels), dus hier belandt alleen een echt gerecht/thema.
  const [selectedAngle, setSelectedAngle] = useState<string | null>(
    initialTopic ? "gerecht" : null,
  );
  const [angleText, setAngleText] = useState<Record<string, string>>(
    initialTopic ? { gerecht: initialTopic } : {},
  );
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(
    new Set(),
  );
  // "Bedenk er zelf een": eigen-campagne-spoor. Geselecteerd + Verder →
  // we sturen de eigenaar naar de "maak eigen campagne"-builder op de
  // campagnes-pagina i.p.v. Filly een voorstel te laten schrijven.
  // Wederzijds uitsluitend met een gekozen hoek.
  const [buildOwn, setBuildOwn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllQuiet, setShowAllQuiet] = useState(false);

  // ---- Multi-dag (batch) ----
  // De eigenaar kan in de opener meerdere dagen aanvinken. Na "Verder" loopt
  // de flow ze één voor één langs (per dag de bestaande hoek- + kanaal-
  // schermen); pas na de laatste dag genereert 'ie alles in één keer (de
  // backend draait die dagen parallel). De "huidige dag die je instelt" blijft
  // de bestaande single-day-state (picked/dayContext/selectedAngle/…), zodat
  // die schermen ongewijzigd blijven.
  //   openerDays = in de opener aangevinkt, nog niet gestart
  //   queue      = na "Verder" de nog te configureren dagen (zonder de huidige)
  //   planned    = al geconfigureerde dagen als kant-en-klare generatie-items
  //   batchTotal = totaal in deze ronde (voor "Dag X van N"); 0 = single/auto
  const [openerDays, setOpenerDays] = useState<PickedDay[]>([]);
  const [queue, setQueue] = useState<PickedDay[]>([]);
  const [planned, setPlanned] = useState<GenerateForDatesItem[]>([]);
  const [batchTotal, setBatchTotal] = useState(0);
  const openerHas = (date: string) => openerDays.some((d) => d.date === date);
  const toggleOpenerDay = (day: PickedDay) =>
    setOpenerDays((cur) =>
      cur.some((d) => d.date === day.date)
        ? cur.filter((d) => d.date !== day.date)
        : [...cur, day],
    );

  // Smart flow: dagen waarvoor in deze sessie al een campagne is gemaakt
  // bieden we niet opnieuw aan.
  const availableQuiet = lowOccupancyDays.filter((d) => !usedSet.has(d.date));
  const availableSpecial = specialDays.filter((s) => !usedSet.has(s.date));
  const availableOpen = upcomingOpenDays.filter((iso) => !usedSet.has(iso));
  const quietToShow = showAllQuiet
    ? availableQuiet
    : availableQuiet.slice(0, QUIET_DAYS_PREVIEW);
  const contextOptions = useMemo(
    () => buildContextOptions(dayContext),
    [dayContext],
  );

  const minDayIso = useMemo(() => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  }, []);

  const toggle = <T,>(set: Set<T>, key: T): Set<T> => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  // Dag kiezen → day-context ophalen → hoeken-stap. Filly vinkt de
  // aanbevolen kanalen alvast aan. persist=false bij auto-start vanuit een
  // bestaande datum (die zit al in active_action).
  const pickDay = async (day: PickedDay, persist = true) => {
    setPicked(day);
    setError(null);
    setLoadingContext(true);
    setStep("angles");
    if (persist) onActionChange?.({ date: day.date, step: "angles" });
    try {
      const ctx = await fetchDayContext(day.date);
      setDayContext(ctx);
      setSelectedContext(new Set()); // gedetecteerde context standaard uit
      // Voor-aanvinken ALLEEN wanneer de eigenaar zelf een kanaal noemde
      // (initialChannels, bv. "een tiktok campagne"). Noemde 'ie niets, dan
      // laten we de selectie LEEG zodat de eigenaar bewust zelf kiest — geen
      // automatische voorselectie van alle gekoppelde kanalen meer (dat zette
      // bv. TikTok aan terwijl daar niet om gevraagd was). De "Genereer"-knop
      // is disabled tot er minstens één kanaal gekozen is.
      const explicit =
        initialChannels && initialChannels.length > 0
          ? ctx.channels
              .filter((c) => initialChannels.includes(c.channel))
              .map((c) => c.channel)
          : [];
      setSelectedChannels(new Set(explicit));
    } catch (e) {
      logger.error(e);
      setDayContext(null);
    } finally {
      setLoadingContext(false);
    }
  };

  const pickAnyDay = (iso: string) => {
    if (!iso) return;
    // Multi-select: een zelfgekozen datum wordt aan de selectie toegevoegd
    // (niet meteen gestart). "Verder" begint de flow met alle gekozen dagen.
    toggleOpenerDay({
      date: iso,
      kind: "low_occupancy",
      label: formatDayNl(iso, localeTag),
    });
  };

  // Voorgevulde datum (getypt verzoek): classificeer + spring naar de
  // hoeken-stap, opener overgeslagen.
  useEffect(() => {
    if (!initialDate || autoStarted || loading) return;
    // Run-once auto-start-guard: setState in effect is hier bewust (we mogen de
    // classificatie pas doen zodra de dagen-data geladen is, niet in render).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAutoStarted(true);
    const special = specialDays.find((s) => s.date === initialDate);
    const low = lowOccupancyDays.find((d) => d.date === initialDate);
    const day: PickedDay = special
      ? {
          date: initialDate,
          kind: "special_day",
          name: special.name,
          label: `${special.name} · ${formatDayNl(initialDate, localeTag)}`,
        }
      : low
        ? {
            date: initialDate,
            kind: "low_occupancy",
            label: `${formatDayNl(initialDate, localeTag)} · ${low.occupancy_pct}% bezet`,
          }
        : {
            date: initialDate,
            kind: "low_occupancy",
            label: formatDayNl(initialDate, localeTag),
          };
    void pickDay(day, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDate, loading, autoStarted]);

  // Idle-sync: bij de eerste campagne in een leeg gesprek wisselt de chat van
  // render-plek zodra het eerste bericht verschijnt; de nieuwe flow-instantie
  // mount soms vóórdat active_action op "idle" staat (race) en toont dan de
  // dag-keuze. Zodra active_action wél "idle" is, dwingen we de rust-stap af —
  // ongeacht het mount-moment. (Alleen voor "idle"; gewone flow-stappen
  // sturen we niet, zodat eigen kliks niet worden overschreven.)
  useEffect(() => {
    if (initialStep === "idle") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStep("idle");
    }
  }, [initialStep]);

  // Dag wijzigen → terug naar de opener; gedetecteerde context + kanalen
  // resetten (die zijn dag-specifiek), de gekozen hoeken blijven staan
  // zodat je na een nieuwe dag netjes weer bij dezelfde hoeken uitkomt.
  const editDay = () => {
    setStep("opener");
    setPicked(null);
    setDayContext(null);
    setSelectedContext(new Set());
    setSelectedChannels(new Set());
    // Terug naar de dag-keuze = de hele batch opnieuw opzetten.
    setQueue([]);
    setPlanned([]);
    setBatchTotal(0);
    setOpenerDays([]);
  };

  const setAngleTextFor = (id: string, value: string) =>
    setAngleText((m) => ({ ...m, [id]: value }));

  // Bouwt de sturing voor de generatie uit gedetecteerde context + hoeken.
  const buildContextHints = (): string[] => {
    const hints = contextOptions
      .filter((o) => selectedContext.has(o.id))
      .map((o) => o.hint);
    if (selectedAngle === "gerecht") {
      hints.push(
        `Gerecht uitlichten: ${angleText.gerecht?.trim() || "kies een passend gerecht uit het menu"}`,
      );
    }
    if (selectedAngle === "deal") {
      hints.push(
        angleText.deal?.trim()
          ? `Aanbieding/deal: ${angleText.deal.trim()}`
          : "Aanbieding/deal: een aantrekkelijke deal",
      );
    }
    if (selectedAngle === "sfeer") hints.push("Insteek: sfeer en beleving");
    if (selectedAngle === "doelgroep") {
      hints.push(
        `Doelgroep: ${angleText.doelgroep?.trim() || "de vaste gasten"}`,
      );
    }
    if (selectedAngle === "anders" && angleText.anders?.trim()) {
      hints.push(`Eigen wens: ${angleText.anders.trim()}`);
    }
    return hints;
  };

  // "Verder" in de opener: start de wachtrij met de aangevinkte dagen. De
  // eerste dag wordt meteen geconfigureerd (hoeken); de rest gaat in de queue.
  const startQueue = () => {
    if (openerDays.length === 0) return;
    const [first, ...rest] = openerDays;
    setQueue(rest);
    setPlanned([]);
    setBatchTotal(openerDays.length);
    setOpenerDays([]);
    void pickDay(first);
  };

  // Bouwt het generatie-item voor de HUIDIGE dag uit de verzamelde keuzes.
  const buildCurrentItem = (fillyChooses: boolean): GenerateForDatesItem | null => {
    if (!picked) return null;
    const hints = fillyChooses ? [] : buildContextHints();
    return {
      date: picked.date,
      kind: picked.kind,
      ...(picked.name ? { name: picked.name } : {}),
      ...(selectedChannels.size > 0
        ? { channels: [...selectedChannels] }
        : {}),
      ...(hints.length > 0 ? { context: hints } : {}),
    };
  };

  // De huidige dag afronden. Zijn er nog dagen in de wachtrij → naar de
  // volgende dag (hoeken-stap). Anders → alles in één keer genereren.
  // fillyChooses=true → geen hoeken, Filly kiest zelf de invalshoek.
  const commitCurrentDay = (fillyChooses = false) => {
    const item = buildCurrentItem(fillyChooses);
    if (!item) return;
    const nextPlanned = [...planned, item];
    // Per-dag-keuzes resetten voor de volgende dag.
    setSelectedContext(new Set());
    setSelectedAngle(null);
    setAngleText({});
    setSelectedChannels(new Set());
    if (queue.length > 0) {
      const [next, ...rest] = queue;
      setPlanned(nextPlanned);
      setQueue(rest);
      void pickDay(next, false);
    } else {
      setPlanned(nextPlanned);
      void generateBatch(nextPlanned);
    }
  };

  // Alle geconfigureerde dagen in één call genereren (backend draait ze
  // parallel). Bij succes: één samenvattende notitie in de chat + rust-stap.
  const generateBatch = async (items: GenerateForDatesItem[]) => {
    if (items.length === 0) return;
    setStep("generating");
    setError(null);
    onActionChange?.({ step: "generating" });
    try {
      const { suggestions } = await generateSuggestionsForDates(items);
      if (!suggestions || suggestions.length === 0) {
        // Geen stille redirect: duidelijke melding en terug naar de dag-keuze
        // (daar rendert de fout-banner; de idle-stap doet dat niet). Batch-
        // state resetten zodat de eigenaar schoon opnieuw kan kiezen.
        resetBatchAfterFailure();
        setError(t("errors.noResult"));
        return;
      }
      // Spoor in de chat-historie: bij één dag de bestaande notitie + kaart;
      // bij meerdere een samenvatting ("X concepten klaargezet") + een kaart
      // naar het eerste concept.
      const primary = suggestions[0];
      const card: CampaignCreatedCard | undefined = primary
        ? {
            kind: "campaign_created",
            campaignId: primary.approved_campaign_id ?? null,
            suggestionId: primary.id,
            name: primary.suggested_campaign?.name ?? t("result.fallbackName"),
          }
        : undefined;
      const note =
        items.length === 1
          ? t("generatedNote", { day: formatDayNl(items[0].date, localeTag) })
          : t("batchGeneratedNote", { count: suggestions.length });
      onGenerated?.(note, card);
      // Smart flow: alle behandelde dagen als "gedaan" markeren.
      items.forEach((it) => onDayUsed?.(it.date));
      // Rust-stap + alle batch-state schoon.
      onActionChange?.({
        date: null,
        topic: null,
        channels: null,
        step: "idle",
      });
      setPicked(null);
      setDayContext(null);
      setSelectedContext(new Set());
      setSelectedAngle(null);
      setAngleText({});
      setSelectedChannels(new Set());
      setQueue([]);
      setPlanned([]);
      setBatchTotal(0);
      setStep("idle");
    } catch (e) {
      logger.error(e);
      resetBatchAfterFailure();
      setError(e instanceof Error ? e.message : t("errors.generic"));
    }
  };

  // Na een mislukte batch: terug naar de dag-keuze (waar de fout-banner
  // rendert) met schone batch-state, zodat de eigenaar opnieuw kan beginnen.
  const resetBatchAfterFailure = () => {
    setPicked(null);
    setDayContext(null);
    setSelectedContext(new Set());
    setSelectedAngle(null);
    setAngleText({});
    setSelectedChannels(new Set());
    setQueue([]);
    setPlanned([]);
    setBatchTotal(0);
    setOpenerDays([]);
    setStep("opener");
  };

  // ---------- Idle: rust-stap ná een afgeronde campagne ----------
  // Geen stappen-menu opdringen; eerst een rustige "nog een campagne?"-vraag.
  // De eigenaar kan ook gewoon zelf typen via het chat-tekstveld eronder.
  if (step === "idle") {
    return (
      <div className="filly-guided">
        <div className="fg-welcome">
          <span className="fg-avatar">F</span>
          <div>
            <div className="fg-welcome-title">{t("idle.title")}</div>
          </div>
        </div>
        <div className="fg-options" style={{ marginTop: 4 }}>
          <button
            type="button"
            className="ui-btn ui-btn--primary ui-btn--sm"
            onClick={() => {
              setStep("opener");
              onActionChange?.({ step: "day" });
            }}
          >
            {t("idle.again")}
          </button>
        </div>
      </div>
    );
  }

  // ---------- Genereren: rustige tussenstaat ----------
  if (step === "generating") {
    return (
      <div className="filly-guided">
        <div className="fg-welcome" role="status" aria-live="polite">
          <span className="fg-avatar">F</span>
          <div className="fg-welcome-text">{t("generating.text")}</div>
        </div>
        <div className="typing" style={{ marginTop: 4 }}>
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    );
  }

  return (
    <div className="filly-guided">
      <div className="fg-welcome">
        <span className="fg-avatar">F</span>
        <div>
          <div className="fg-welcome-title">{t("welcome.title")}</div>
          <div className="fg-welcome-text">
            {step === "opener"
              ? t("welcome.openerText")
              : t("welcome.continueText")}
          </div>
        </div>
      </div>

      {/* Multi-dag voortgang: "Dag X van N" zodat de eigenaar weet waar 'ie
          in de wachtrij zit. Alleen bij een echte batch (>1 dag). */}
      {step !== "opener" && batchTotal > 1 && (
        <div className="fg-group-label" style={{ marginTop: 2 }}>
          <CalendarDays size={13} strokeWidth={2.25} />
          {t("progress.dayOf", {
            current: planned.length + 1,
            total: batchTotal,
          })}
        </div>
      )}

      {/* Antwoordspoor: de gekozen dag als chip met "wijzig". */}
      {step !== "opener" && picked && (
        <div className="fg-trail">
          <button type="button" className="fg-trail-chip" onClick={editDay}>
            <Check size={13} strokeWidth={2.5} />
            <span>{picked.label}</span>
            <Pencil size={12} strokeWidth={2.25} className="fg-trail-edit" />
          </button>
          {step === "channels" && (
            <button
              type="button"
              className="fg-trail-chip"
              onClick={() => setStep("angles")}
            >
              <Check size={13} strokeWidth={2.5} />
              <span>{t("trail.editAngle")}</span>
              <Pencil size={12} strokeWidth={2.25} className="fg-trail-edit" />
            </button>
          )}
        </div>
      )}

      {/* ---------- Opener: gedetecteerde dagen (rustige eerst) ---------- */}
      {step === "opener" &&
        (loading ? (
          <div className="fg-loading">{t("opener.loading")}</div>
        ) : (
          <>
            <div className="fg-group-label">
              <TrendingDown size={13} strokeWidth={2.25} />
              {t("opener.quietDays")}
              {hasOccupancyData
                ? t("opener.belowThreshold", { threshold: occupancyThreshold })
                : ""}
            </div>
            {hasOccupancyData && availableQuiet.length > 0 ? (
              <div className="fg-options">
                {quietToShow.map((d) => {
                  const sel = openerHas(d.date);
                  return (
                    <button
                      key={`low-${d.date}`}
                      type="button"
                      className={`fg-opt${sel ? " sel" : ""}`}
                      onClick={() =>
                        toggleOpenerDay({
                          date: d.date,
                          kind: "low_occupancy",
                          label: `${formatDayNl(d.date, localeTag)} · ${d.occupancy_pct}% bezet`,
                        })
                      }
                    >
                      <span className="fg-opt-col">
                        <span className="fg-opt-main">
                          {formatDayNl(d.date, localeTag)}
                        </span>
                        <span className="fg-opt-sub-inline">
                          {t("opener.occupied", { pct: d.occupancy_pct })}
                        </span>
                      </span>
                      {sel && <Check size={15} strokeWidth={2.5} />}
                    </button>
                  );
                })}
                {availableQuiet.length > QUIET_DAYS_PREVIEW && (
                  <button
                    type="button"
                    className="fg-more"
                    onClick={() => setShowAllQuiet((v) => !v)}
                  >
                    {showAllQuiet
                      ? t("opener.showLess")
                      : t("opener.showMore", {
                          count:
                            availableQuiet.length - QUIET_DAYS_PREVIEW,
                        })}
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="fg-q">{t("opener.noReservations")}</div>
                <div className="fg-options">
                  {availableOpen.slice(0, 4).map((iso) => {
                    const sel = openerHas(iso);
                    return (
                      <button
                        key={`open-${iso}`}
                        type="button"
                        className={`fg-opt${sel ? " sel" : ""}`}
                        onClick={() =>
                          toggleOpenerDay({
                            date: iso,
                            kind: "low_occupancy",
                            label: formatDayNl(iso, localeTag),
                          })
                        }
                      >
                        <span className="fg-opt-main">
                          {formatDayNl(iso, localeTag)}
                        </span>
                        {sel && <Check size={15} strokeWidth={2.5} />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {availableSpecial.length > 0 && (
              <>
                <div className="fg-group-label" style={{ marginTop: 6 }}>
                  <CalendarDays size={13} strokeWidth={2.25} />
                  {t("opener.specialDays")}
                </div>
                <div className="fg-options">
                  {availableSpecial.map((s) => {
                    const sel = openerHas(s.date);
                    return (
                      <button
                        key={`special-${s.date}`}
                        type="button"
                        className={`fg-opt${sel ? " sel" : ""}`}
                        onClick={() =>
                          toggleOpenerDay({
                            date: s.date,
                            kind: "special_day",
                            name: s.name,
                            label: `${s.name} · ${formatDayNl(s.date, localeTag)}`,
                          })
                        }
                      >
                        <span className="fg-opt-col">
                          <span className="fg-opt-main">
                            {s.emoji} {s.name}
                          </span>
                          <span className="fg-opt-sub-inline">
                            {formatDayNl(s.date, localeTag)}
                          </span>
                        </span>
                        {sel && <Check size={15} strokeWidth={2.5} />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <div className="fg-group-label" style={{ marginTop: 6 }}>
              <CalendarDays size={13} strokeWidth={2.25} />
              {t("opener.pickOwnDay")}
            </div>
            <input
              type="date"
              className="fg-input"
              min={minDayIso}
              onChange={(e) => pickAnyDay(e.target.value)}
            />

            {/* Verder met de aangevinkte dagen. Pas actief zodra er minstens
                één dag gekozen is; het aantal staat in het label zodat de
                eigenaar ziet hoeveel concepten 'ie gaat maken. */}
            <button
              type="button"
              className="ui-btn ui-btn--primary ui-btn--sm fg-next"
              onClick={startQueue}
              disabled={openerDays.length === 0}
            >
              {openerDays.length > 1
                ? t("opener.continueMulti", { count: openerDays.length })
                : t("opener.continue")}
            </button>
          </>
        ))}

      {/* ---------- Hoeken voor de gekozen dag ---------- */}
      {step === "angles" &&
        (loadingContext || (initialDate && !autoStarted) ? (
          <div className="fg-loading">{t("angles.loading")}</div>
        ) : (
          <>
            <div className="fg-q">
              {t("angles.question", {
                day: picked ? picked.label : t("angles.thatDay"),
              })}
            </div>

            <button
              type="button"
              className="fg-opt fg-opt--feature"
              onClick={() => commitCurrentDay(true)}
            >
              <span className="fg-opt-main">
                <Wand2 size={15} strokeWidth={2.25} /> {t("angles.fillyChoose")}
              </span>
              <span className="fg-opt-sub">{t("angles.fastest")}</span>
            </button>

            {/* Eigen-campagne-spoor: zelfde breedte/feature-stijl als de
                Filly-kaart. Geen uitklap-veld; selecteren + Verder stuurt
                naar de "maak eigen campagne"-builder. Alleen bij een enkele
                dag: in een multi-dag-batch zou de redirect de wachtrij
                afbreken, dus dan verbergen we 'm. */}
            {batchTotal <= 1 && (
              <button
                type="button"
                className={`fg-opt fg-opt--feature${buildOwn ? " sel" : ""}`}
                onClick={() => {
                  setBuildOwn((cur) => !cur);
                  setSelectedAngle(null);
                }}
              >
                <span className="fg-opt-main">
                  <Pencil size={15} strokeWidth={2.25} /> {t("angles.buildOwn")}
                </span>
                {buildOwn && <Check size={15} strokeWidth={2.5} />}
              </button>
            )}

            {contextOptions.length > 0 && (
              <>
                <div className="fg-group-label" style={{ marginTop: 6 }}>
                  {t("angles.whatsHappening")}
                </div>
                <div className="fg-options">
                  {contextOptions.map((o) => {
                    const sel = selectedContext.has(o.id);
                    return (
                      <button
                        key={o.id}
                        type="button"
                        className={`fg-opt${sel ? " sel" : ""}`}
                        onClick={() =>
                          setSelectedContext((s) => toggle(s, o.id))
                        }
                      >
                        <span className="fg-opt-main">{o.label}</span>
                        {sel && <Check size={15} strokeWidth={2.5} />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <div className="fg-group-label" style={{ marginTop: 6 }}>
              {t("angles.pickAngle")}
            </div>
            <div className="fg-options">
              {ANGLES.map(({ id, Icon, hasInput }) => {
                const sel = selectedAngle === id;
                return (
                  <div key={id}>
                    <button
                      type="button"
                      className={`fg-opt${sel ? " sel" : ""}`}
                      onClick={() => {
                        setSelectedAngle((cur) => (cur === id ? null : id));
                        setBuildOwn(false);
                      }}
                    >
                      <span className="fg-opt-main">
                        <Icon size={15} strokeWidth={2.25} />{" "}
                        {t(`angles.options.${id}.label`)}
                      </span>
                      {sel && <Check size={15} strokeWidth={2.5} />}
                    </button>
                    {sel && hasInput && (
                      <input
                        type="text"
                        className="fg-input"
                        placeholder={t(`angles.options.${id}.placeholder`)}
                        value={angleText[id] ?? ""}
                        onChange={(e) => setAngleTextFor(id, e.target.value)}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              className="ui-btn ui-btn--primary ui-btn--sm fg-next"
              onClick={() => {
                if (buildOwn) {
                  // Eigen-campagne-spoor: naar de builder op de campagnes-
                  // pagina (opent daar de "maak eigen campagne"-modal).
                  router.push("/dashboard/campagnes?nieuw=eigen");
                  return;
                }
                setStep("channels");
              }}
            >
              {t("angles.next")}
            </button>
          </>
        ))}

      {/* ---------- Kanalen ---------- */}
      {step === "channels" && (
        <>
          <div className="fg-q">
            {dayContext && dayContext.channels.length > 0
              ? t("channels.question")
              : t("channels.autoQuestion")}
          </div>
          {dayContext && dayContext.channels.length > 0 && (
            <div className="fg-options">
              {dayContext.channels.map((c) => {
                const sel = selectedChannels.has(c.channel);
                return (
                  <button
                    key={c.channel}
                    type="button"
                    className={`fg-opt${sel ? " sel" : ""}`}
                    onClick={() =>
                      setSelectedChannels((s) => toggle(s, c.channel))
                    }
                  >
                    <span className="fg-opt-col">
                      <span className="fg-opt-main">{c.label}</span>
                      <span className="fg-opt-sub-inline">{c.note}</span>
                    </span>
                    {sel && <Check size={15} strokeWidth={2.5} />}
                  </button>
                );
              })}
            </div>
          )}
          <button
            type="button"
            className="ui-btn ui-btn--primary ui-btn--sm fg-next"
            onClick={() => commitCurrentDay(false)}
            disabled={
              !!dayContext &&
              dayContext.channels.length > 0 &&
              selectedChannels.size === 0
            }
          >
            {queue.length > 0
              ? t("channels.nextDay")
              : batchTotal > 1
                ? t("channels.makeBatch", { count: batchTotal })
                : t("channels.makeAction")}
          </button>
        </>
      )}

      {/* role="alert" → screenreader kondigt de fout/"geen resultaat"-
          melding direct aan (impliceert aria-live="assertive"). */}
      {error && (
        <div className="fg-error" role="alert">
          {error}
        </div>
      )}

      <div className="fg-hint">
        <Sparkles size={12} strokeWidth={2.25} />
        {t("hint.typeOwn")}
      </div>
    </div>
  );
}
