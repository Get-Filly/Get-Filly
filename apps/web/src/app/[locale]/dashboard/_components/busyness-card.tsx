"use client";

// ============================================================
// BusynessCard — "Wanneer kan Filly je helpen"
// ============================================================
// Vervangt de oude CalendarCard + de twee groene banners. Eén blok:
//   - week-navigatie (vorige / deze / volgende week; toekomst = voorspeld)
//   - dag-strip: 7 mini-sparklines met markers (rustig moment / speciale dag)
//   - dag-grafiek: dubbele lijn (gemiddeld patroon vs werkelijke drukte),
//     met gearceerd rustig-venster. Toekomst = 1 gestippelde voorspel-lijn.
//
// Data komt uit _lib/busyness.ts (de naad naar de latere Google-bron).

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useLocaleTag } from "@/lib/locale-format";
import {
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
  AXIS_TICKS,
  AXIS_LABELS,
  SLOT_COUNT,
  type DayBusyness,
} from "../_lib/busyness";

// Week-offset t.o.v. deze week. We halen prev/cur/next maand op, dus
// -1..+1 week blijft altijd binnen de opgehaalde data.
const MIN_OFFSET = -1;
const MAX_OFFSET = 1;

// SVG-grafiek afmetingen (viewBox-eenheden; schaalt mee naar 100% breed).
const W = 640;
const H = 190;
const PL = 10;
const PR = 10;
const PT = 20;
const PB = 26;
const PLOT_W = W - PL - PR;
const PLOT_H = H - PT - PB;
const BASE_Y = PT + PLOT_H;

// Verwacht/voorspeld = blauw; werkelijk = groen (huisstijl-accent). Blauw
// heeft geen huisstijl-token, dus hier als vaste waarde.
const BLUE = "#2f6cae";

const xAt = (i: number) => PL + (i / (SLOT_COUNT - 1)) * PLOT_W;
const yAt = (v: number) => PT + (1 - v / 100) * PLOT_H;

function linePath(arr: number[]): string {
  return arr
    .map((v, i) => `${i ? "L" : "M"}${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`)
    .join(" ");
}

// Mini-sparkline (dag-strip): compacte polyline over de eigen viewBox.
function sparkPoints(arr: number[]): string {
  return arr
    .map((v, i) => {
      const x = (i / (arr.length - 1)) * 100;
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

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type Props = {
  // Aangeroepen als de eigenaar op "Maak concept" klikt (of een kans
  // aantikt in de strip). De pagina koppelt dit voorlopig aan het
  // scrollen naar de Filly-chat; latere fase: de dag vooraf invullen
  // in de geleide flow.
  onMakeConcept?: (iso: string) => void;
};

export function BusynessCard({ onMakeConcept }: Props) {
  const t = useTranslations("dash__components_busyness");
  const localeTag = useLocaleTag();

  const [occupancy, setOccupancy] = useState<OccupancyDay[]>([]);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);

  const today = useMemo(() => new Date(), []);
  const todayIso = useMemo(() => isoOf(today), [today]);
  const thisMonday = useMemo(() => mondayOfWeek(today), [today]);

  const [offset, setOffset] = useState(0);
  const [col, setCol] = useState(() => {
    // Standaard: vandaag geselecteerd.
    const d = new Date();
    return (d.getDay() + 6) % 7;
  });

  // Occupancy voor prev/cur/next maand ophalen — dekt het hele
  // navigeerbare venster (-1..+1 week) in één keer.
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
      .then((chunks) => {
        if (!cancelled) setOccupancy(chunks.flat());
      })
      .catch(() => {
        if (!cancelled) setOccupancy([]);
      });
    fetchRestaurant()
      .then((r) => !cancelled && setRestaurant(r))
      .catch(() => !cancelled && setRestaurant(null));
    return () => {
      cancelled = true;
    };
  }, [today]);

  const realMap = useMemo(() => occupancyMap(occupancy), [occupancy]);
  const threshold = restaurant?.low_occupancy_threshold ?? 50;

  const monday = useMemo(
    () => addDays(thisMonday, offset * 7),
    [thisMonday, offset],
  );
  const week = useMemo(
    () => buildWeek(monday, realMap, restaurant, threshold, todayIso),
    [monday, realMap, restaurant, threshold, todayIso],
  );
  const day: DayBusyness = week[col] ?? week[0];

  const shortWd = useMemo(
    () => new Intl.DateTimeFormat(localeTag, { weekday: "short" }),
    [localeTag],
  );
  const longWd = useMemo(
    () => new Intl.DateTimeFormat(localeTag, { weekday: "long" }),
    [localeTag],
  );
  const rangeFmt = useMemo(
    () => new Intl.DateTimeFormat(localeTag, { day: "numeric", month: "short" }),
    [localeTag],
  );

  const weekLabel = `${rangeFmt.format(week[0].date)} - ${rangeFmt.format(week[6].date)}`;
  const weekSub =
    offset === 0 ? t("subThis") : offset < 0 ? t("subPrev") : t("subNext");

  const isFuture = day.timeframe === "future";
  const mainLine = isFuture ? day.pattern : (day.actual ?? day.pattern);

  const tfLabel =
    day.timeframe === "today"
      ? t("tfToday")
      : day.timeframe === "future"
        ? t("tfFuture")
        : t("tfPast");

  let note: string;
  if (day.special && !isFuture) note = t("noteSpecialPast", { name: day.special.name });
  else if (day.special && isFuture) note = t("noteSpecialFuture", { name: day.special.name });
  else if (day.isQuiet) note = t("noteKans");
  else note = t("noteNoKans");

  function pick(nextCol: number) {
    setCol(nextCol);
  }

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
            const line = d.actual ?? d.pattern;
            const isToday = d.iso === todayIso;
            return (
              <button
                key={d.iso}
                className={`bz-day${i === col ? " on" : ""}${isToday ? " today" : ""}`}
                aria-label={`${cap(longWd.format(d.date))} ${formatDM(d.date)}`}
                onClick={() => pick(i)}
              >
                <span className="bz-ab">{shortWd.format(d.date).replace(".", "")}</span>
                <span className="bz-dm">{formatDM(d.date)}</span>
                <svg
                  className="bz-spark"
                  viewBox="0 0 100 30"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <polyline
                    points={sparkPoints(line)}
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
            {day.special && (
              <span className="bz-spill">★ {day.special.name}</span>
            )}
          </div>

          <div className="bz-llegend">
            {isFuture ? (
              <>
                <span className="bz-lg">
                  <span className="bz-ln blue dash" />
                  {t("predictedLine")}
                </span>
                <span className="bz-lg bz-hint">{t("predictedNote")}</span>
              </>
            ) : (
              <>
                <span className="bz-lg">
                  <span className="bz-ln blue" />
                  {t("avgLine")}
                </span>
                <span className="bz-lg">
                  <span className="bz-ln" />
                  {t("actualLine")}
                </span>
              </>
            )}
          </div>

          <svg
            className="bz-line"
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`${cap(longWd.format(day.date))} ${formatDM(day.date)}`}
          >
            <line x1={PL} y1={BASE_Y} x2={W - PR} y2={BASE_Y} stroke="var(--border)" />
            {day.quiet && (
              <>
                <rect
                  x={xAt(day.quiet[0]).toFixed(1)}
                  y={PT}
                  width={(xAt(day.quiet[1]) - xAt(day.quiet[0])).toFixed(1)}
                  height={PLOT_H}
                  fill="var(--accent-light)"
                  opacity="0.55"
                />
                <text
                  x={((xAt(day.quiet[0]) + xAt(day.quiet[1])) / 2).toFixed(1)}
                  y={PT + 13}
                  fill="var(--accent-dark)"
                  fontSize="12"
                  fontWeight="600"
                  textAnchor="middle"
                >
                  {t("bandRustig")}
                </text>
              </>
            )}
            {isFuture ? (
              <path
                d={linePath(day.pattern)}
                fill="none"
                stroke={BLUE}
                strokeWidth="2.4"
                strokeDasharray="6 5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : (
              <>
                <path
                  d={linePath(day.pattern)}
                  fill="none"
                  stroke={BLUE}
                  strokeWidth="2.2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <path
                  d={linePath(day.actual ?? day.pattern)}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2.6"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </>
            )}
            {AXIS_TICKS.map((i, k) => (
              <text
                key={i}
                x={xAt(i).toFixed(1)}
                y={H - 8}
                fill="var(--tl)"
                fontSize="11"
                textAnchor="middle"
              >
                {AXIS_LABELS[k]}
              </text>
            ))}
          </svg>

          <div className="bz-foot">
            <p className="bz-note">{note}</p>
            <button className="bz-cta" onClick={() => onMakeConcept?.(day.iso)}>
              {t("ctaFor", { date: formatDM(day.date) })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
