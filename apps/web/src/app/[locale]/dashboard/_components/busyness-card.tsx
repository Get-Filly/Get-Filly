"use client";

// ============================================================
// BusynessCard — "Wanneer kan Filly je helpen"
// ============================================================
// Eén blok: week-navigatie, dag-strip met markers, en een dag-grafiek
// (verwacht = grijs, werkelijk = groen). De x-as volgt de openingstijden
// van het restaurant; de y-as heeft kopruimte zodat pieken niet tegen
// het plafond plakken. De kaart spiegelt de Filly-chat ernaast: content
// boven, scheidingslijn, en onderaan een volledige-breedte-actie op
// dezelfde hoogte als de chat-invoer.

import { useEffect, useMemo, useState } from "react";
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
  buildWeek,
  occupancyMap,
  mondayOfWeek,
  addDays,
  isoOf,
  type DayBusyness,
} from "../_lib/busyness";

// Week-navigatie: vooruit een paar weken (de detectie kijkt 14 dagen vooruit).
// Terug loopt tot begin dit jaar; die ondergrens (minOffset) wordt per render
// uit de huidige datum berekend in de component.
const MAX_OFFSET = 6;

// Grijs = verwacht/voorspeld; groen = werkelijk (huisstijl-accent).
const EXPECTED = "var(--tl)";
// Y-as tekent tot 115 i.p.v. 100 → kopruimte, zodat de 100-piek niet op
// de bovenrand plakt en je boven/onder gemiddeld kunt zien.
const Y_MAX = 115;

function sparkPoints(arr: number[], open: number, close: number): string {
  const vis = [];
  for (let h = open; h <= close; h++) vis.push(arr[h]);
  const n = vis.length;
  return vis
    .map((v, i) => {
      const x = n > 1 ? (i / (n - 1)) * 100 : 50;
      const y = 27 - (v / 100) * 24;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function formatDM(date: Date): string {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${d}/${m}`;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Props = {
  onMakeConcept?: (iso: string) => void;
};

export function BusynessCard({ onMakeConcept }: Props) {
  const t = useTranslations("dash__components_busyness");
  const localeTag = useLocaleTag();

  const [occupancy, setOccupancy] = useState<OccupancyDay[]>([]);
  const [restaurant, setRestaurant] = useState<Business | null>(null);
  // Echt Google-patroon (7x24) uit busyness_snapshots; null = terugval op seed.
  const [pattern, setPattern] = useState<number[][] | null>(null);
  // Openingstijden uit de pull; sturen de grafiek-x-as (terugval na eigen tijden).
  const [busynessHours, setBusynessHours] = useState<
    Record<string, { open: string; close: string } | null> | null
  >(null);
  // Echte werkelijk-drukte per datum ([uur, pct]) uit de live-metingen.
  const [actualByDate, setActualByDate] = useState<
    Record<string, [number, number][]>
  >({});
  // Rustige momenten (dag + dagdeel) uit het model — zelfde bron als de chat +
  // de auto-detectie. Voedt de ● marker en het gearceerde rustig-venster.
  const [quiet, setQuiet] = useState<{
    hasSource: boolean;
    moments: QuietMoment[];
  }>({ hasSource: false, moments: [] });

  const today = useMemo(() => new Date(), []);
  const todayIso = useMemo(() => isoOf(today), [today]);
  const thisMonday = useMemo(() => mondayOfWeek(today), [today]);

  const [offset, setOffset] = useState(0);
  const [col, setCol] = useState(() => (new Date().getDay() + 6) % 7);

  // Terug tot de week van 1 januari van dit jaar (negatief aantal weken).
  const minOffset = useMemo(() => {
    const jan = mondayOfWeek(new Date(today.getFullYear(), 0, 1));
    return Math.round((jan.getTime() - thisMonday.getTime()) / (7 * 86400000));
  }, [today, thisMonday]);

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
    // Rustige momenten = vooruitkijkend (kansen); vast venster vanaf vandaag.
    // Markers verschijnen dus alleen op komende dagen, ook als je terugbladert.
    const qFrom = isoOf(today);
    const qTo = isoOf(addDays(today, 21));
    fetchQuietMoments(qFrom, qTo)
      .then((q) => !cancelled && setQuiet(q))
      .catch(() => !cancelled && setQuiet({ hasSource: false, moments: [] }));
    return () => {
      cancelled = true;
    };
  }, [today]);

  const realMap = useMemo(() => occupancyMap(occupancy), [occupancy]);
  const threshold = restaurant?.low_occupancy_threshold ?? 50;

  const monday = useMemo(() => addDays(thisMonday, offset * 7), [thisMonday, offset]);

  // Werkelijke drukte voor de zichtbare week; volgt de navigatie zodat eerdere
  // weken hun gemeten data tonen (en niet alleen de week rond vandaag).
  useEffect(() => {
    let cancelled = false;
    fetchBusynessActual(isoOf(monday), isoOf(addDays(monday, 6)))
      .then((a) => !cancelled && setActualByDate(a))
      .catch(() => !cancelled && setActualByDate({}));
    return () => {
      cancelled = true;
    };
  }, [monday]);

  const week = useMemo(
    () =>
      buildWeek(
        monday,
        realMap,
        restaurant,
        threshold,
        todayIso,
        pattern,
        busynessHours,
        actualByDate,
      ),
    [monday, realMap, restaurant, threshold, todayIso, pattern, busynessHours, actualByDate],
  );
  const day: DayBusyness = week[col] ?? week[0];

  // Rustige momenten per datum. Bij een echt model (hasSource) sturen déze de
  // ● marker + het venster; anders valt de kaart terug op het lokale
  // buildDayBusyness-oordeel (isQuiet / quietWindow).
  const quietByDate = useMemo(() => {
    const m = new Map<string, QuietMoment[]>();
    for (const q of quiet.moments) {
      const arr = m.get(q.date) ?? [];
      arr.push(q);
      m.set(q.date, arr);
    }
    return m;
  }, [quiet]);
  const dayHasQuiet = (d: DayBusyness) =>
    quiet.hasSource ? quietByDate.has(d.iso) : d.isQuiet;

  const shortWd = useMemo(() => new Intl.DateTimeFormat(localeTag, { weekday: "short" }), [localeTag]);
  const longWd = useMemo(() => new Intl.DateTimeFormat(localeTag, { weekday: "long" }), [localeTag]);
  const rangeFmt = useMemo(
    () => new Intl.DateTimeFormat(localeTag, { day: "numeric", month: "short" }),
    [localeTag],
  );
  const monthYearFmt = useMemo(
    () => new Intl.DateTimeFormat(localeTag, { month: "long", year: "numeric" }),
    [localeTag],
  );

  const weekLabel = `${rangeFmt.format(week[0].date)} - ${rangeFmt.format(week[6].date)}`;
  // Dichtbij: deze/vorige/volgende week. Verder weg: maand + jaar voor context.
  const weekSub =
    offset === 0
      ? t("subThis")
      : offset === -1
        ? t("subPrev")
        : offset === 1
          ? t("subNext")
          : monthYearFmt.format(week[0].date);

  const isFuture = day.timeframe === "future";
  const tfLabel =
    day.timeframe === "today" ? t("tfToday") : isFuture ? t("tfFuture") : t("tfPast");

  let note: string;
  if (day.special && !isFuture) note = t("noteSpecialPast", { name: day.special.name });
  else if (day.special && isFuture) note = t("noteSpecialFuture", { name: day.special.name });
  else if (dayHasQuiet(day)) note = t("noteKans");
  else note = t("noteNoKans");

  // Zichtbare uren volgen de openingstijden.
  const vis = useMemo(() => {
    const arr: number[] = [];
    for (let h = day.openHour; h <= day.closeHour; h++) arr.push(h);
    return arr;
  }, [day.openHour, day.closeHour]);
  const N = vis.length;
  const xPct = (i: number) => (N > 1 ? (i / (N - 1)) * 100 : 50);
  const yPct = (v: number) => (1 - v / Y_MAX) * 100;
  // Punten als {x,y} voor de gladde curve (smoothPath) i.p.v. een hoekige
  // polyline. Gebruikt voor de verwacht-lijn en de seed-werkelijk-lijn.
  const linePoints = (arr: number[]) =>
    vis.map((h, i) => ({ x: xPct(i), y: yPct(arr[h]) }));
  // Lichte 5-punts gladstrijking (midden zwaarst) binnen de open uren, zodat de
  // verwacht-lijn vloeiend loopt i.p.v. elke uur-sprong te volgen — net als de
  // werkelijk-lijn. Buren buiten het open bereik tellen niet mee (geen
  // kunstmatige dip aan de randen). Puur visueel; de detectie blijft op de ruwe
  // waarden draaien.
  const smoothVisible = (arr: number[]): number[] => {
    const out = arr.slice();
    for (const h of vis) {
      let s = 0;
      let w = 0;
      for (const [dh, wt] of [
        [-2, 1],
        [-1, 2],
        [0, 3],
        [1, 2],
        [2, 1],
      ] as const) {
        const nb = h + dh;
        if (nb >= day.openHour && nb <= day.closeHour) {
          s += arr[nb] * wt;
          w += wt;
        }
      }
      out[h] = w ? s / w : arr[h];
    }
    return out;
  };
  // Echte gemeten punten (real-modus): uur → x (index binnen open bereik),
  // pct → y. Alleen uren binnen de zichtbare openingsuren.
  const actualDots = (pairs: [number, number][]) =>
    pairs
      .filter(([h]) => h >= day.openHour && h <= day.closeHour)
      .map(([h, pct]) => ({ x: xPct(h - day.openHour), y: yPct(pct) }));

  // Vloeiende curve (Catmull-Rom → cubic bezier) door de punten, zodat de
  // werkelijk-lijn een gladde lijn wordt i.p.v. hoekige rechte stukjes.
  const smoothPath = (p: { x: number; y: number }[]): string => {
    if (p.length < 2) return "";
    const f = (n: number) => n.toFixed(2);
    let d = `M${f(p[0].x)},${f(p[0].y)}`;
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[i - 1] ?? p[i];
      const p1 = p[i];
      const p2 = p[i + 1];
      const p3 = p[i + 2] ?? p2;
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(p2.x)},${f(p2.y)}`;
    }
    return d;
  };

  const ticks = useMemo(() => {
    const step = N <= 9 ? 2 : N <= 15 ? 3 : 4;
    const out: number[] = [];
    for (let i = 0; i < N; i += step) out.push(i);
    if (out[out.length - 1] !== N - 1) out.push(N - 1);
    return out;
  }, [N]);

  // Rustig-venster: bij een echt model het dagdeel-venster van de gedetecteerde
  // momenten op deze dag; anders het lokale quietWindow (terugval).
  const qmWindow: [number, number] | null = quiet.hasSource
    ? quietByDate.has(day.iso)
      ? [
          Math.min(...quietByDate.get(day.iso)!.map((m) => m.fromHour)),
          Math.max(...quietByDate.get(day.iso)!.map((m) => m.toHour)),
        ]
      : null
    : day.quiet;
  const band =
    qmWindow && qmWindow[1] >= day.openHour && qmWindow[0] <= day.closeHour
      ? {
          x0: xPct(Math.max(0, qmWindow[0] - day.openHour)),
          x1: xPct(Math.min(N - 1, qmWindow[1] - day.openHour)),
        }
      : null;

  return (
    <div className="card bz-card">
      <div className="card-h bz-head">
        <div>
          <div className="card-t">{t("title")}</div>
          <div className="card-st">{t("subtitle")}</div>
        </div>
        <div className="bz-nav">
          <button
            className="bz-navbtn"
            aria-label={t("prevWeek")}
            disabled={offset <= minOffset}
            onClick={() => setOffset((o) => Math.max(minOffset, o - 1))}
          >
            ‹
          </button>
          <div className="bz-lbl">
            {weekLabel}
            <small>{weekSub}</small>
          </div>
          <button
            className="bz-navbtn"
            aria-label={t("nextWeek")}
            disabled={offset >= MAX_OFFSET}
            onClick={() => setOffset((o) => Math.min(MAX_OFFSET, o + 1))}
          >
            ›
          </button>
          <button
            className="bz-today"
            onClick={() => {
              setOffset(0);
              setCol((today.getDay() + 6) % 7);
            }}
          >
            {t("today")}
          </button>
        </div>
      </div>

      <div className="card-b bz-body">
        <div className="bz-strip">
          {week.map((d, i) => {
            const line = d.actual ?? d.hours;
            const isToday = d.iso === todayIso;
            return (
              <button
                key={d.iso}
                className={`bz-day${i === col ? " on" : ""}${isToday ? " today" : ""}`}
                aria-label={`${cap(longWd.format(d.date))} ${formatDM(d.date)}`}
                onClick={() => setCol(i)}
              >
                <span className="bz-ab">{shortWd.format(d.date).replace(".", "")}</span>
                <span className="bz-dm">{formatDM(d.date)}</span>
                <svg className="bz-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
                  <polyline
                    points={sparkPoints(line, d.openHour, d.closeHour)}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    strokeDasharray={d.timeframe === "future" ? "3 3" : undefined}
                  />
                </svg>
                <span className="bz-mks">
                  {dayHasQuiet(d) && <span className="bz-dot" />}
                  {d.special && <span className="bz-star">★</span>}
                </span>
              </button>
            );
          })}
        </div>

        <div className="bz-legend">
          <span className="bz-lg">
            <span className="bz-dot" />
            {t("legendQuiet")}
          </span>
          <span className="bz-lg">
            <span className="bz-star">★</span>
            {t("legendSpecial")}
          </span>
          <span className="bz-lg bz-hint">{t("legendHint")}</span>
        </div>

        <div className="bz-detail">
          <div className="bz-dhead">
            <h3>
              {cap(longWd.format(day.date))} {formatDM(day.date)}
            </h3>
            <span className={`bz-dtag${isFuture ? " future" : ""}`}>{tfLabel}</span>
            {day.special && <span className="bz-spill">★ {day.special.name}</span>}
          </div>

          <div className="bz-llegend">
            {isFuture ? (
              <>
                <span className="bz-lg">
                  <span className="bz-ln expected" />
                  {t("predictedLine")}
                </span>
                <span className="bz-lg bz-hint">{t("predictedNote")}</span>
              </>
            ) : (
              <>
                <span className="bz-lg">
                  <span className="bz-ln expected" />
                  {t("avgLine")}
                </span>
                <span className="bz-lg">
                  <span className="bz-ln" />
                  {t("actualLine")}
                </span>
              </>
            )}
          </div>

          <p className="bz-note">{note}</p>

          <div className="bz-chart">
            <svg className="bz-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
              {band && (
                <rect
                  x={band.x0}
                  y="0"
                  width={band.x1 - band.x0}
                  height="100"
                  fill="var(--accent-light)"
                  opacity="0.55"
                />
              )}
              {isFuture ? (
                <path
                  d={smoothPath(linePoints(smoothVisible(day.hours)))}
                  fill="none"
                  stroke={EXPECTED}
                  strokeWidth="2.2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ) : (
                <>
                  <path
                    d={smoothPath(linePoints(smoothVisible(day.hours)))}
                    fill="none"
                    stroke={EXPECTED}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                  {day.actualPoints ? (
                    // Real-modus: gladde groene curve uit de echte metingen,
                    // zonder losse meetpunt-stippen. Alleen bij één enkele
                    // meting tonen we een stip (anders zou je niets zien).
                    day.actualPoints.length > 1 ? (
                      <path
                        d={smoothPath(actualDots(day.actualPoints))}
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth="2.4"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : (
                      actualDots(day.actualPoints).map((p, i) => (
                        <circle
                          key={i}
                          cx={p.x}
                          cy={p.y}
                          r="1.1"
                          fill="var(--accent)"
                          vectorEffect="non-scaling-stroke"
                        />
                      ))
                    )
                  ) : day.actual ? (
                    // Seed-modus (zaak zonder echte drukte-bron): oude lijn.
                    <path
                      d={smoothPath(linePoints(day.actual))}
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="2.4"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null}
                </>
              )}
            </svg>
            {band && (
              <span className="bz-band-label" style={{ left: `${(band.x0 + band.x1) / 2}%` }}>
                {t("bandRustig")}
              </span>
            )}
            <div className="bz-xlabels">
              {ticks.map((i) => (
                <span
                  key={i}
                  className={i === 0 ? "start" : i === N - 1 ? "end" : ""}
                  style={{ left: `${xPct(i)}%` }}
                >
                  {String(vis[i]).padStart(2, "0")}:00
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bz-footbar">
        <button className="bz-cta" onClick={() => onMakeConcept?.(day.iso)}>
          {t("ctaFor", { date: formatDM(day.date) })}
        </button>
      </div>
    </div>
  );
}
