"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, CalendarDays, TrendingDown } from "lucide-react";
import {
  generateSuggestionsForDates,
  type GenerateForDatesItem,
} from "../../../lib/api";
import { useActionableDays } from "../../../lib/use-actionable-days";
import { logger } from "@/lib/logger";

// ============================================================
// FillyGuidedFlow — geleide on-ramp in de lege chat-staat (fase 1)
// ============================================================
//
// In plaats van een leeg vlak begint Filly met een vraag: "Voor welke
// dag zal ik iets bedenken?" met aanklikbare antwoorden — de rustige
// dagen (onder de eigenaar-drempel) en speciale dagen die er nu zijn.
// Eén tik genereert het voorstel via het bestaande generate-for-dates
// endpoint en brengt de eigenaar naar /campagnes waar het voorstel
// verschijnt — exact de route die de "Vraag Filly om voorstellen"-
// popover ook gebruikt.
//
// Fase 1 = alleen stap 1 (dag) → genereer. De vervolgstappen
// (context bevestigen, kanalen voorvinken) komen in fase 2; daarvoor
// breiden we generate-for-dates uit. Wie liever zelf typt gebruikt
// gewoon het tekstveld eronder (escape hatch, door de orchestrator
// gerenderd).

// Hoeveel rustige dagen we standaard tonen vóór de "meer"-knop. Houdt
// de lijst behapbaar; speciale dagen zijn er meestal weinig, die tonen
// we allemaal.
const QUIET_DAYS_PREVIEW = 4;

function formatDayNl(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function FillyGuidedFlow() {
  const router = useRouter();
  const { lowOccupancyDays, specialDays, occupancyThreshold, loading } =
    useActionableDays();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllQuiet, setShowAllQuiet] = useState(false);

  const hasDays = lowOccupancyDays.length + specialDays.length > 0;
  const quietToShow = showAllQuiet
    ? lowOccupancyDays
    : lowOccupancyDays.slice(0, QUIET_DAYS_PREVIEW);

  const pickDay = async (item: GenerateForDatesItem) => {
    if (generating) return;
    setGenerating(true);
    setError(null);
    try {
      await generateSuggestionsForDates([item]);
      // Voorstel staat nu klaar in de voorstellen-strip op /campagnes.
      router.push("/dashboard/campagnes");
    } catch (e) {
      logger.error(e);
      setError(
        e instanceof Error
          ? e.message
          : "Voorstel maken lukte niet. Probeer 't zo opnieuw.",
      );
      setGenerating(false);
    }
  };

  // Tijdens het genereren: rustige tussenstaat zodat de eigenaar weet
  // dat 'ie even moet wachten (de AI-call duurt enkele seconden).
  if (generating) {
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
            {hasDays
              ? "Ik zie een paar dagen waar een actie kan helpen. Voor welke dag zal ik iets bedenken?"
              : "Geen rustige of speciale dagen in zicht op dit moment — typ hieronder gerust zelf wat je wilt, dan denk ik mee."}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="fg-loading">Even kijken welke dagen kansrijk zijn…</div>
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
                  pickDay({ date: d.date, kind: "low_occupancy" })
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
      )}

      {error && <div className="fg-error">{error}</div>}

      <div className="fg-hint">
        <Sparkles size={12} strokeWidth={2.25} />
        Of typ hieronder zelf een vraag
      </div>
    </div>
  );
}
