"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  CalendarDays,
  TrendingDown,
  MapPin,
  Cloud,
  UtensilsCrossed,
  Lightbulb,
  Check,
  Pencil,
  ChevronRight,
} from "lucide-react";
import {
  fetchDayContext,
  generateSuggestionsForDates,
  type ActiveActionDelta,
  type AiSuggestion,
  type DayContext,
  type GenerateForDatesItem,
} from "../../../lib/api";
import { useActionableDays } from "../../../lib/use-actionable-days";
import { logger } from "@/lib/logger";

// ============================================================
// FillyGuidedFlow — hoek-eerste geleide flow (redesign 2026-06-13)
// ============================================================
//
// Stappen:
//   1. "hooks"   — Waar wil je op inspelen? Zes combineerbare hoeken
//                  (rustige dag, speciale dag, event, weer, gerecht, iets
//                  anders). Gerecht/anders openen een vrij tekstveld dat
//                  voorgaat.
//   2. "day"     — Voor welke dag? (rustige + speciale dagen als snelle
//                  keuze + een datumveld voor elke andere dag.)
//   3. "context" — Alléén als event/weer gekozen is: de relevante
//                  aanknopingen bevestigen. Anders overgeslagen (geen
//                  vaste events+weer-lijst meer).
//   4. "channels"— Op welke kanalen? Niets vooraf aangevinkt.
//   5. genereren → resultaat inline.
//
// Een getypt verzoek met al een datum (initialDate) slaat de hoek-stap
// over en springt naar de dag/context/kanalen, zodat typen snel blijft.

const QUIET_DAYS_PREVIEW = 4;

function formatDayNl(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("nl-NL", {
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

type ContextOption = { id: string; label: string; hint: string; kind: "event" | "weer" };

// Bouwt de aanklikbare context-opties (events + weer) uit de day-context.
// We taggen ze met kind zodat we ze kunnen filteren op de gekozen hoeken
// (alleen events tonen als 'event' gekozen is, enz.).
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
  | "hooks"
  | "day"
  | "context"
  | "channels"
  | "generating"
  | "done";

type Hook = "rustige_dag" | "speciale_dag" | "event" | "weer" | "gerecht" | "anders";

const HOOKS: { id: Hook; label: string; Icon: typeof MapPin }[] = [
  { id: "rustige_dag", label: "Rustige dag", Icon: TrendingDown },
  { id: "speciale_dag", label: "Speciale dag", Icon: CalendarDays },
  { id: "event", label: "Event in de buurt", Icon: MapPin },
  { id: "weer", label: "Het weer", Icon: Cloud },
  { id: "gerecht", label: "Gerecht uitlichten", Icon: UtensilsCrossed },
  { id: "anders", label: "Iets anders", Icon: Lightbulb },
];

const CHANNEL_LABEL: Record<string, string> = {
  mail: "Mail",
  social: "Social",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  google_business: "Google Business",
};

// initialDate / initialTopic: voorgevuld uit de lopende actie (active_action)
// of een getypt verzoek. initialDate gezet → hoek-stap overslaan.
// onActionChange: keuzes terugmelden naar active_action (zie audit #8).
export function FillyGuidedFlow({
  initialDate,
  initialTopic,
  onActionChange,
}: {
  initialDate?: string;
  initialTopic?: string;
  onActionChange?: (delta: ActiveActionDelta) => void;
}) {
  const router = useRouter();
  const {
    lowOccupancyDays,
    specialDays,
    occupancyThreshold,
    loading,
    upcomingOpenDays,
    hasOccupancyData,
  } = useActionableDays();

  // Met een voorgevulde datum slaan we de detectie-opener over (typen
  // blijft snel). Anders begint de flow bij de detectie-gedreven opener.
  const [step, setStep] = useState<Step>(initialDate ? "day" : "opener");
  const [autoStarted, setAutoStarted] = useState(false);
  const [hooks, setHooks] = useState<Set<Hook>>(new Set());
  const [dish, setDish] = useState("");
  // Vrij "iets anders"-veld; geseed met een eventueel getypt thema.
  const [customReason, setCustomReason] = useState(initialTopic ?? "");
  const [picked, setPicked] = useState<PickedDay | null>(null);
  const [dayContext, setDayContext] = useState<DayContext | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [selectedContext, setSelectedContext] = useState<Set<string>>(
    new Set(),
  );
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(
    new Set(),
  );
  const [error, setError] = useState<string | null>(null);
  const [showAllQuiet, setShowAllQuiet] = useState(false);
  const [result, setResult] = useState<AiSuggestion[]>([]);

  const hasDays = lowOccupancyDays.length + specialDays.length > 0;
  const quietToShow = showAllQuiet
    ? lowOccupancyDays
    : lowOccupancyDays.slice(0, QUIET_DAYS_PREVIEW);
  const contextOptions = useMemo(
    () => buildContextOptions(dayContext),
    [dayContext],
  );

  // Morgen als vroegste kies-datum (een actie voor vandaag kan niet meer).
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

  // Het door de eigenaar opgegeven thema (gerecht en/of vrije wens).
  const topicText = [dish.trim(), customReason.trim()]
    .filter(Boolean)
    .join(", ");

  // Hoek-stap afronden → naar de dag-keuze. Thema (gerecht/wens) vast-
  // leggen in de lopende actie.
  const confirmHooks = () => {
    if (hooks.size === 0) return;
    setError(null);
    onActionChange?.(
      topicText ? { topic: topicText, step: "day" } : { step: "day" },
    );
    setStep("day");
  };

  // Dag kiezen → day-context ophalen → context-stap (alleen bij event/weer)
  // of direct kanalen. persist=false bij auto-start vanuit een bestaande
  // datum (die zit al in active_action).
  const pickDay = async (day: PickedDay, persist = true) => {
    setPicked(day);
    setError(null);
    setLoadingContext(true);
    setStep("context");
    if (persist) onActionChange?.({ date: day.date, step: "context" });
    try {
      const ctx = await fetchDayContext(day.date);
      setDayContext(ctx);
      // Context-hints (events/weer) staan standaard uit; de eigenaar kiest
      // bewust waarop 'ie wil inspelen.
      setSelectedContext(new Set());
      // Kanalen: Filly vinkt de AANBEVOLEN kanalen alvast aan (autonomer,
      // Floris-feedback 2026-06-13) — de eigenaar kan aanpassen.
      setSelectedChannels(
        new Set(
          ctx.channels.filter((c) => c.recommended).map((c) => c.channel),
        ),
      );
      // Toon wat er díe dag speelt (events/weer) zodra er iets is; anders
      // meteen door naar de kanalen.
      if (buildContextOptions(ctx).length === 0) setStep("channels");
    } catch (e) {
      logger.error(e);
      setDayContext(null);
      setStep("channels");
    } finally {
      setLoadingContext(false);
    }
  };

  const pickAnyDay = (iso: string) => {
    if (!iso) return;
    void pickDay({
      date: iso,
      kind: hooks.has("speciale_dag") ? "special_day" : "low_occupancy",
      label: formatDayNl(iso),
    });
  };

  // Voorgevulde datum (getypt verzoek): classificeer + spring naar de
  // dag-bevestiging, hoek-stap overgeslagen.
  useEffect(() => {
    if (!initialDate || autoStarted || loading) return;
    setAutoStarted(true);
    const special = specialDays.find((s) => s.date === initialDate);
    const low = lowOccupancyDays.find((d) => d.date === initialDate);
    const day: PickedDay = special
      ? {
          date: initialDate,
          kind: "special_day",
          name: special.name,
          label: `${special.name} · ${formatDayNl(initialDate)}`,
        }
      : low
        ? {
            date: initialDate,
            kind: "low_occupancy",
            label: `${formatDayNl(initialDate)} · ${low.occupancy_pct}% bezet`,
          }
        : {
            date: initialDate,
            kind: "low_occupancy",
            label: formatDayNl(initialDate),
          };
    void pickDay(day, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDate, loading, autoStarted]);

  const editHooks = () => {
    setStep("hooks");
    setPicked(null);
    setDayContext(null);
    setSelectedContext(new Set());
    setSelectedChannels(new Set());
  };

  const editDay = () => {
    setStep("day");
    setPicked(null);
    setDayContext(null);
    setSelectedContext(new Set());
    setSelectedChannels(new Set());
  };

  // Laatste stap → genereer met de verzamelde keuzes.
  const generate = async () => {
    if (!picked) return;
    setStep("generating");
    setError(null);
    onActionChange?.({ channels: [...selectedChannels], step: "generating" });
    const contextHints = [
      ...(dish.trim() ? [`Centraal gerecht: ${dish.trim()}`] : []),
      ...(customReason.trim() ? [`Wens van de eigenaar: ${customReason.trim()}`] : []),
      ...contextOptions
        .filter((o) => selectedContext.has(o.id))
        .map((o) => o.hint),
    ];
    const item: GenerateForDatesItem = {
      date: picked.date,
      kind: picked.kind,
      ...(picked.name ? { name: picked.name } : {}),
      ...(selectedChannels.size > 0
        ? { channels: [...selectedChannels] }
        : {}),
      ...(contextHints.length > 0 ? { context: contextHints } : {}),
    };
    try {
      const { suggestions } = await generateSuggestionsForDates([item]);
      if (!suggestions || suggestions.length === 0) {
        router.push("/dashboard/campagnes");
        return;
      }
      setResult(suggestions);
      setStep("done");
      onActionChange?.({ step: "done" });
    } catch (e) {
      logger.error(e);
      setError(
        e instanceof Error
          ? e.message
          : "Voorstel maken lukte niet. Probeer 't zo opnieuw.",
      );
      setStep("channels");
    }
  };

  // Verse actie: alles leeg, terug naar de hoek-stap. active_action
  // leegmaken (maar non-null op step 'day') zodat het paneel blijft staan.
  const restart = () => {
    setStep("opener");
    setHooks(new Set());
    setDish("");
    setCustomReason("");
    setPicked(null);
    setDayContext(null);
    setSelectedContext(new Set());
    setSelectedChannels(new Set());
    setResult([]);
    setError(null);
    onActionChange?.({ date: null, topic: null, channels: null, step: "day" });
  };

  // ---------- Klaar: resultaat inline tonen ----------
  if (step === "done") {
    return (
      <div className="filly-guided">
        <div className="fg-welcome">
          <span className="fg-avatar">F</span>
          <div>
            <div className="fg-welcome-title">Klaar! ✨</div>
            <div className="fg-welcome-text">
              {result.length > 1
                ? `Ik heb ${result.length} voorstellen voor je klaargezet.`
                : "Ik heb een voorstel voor je klaargezet."}
            </div>
          </div>
        </div>

        <div className="fg-options">
          {result.map((s) => {
            const sc = s.suggested_campaign;
            const body = sc.body ?? sc.variants?.[0]?.body ?? "";
            const channelLabels =
              sc.channels && sc.channels.length > 0
                ? sc.channels.map(
                    (c) => CHANNEL_LABEL[c.platform] ?? c.platform,
                  )
                : [CHANNEL_LABEL[sc.platform ?? sc.type ?? ""] ?? ""].filter(
                    Boolean,
                  );
            return (
              <div key={s.id} className="fg-result">
                <div className="fg-result-head">
                  <span className="fg-result-name">
                    {sc.name ?? "Voorstel"}
                  </span>
                  <span className="fg-result-channels">
                    {channelLabels.map((l) => (
                      <span key={l} className="fg-result-channel">
                        {l}
                      </span>
                    ))}
                  </span>
                </div>
                {body && <div className="fg-result-body">{body}</div>}
                <button
                  type="button"
                  className="ui-btn ui-btn--primary ui-btn--sm fg-result-btn"
                  onClick={() =>
                    router.push(`/dashboard/campagnes/voorstel/${s.id}`)
                  }
                >
                  Bekijken &amp; aanpassen →
                </button>
              </div>
            );
          })}
        </div>

        <div className="fg-done-actions">
          <button type="button" className="fg-more" onClick={restart}>
            ＋ Nog een actie
          </button>
          <button
            type="button"
            className="fg-more"
            onClick={() => router.push("/dashboard/campagnes")}
          >
            Alle voorstellen →
          </button>
        </div>
      </div>
    );
  }

  // ---------- Genereren: rustige tussenstaat ----------
  if (step === "generating") {
    return (
      <div className="filly-guided">
        <div className="fg-welcome">
          <span className="fg-avatar">F</span>
          <div className="fg-welcome-text">Filly maakt je voorstel…</div>
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
          <div className="fg-welcome-title">Waar kan ik je mee helpen?</div>
          <div className="fg-welcome-text">
            {step === "opener"
              ? "Ik heb een paar dagen gedetecteerd. Voor welke dag wil je een uiting maken?"
              : step === "hooks"
                ? "Waar wil je op inspelen? Combineer gerust meerdere."
                : "Beantwoord de vragen of pas een eerdere stap aan."}
          </div>
        </div>
      </div>

      {/* Antwoordspoor: beantwoorde stappen als chip met "wijzig". */}
      {step !== "opener" && step !== "hooks" && (hooks.size > 0 || picked) && (
        <div className="fg-trail">
          {hooks.size > 0 && (
            <button
              type="button"
              className="fg-trail-chip"
              onClick={editHooks}
            >
              <Check size={13} strokeWidth={2.5} />
              <span>
                {HOOKS.filter((h) => hooks.has(h.id))
                  .map((h) => h.label.toLowerCase())
                  .join(", ")}
              </span>
              <Pencil size={12} strokeWidth={2.25} className="fg-trail-edit" />
            </button>
          )}
          {picked && step !== "day" && (
            <button type="button" className="fg-trail-chip" onClick={editDay}>
              <Check size={13} strokeWidth={2.5} />
              <span>{picked.label}</span>
              <Pencil size={12} strokeWidth={2.25} className="fg-trail-edit" />
            </button>
          )}
        </div>
      )}

      {/* ---------- Opener: gedetecteerde kansen (rustige dagen eerst) ---------- */}
      {step === "opener" &&
        (loading ? (
          <div className="fg-loading">Even kijken welke kansen er zijn…</div>
        ) : (
          <>
            <div className="fg-group-label">
              <TrendingDown size={13} strokeWidth={2.25} />
              Rustige dagen
            </div>
            {hasOccupancyData && lowOccupancyDays.length > 0 ? (
              <div className="fg-options">
                {quietToShow.map((d) => (
                  <button
                    key={`low-${d.date}`}
                    type="button"
                    className="fg-opt"
                    onClick={() =>
                      pickDay({
                        date: d.date,
                        kind: "low_occupancy",
                        label: `${formatDayNl(d.date)} · ${d.occupancy_pct}% bezet`,
                      })
                    }
                  >
                    <span className="fg-opt-main">{formatDayNl(d.date)}</span>
                    <span className="fg-opt-sub">{d.occupancy_pct}% bezet</span>
                  </button>
                ))}
                {lowOccupancyDays.length > QUIET_DAYS_PREVIEW && (
                  <button
                    type="button"
                    className="fg-more"
                    onClick={() => setShowAllQuiet((v) => !v)}
                  >
                    {showAllQuiet
                      ? "Minder tonen"
                      : `+ ${lowOccupancyDays.length - QUIET_DAYS_PREVIEW} meer rustige dagen`}
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="fg-q">
                  Er staan nog geen reserveringen, dus elke open dag is rustig.
                </div>
                <div className="fg-options">
                  {upcomingOpenDays.slice(0, 4).map((iso) => (
                    <button
                      key={`open-${iso}`}
                      type="button"
                      className="fg-opt"
                      onClick={() =>
                        pickDay({
                          date: iso,
                          kind: "low_occupancy",
                          label: formatDayNl(iso),
                        })
                      }
                    >
                      <span className="fg-opt-main">{formatDayNl(iso)}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {specialDays.length > 0 && (
              <>
                <div className="fg-group-label" style={{ marginTop: 6 }}>
                  <CalendarDays size={13} strokeWidth={2.25} />
                  Speciale dagen
                </div>
                <div className="fg-options">
                  {specialDays.map((s) => (
                    <button
                      key={`special-${s.date}`}
                      type="button"
                      className="fg-opt"
                      onClick={() =>
                        pickDay({
                          date: s.date,
                          kind: "special_day",
                          name: s.name,
                          label: `${s.name} · ${formatDayNl(s.date)}`,
                        })
                      }
                    >
                      <span className="fg-opt-main">
                        {s.emoji} {s.name}
                      </span>
                      <span className="fg-opt-sub">{formatDayNl(s.date)}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="fg-group-label" style={{ marginTop: 6 }}>
              <CalendarDays size={13} strokeWidth={2.25} />
              Of kies zelf een dag
            </div>
            <input
              type="date"
              className="fg-input"
              min={minDayIso}
              onChange={(e) => pickAnyDay(e.target.value)}
            />

            <button
              type="button"
              className="fg-opt"
              style={{ marginTop: 6 }}
              onClick={() => setStep("hooks")}
            >
              <span className="fg-opt-main">
                <Lightbulb size={15} strokeWidth={2.25} /> Iets anders (event,
                weer, gerecht…)
              </span>
              <ChevronRight size={16} strokeWidth={2.25} />
            </button>
          </>
        ))}

      {/* ---------- Stap 1: hoeken (achter "iets anders") ---------- */}
      {step === "hooks" && (
        <>
          <div className="fg-options">
            {HOOKS.map(({ id, label, Icon }) => {
              const sel = hooks.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  className={`fg-opt${sel ? " sel" : ""}`}
                  onClick={() => setHooks((s) => toggle(s, id))}
                >
                  <span className="fg-opt-col">
                    <span className="fg-opt-main">
                      <Icon size={15} strokeWidth={2.25} /> {label}
                    </span>
                  </span>
                  {sel && <Check size={15} strokeWidth={2.5} />}
                </button>
              );
            })}
          </div>

          {hooks.has("gerecht") && (
            <input
              type="text"
              className="fg-input"
              placeholder="Welk gerecht of drankje? (bijv. Burrata di Puglia)"
              value={dish}
              onChange={(e) => setDish(e.target.value)}
            />
          )}
          {hooks.has("anders") && (
            <input
              type="text"
              className="fg-input"
              placeholder="Waar denk je zelf aan? Typ het hier"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
            />
          )}

          <button
            type="button"
            className="ui-btn ui-btn--primary ui-btn--sm fg-next"
            onClick={confirmHooks}
            disabled={hooks.size === 0}
          >
            Verder
          </button>
        </>
      )}

      {/* ---------- Stap 2: dag ---------- */}
      {step === "day" &&
        (loading || (initialDate && !autoStarted) ? (
          <div className="fg-loading">
            {initialDate && !autoStarted
              ? "Moment, ik zet 'm voor je klaar…"
              : "Even kijken welke dagen kansrijk zijn…"}
          </div>
        ) : (
          <>
            <div className="fg-q">Voor welke dag?</div>
            <div className="fg-options">
              {quietToShow.length > 0 && (
                <div className="fg-group-label">
                  <TrendingDown size={13} strokeWidth={2.25} />
                  Rustige dagen (onder {occupancyThreshold}%)
                </div>
              )}
              {quietToShow.map((d) => (
                <button
                  key={`low-${d.date}`}
                  type="button"
                  className="fg-opt"
                  onClick={() =>
                    pickDay({
                      date: d.date,
                      kind: "low_occupancy",
                      label: `${formatDayNl(d.date)} · ${d.occupancy_pct}% bezet`,
                    })
                  }
                >
                  <span className="fg-opt-main">{formatDayNl(d.date)}</span>
                  <span className="fg-opt-sub">{d.occupancy_pct}% bezet</span>
                </button>
              ))}
              {lowOccupancyDays.length > QUIET_DAYS_PREVIEW && (
                <button
                  type="button"
                  className="fg-more"
                  onClick={() => setShowAllQuiet((v) => !v)}
                >
                  {showAllQuiet
                    ? "Minder tonen"
                    : `+ ${lowOccupancyDays.length - QUIET_DAYS_PREVIEW} meer rustige dagen`}
                </button>
              )}

              {specialDays.length > 0 && (
                <div className="fg-group-label" style={{ marginTop: 6 }}>
                  <CalendarDays size={13} strokeWidth={2.25} />
                  Speciale dagen
                </div>
              )}
              {specialDays.map((s) => (
                <button
                  key={`special-${s.date}`}
                  type="button"
                  className="fg-opt"
                  onClick={() =>
                    pickDay({
                      date: s.date,
                      kind: "special_day",
                      name: s.name,
                      label: `${s.name} · ${formatDayNl(s.date)}`,
                    })
                  }
                >
                  <span className="fg-opt-main">
                    {s.emoji} {s.name}
                  </span>
                  <span className="fg-opt-sub">{formatDayNl(s.date)}</span>
                </button>
              ))}
            </div>

            <div className="fg-group-label" style={{ marginTop: 6 }}>
              <CalendarDays size={13} strokeWidth={2.25} />
              Of kies zelf een dag
            </div>
            <input
              type="date"
              className="fg-input"
              min={minDayIso}
              onChange={(e) => pickAnyDay(e.target.value)}
            />
          </>
        ))}

      {/* ---------- Stap 3: context (alleen event/weer) ---------- */}
      {step === "context" &&
        (loadingContext ? (
          <div className="fg-loading">Filly kijkt wat er die dag speelt…</div>
        ) : (
          <>
            <div className="fg-q">Die dag speelt er wat. Waarop wil je inspelen?</div>
            <div className="fg-options">
              {contextOptions.map((o) => {
                const sel = selectedContext.has(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    className={`fg-opt${sel ? " sel" : ""}`}
                    onClick={() => setSelectedContext((s) => toggle(s, o.id))}
                  >
                    <span className="fg-opt-main">{o.label}</span>
                    {sel && <Check size={15} strokeWidth={2.5} />}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="ui-btn ui-btn--primary ui-btn--sm fg-next"
              onClick={() => setStep("channels")}
            >
              Verder
            </button>
          </>
        ))}

      {/* ---------- Stap 4: kanalen ---------- */}
      {step === "channels" && (
        <>
          <div className="fg-q">
            {dayContext && dayContext.channels.length > 0
              ? "Op welke kanalen wil je dit? Kies er minstens één."
              : "Ik kies zelf het beste kanaal. Zal ik 'm maken?"}
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
            onClick={generate}
            disabled={
              !!dayContext &&
              dayContext.channels.length > 0 &&
              selectedChannels.size === 0
            }
          >
            Maak de actie
          </button>
        </>
      )}

      {error && <div className="fg-error">{error}</div>}

      <div className="fg-hint">
        <Sparkles size={12} strokeWidth={2.25} />
        Of typ hieronder zelf een vraag
      </div>
    </div>
  );
}
