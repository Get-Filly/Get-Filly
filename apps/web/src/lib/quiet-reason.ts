// ============================================================
// quiet-reason — waarom Filly juist deze dag koos, in leesbare taal
// ============================================================
//
// De detectie stuurt een sleutel mee (QuietMoment.reasonKey) plus de
// gegevens die erbij horen (reasonParams), niet een kant-en-klare zin. De
// app is NL/EN, dus een in de backend gebouwde zin zou op de Engelse kant
// gewoon Nederlands zijn — dat is precies hoe daypartLabel daar eerder
// stond.
//
// Deze module is de enige plek waar zo'n sleutel een zin wordt. Hij wordt
// gebruikt door de drukte-kaart op het dashboard én door de campagne-
// detailpagina, zodat "waarom deze dag" daar hetzelfde zegt. De teksten
// staan onder common.quietReasons.

export type QuietReasonKey =
  | "structural"
  | "structuralRotated"
  | "unusual"
  | "weatherRain"
  | "weatherCold"
  | "weatherHeat"
  | "eventNearby";

/** Redenen die uit een datum-signaal komen (weer, evenement). */
export const DATE_REASONS: readonly QuietReasonKey[] = [
  "weatherRain",
  "weatherCold",
  "weatherHeat",
  "eventNearby",
];

type Translator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

/**
 * De reden als zin. `t` moet de namespace `common.quietReasons` zijn.
 *
 * Onbekende sleutel → lege string in plaats van een crash of een rauwe
 * sleutel op het scherm: een oudere campagne kan een reden dragen die we
 * inmiddels anders noemen, en dan is niets tonen beter dan "weatherRain".
 */
export function quietReasonText(
  t: Translator,
  reasonKey: string | null | undefined,
  reasonParams?: Record<string, string | number> | null,
): string {
  if (!reasonKey) return "";
  if (!(QUIET_REASON_KEYS as readonly string[]).includes(reasonKey)) return "";
  return t(reasonKey, reasonParams ?? {});
}

const QUIET_REASON_KEYS: readonly QuietReasonKey[] = [
  "structural",
  "structuralRotated",
  "unusual",
  "weatherRain",
  "weatherCold",
  "weatherHeat",
  "eventNearby",
];
