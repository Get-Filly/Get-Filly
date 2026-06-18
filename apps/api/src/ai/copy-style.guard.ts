/**
 * ============================================================
 * Copy-style-guard — AI-tells uit gegenereerde copy poetsen
 * ============================================================
 *
 * Het LLM strooit met gedachtestreepjes (em-dash "—" / en-dash "–") als
 * zinsverbinder ("even op adem komen — dat klinkt goed"). In Nederlandse
 * horeca-marketing leest dat als door-een-AI-geschreven; een eigenaar
 * typt die tekens vrijwel nooit zelf. Net als de copy-length-guard is dit
 * de deterministische correctie áchteraf: het LLM krijgt een prompt-regel
 * mee (zachte hint), maar deze functie garandeert dat de tekens weg zijn.
 *
 * Bewust ALLEEN em/en-dash (de echte tell), NIET het gewone koppelteken
 * "-": dat zit legitiem in samenstellingen ("Oud-Zuid", "3-gangen") en
 * mag blijven. Decimaal-komma's (12,50) blijven ongemoeid omdat we nooit
 * blind een spatie ná een komma forceren.
 */

// Vervangt em/en-dash (+ omringende spaties) door een natuurlijke komma
// en ruimt de leestekens op die daardoor kunnen ontstaan.
export function naturalizeDashes(text: string): string {
  if (!text) return text;
  let out = text
    // em/en-dash met optionele spaties eromheen → komma-met-spatie.
    // "op adem komen — dat" → "op adem komen, dat"
    // "woord—woord" → "woord, woord"
    .replace(/\s*[—–]\s*/g, ', ')
    // opruimen van bijeffecten:
    .replace(/,\s*,/g, ', ') // dubbele komma → één
    .replace(/\s+,/g, ',') // spatie vóór komma weg
    .replace(/[ \t]{2,}/g, ' '); // dubbele spatie weg
  // Komma aan zin-rand (dash stond vooraan/achteraan) netjes wegnemen.
  out = out.replace(/^\s*,\s*/, '').replace(/\s*,\s*$/, '');
  return out;
}

// Loopt een willekeurige (geneste) waarde door en past naturalizeDashes
// toe op élke string. Veilig om breed in te zetten omdat we enkel
// em/en-dashes raken — andere velden (hashtags, prijzen, URLs) bevatten
// die tekens niet. Gebruikt voor het hele suggested_campaign-object zodat
// alle kanaal-bodies/captions/subjects in één keer schoon zijn, ongeacht
// hoe de structuur is opgebouwd.
export function naturalizeSuggestedCampaign<T>(value: T): T {
  return deepNaturalize(value) as T;
}

function deepNaturalize(value: unknown): unknown {
  if (typeof value === 'string') return naturalizeDashes(value);
  if (Array.isArray(value)) return value.map(deepNaturalize);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepNaturalize(v);
    return out;
  }
  return value;
}
