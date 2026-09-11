"use client";

// ============================================================
// BusynessCard — drukte per dag/week/maand, met kansen
// ============================================================
// Dashboard v2 (2026-09). Verving de dag-strip met mini-lijntjes plus de
// losse lijngrafiek door één staafgrafiek met een periode-schakelaar.
//
// De staaf:
//   - donker  = gemeten (live-metingen uit busyness_snapshots)
//   - licht   = nog voorspeld (het Google-patroon)
//   - op gemeten staven ligt één horizontale lijn op de verwachte hoogte;
//     erboven is beter dan verwacht, eronder is minder
//   - lichtgroen blok bovenop = de ruimte tot je normale niveau, alleen op
//     dagen/uren waar de backend een kans detecteert, met een ★ onder de staaf
//
// Waarom geen normaal-lijn op voorspelde staven: het Google-patroon is
// tegelijk de voorspelling én "normaal voor dat uur", dus die staaf zou per
// definitie zijn eigen lijn raken. Vooruitkijken kan alleen zijwaarts, en
// daarom is "normaal" hier de mediaan van dat dagdeel over je weekdagen.
//
// De grafiek tekent in echte containerpixels (geen preserveAspectRatio=none),
// anders rekt de tekst mee met de kaartbreedte.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useLocaleTag } from "@/lib/locale-format";
import {
  fetchBusyness,
  fetchBusynessActual,
  fetchOccupancy,
  fetchQuietMoments,
  fetchRestaurant,
  type OccupancyDay,
  type QuietMoment,
  type Business,
} from "@/lib/api";
import {
  buildDays,
  dayLevelIndex,
  dayLevels,
  daypartOf,
  normalForWindow,
  occupancyMap,
  weekdayCurves,
  addDays,
  isoOf,
  type DayBusyness,
} from "../_lib/busyness";

type View = "dag" | "week" | "maand";

// Kansen worden een paar weken vooruit bepaald; daarbuiten tonen we alleen
// het patroon. Spiegelt het venster waarmee de moments worden opgehaald.
const HORIZON_DAYS = 21;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pad = (n: number) => String(n).padStart(2, "0");

/** Staafpad: platte onderkant, ronde bovenkant alleen waar de staaf eindigt. */
function barPath(x: number, y: number, w: number, h: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, w / 2, h));
  const f = (n: number) => n.toFixed(1);
  return (
    `M${f(x)},${f(y + h)} L${f(x)},${f(y + r)} Q${f(x)},${f(y)} ${f(x + r)},${f(y)}` +
    ` L${f(x + w - r)},${f(y)} Q${f(x + w)},${f(y)} ${f(x + w)},${f(y + r)}` +
    ` L${f(x + w)},${f(y + h)} Z`
  );
}

type Bar = {
  key: string;
  iso: string | null; // gezet op dag-staven: klikbaar
  hour: number | null;
  value: number; // 0-100
  expected: number; // 0-100
  measured: boolean;
  kans: boolean;
  normal: number | null; // bovenkant van het lichte blok
  label: string;
  sub: string | null;
  isToday: boolean;
  isFocus: boolean;
  title: string;
};

type Props = {
  onMakeConcept?: (iso: string) => void;
};

export function BusynessCard({ onMakeConcept }: Props) {
  const t = useTranslations("dash__components_busyness");
  const localeTag = useLocaleTag();

  const [occupancy, setOccupancy] = useState<OccupancyDay[]>([]);
  const [restaurant, setRestaurant] = useState<Business | null>(null);
  const [pattern, setPattern] = useState<number[][] | null>(null);
  const [busynessHours, setBusynessHours] = useState<Record<
    string,
    { open: string; close: string } | null
  > | null>(null);
  const [actualByDate, setActualByDate] = useState<Record<string, [number, number][]>>({});
  const [quiet, setQuiet] = useState<{ hasSource: boolean; moments: QuietMoment[] }>({
    hasSource: false,
    moments: [],
  });

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayIso = useMemo(() => isoOf(today), [today]);
  const nowHour = useMemo(() => new Date().getHours(), []);

  const [view, setView] = useState<View>("week");
  // Dag-weergave: de dag zelf. Week: de eerste dag van het rollende venster.
  // Maand: een dag in die maand.
  const [anchor, setAnchor] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [focusIso, setFocusIso] = useState<string | null>(null);

  // ---------- data ----------
  useEffect(() => {
    let cancelled = false;
    const y = today.getFullYear();
    const m = today.getMonth();
    const months: [number, number][] = [
      [m === 0 ? y - 1 : y, (m + 11) % 12],
      [y, m],
      [m === 11 ? y + 1 : y, (m + 1) % 12],
    ];
    Promise.all(months.map(([yy, mm]) => fetchOccupancy(yy, mm).catch(() => [])))
      .then((chunks) => !cancelled && setOccupancy(chunks.flat()))
      .catch(() => !cancelled && setOccupancy([]));
    fetchRestaurant()
      .then((r) => !cancelled && setRestaurant(r))
      .catch(() => !cancelled && setRestaurant(null));
    fetchBusyness()
      .then((b) => {
        if (cancelled) return;
        setPattern(b.pattern);
        setBusynessHours(b.openingHours);
      })
      .catch(() => {
        if (cancelled) return;
        setPattern(null);
        setBusynessHours(null);
      });
    // Kansen zijn vooruitkijkend; vast venster vanaf vandaag.
    fetchQuietMoments(isoOf(today), isoOf(addDays(today, HORIZON_DAYS)))
      .then((q) => !cancelled && setQuiet(q))
      .catch(() => !cancelled && setQuiet({ hasSource: false, moments: [] }));
    return () => {
      cancelled = true;
    };
  }, [today]);

  // ---------- periode ----------
  const dates = useMemo<Date[]>(() => {
    if (view === "dag") return [anchor];
    if (view === "week") return Array.from({ length: 7 }, (_, i) => addDays(anchor, i));
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
    return Array.from(
      { length: last },
      (_, i) => new Date(anchor.getFullYear(), anchor.getMonth(), i + 1),
    );
  }, [view, anchor]);

  // Werkelijke drukte voor precies de zichtbare periode.
  useEffect(() => {
    let cancelled = false;
    const from = isoOf(dates[0]);
    const to = isoOf(dates[dates.length - 1]);
    fetchBusynessActual(from, to)
      .then((a) => !cancelled && setActualByDate(a))
      .catch(() => !cancelled && setActualByDate({}));
    return () => {
      cancelled = true;
    };
  }, [dates]);

  const realMap = useMemo(() => occupancyMap(occupancy), [occupancy]);
  const threshold = restaurant?.low_occupancy_threshold ?? 50;

  const days = useMemo(
    () =>
      buildDays(
        dates,
        realMap,
        restaurant,
        threshold,
        todayIso,
        pattern,
        busynessHours,
        actualByDate,
      ),
    [dates, realMap, restaurant, threshold, todayIso, pattern, busynessHours, actualByDate],
  );

  // Kans per datum: het dagdeel met de grootste vulbaarheid (gap).
  const chanceByDate = useMemo(() => {
    const m = new Map<string, QuietMoment>();
    for (const q of quiet.moments) {
      const cur = m.get(q.date);
      if (!cur || q.gap > cur.gap) m.set(q.date, q);
    }
    return m;
  }, [quiet]);

  const focus = useMemo<DayBusyness>(() => {
    if (view === "dag") return days[0];
    const chosen = days.find((d) => d.iso === focusIso);
    if (chosen) return chosen;
    const withChance = days
      .filter((d) => chanceByDate.has(d.iso))
      .sort((a, b) => (chanceByDate.get(b.iso)!.gap ?? 0) - (chanceByDate.get(a.iso)!.gap ?? 0));
    if (withChance.length) return withChance[0];
    return days.find((d) => d.iso === todayIso) ?? days[0];
  }, [view, days, focusIso, chanceByDate, todayIso]);

  const focusChance = chanceByDate.get(focus?.iso ?? "") ?? null;
  const chancesInPeriod = days.filter((d) => chanceByDate.has(d.iso)).length;

  // ---------- normaal-niveaus ----------
  const curves = useMemo(() => weekdayCurves(pattern), [pattern]);
  const levels = useMemo(
    () => dayLevels(curves, focus?.openHour ?? 9, focus?.closeHour ?? 22),
    [curves, focus?.openHour, focus?.closeHour],
  );

  /** Gemeten uren van een dag; vandaag knipt op het huidige uur. */
  const measuredHours = useCallback(
    (d: DayBusyness): Map<number, number> => {
      const m = new Map<number, number>();
      if (d.timeframe === "future") return m;
      const cut = d.timeframe === "today" ? nowHour : 23;
      if (d.actualPoints) {
        for (const [h, pct] of d.actualPoints) if (h <= cut) m.set(h, pct);
      } else if (d.actual) {
        for (let h = d.openHour; h <= Math.min(d.closeHour, cut); h++) m.set(h, d.actual[h]);
      }
      return m;
    },
    [nowHour],
  );

  /** Staat deze weekdag bij de twee stilste van je week? */
  const weekdayQuiet = useMemo(() => {
    if (!focus) return false;
    const mean = (c: number[]) => {
      let sum = 0;
      let n = 0;
      for (let h = focus.openHour; h <= focus.closeHour; h++) {
        sum += c[h] ?? 0;
        n++;
      }
      return n ? sum / n : 0;
    };
    const mine = mean(curves[focus.colMon]);
    return curves.map(mean).filter((v) => v < mine).length <= 1;
  }, [curves, focus]);

  /** Dagniveau als index (100 = je drukste dag), gemeten waar het kan. */
  const dayIndex = useCallback(
    (d: DayBusyness, expectedOnly = false): number => {
      const meas = expectedOnly ? new Map<number, number>() : measuredHours(d);
      let sum = 0;
      let n = 0;
      for (let h = d.openHour; h <= d.closeHour; h++) {
        sum += meas.get(h) ?? d.hours[h];
        n++;
      }
      return dayLevelIndex(n ? sum / n : 0, levels.peak);
    },
    [measuredHours, levels.peak],
  );

  // ---------- staven ----------
  const shortWd = useMemo(
    () => new Intl.DateTimeFormat(localeTag, { weekday: "short" }),
    [localeTag],
  );
  const longWd = useMemo(
    () => new Intl.DateTimeFormat(localeTag, { weekday: "long" }),
    [localeTag],
  );
  const dayMonth = useMemo(
    () => new Intl.DateTimeFormat(localeTag, { day: "numeric", month: "short" }),
    [localeTag],
  );
  const monthYear = useMemo(
    () => new Intl.DateTimeFormat(localeTag, { month: "long", year: "numeric" }),
    [localeTag],
  );
  const dayFull = useMemo(
    () => new Intl.DateTimeFormat(localeTag, { weekday: "long", day: "numeric", month: "short" }),
    [localeTag],
  );

  const bars = useMemo<Bar[]>(() => {
    if (!days.length) return [];
    if (view === "dag") {
      const d = days[0];
      const meas = measuredHours(d);
      const ch = chanceByDate.get(d.iso) ?? null;
      const out: Bar[] = [];
      for (let h = d.openHour; h <= d.closeHour; h++) {
        const isKans = !!ch && h >= ch.fromHour && h <= ch.toHour;
        const part = daypartOf(h);
        out.push({
          key: `h${h}`,
          iso: null,
          hour: h,
          value: meas.get(h) ?? d.hours[h],
          expected: d.hours[h],
          measured: meas.has(h),
          kans: isKans,
          normal: isKans && part ? normalForWindow(curves, part.from, part.to - 1) : null,
          label: `${pad(h)}:00`,
          sub: null,
          isToday: false,
          isFocus: false,
          title: `${pad(h)}:00 · ${meas.has(h) ? t("legendMeasured") : t("legendPredicted")}`,
        });
      }
      return out;
    }
    return days.map((d) => {
      const ch = chanceByDate.get(d.iso) ?? null;
      const meas = measuredHours(d);
      return {
        key: d.iso,
        iso: d.iso,
        hour: null,
        value: dayIndex(d),
        expected: dayIndex(d, true),
        measured: meas.size > 0,
        kans: !!ch,
        normal: ch ? dayLevelIndex(levels.normal, levels.peak) : null,
        label:
          view === "week"
            ? shortWd.format(d.date).replace(".", "")
            : String(d.date.getDate()),
        sub:
          view === "week"
            ? d.iso === todayIso
              ? t("today").toLowerCase()
              : `${pad(d.date.getDate())}/${pad(d.date.getMonth() + 1)}`
            : null,
        isToday: d.iso === todayIso,
        isFocus: d.iso === focus?.iso,
        title: `${cap(dayFull.format(d.date))} · ${
          ch ? t("titleChance", { part: ch.daypartLabel }) : t("titleNoChance")
        }`,
      };
    });
  }, [
    days,
    view,
    measuredHours,
    chanceByDate,
    curves,
    dayIndex,
    levels,
    shortWd,
    dayFull,
    todayIso,
    focus?.iso,
    t,
  ]);

  // ---------- grafiek-afmetingen in echte pixels ----------
  const plotRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 720, h: 230 });
  useEffect(() => {
    const el = plotRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let pending = false;
    const ro = new ResizeObserver(() => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        if (!plotRef.current) return;
        setBox({
          w: Math.max(320, Math.round(plotRef.current.clientWidth)),
          h: Math.max(150, Math.round(plotRef.current.clientHeight)),
        });
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---------- navigatie ----------
  function shift(step: number) {
    setFocusIso(null);
    setAnchor((a) => {
      if (view === "dag") return addDays(a, step);
      if (view === "week") return addDays(a, 7 * step);
      return new Date(a.getFullYear(), a.getMonth() + step, 1);
    });
  }
  function switchView(next: View) {
    if ((next === "dag" || next === "week") && focus) setAnchor(new Date(focus.date));
    setView(next);
  }
  // Eerste klik kiest een staaf, tweede klik opent die dag per uur.
  function onBarClick(iso: string) {
    if (focus?.iso === iso) {
      setAnchor(new Date(`${iso}T00:00:00`));
      setView("dag");
      return;
    }
    setFocusIso(iso);
  }

  if (!days.length || !focus) return null;

  // ---------- kop-teksten ----------
  const rangeLabel =
    view === "dag"
      ? cap(dayFull.format(focus.date))
      : view === "week"
        ? `${dayMonth.format(days[0].date)} – ${dayMonth.format(days[days.length - 1].date)}`
        : cap(monthYear.format(anchor));
  const rangeNote =
    view === "dag"
      ? focus.iso === todayIso
        ? t("today").toLowerCase()
        : focus.timeframe === "past"
          ? t("tfPast").toLowerCase()
          : ""
      : view === "week"
        ? days[0].iso === todayIso
          ? t("subNext7")
          : ""
        : anchor.getMonth() === today.getMonth() && anchor.getFullYear() === today.getFullYear()
          ? t("subThisMonth")
          : "";

  const beyondHorizon = days.every(
    (d) => Math.round((d.date.getTime() - today.getTime()) / 86400000) > HORIZON_DAYS,
  );
  const periodWord = view === "week" ? t("periodWeek") : t("periodMonth");

  let insightTitle: string;
  let insightSub: string;
  if (focusChance) {
    const who = view === "week" && focus.iso === todayIso
      ? cap(longWd.format(focus.date))
      : cap(dayFull.format(focus.date));
    const bestIso = days
      .filter((d) => chanceByDate.has(d.iso))
      .sort((a, b) => chanceByDate.get(b.iso)!.gap - chanceByDate.get(a.iso)!.gap)[0]?.iso;
    const isBest = view !== "dag" && chancesInPeriod > 1 && focus.iso === bestIso;
    insightTitle = isBest
      ? t("insBiggest", { day: who, part: focusChance.daypartLabel, period: periodWord })
      : t("insChance", { day: who, part: focusChance.daypartLabel });
    const window = `${pad(focusChance.fromHour)}:00–${pad(focusChance.toHour + 1)}:00`;
    const parts = [window, t("insQuieter", { part: focusChance.daypartLabel })];
    if (chancesInPeriod > 1) {
      parts.push(t("insMore", { count: chancesInPeriod - 1, period: periodWord }));
    }
    if (focus.special) parts.push(`★ ${focus.special.name}`);
    insightSub = parts.join("  ·  ");
  } else if (beyondHorizon && view !== "dag") {
    insightTitle = t("insTooFar");
    insightSub = t("insTooFarSub", { days: HORIZON_DAYS });
  } else {
    insightTitle = t("insFullEnough", { day: cap(dayFull.format(focus.date)) });
    const best = days
      .filter((d) => chanceByDate.has(d.iso))
      .sort((a, b) => chanceByDate.get(b.iso)!.gap - chanceByDate.get(a.iso)!.gap)[0];
    insightSub = best
      ? t("insBestElsewhere", {
          day: `${shortWd.format(best.date).replace(".", "")} ${dayMonth.format(best.date)}`,
          part: chanceByDate.get(best.iso)!.daypartLabel,
        })
      : t("insAllNormal");
  }

  // ---------- geometrie ----------
  const W = box.w;
  const H = box.h;
  const L = 44;
  const R = 14;
  const T = 34;
  const B = view === "week" ? 54 : view === "dag" ? 30 : 40;
  const pw = W - L - R;
  const ph = Math.max(40, H - T - B);
  const n = Math.max(1, bars.length);
  const slot = pw / n;
  const bw = Math.max(6, Math.min(46, slot * (view === "maand" ? 0.62 : 0.46)));
  const X = (i: number) => L + slot * (i + 0.5);
  const Y = (v: number) => T + ph - (Math.max(0, Math.min(100, v)) / 100) * ph;

  const markerIndex = bars.findIndex((b) =>
    view === "dag"
      ? focusChance
        ? b.hour === Math.round((focusChance.fromHour + focusChance.toHour) / 2)
        : focus.iso === todayIso && b.hour === nowHour
      : b.isFocus,
  );
  const markerText =
    view === "dag"
      ? focusChance
        ? focusChance.daypartLabel
        : t("markerNow", { hour: `${pad(nowHour)}:00` })
      : focus.iso === todayIso
        ? t("today").toLowerCase()
        : `${shortWd.format(focus.date).replace(".", "")} ${dayMonth.format(focus.date)}`;

  return (
    <div className="bzv">
     <div className="bzv-scroll">
      <div className={`bzv-insight${focusChance ? " kans" : ""}`}>
        <span className="bzv-mark" aria-hidden="true" />
        <div>
          <h2 className="bzv-ins-h">{insightTitle}</h2>
          <p className="bzv-ins-sub">{insightSub}</p>
        </div>
      </div>

      <div className="card bzv-card">
        <div className="card-h bzv-head">
          <div className="bzv-switch" role="group" aria-label={t("periodGroup")}>
            {(["dag", "week", "maand"] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => switchView(v)}
              >
                {t(`view_${v}`)}
              </button>
            ))}
          </div>
          <div className="bzv-daterow">
            <button
              type="button"
              className="bzv-nav"
              aria-label={t("prev")}
              onClick={() => shift(-1)}
            >
              ‹
            </button>
            <span className="bzv-range">
              {rangeLabel}
              {rangeNote && <small> · {rangeNote}</small>}
            </span>
            <button
              type="button"
              className="bzv-nav"
              aria-label={t("next")}
              onClick={() => shift(1)}
            >
              ›
            </button>
          </div>
          <div className="bzv-quick">
            {view === "dag" ? (
              [0, 1, 2].map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={isoOf(addDays(today, d)) === focus.iso}
                  onClick={() => {
                    setFocusIso(null);
                    setAnchor(addDays(today, d));
                  }}
                >
                  {t(`jump_${d}`)}
                </button>
              ))
            ) : (
              <button
                type="button"
                onClick={() => {
                  setFocusIso(null);
                  setAnchor(today);
                }}
              >
                {t("today")}
              </button>
            )}
          </div>
        </div>

        <div className="bzv-chart">
          <div className="bzv-chart-head">
            <span className="bzv-chart-t">
              {view === "dag" ? t("chartPerHour") : t("chartPerDay")}
            </span>
            <div className="bzv-legend">
              <span>
                <i className="bzv-sw act" />
                {t("legendMeasured")}
              </span>
              <span>
                <i className="bzv-sw exp" />
                {t("legendPredicted")}
              </span>
              <span>
                <i className="bzv-sw line" />
                {t("legendExpectedLevel")}
              </span>
              <span>
                <i className="bzv-sw room" />
                {t("legendRoom")}
              </span>
              <span>
                <b className="bzv-star">★</b>
                {t("legendChance")}
              </span>
            </div>
          </div>

          <div className="bzv-plot" ref={plotRef}>
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("chartAria")}>
              {[25, 50, 75, 100].map((v) => (
                <line
                  key={v}
                  x1={L}
                  y1={Y(v)}
                  x2={W - R}
                  y2={Y(v)}
                  stroke="var(--bzv-grid)"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              <line
                x1={L}
                y1={Y(0)}
                x2={W - R}
                y2={Y(0)}
                stroke="var(--bzv-grid)"
                strokeWidth="1.4"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={L - 10}
                y={Y(100) + 4}
                textAnchor="end"
                fontSize="11"
                fill="var(--tl)"
              >
                {t("axisBusy")}
              </text>
              <text x={L - 10} y={Y(0) + 4} textAnchor="end" fontSize="11" fill="var(--tl)">
                {t("axisQuiet")}
              </text>

              {bars.map((b, i) => {
                const x = X(i) - bw / 2;
                const ay = Y(b.value);
                const ah = Math.max(2, T + ph - ay);
                const ey = Y(b.expected);
                const roomTop = b.normal !== null ? Y(b.normal) : null;
                const hasRoom = roomTop !== null && ay - roomTop > 3;
                return (
                  <g
                    key={b.key}
                    className={b.iso ? "bzv-bar clickable" : "bzv-bar"}
                    onClick={b.iso ? () => onBarClick(b.iso!) : undefined}
                  >
                    <title>{b.title}</title>
                    {b.iso && (
                      <rect x={L + slot * i} y={T} width={slot} height={ph} fill="transparent" />
                    )}
                    {hasRoom && (
                      <path d={barPath(x, roomTop!, bw, ay - roomTop!, 5)} fill="var(--bzv-room)" />
                    )}
                    <path
                      d={barPath(x, ay, bw, ah, hasRoom ? 0 : 5)}
                      fill={b.measured ? "var(--bzv-act)" : "var(--bzv-exp)"}
                    />
                    {b.measured && (
                      <line
                        x1={x - 7}
                        y1={ey}
                        x2={x + bw + 7}
                        y2={ey}
                        stroke="var(--bzv-ink)"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                  </g>
                );
              })}

              {markerIndex >= 0 && (
                <g aria-hidden="true">
                  <line
                    x1={X(markerIndex)}
                    y1={T - 9}
                    x2={X(markerIndex)}
                    y2={T + ph}
                    stroke="var(--bzv-ink)"
                    strokeWidth="1.2"
                    strokeDasharray="3 3"
                    opacity="0.55"
                    vectorEffect="non-scaling-stroke"
                  />
                  <rect
                    x={Math.min(
                      W - R - (markerText.length * 6.1 + 20) / 2,
                      Math.max(
                        L + (markerText.length * 6.1 + 20) / 2,
                        X(markerIndex),
                      ),
                    ) - (markerText.length * 6.1 + 20) / 2}
                    y={1}
                    width={markerText.length * 6.1 + 20}
                    height={21}
                    rx={10.5}
                    fill="var(--text)"
                  />
                  <text
                    x={Math.min(
                      W - R - (markerText.length * 6.1 + 20) / 2,
                      Math.max(L + (markerText.length * 6.1 + 20) / 2, X(markerIndex)),
                    )}
                    y={15.5}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="600"
                    fill="var(--white)"
                  >
                    {markerText}
                  </text>
                </g>
              )}

              {bars.map((b, i) => {
                const show =
                  view === "dag"
                    ? (b.hour ?? 0) % 2 === 0
                    : view === "maand"
                      ? slot >= 19 || i % 2 === 0
                      : true;
                if (!show) return null;
                const strong = b.isToday || b.isFocus;
                return (
                  <g key={`lbl${b.key}`} aria-hidden="true">
                    <text
                      x={X(i)}
                      y={T + ph + 16}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight={strong ? 600 : 400}
                      fill={strong ? "var(--text)" : "var(--tl)"}
                    >
                      {b.label}
                    </text>
                    {b.sub && (
                      <text
                        x={X(i)}
                        y={T + ph + 30}
                        textAnchor="middle"
                        fontSize="10.5"
                        fill={b.isToday ? "var(--text)" : "var(--tl)"}
                      >
                        {b.sub}
                      </text>
                    )}
                    {view !== "dag" && b.kans && (
                      <text
                        x={X(i)}
                        y={T + ph + (b.sub ? 45 : 30)}
                        textAnchor="middle"
                        fontSize="13"
                        fill="var(--accent)"
                      >
                        ★
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          <p className="bzv-foot">
            {t("footLine")}
            {view !== "dag" && ` ${t("footClick")}`}
          </p>
        </div>
      </div>

      <div className="card bzv-why">
        <div className="bzv-why-h">
          {focusChance
            ? t("whyChance", {
                day: cap(dayFull.format(focus.date)),
                part: focusChance.daypartLabel,
              })
            : t("whyPlain", { day: cap(dayFull.format(focus.date)) })}
        </div>
        <div className="bzv-why-rows">
          <div className="bzv-wrow">
            <span className={`bzv-wdir ${weekdayQuiet ? "down" : "flat"}`}>
              {weekdayQuiet ? "↓" : "·"}
            </span>
            <span>
              <span className="bzv-wk">{t("factorWeekday")}</span>{" "}
              <span className="bzv-wv">
                {t(weekdayQuiet ? "factorWeekdayQuiet" : "factorWeekdayNormal", {
                  day: shortWd.format(focus.date).replace(".", ""),
                })}
              </span>
            </span>
          </div>
          <div className="bzv-wrow">
            <span className={`bzv-wdir ${focus.special ? "up" : "flat"}`}>
              {focus.special ? "↑" : "·"}
            </span>
            <span>
              <span className="bzv-wk">{t("factorSpecial")}</span>{" "}
              <span className="bzv-wv">{focus.special?.name ?? t("factorSpecialNone")}</span>
            </span>
          </div>
          <div className="bzv-wrow">
            <span className={`bzv-wdir ${focusChance ? "down" : "flat"}`}>
              {focusChance ? "↓" : "·"}
            </span>
            <span>
              <span className="bzv-wk">{t("factorPattern")}</span>{" "}
              <span className="bzv-wv">
                {focusChance
                  ? t(focusChance.unusual ? "factorPatternUnusual" : "factorPatternStructural", {
                      part: focusChance.daypartLabel,
                    })
                  : t("factorPatternNormal")}
              </span>
            </span>
          </div>
          <div className="bzv-wrow">
            <span className="bzv-wdir flat">·</span>
            <span>
              <span className="bzv-wk">{t("factorSource")}</span>{" "}
              <span className="bzv-wv">
                {quiet.hasSource ? t("factorSourceLive") : t("factorSourceSeed")}
              </span>
            </span>
          </div>
        </div>
        <div className="bzv-why-foot">{t("whyFoot")}</div>
      </div>
     </div>

      <div className="bzv-footbar">
        <button
          type="button"
          className="bzv-cta"
          disabled={focus.timeframe === "past"}
          onClick={() => onMakeConcept?.(focus.iso)}
        >
          {focusChance
            ? t("ctaForPart", {
                day: shortWd.format(focus.date).replace(".", ""),
                part: focusChance.daypartLabel,
              })
            : t("ctaPlain")}
        </button>
        <p className="bzv-note">{pattern ? t("noteSource") : t("noteSeed")}</p>
      </div>
    </div>
  );
}
