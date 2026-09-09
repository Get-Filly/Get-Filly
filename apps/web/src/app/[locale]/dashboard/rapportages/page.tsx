"use client";

// ============================================================
// /dashboard/rapportages — rapportage per uiting
// ============================================================
// Herbouwd per 2026-09-09. Was een hub met kanaal-tegels waarin mail het
// enige "live" kanaal was (open-rate + klikratio als kern-KPI) en de
// sociale kanalen "Binnenkort"-tegels zonder cijfers. Dat stond omgekeerd
// t.o.v. wat het product doet: social publiceren werkt, mail is uit het
// verhaal.
//
// Nu: één pagina die per uiting rapporteert, organisch én betaald. Alles
// komt uit GET /campaigns/report, dat de view campaign_performance_report
// leest (migratie 0071 + 0072). Eén call voor de hele pagina, dus elke
// kaart ziet gegarandeerd dezelfde cijfers.
//
// BOEKINGEN STAAN HIER BEWUST NIET IN (besluit 2026-09-09). Meta, TikTok
// en Google rapporteren via hun API's bereik, doorkliks, interacties en
// besteed budget — dat kunnen we dus meten. Of iemand daarna écht een
// tafel boekt weten zij niet, en wij ook niet zolang we niet aan een
// reserveringssysteem gekoppeld zijn. Een boekingen-kolom zou dan een
// door de eigenaar zelf ingevuld getal presenteren alsof het gemeten is.
// De kolommen blijven wél in de database en in de API-payload staan
// (`bookings`, `revenue_cents`, `cost_per_booking_cents`), zodat we ze
// kunnen aanzetten zodra ze echt meetbaar zijn. Zie de noot onderaan de
// pagina, die dit ook aan de eigenaar uitlegt.
//
// De bezettings-rapportage en de retentie-cohort blijven waar ze waren
// (/dashboard/rapportages/bezetting): die zijn kanaal-onafhankelijk.
//
// Vormkeuzes (en waarom, zodat ze niet per ongeluk sneuvelen):
//   - Boekingen per kanaal = magnitude, dus één groentint waarin donkerder
//     meer betekent. Het kanaal-identiteitskleurtje zit in het blokje
//     ernaast, niet in de balk.
//   - Een kanaalselectie DIMT de andere kanalen in die grafiek in plaats
//     van ze te verbergen: anders houd je een staafdiagram met één staaf
//     over, en dat is geen diagram.
//   - De budget-donut wisselt naar een stat tile bij één kanaal en naar
//     een tekstregel bij nul. Een cirkel met één punt zegt niets.
//   - Organisch vs betaald is de enige plek waar kleur écht identiteit
//     draagt: groen vs koper, met legenda + labels + de tabel als opvang
//     (koper zit net onder 3:1 contrast op wit).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  fetchCampaignReport,
  type CampaignReport,
  type CampaignReportRow,
  type ReportKind,
} from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { downloadCsv, exportPagePdf } from "@/lib/csv-export";
import { useLocaleTag } from "@/lib/locale-format";
import "./rapportage.css";

// De kanalen die de filterrij aanbiedt, in vaste volgorde. WhatsApp staat
// hier bewust NIET: er is geen verzendpad, dus valt er niets te
// rapporteren. Bestaande rijen met dat kanaal komen wel in de tabel.
const KANALEN = [
  { key: "instagram", kleur: "#E1306C" },
  { key: "facebook", kleur: "#1877F2" },
  { key: "google_business", kleur: "#34A853" },
  { key: "tiktok", kleur: "#111111" },
  { key: "youtube", kleur: "#FF0000" },
] as const;

const KANAAL_KLEUR: Record<string, string> = {
  ...Object.fromEntries(KANALEN.map((k) => [k.key, k.kleur])),
  mail: "#1F4A2D",
  whatsapp: "#25D366",
};

// Sequentiële groen-ramp: donkerder = meer. Voorbij 5 kanalen valt de
// staart terug op de lichtste stap; dat is beter dan hues genereren.
const RAMP = [
  "var(--g700)",
  "var(--g600)",
  "var(--g500)",
  "var(--g400)",
  "var(--g300)",
];

const PERIODES = [7, 30, 90] as const;
const SOORTEN: ReportKind[] = ["all", "organic", "paid"];

export default function RapportagesPage() {
  const t = useTranslations("dash_rapportages_page");
  const localeTag = useLocaleTag();

  const [dagen, setDagen] = useState<(typeof PERIODES)[number]>(30);
  const [soort, setSoort] = useState<ReportKind>("all");
  const [kanalen, setKanalen] = useState<string[]>([]);
  // Eén state-object met de sleutel van de selectie waar het bij hoort.
  // Zo hoeven we geen setState in de effect-body te doen (dat veroorzaakt
  // cascading renders) en kunnen we "laden" afleiden: de gevraagde
  // selectie wijkt af van de geladen selectie. `data` blijft bovendien de
  // laatste geslaagde render, zodat we die op halve dekking kunnen
  // vasthouden i.p.v. een skeleton te flitsen.
  const selectie = `${dagen}|${soort}|${[...kanalen].sort().join(",")}`;
  const [snap, setSnap] = useState<{
    selectie: string;
    data: CampaignReport | null;
    fout: boolean;
  }>({ selectie: "", data: null, fout: false });

  const laden = snap.selectie !== selectie;
  const data = snap.data;
  const fout = snap.selectie === selectie && snap.fout;

  useEffect(() => {
    let afgebroken = false;
    fetchCampaignReport({ days: dagen, kind: soort, channels: kanalen })
      .then((d) => {
        if (afgebroken) return;
        setSnap({ selectie, data: d, fout: false });
      })
      .catch(() => {
        if (afgebroken) return;
        // Vorige data laten staan; de foutmelding komt erboven.
        setSnap((vorig) => ({ selectie, data: vorig.data, fout: true }));
      });
    return () => {
      afgebroken = true;
    };
  }, [dagen, soort, kanalen, selectie]);

  // ---- formatters ----
  const eur = useCallback(
    (cents: number) =>
      new Intl.NumberFormat(localeTag, {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(Math.round(cents / 100)),
    [localeTag],
  );
  const eur2 = useCallback(
    (cents: number) =>
      new Intl.NumberFormat(localeTag, {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2,
      }).format(cents / 100),
    [localeTag],
  );
  const num = useCallback(
    (n: number) => n.toLocaleString(localeTag),
    [localeTag],
  );
  const dm = useCallback(
    (iso: string | null) =>
      iso
        ? new Date(iso).toLocaleDateString(localeTag, {
            day: "numeric",
            month: "short",
          })
        : "—",
    [localeTag],
  );

  const kanaalNaam = useCallback(
    (key: string) => {
      // Onbekend kanaal (bv. een oude waarde) tonen we ruw i.p.v. leeg.
      const bekend = [
        "instagram",
        "facebook",
        "tiktok",
        "youtube",
        "google_business",
        "mail",
        "whatsapp",
      ];
      return bekend.includes(key) ? t(`channels.${key}`) : key;
    },
    [t],
  );

  const toggleKanaal = (key: string) => {
    setKanalen((huidig) => {
      const next = huidig.includes(key)
        ? huidig.filter((k) => k !== key)
        : [...huidig, key];
      // Alles aangevinkt is hetzelfde als geen filter.
      return next.length === KANALEN.length ? [] : next;
    });
  };

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(
      "rapportage-uitingen",
      [
        t("table.thName"),
        t("table.thChannel"),
        t("table.thDate"),
        t("table.thKind"),
        t("table.thReach"),
        t("table.thClicks"),
        t("table.thCtr"),
        t("table.thInteractions"),
        t("table.thBudget"),
        t("table.thPerClick"),
        t("table.thVerdict"),
      ],
      data.rows.map((r) => [
        r.campaign_name,
        kanaalNaam(r.channel),
        r.happened_at ? r.happened_at.slice(0, 10) : "",
        r.paid ? t("split.paid") : t("split.organic"),
        String(r.reach ?? ""),
        String(r.clicks ?? ""),
        r.reach && r.clicks !== null
          ? ((r.clicks / r.reach) * 100).toFixed(1)
          : "",
        String(r.interactions ?? ""),
        r.spend_cents ? (r.spend_cents / 100).toFixed(2) : "",
        r.spend_cents && r.clicks
          ? (r.spend_cents / r.clicks / 100).toFixed(2)
          : "",
        verdictLabel(r, t),
      ]),
    );
  };

  const filterMeta = useMemo(() => {
    if (!data) return "";
    const kanaalTxt = kanalen.length
      ? KANALEN.filter((k) => kanalen.includes(k.key))
          .map((k) => kanaalNaam(k.key))
          .join(", ")
      : t("filters.metaAll");
    const soortTxt =
      soort === "all"
        ? t("filters.metaKindAll")
        : soort === "organic"
          ? t("filters.metaKindOrganic")
          : t("filters.metaKindPaid");
    return `${dm(data.from)} — ${dm(data.to)} · ${kanaalTxt} · ${soortTxt}`;
  }, [data, kanalen, soort, t, dm, kanaalNaam]);

  return (
    <div className="page-full rap">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <>
            <Link
              href="/dashboard/rapportages/bezetting"
              className="ui-btn ui-btn--secondary ui-btn--sm"
            >
              {t("occupancyLink")}
            </Link>
            <Button variant="secondary" onClick={exportPagePdf}>
              {t("actions.pdf")}
            </Button>
            <Button variant="primary" onClick={exportCsv} disabled={!data}>
              {t("actions.exportCsv")}
            </Button>
          </>
        }
      />

      {/* Eén filterrij boven alles wat ze scopet, niet per kaart. */}
      <div className="rap-filters">
        <span className="rap-fgroup">
          <span className="rap-lbl">{t("filters.period")}</span>
          <span className="rap-seg">
            {PERIODES.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={dagen === p}
                onClick={() => setDagen(p)}
              >
                {t("filters.days", { n: p })}
              </button>
            ))}
          </span>
        </span>
        <span className="rap-fgroup">
          <span className="rap-lbl">{t("filters.kind")}</span>
          <span className="rap-seg">
            {SOORTEN.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={soort === s}
                onClick={() => setSoort(s)}
              >
                {s === "all"
                  ? t("filters.kindAll")
                  : s === "organic"
                    ? t("filters.kindOrganic")
                    : t("filters.kindPaid")}
              </button>
            ))}
          </span>
        </span>
        <span className="rap-fgroup">
          <span className="rap-lbl">{t("filters.channel")}</span>
          <span className="rap-chips">
            <button
              type="button"
              className="rap-chip"
              aria-pressed={kanalen.length === 0}
              onClick={() => setKanalen([])}
            >
              {t("filters.channelAll")}
            </button>
            {KANALEN.map((k) => (
              <button
                key={k.key}
                type="button"
                className="rap-chip"
                aria-pressed={kanalen.includes(k.key)}
                onClick={() => toggleKanaal(k.key)}
              >
                <i style={{ background: k.kleur }} />
                {kanaalNaam(k.key)}
              </button>
            ))}
          </span>
        </span>
      </div>

      <p className="rap-meta">
        {data ? (
          <>
            <b>{data.totals.uitingen}</b> · {filterMeta}
          </>
        ) : laden ? (
          t("loading")
        ) : (
          ""
        )}
      </p>

      {fout && (
        <Card>
          <p className="rap-empty">{t("error")}</p>
        </Card>
      )}

      {/* Bij een refetch houden we de vorige render vast op halve dekking:
          geen skeleton-flits en geen layout-sprong. */}
      {data && (
        <div style={{ opacity: laden ? 0.55 : 1, transition: "opacity .15s" }}>
          <Kpis data={data} t={t} eur={eur} eur2={eur2} num={num} />

          <div className="rap-grid2">
            <PerKanaal
              data={data}
              gekozen={kanalen}
              t={t}
              num={num}
              kanaalNaam={kanaalNaam}
            />
            <Budget
              data={data}
              t={t}
              eur={eur}
              eur2={eur2}
              kanaalNaam={kanaalNaam}
            />
          </div>

          <div className="rap-grid1">
            <Split data={data} t={t} eur={eur} num={num} kanaalNaam={kanaalNaam} />
          </div>

          <div className="rap-grid1">
            <Trend data={data} t={t} num={num} localeTag={localeTag} />
          </div>

          <h2 className="rap-sec">{t("scores.sectionTitle")}</h2>
          <div className="rap-grid1">
            <Scores data={data} t={t} />
          </div>

          <div className="rap-grid1">
            <Tabel
              data={data}
              t={t}
              eur={eur}
              eur2={eur2}
              num={num}
              dm={dm}
              kanaalNaam={kanaalNaam}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Hulpjes
// ============================================================

type T = ReturnType<typeof useTranslations<"dash_rapportages_page">>;

function verdictLabel(r: CampaignReportRow, t: T): string {
  if (r.classification === "winner") return t("scores.winner");
  if (r.classification === "average") return t("scores.average");
  if (r.classification === "underperformer") return t("scores.underperformer");
  return t("scores.pending");
}

function verdictKleur(r: CampaignReportRow): string {
  if (r.classification === "winner") return "var(--success, #16A34A)";
  if (r.classification === "average") return "#F59E0B";
  if (r.classification === "underperformer") return "var(--danger, #DC2626)";
  return "var(--text-muted)";
}

// ============================================================
// KPI-rij
// ============================================================
function Kpis({
  data,
  t,
  eur,
  eur2,
  num,
}: {
  data: CampaignReport;
  t: T;
  eur: (c: number) => string;
  eur2: (c: number) => string;
  num: (n: number) => string;
}) {
  const { totals, previous, filters } = data;
  // Minder dan 2 uitingen in de vorige periode? Dan geeft de backend
  // previous=null, want een percentage zou misleidend precies zijn.
  const pct =
    previous && previous.reach > 0
      ? Math.round(((totals.reach - previous.reach) / previous.reach) * 100)
      : null;
  const ctr =
    totals.reach > 0 ? ((totals.clicks / totals.reach) * 100).toFixed(1) : null;

  return (
    <div className="rap-kpis">
      <div className="rap-kpi hero">
        <div className="rap-kpi-lbl">{t("kpi.reachHero")}</div>
        <div className="rap-kpi-val">{num(totals.reach)}</div>
        <div className="rap-kpi-sub">
          {pct === null ? (
            <span style={{ color: "var(--text-muted)" }}>
              {t("kpi.noHistory")}
            </span>
          ) : (
            <>
              <span className={`rap-delta ${pct >= 0 ? "up" : "down"}`}>
                {pct >= 0 ? "▲" : "▼"} {Math.abs(pct)}%
              </span>{" "}
              {t("kpi.vsPrevious", { n: filters.days })}
            </>
          )}
        </div>
      </div>
      <div className="rap-kpi">
        <div className="rap-kpi-lbl">{t("kpi.clicks")}</div>
        <div className="rap-kpi-val">{num(totals.clicks)}</div>
        <div className="rap-kpi-sub">
          {ctr ? t("kpi.clickRate", { pct: ctr }) : "—"}
        </div>
      </div>
      <div className="rap-kpi">
        <div className="rap-kpi-lbl">{t("kpi.interactions")}</div>
        <div className="rap-kpi-val">{num(totals.interactions)}</div>
        <div className="rap-kpi-sub">{t("kpi.interactionsSub")}</div>
      </div>
      <div className="rap-kpi">
        <div className="rap-kpi-lbl">{t("kpi.budget")}</div>
        <div className="rap-kpi-val">
          {totals.spendCents ? eur(totals.spendCents) : "—"}
        </div>
        <div className="rap-kpi-sub">
          {t("kpi.paidOf", {
            paid: totals.paidUitingen,
            total: totals.uitingen,
          })}
        </div>
      </div>
      <div className="rap-kpi">
        <div className="rap-kpi-lbl">{t("kpi.costPerClick")}</div>
        <div className="rap-kpi-val">
          {totals.costPerClickCents ? eur2(totals.costPerClickCents) : "—"}
        </div>
        <div className="rap-kpi-sub">
          {totals.costPerClickCents
            ? t("kpi.overPaidClicks", { n: totals.paidClicks })
            : t("kpi.noPaid")}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Boekingen per kanaal
// ============================================================
function PerKanaal({
  data,
  gekozen,
  t,
  num,
  kanaalNaam,
}: {
  data: CampaignReport;
  gekozen: string[];
  t: T;
  num: (n: number) => string;
  kanaalNaam: (k: string) => string;
}) {
  const rijen = data.byChannel;
  const max = Math.max(...rijen.map((r) => r.reach), 1);
  // Het kanaal met de hoogste doorklik-ratio, gerekend en niet vast.
  const beste = [...rijen]
    .filter((r) => r.reach > 0)
    .sort((a, b) => b.clicks / b.reach - a.clicks / a.reach)[0];

  return (
    <Card>
      <div className="rap-card-hd">
        <p className="rap-card-t">{t("perChannel.title")}</p>
        <p className="rap-card-s">
          {gekozen.length
            ? t("perChannel.subtitleFiltered")
            : t("perChannel.subtitle")}
        </p>
      </div>
      {rijen.length === 0 ? (
        <p className="rap-empty">{t("perChannel.empty")}</p>
      ) : (
        <>
          <div className="rap-bars">
            {rijen.map((r, i) => {
              const aan = gekozen.length === 0 || gekozen.includes(r.channel);
              return (
                <div
                  key={r.channel}
                  className={`rap-bar-row${aan ? "" : " off"}`}
                  title={t("perChannel.tip", {
                    reach: num(r.reach),
                    n: r.uitingen,
                    clicks: r.clicks,
                    interactions: r.interactions,
                  })}
                >
                  <span className="rap-bar-lbl">
                    <i
                      className="rap-ch-ic"
                      style={{
                        background: KANAAL_KLEUR[r.channel] ?? "var(--brand)",
                      }}
                    />
                    {kanaalNaam(r.channel)}
                  </span>
                  <span className="rap-bar-track">
                    <span
                      className="rap-bar-fill"
                      style={{
                        width: `${((r.reach / max) * 100).toFixed(1)}%`,
                        background: aan
                          ? (RAMP[i] ?? "var(--g300)")
                          : "var(--rap-dim)",
                      }}
                    />
                  </span>
                  <span className="rap-bar-val">{num(r.reach)}</span>
                </div>
              );
            })}
          </div>
          {beste && beste.clicks > 0 && (
            <div className="rap-note">
              {t("perChannel.bestCtr", {
                channel: kanaalNaam(beste.channel),
                clicks: beste.clicks,
                reach: num(beste.reach),
                pct: ((beste.clicks / beste.reach) * 100).toFixed(1),
              })}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ============================================================
// Budget: donut bij 2+, stat tile bij 1, tekst bij 0
// ============================================================
function Budget({
  data,
  t,
  eur,
  eur2,
  kanaalNaam,
}: {
  data: CampaignReport;
  t: T;
  eur: (c: number) => string;
  eur2: (c: number) => string;
  kanaalNaam: (k: string) => string;
}) {
  const posten = data.byChannel
    .filter((c) => c.spendCents > 0)
    .sort((a, b) => b.spendCents - a.spendCents);
  const totaal = posten.reduce((s, p) => s + p.spendCents, 0);

  const R = 66;
  const SW = 22;
  const C = 88;
  const circ = 2 * Math.PI * R;

  return (
    <Card>
      <div className="rap-card-hd">
        <p className="rap-card-t">{t("budget.title")}</p>
        <p className="rap-card-s">
          {posten.length > 1
            ? t("budget.subtitleSplit", {
                total: eur(totaal),
                n: posten.length,
              })
            : posten.length === 1
              ? t("budget.subtitleSingle")
              : t("budget.subtitle")}
        </p>
      </div>

      {posten.length === 0 && <p className="rap-empty">{t("budget.empty")}</p>}

      {posten.length === 1 && (
        <div style={{ padding: "12px 2px 6px" }}>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            {t("budget.spentOn", { channel: kanaalNaam(posten[0].channel) })}
          </div>
          <div
            style={{
              fontSize: 40,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
            }}
          >
            {eur(posten[0].spendCents)}
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--text-soft)",
              marginTop: 6,
            }}
          >
            {posten[0].paidBookings > 0
              ? t("budget.bookingsAnd", {
                  n: posten[0].paidBookings,
                  cost: eur2(
                    Math.round(posten[0].spendCents / posten[0].paidBookings),
                  ),
                })
              : t("kpi.noPaid")}
          </div>
        </div>
      )}

      {posten.length > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          <svg width="176" height="176" viewBox="0 0 176 176" aria-hidden="true">
            <circle
              cx={C}
              cy={C}
              r={R}
              fill="none"
              stroke="var(--rap-hair)"
              strokeWidth={SW}
            />
            {
              posten.reduce<{ offset: number; nodes: React.ReactNode[] }>(
                (acc, p, i) => {
                  const frac = p.spendCents / totaal;
                  // 2px oppervlak-gat tussen segmenten i.p.v. een randje.
                  const len = Math.max(0, circ * frac - 3);
                  acc.nodes.push(
                    <circle
                      key={p.channel}
                      cx={C}
                      cy={C}
                      r={R}
                      fill="none"
                      stroke={RAMP[i] ?? "var(--g300)"}
                      strokeWidth={SW}
                      strokeDasharray={`${len} ${circ - len}`}
                      strokeDashoffset={-acc.offset}
                      transform={`rotate(-90 ${C} ${C})`}
                    />,
                  );
                  acc.offset += circ * frac;
                  return acc;
                },
                { offset: 0, nodes: [] },
              ).nodes
            }
            <text
              x={C}
              y={C - 4}
              textAnchor="middle"
              fontSize="21"
              fontWeight="700"
              fill="var(--text)"
            >
              {eur(totaal)}
            </text>
            <text
              x={C}
              y={C + 14}
              textAnchor="middle"
              fontSize="11"
              fill="var(--text-muted)"
            >
              {t("budget.spent")}
            </text>
          </svg>
          <div
            style={{
              flex: 1,
              minWidth: 150,
              display: "flex",
              flexDirection: "column",
              gap: 9,
            }}
          >
            {posten.map((p, i) => (
              <div
                key={p.channel}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                }}
              >
                <i
                  className="rap-swatch"
                  style={{ background: RAMP[i] ?? "var(--g300)" }}
                />
                <span style={{ flex: 1 }}>{kanaalNaam(p.channel)}</span>
                <b style={{ fontVariantNumeric: "tabular-nums" }}>
                  {eur(p.spendCents)}
                </b>
                <span
                  style={{
                    color: "var(--text-muted)",
                    width: 38,
                    textAlign: "right",
                  }}
                >
                  {Math.round((p.spendCents / totaal) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// ============================================================
// Organisch vs betaald
// ============================================================
function Split({
  data,
  t,
  eur,
  num,
  kanaalNaam,
}: {
  data: CampaignReport;
  t: T;
  eur: (c: number) => string;
  num: (n: number) => string;
  kanaalNaam: (k: string) => string;
}) {
  // Alleen de kanalen in de actieve selectie: dit is een deel-van-geheel
  // per kanaal, geen vergelijking met de rest.
  const gekozen = data.filters.channels;
  const rijen = data.byChannel
    .filter((c) => (gekozen.length ? gekozen.includes(c.channel) : true))
    .filter((c) => c.reach > 0);
  const max = Math.max(...rijen.map((r) => r.reach), 1);
  const tOrg = rijen.reduce((s, r) => s + r.organicReach, 0);
  const tPaid = rijen.reduce((s, r) => s + r.paidReach, 0);
  const tBud = rijen.reduce((s, r) => s + r.spendCents, 0);

  return (
    <Card>
      <div className="rap-card-hd">
        <p className="rap-card-t">{t("split.title")}</p>
        <p className="rap-card-s">{t("split.subtitle")}</p>
      </div>
      <div className="rap-legend">
        <span>
          <i className="rap-swatch" style={{ background: "var(--organic)" }} />
          {t("split.organic")}
        </span>
        <span>
          <i className="rap-swatch" style={{ background: "var(--paid)" }} />
          {t("split.paid")}
        </span>
      </div>
      {rijen.length === 0 ? (
        <p className="rap-empty">{t("split.empty")}</p>
      ) : (
        <>
          <div className="rap-bars">
            {rijen.map((r) => {
              const breedte = ((r.reach / max) * 100).toFixed(1);
              const o = ((r.organicReach / r.reach) * 100).toFixed(1);
              const p = ((r.paidReach / r.reach) * 100).toFixed(1);
              // Label alleen in het segment als het ruim past. De waarde
              // staat altijd in het rij-totaal en in de tabel. Bereik-
              // getallen zijn lang, dus de drempel ligt hoger dan bij
              // boekingen: pas vanaf 22% van de breedste rij.
              const toonO = (r.organicReach / max) * 100 >= 22;
              const toonP = (r.paidReach / max) * 100 >= 22;
              return (
                <div key={r.channel} className="rap-bar-row">
                  <span className="rap-bar-lbl">
                    <i
                      className="rap-ch-ic"
                      style={{
                        background: KANAAL_KLEUR[r.channel] ?? "var(--brand)",
                      }}
                    />
                    {kanaalNaam(r.channel)}
                  </span>
                  <span
                    className="rap-bar-track"
                    style={{ background: "transparent" }}
                  >
                    <span className="rap-stack" style={{ width: `${breedte}%` }}>
                      {r.organicReach > 0 && (
                        <i
                          style={{ width: `${o}%`, background: "var(--organic)" }}
                          title={`${kanaalNaam(r.channel)} · ${t("split.organic")}: ${num(r.organicReach)}`}
                        >
                          {toonO && (
                            <span className="rap-seg-lbl">
                              {num(r.organicReach)}
                            </span>
                          )}
                        </i>
                      )}
                      {r.paidReach > 0 && (
                        <i
                          style={{ width: `${p}%`, background: "var(--paid)" }}
                          title={`${kanaalNaam(r.channel)} · ${t("split.paid")}: ${num(r.paidReach)}`}
                        >
                          {toonP && (
                            <span className="rap-seg-lbl">
                              {num(r.paidReach)}
                            </span>
                          )}
                        </i>
                      )}
                    </span>
                  </span>
                  <span className="rap-bar-val">{num(r.reach)}</span>
                </div>
              );
            })}
          </div>
          <div className="rap-note">
            {tPaid > 0 && tOrg > 0
              ? t("split.noteBoth", {
                  paid: num(tPaid),
                  total: num(tOrg + tPaid),
                  budget: eur(tBud),
                })
              : tPaid > 0
                ? t("split.notePaidOnly", { budget: eur(tBud) })
                : t("split.noteOrganicOnly")}
          </div>
        </>
      )}
    </Card>
  );
}

// ============================================================
// Verloop over tijd
// ============================================================
function Trend({
  data,
  t,
  num,
  localeTag,
}: {
  data: CampaignReport;
  t: T;
  num: (n: number) => string;
  localeTag: string;
}) {
  const buckets = data.buckets;
  const perDag = data.bucketSizeDays === 1;
  const n = buckets.length;
  const W = 1040;
  const H = 220;
  const PL = 44;
  const PR = 16;
  const PT = 16;
  const PB = 34;
  const iw = W - PL - PR;
  const ih = H - PT - PB;
  // Bovengrens deelbaar door 4, zodat de ticks hele getallen zijn.
  // Bovengrens afronden op iets nets: bereik loopt in duizenden, dus
  // ronden we op een veelvoud van 4 "stappen" van 500 af.
  const ruw = Math.max(...buckets.map((b) => b.reach), 0);
  const stap = Math.max(500, Math.ceil(ruw / 4 / 500) * 500);
  const max = Math.max(stap * 4, 2000);
  const x = (i: number) => (n === 1 ? PL + iw / 2 : PL + (iw / (n - 1)) * i);
  const y = (v: number) => PT + ih - (v / max) * ih;
  const label = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(localeTag, {
      day: "numeric",
      month: "short",
    });
  const piek = buckets.reduce(
    (best, b, i) => (b.reach > buckets[best].reach ? i : best),
    0,
  );
  const markers = Array.from(new Set([piek, n - 1]));
  const skip = n > 8 ? 2 : 1;

  return (
    <Card>
      <div className="rap-card-hd">
        <p className="rap-card-t">{t("trend.title")}</p>
        <p className="rap-card-s">
          {perDag
            ? t("trend.subtitleDaily")
            : t("trend.subtitleWeekly", { n: data.filters.days })}
        </p>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        role="img"
        aria-label={t("trend.title")}
      >
        {/* Rasterlijnen: doorlopende haarlijnen, nooit gestreept. */}
        {[0, 1, 2, 3, 4].map((tick) => {
          const v = (max / 4) * tick;
          return (
            <g key={tick}>
              <line
                x1={PL}
                x2={W - PR}
                y1={y(v)}
                y2={y(v)}
                stroke="var(--rap-grid)"
                strokeWidth={1}
              />
              <text
                x={PL - 10}
                y={y(v) + 4}
                textAnchor="end"
                fontSize="11"
                fill="var(--text-muted)"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {/* Duizenden afkorten, anders duwt de as-tekst het vlak weg. */}
                {v >= 1000 ? `${v / 1000}k` : v}
              </text>
            </g>
          );
        })}
        {n > 1 && (
          <>
            <polygon
              points={`${buckets.map((b, i) => `${x(i)},${y(b.reach)}`).join(" ")} ${x(n - 1)},${y(0)} ${x(0)},${y(0)}`}
              fill="var(--organic)"
              opacity={0.13}
            />
            <polyline
              points={buckets
                .map((b, i) => `${x(i)},${y(b.reach)}`)
                .join(" ")}
              fill="none"
              stroke="var(--organic)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* Alleen de piek en het eindpunt krijgen een marker + label. */}
            {markers.map((i) => (
              <g key={i}>
                <circle
                  cx={x(i)}
                  cy={y(buckets[i].reach)}
                  r={4.5}
                  fill="var(--organic)"
                  stroke="var(--white)"
                  strokeWidth={2}
                />
                <text
                  x={x(i)}
                  y={y(buckets[i].reach) - 12}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="700"
                  fill="var(--text)"
                >
                  {num(buckets[i].reach)}
                </text>
              </g>
            ))}
          </>
        )}
        {/* De assebalk hoort binnen de container, anders krijgt de kaart
            een eigen scrollbar. */}
        <line
          x1={PL}
          x2={W - PR}
          y1={y(0)}
          y2={y(0)}
          stroke="var(--rap-axis)"
          strokeWidth={1}
        />
        {buckets.map((b, i) =>
          i % skip !== 0 && i !== n - 1 ? null : (
            <text
              key={b.from}
              x={x(i)}
              y={H - 12}
              textAnchor="middle"
              fontSize="11"
              fill="var(--text-muted)"
            >
              {label(b.from)}
            </text>
          ),
        )}
        {/* Hitzones, ruim genoeg om te raken. */}
        {buckets.map((b, i) => {
          const bw = n === 1 ? iw : iw / (n - 1);
          return (
            <rect
              key={`hit-${b.from}`}
              x={x(i) - bw / 2}
              y={PT}
              width={bw}
              height={ih}
              fill="transparent"
            >
              <title>
                {perDag
                  ? t("trend.tipDay", {
                      date: label(b.from),
                      reach: num(b.reach),
                      clicks: b.clicks,
                      n: b.uitingen,
                    })
                  : t("trend.tipWeek", {
                      date: label(b.from),
                      reach: num(b.reach),
                      clicks: b.clicks,
                      n: b.uitingen,
                    })}
              </title>
            </rect>
          );
        })}
      </svg>
    </Card>
  );
}

// ============================================================
// Score-strip
// ============================================================
function Scores({ data, t }: { data: CampaignReport; t: T }) {
  const s = data.scores;
  const groepen = [
    { label: t("scores.winner"), n: s.winner, kleur: "var(--success, #16A34A)" },
    { label: t("scores.average"), n: s.average, kleur: "#F59E0B" },
    {
      label: t("scores.underperformer"),
      n: s.underperformer,
      kleur: "var(--danger, #DC2626)",
    },
    {
      label: t("scores.pending"),
      n: s.pending + s.no_data,
      kleur: "var(--text-muted)",
    },
  ];
  return (
    <Card>
      <div className="rap-card-hd">
        <p className="rap-card-t">{t("scores.title")}</p>
        <p className="rap-card-s">{t("scores.subtitle")}</p>
      </div>
      <div className="rap-scores">
        {groepen.map((g) => (
          <div key={g.label} className="rap-score">
            <div className="rap-score-top">
              <i className="rap-dot" style={{ background: g.kleur }} />
              {g.label}
            </div>
            <div className="rap-score-n">{g.n}</div>
          </div>
        ))}
      </div>
      <div className="rap-note">
        {s.scored === 0
          ? t("scores.noneScored")
          : t("scores.noteConversion", {
              n: s.conversionOnly,
              total: s.scored,
            })}
      </div>
    </Card>
  );
}

// ============================================================
// Tabel — alle cijfers, en de opvang voor de kleuren die op wit
// onder 3:1 contrast zitten.
// ============================================================
function Tabel({
  data,
  t,
  eur,
  eur2,
  num,
  dm,
  kanaalNaam,
}: {
  data: CampaignReport;
  t: T;
  eur: (c: number) => string;
  eur2: (c: number) => string;
  num: (n: number) => string;
  dm: (iso: string | null) => string;
  kanaalNaam: (k: string) => string;
}) {
  return (
    <Card>
      <div className="rap-card-hd">
        <p className="rap-card-t">{t("table.title")}</p>
        <p className="rap-card-s">
          {t("table.subtitle", { n: data.rows.length })}
        </p>
      </div>
      {data.rows.length === 0 ? (
        <p className="rap-empty">{t("table.empty")}</p>
      ) : (
        <div className="rap-tbl-wrap">
          <table className="rap-tbl">
            <thead>
              <tr>
                <th>{t("table.thName")}</th>
                <th>{t("table.thChannel")}</th>
                <th>{t("table.thDate")}</th>
                <th>{t("table.thKind")}</th>
                <th className="num">{t("table.thReach")}</th>
                <th className="num">{t("table.thClicks")}</th>
                <th className="num">{t("table.thCtr")}</th>
                <th className="num">{t("table.thInteractions")}</th>
                <th className="num">{t("table.thBudget")}</th>
                <th className="num">{t("table.thPerClick")}</th>
                <th>{t("table.thVerdict")}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.campaign_id}>
                  <td>{r.campaign_name}</td>
                  <td>
                    <span className="rap-ch">
                      <i
                        className="rap-ch-ic"
                        style={{
                          background: KANAAL_KLEUR[r.channel] ?? "var(--brand)",
                        }}
                      />
                      {kanaalNaam(r.channel)}
                    </span>
                  </td>
                  <td>{dm(r.happened_at)}</td>
                  <td>
                    <span className="rap-pill">
                      <i
                        className="rap-swatch"
                        style={{
                          background: r.paid ? "var(--paid)" : "var(--organic)",
                        }}
                      />
                      {r.paid ? t("split.paid") : t("split.organic")}
                    </span>
                  </td>
                  <td className="num">
                    {r.reach !== null ? <b>{num(r.reach)}</b> : "—"}
                  </td>
                  <td className="num">{r.clicks !== null ? r.clicks : "—"}</td>
                  <td className="num">
                    {r.reach && r.clicks !== null
                      ? `${((r.clicks / r.reach) * 100).toFixed(1)}%`
                      : "—"}
                  </td>
                  <td className="num">
                    {r.interactions !== null ? num(r.interactions) : "—"}
                  </td>
                  <td className="num">
                    {r.spend_cents ? eur(r.spend_cents) : "—"}
                  </td>
                  <td className="num">
                    {r.spend_cents && r.clicks
                      ? eur2(Math.round(r.spend_cents / r.clicks))
                      : "—"}
                  </td>
                  <td>
                    <span className="rap-pill">
                      <i
                        className="rap-dot"
                        style={{ background: verdictKleur(r) }}
                      />
                      {verdictLabel(r, t)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="rap-note">{t("bookingsNote")}</div>
    </Card>
  );
}
