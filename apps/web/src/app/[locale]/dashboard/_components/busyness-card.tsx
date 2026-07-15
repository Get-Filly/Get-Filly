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
  fetchRestaurant,
  type OccupancyDay,
  type Restaurant,
} from "@/lib/api";
import {
  buildWeek,
  occupancyMap,
  mondayOfWeek,
  addDays,
  isoOf,
  type DayBusyness,
} from "../_lib/busyness";

const MIN_OFFSET = -1;
const MAX_OFFSET = 1;

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
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
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

  const today = useMemo(() => new Date(), []);
  const todayIso = useMemo(() => isoOf(today), [today]);
  const thisMonday = useMemo(() => mondayOfWeek(today), [today]);

  const [offset, setOffset] = useState(0);
  const [col, setCol] = useState(() => (new Date().getDay() + 6) % 7);

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
    // Werkelijk-drukte voor het zichtbare bereik (vorige t/m volgende week).
    const from = isoOf(addDays(thisMonday, -7));
    const to = isoOf(addDays(thisMonday, 13));
    fetchBusynessActual(from, to)
      .then((a) => !cancelled && setActualByDate(a))
      .catch(() => !cancelled && setActualByDate({}));
    return () => {
      cancelled = true;
    };
  }, [today, thisMonday]);

  const realMap = useMemo(() => occupancyMap(occupancy), [occupancy]);
  const threshold = restaurant?.low_occupancy_threshold ?? 50;

  const monday = useMemo(() => addDays(thisMonday, offset * 7), [thisMonday, offset]);
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

  const shortWd = useMemo(() => new Intl.DateTimeFormat(localeTag, { weekday: "short" }), [localeTag]);
  const longWd = useMemo(() => new Intl.DateTimeFormat(localeTag, { weekday: "long" }), [localeTag]);
  const rangeFmt = useMemo(
    () => new Intl.DateTimeFormat(localeTag, { day: "numeric", month: "short" }),
    [localeTag],
  );

  const weekLabel = `${rangeFmt.format(week[0].date)} - ${rangeFmt.format(week[6].date)}`;
  const weekSub = offset === 0 ? t("subThis") : offset < 0 ? t("subPrev") : t("subNext");

  const isFuture = day.timeframe === "future";
  const tfLabel =
    day.timeframe === "today" ? t("tfToday") : isFuture ? t("tfFuture") : t("tfPast");

  let note: string;
  if (day.special && !isFuture) note = t("noteSpecialPast", { name: day.special.name });
  else if (day.special && isFuture) note = t("noteSpecialFuture", { name: day.special.name });
  else if (day.isQuiet) note = t("noteKans");
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
  const linePts = (arr: number[]) =>
    vis.map((h, i) => `${xPct(i).toFixed(2)},${yPct(arr[h]).toFixed(2)}`).join(" ");
  // Echte gemeten punten (real-modus): uur → x (index binnen open bereik),
  // pct → y. Alleen uren binnen de zichtbare openingsuren.
  const actualDots = (pairs: [number, number][]) =>
    pairs
      .filter(([h]) => h >= day.openHour && h <= day.closeHour)
      .map(([h, pct]) => ({ x: xPct(h - day.openHour), y: yPct(pct) }));

  const ticks = useMemo(() => {
    const step = N <= 9 ? 2 : N <= 15 ? 3 : 4;
    const out: number[] = [];
    for (let i = 0; i < N; i += step) out.push(i);
    if (out[out.length - 1] !== N - 1) out.push(N - 1);
    return out;
  }, [N]);

  const band =
    day.quiet && day.quiet[1] >= day.openHour && day.quiet[0] <= day.closeHour
      ? {
          x0: xPct(Math.max(0, day.quiet[0] - day.openHour)),
          x1: xPct(Math.min(N - 1, day.quiet[1] - day.openHour)),
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
            disabled={offset <= MIN_OFFSET}
            onClick={() => setOffset((o) => Math.max(MIN_OFFSET, o - 1))}
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
                  {d.isQuiet && <span className="bz-dot" />}
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
                <polyline
                  points={linePts(day.hours)}
                  fill="none"
                  stroke={EXPECTED}
                  strokeWidth="2.2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ) : (
                <>
                  <polyline
                    points={linePts(day.hours)}
                    fill="none"
                    stroke={EXPECTED}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                  {day.actualPoints ? (
                    // Real-modus: groene lijn + stippen uit de echte metingen.
                    // (Stippen zorgen dat ook één losse meting zichtbaar is.)
                    <>
                      {day.actualPoints.length > 1 && (
                        <polyline
                          points={actualDots(day.actualPoints)
                            .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
                            .join(" ")}
                          fill="none"
                          stroke="var(--accent)"
                          strokeWidth="2.4"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                      {actualDots(day.actualPoints).map((p, i) => (
                        <circle
                          key={i}
                          cx={p.x}
                          cy={p.y}
                          r="1.1"
                          fill="var(--accent)"
                          vectorEffect="non-scaling-stroke"
                        />
                      ))}
                    </>
                  ) : day.actual ? (
                    // Seed-modus (zaak zonder echte drukte-bron): oude lijn.
                    <polyline
                      points={linePts(day.actual)}
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
