"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  type AiSuggestion,
  type DayContext,
  type GenerateForDatesItem,
} from "../../../lib/api";
import { useActionableDays } from "../../../lib/use-actionable-days";
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

type Step = "opener" | "angles" | "channels" | "generating" | "done";

// Altijd-beschikbare hoeken (los van wat er die dag gedetecteerd is).
// placeholder !== undefined → de hoek opent een vrij tekstveld.
const ANGLES: {
  id: string;
  label: string;
  Icon: typeof Tag;
  placeholder?: string;
}[] = [
  {
    id: "gerecht",
    label: "Gerecht of drankje uitlichten",
    Icon: UtensilsCrossed,
    placeholder: "Welk gerecht of drankje? (bijv. Burrata di Puglia)",
  },
  {
    id: "deal",
    label: "Een deal of aanbieding",
    Icon: Tag,
    placeholder: "Wat voor deal? (bijv. 2-gangenmenu € 27,50)",
  },
  { id: "sfeer", label: "Sfeer & beleving", Icon: Sparkles },
  {
    id: "doelgroep",
    label: "Voor een doelgroep",
    Icon: Users,
    placeholder: "Welke doelgroep? (bijv. gezinnen, after-work)",
  },
  {
    id: "anders",
    label: "Iets anders",
    Icon: Pencil,
    placeholder: "Typ je eigen hoek",
  },
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

  const [step, setStep] = useState<Step>(initialDate ? "angles" : "opener");
  const [autoStarted, setAutoStarted] = useState(false);
  const [picked, setPicked] = useState<PickedDay | null>(null);
  const [dayContext, setDayContext] = useState<DayContext | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  // Gedetecteerde aanknopingen (weer/event) die de eigenaar aanvinkt.
  const [selectedContext, setSelectedContext] = useState<Set<string>>(
    new Set(),
  );
  // Altijd-beschikbare hoeken + hun vrije tekst. Een getypt thema
  // (initialTopic) vult de gerecht-hoek alvast voor.
  const [selectedAngles, setSelectedAngles] = useState<Set<string>>(
    initialTopic ? new Set(["gerecht"]) : new Set(),
  );
  const [angleText, setAngleText] = useState<Record<string, string>>(
    initialTopic ? { gerecht: initialTopic } : {},
  );
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(
    new Set(),
  );
  const [error, setError] = useState<string | null>(null);
  const [showAllQuiet, setShowAllQuiet] = useState(false);
  const [result, setResult] = useState<AiSuggestion[]>([]);

  const quietToShow = showAllQuiet
    ? lowOccupancyDays
    : lowOccupancyDays.slice(0, QUIET_DAYS_PREVIEW);
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
      setSelectedChannels(
        new Set(
          ctx.channels.filter((c) => c.recommended).map((c) => c.channel),
        ),
      );
    } catch (e) {
      logger.error(e);
      setDayContext(null);
    } finally {
      setLoadingContext(false);
    }
  };

  const pickAnyDay = (iso: string) => {
    if (!iso) return;
    void pickDay({ date: iso, kind: "low_occupancy", label: formatDayNl(iso) });
  };

  // Voorgevulde datum (getypt verzoek): classificeer + spring naar de
  // hoeken-stap, opener overgeslagen.
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

  // Dag wijzigen → terug naar de opener; gedetecteerde context + kanalen
  // resetten (die zijn dag-specifiek), de gekozen hoeken blijven staan
  // zodat je na een nieuwe dag netjes weer bij dezelfde hoeken uitkomt.
  const editDay = () => {
    setStep("opener");
    setPicked(null);
    setDayContext(null);
    setSelectedContext(new Set());
    setSelectedChannels(new Set());
  };

  const setAngleTextFor = (id: string, value: string) =>
    setAngleText((m) => ({ ...m, [id]: value }));

  // Bouwt de sturing voor de generatie uit gedetecteerde context + hoeken.
  const buildContextHints = (): string[] => {
    const hints = contextOptions
      .filter((o) => selectedContext.has(o.id))
      .map((o) => o.hint);
    if (selectedAngles.has("gerecht")) {
      hints.push(
        `Gerecht uitlichten: ${angleText.gerecht?.trim() || "kies een passend gerecht uit het menu"}`,
      );
    }
    if (selectedAngles.has("deal")) {
      hints.push(
        angleText.deal?.trim()
          ? `Aanbieding/deal: ${angleText.deal.trim()}`
          : "Aanbieding/deal: een aantrekkelijke deal",
      );
    }
    if (selectedAngles.has("sfeer")) hints.push("Insteek: sfeer en beleving");
    if (selectedAngles.has("doelgroep")) {
      hints.push(
        `Doelgroep: ${angleText.doelgroep?.trim() || "de vaste gasten"}`,
      );
    }
    if (selectedAngles.has("anders") && angleText.anders?.trim()) {
      hints.push(`Eigen wens: ${angleText.anders.trim()}`);
    }
    return hints;
  };

  // Genereer met de verzamelde keuzes. fillyChooses=true → geen hoeken,
  // Filly kiest zelf de sterkste invalshoek voor die dag.
  const generate = async (fillyChooses = false) => {
    if (!picked) return;
    setStep("generating");
    setError(null);
    onActionChange?.({ channels: [...selectedChannels], step: "generating" });
    const hints = fillyChooses ? [] : buildContextHints();
    const item: GenerateForDatesItem = {
      date: picked.date,
      kind: picked.kind,
      ...(picked.name ? { name: picked.name } : {}),
      ...(selectedChannels.size > 0
        ? { channels: [...selectedChannels] }
        : {}),
      ...(hints.length > 0 ? { context: hints } : {}),
    };
    try {
      const { suggestions } = await generateSuggestionsForDates([item]);
      if (!suggestions || suggestions.length === 0) {
        // Geen stille redirect meer: blijf in de flow met een duidelijke
        // melding zodat de eigenaar niet na 3 stappen "zomaar" op /campagnes
        // belandt zonder resultaat (UX-audit 2026-06-18).
        setError(
          "Het lukte niet om een voorstel te maken voor deze dag. Probeer een andere dag of een andere hoek.",
        );
        setStep("channels");
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

  const restart = () => {
    setStep("opener");
    setPicked(null);
    setDayContext(null);
    setSelectedContext(new Set());
    setSelectedAngles(new Set());
    setAngleText({});
    setSelectedChannels(new Set());
    setResult([]);
    setError(null);
    onActionChange?.({ date: null, topic: null, channels: null, step: "day" });
  };

  // ---------- Klaar: resultaat inline tonen ----------
  if (step === "done") {
    return (
      <div className="filly-guided">
        <div className="fg-welcome" role="status" aria-live="polite">
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
        <div className="fg-welcome" role="status" aria-live="polite">
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
              : "Beantwoord de vragen of pas een eerdere stap aan."}
          </div>
        </div>
      </div>

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
              <span>Hoek aanpassen</span>
              <Pencil size={12} strokeWidth={2.25} className="fg-trail-edit" />
            </button>
          )}
        </div>
      )}

      {/* ---------- Opener: gedetecteerde dagen (rustige eerst) ---------- */}
      {step === "opener" &&
        (loading ? (
          <div className="fg-loading">Even kijken welke kansen er zijn…</div>
        ) : (
          <>
            <div className="fg-group-label">
              <TrendingDown size={13} strokeWidth={2.25} />
              Rustige dagen
              {hasOccupancyData ? ` (onder ${occupancyThreshold}%)` : ""}
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
          </>
        ))}

      {/* ---------- Hoeken voor de gekozen dag ---------- */}
      {step === "angles" &&
        (loadingContext || (initialDate && !autoStarted) ? (
          <div className="fg-loading">Filly kijkt wat er die dag kan…</div>
        ) : (
          <>
            <div className="fg-q">
              Voor {picked ? picked.label : "die dag"} — waarop wil je
              inspelen?
            </div>

            <button
              type="button"
              className="fg-opt fg-opt--feature"
              onClick={() => generate(true)}
            >
              <span className="fg-opt-main">
                <Wand2 size={15} strokeWidth={2.25} /> Laat Filly de sterkste
                hoek kiezen
              </span>
              <span className="fg-opt-sub">snelste</span>
            </button>

            {contextOptions.length > 0 && (
              <>
                <div className="fg-group-label" style={{ marginTop: 6 }}>
                  Wat speelt er die dag
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
              Of kies een hoek
            </div>
            <div className="fg-options">
              {ANGLES.map(({ id, label, Icon, placeholder }) => {
                const sel = selectedAngles.has(id);
                return (
                  <div key={id}>
                    <button
                      type="button"
                      className={`fg-opt${sel ? " sel" : ""}`}
                      onClick={() => setSelectedAngles((s) => toggle(s, id))}
                    >
                      <span className="fg-opt-main">
                        <Icon size={15} strokeWidth={2.25} /> {label}
                      </span>
                      {sel && <Check size={15} strokeWidth={2.5} />}
                    </button>
                    {sel && placeholder && (
                      <input
                        type="text"
                        className="fg-input"
                        placeholder={placeholder}
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
              onClick={() => setStep("channels")}
            >
              Verder
            </button>
          </>
        ))}

      {/* ---------- Kanalen ---------- */}
      {step === "channels" && (
        <>
          <div className="fg-q">
            {dayContext && dayContext.channels.length > 0
              ? "Op welke kanalen? Ik heb de aanbevolen alvast aangevinkt."
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
            onClick={() => generate(false)}
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
