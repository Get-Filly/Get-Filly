"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  CalendarDays,
  TrendingDown,
  Check,
  Pencil,
} from "lucide-react";
import {
  fetchDayContext,
  generateSuggestionsForDates,
  type DayContext,
  type GenerateForDatesItem,
} from "../../../lib/api";
import { useActionableDays } from "../../../lib/use-actionable-days";
import { logger } from "@/lib/logger";

// ============================================================
// FillyGuidedFlow — geleide on-ramp in de lege chat-staat
// ============================================================
//
// Filly stelt stap voor stap een vraag met aanklikbare antwoorden:
//   1. Welke dag?      (rustige dagen onder drempel + speciale dagen)
//   2. Waarop inspelen? (events in de buurt + weer — vóórgeselecteerd,
//                         alleen als er iets ís)
//   3. Welke kanalen?   (op basis van bereik vóórgevinkt, eigenaar
//                         past aan)
// Pas bij "Maak de actie" draait de AI (generate-for-dates), met de
// gekozen kanalen + context als sturing. Resultaat verschijnt op
// /campagnes. Beantwoorde stappen blijven als chip staan met "wijzig".
// Wie liever typt gebruikt het tekstveld eronder (escape hatch).

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

type ContextOption = { id: string; label: string; hint: string };

// Bouwt de aanklikbare context-opties (events + weer) uit de
// day-context. label = wat de eigenaar ziet, hint = wat we als
// sturing naar de generatie sturen.
function buildContextOptions(ctx: DayContext | null): ContextOption[] {
  if (!ctx) return [];
  const opts: ContextOption[] = [];
  for (const e of ctx.events) {
    opts.push({
      id: `ev-${e.name}-${e.distanceKm}`,
      label: `${e.name} · ${e.distanceKm} km`,
      hint: `${e.name} (${e.category}, ${e.distanceKm} km)`,
    });
  }
  if (ctx.weather) {
    opts.push({
      id: "weather",
      label: `${ctx.weather.icon} ${ctx.weather.description}, ${ctx.weather.tempMax}°`,
      hint: `Weer die dag: ${ctx.weather.description}, ${ctx.weather.tempMin}–${ctx.weather.tempMax}°`,
    });
  }
  return opts;
}

type Step = "day" | "context" | "channels" | "generating";

export function FillyGuidedFlow() {
  const router = useRouter();
  const { lowOccupancyDays, specialDays, occupancyThreshold, loading } =
    useActionableDays();

  const [step, setStep] = useState<Step>("day");
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

  const hasDays = lowOccupancyDays.length + specialDays.length > 0;
  const quietToShow = showAllQuiet
    ? lowOccupancyDays
    : lowOccupancyDays.slice(0, QUIET_DAYS_PREVIEW);
  const contextOptions = useMemo(
    () => buildContextOptions(dayContext),
    [dayContext],
  );

  // Stap 1 → kies een dag, haal day-context op, ga naar stap 2 (of
  // direct naar 3 als er geen context is). Context-fetch is fail-soft:
  // mislukt 'ie, dan slaan we stap 2 over.
  const pickDay = async (day: PickedDay) => {
    setPicked(day);
    setError(null);
    setLoadingContext(true);
    setStep("context");
    try {
      const ctx = await fetchDayContext(day.date);
      setDayContext(ctx);
      const opts = buildContextOptions(ctx);
      setSelectedContext(new Set(opts.map((o) => o.id)));
      setSelectedChannels(
        new Set(
          ctx.channels.filter((c) => c.recommended).map((c) => c.channel),
        ),
      );
      if (opts.length === 0) setStep("channels");
    } catch (e) {
      logger.error(e);
      setDayContext(null);
      setStep("channels");
    } finally {
      setLoadingContext(false);
    }
  };

  const toggle = (set: Set<string>, key: string): Set<string> => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
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
    const contextHints = contextOptions
      .filter((o) => selectedContext.has(o.id))
      .map((o) => o.hint);
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
      await generateSuggestionsForDates([item]);
      router.push("/dashboard/campagnes");
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
            {step === "day" && hasDays
              ? "Ik zie een paar dagen waar een actie kan helpen. Voor welke dag zal ik iets bedenken?"
              : step === "day"
                ? "Geen rustige of speciale dagen in zicht op dit moment — typ hieronder gerust zelf wat je wilt, dan denk ik mee."
                : "We maken samen een actie. Beantwoord de vragen of pas een eerdere stap aan."}
          </div>
        </div>
      </div>

      {/* Antwoordspoor: beantwoorde stappen als chip met "wijzig". */}
      {picked && step !== "day" && (
        <div className="fg-trail">
          <button type="button" className="fg-trail-chip" onClick={editDay}>
            <Check size={13} strokeWidth={2.5} />
            <span>{picked.label}</span>
            <Pencil size={12} strokeWidth={2.25} className="fg-trail-edit" />
          </button>
          {step === "channels" && contextOptions.length > 0 && (
            <button
              type="button"
              className="fg-trail-chip"
              onClick={() => setStep("context")}
            >
              <Check size={13} strokeWidth={2.5} />
              <span>
                {selectedContext.size > 0
                  ? `${selectedContext.size}× inspelen op`
                  : "Geen extra thema"}
              </span>
              <Pencil size={12} strokeWidth={2.25} className="fg-trail-edit" />
            </button>
          )}
        </div>
      )}

      {/* ---------- Stap 1: dag ---------- */}
      {step === "day" &&
        (loading ? (
          <div className="fg-loading">
            Even kijken welke dagen kansrijk zijn…
          </div>
        ) : (
          hasDays && (
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
          )
        ))}

      {/* ---------- Stap 2: context (events + weer) ---------- */}
      {step === "context" &&
        (loadingContext ? (
          <div className="fg-loading">Filly kijkt wat er die dag speelt…</div>
        ) : (
          <>
            <div className="fg-q">Die dag speelt er wat — waarop inspelen?</div>
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
            <button
              type="button"
              className="ui-btn ui-btn--primary ui-btn--sm fg-next"
              onClick={() => setStep("channels")}
            >
              Verder
            </button>
          </>
        ))}

      {/* ---------- Stap 3: kanalen ---------- */}
      {step === "channels" && (
        <>
          <div className="fg-q">
            {dayContext && dayContext.channels.length > 0
              ? "Op welke kanalen? Ik heb de kansrijkste vast aangevinkt."
              : "Ik kies zelf het beste kanaal — zal ik 'm maken?"}
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
