import type { PlaceDetails } from './types';

/**
 * ============================================================
 * Profiel-audit — deterministische rules-engine
 * ============================================================
 *
 * Loopt ~12 checks over de Place-details en levert een lijst
 * `AuditFinding`s op. Géén Claude-call: deze regels zijn 100%
 * deterministisch, snel, gratis en debugbaar. Bij eventuele
 * AI-suggesties (later) wordt dat een aparte Claude-call.
 *
 * Design-keuzes:
 *   - Severities: 'critical' (bedrijfsstatus fout), 'warning' (mist
 *     kerninfo zoals telefoon/openingstijden), 'tip' (verbeterruimte
 *     zoals weinig foto's). Sortering in UI: critical → warning → tip.
 *   - Elke finding heeft `code`, `severity`, `title`, `description`,
 *     en `actionHint`. Frontend kan op `code` matchen voor speciale
 *     visualisaties; rest is plain tekst.
 *   - Geen scoring (5/10) — een numerieke score nodigt uit tot
 *     gaming en zegt weinig over kwaliteit. We laten de gebruiker
 *     focussen op concrete acties.
 *
 * Bij toevoegen van een check: kijk waar 'ie qua severity past en
 * voeg een case toe in `runChecks()`. Houd descriptions/actionHints
 * NL en op horeca-eigenaar-niveau geschreven.
 * ============================================================
 */

export type AuditSeverity = 'critical' | 'warning' | 'tip';

export interface AuditFinding {
  code: string;
  severity: AuditSeverity;
  title: string;
  description: string;
  // Concrete vervolgactie. Soms 1 zin, soms 2-3.
  actionHint: string;
}

export interface AuditResult {
  // Tijdstempel van wanneer deze audit is gedraaid (= nu) — handig
  // voor de UI om "uitgevoerd om 14:32" te tonen, en als het over
  // gecachete profile-data gaat herinnert de stale-tijd ook hier mee.
  generatedAt: string;
  findings: AuditFinding[];
  // Compacte samenvatting per severity voor de pagina-header.
  summary: {
    critical: number;
    warning: number;
    tip: number;
  };
}

export function runAudit(profile: PlaceDetails): AuditResult {
  const findings: AuditFinding[] = [];

  // ---- Critical checks ----
  // Bedrijfsstatus is hoofdzakelijk OPERATIONAL. Andere waarden
  // betekenen dat Google denkt dat je dicht bent — direct rampzalig
  // voor zichtbaarheid, dus critical.
  if (profile.businessStatus && profile.businessStatus !== 'OPERATIONAL') {
    const labelMap: Record<string, string> = {
      CLOSED_TEMPORARILY: 'tijdelijk gesloten',
      CLOSED_PERMANENTLY: 'permanent gesloten',
    };
    findings.push({
      code: 'business_status_not_operational',
      severity: 'critical',
      title: `Google denkt dat je ${labelMap[profile.businessStatus] ?? 'gesloten'} bent`,
      description:
        'Je profiel staat als gesloten gemarkeerd. Bezoekers zien dit direct in Maps en zoekresultaten — kan een grote impact hebben op klanten.',
      actionHint:
        'Ga naar je Google Business Profile (business.google.com) en zet de status terug op "open". Controleer of er niet per ongeluk een sluitingsdatum is ingevoerd.',
    });
  }

  // ---- Warning checks ----
  // Telefoon ontbreekt — gasten kunnen je niet bellen voor een
  // reservering of vraag. Klassieke "low hanging fruit".
  if (!profile.internationalPhoneNumber) {
    findings.push({
      code: 'missing_phone',
      severity: 'warning',
      title: 'Geen telefoonnummer ingevuld',
      description:
        'Veel gasten klikken liever op "bel" dan dat ze online reserveren. Zonder nummer mis je die conversie.',
      actionHint:
        'Voeg in je Google Business Profile een internationaal telefoonnummer toe (+31 6 …).',
    });
  }

  // Website ontbreekt — gemiste click-out naar je eigen reserveringen.
  if (!profile.websiteUri) {
    findings.push({
      code: 'missing_website',
      severity: 'warning',
      title: 'Geen website-link',
      description:
        'Zonder website-link in je Google-profiel sturen gasten niet door naar jouw eigen reserverings-flow.',
      actionHint:
        'Voeg de URL van je website toe in Google Business Profile → Bewerken → Bedrijfsgegevens.',
    });
  }

  // Openingstijden ontbreken volledig — Google toont dan "geen
  // openingstijden bekend", wat verwarrend is en gasten weghoudt.
  if (
    !profile.regularOpeningHours ||
    profile.regularOpeningHours.weekdayDescriptions.length === 0
  ) {
    findings.push({
      code: 'missing_opening_hours',
      severity: 'warning',
      title: 'Geen openingstijden ingesteld',
      description:
        'Gasten zien "Openingstijden onbekend" naast je naam. Dat is een twijfel-trigger waardoor ze elders kijken.',
      actionHint:
        'Stel je openingstijden per weekdag in via Google Business Profile → Openingstijden.',
    });
  }

  // Beschrijving ontbreekt — Google toont dan niks bij "Over deze
  // zaak". Gemiste sales-pitch in zoekresultaten.
  if (!profile.editorialSummary && !profile.displayName) {
    // We hebben geen toegang tot de eigenaar's eigen beschrijving via
    // Places API; alleen Google's editorial. Dit is daarom een 'tip'
    // tier — gewoonlijk is editorialSummary alleen aanwezig bij grote
    // of bekende plekken.
  }
  if (!profile.editorialSummary) {
    findings.push({
      code: 'missing_editorial_summary',
      severity: 'tip',
      title: 'Geen Google-beschrijving zichtbaar',
      description:
        "Google toont een korte 'Over deze onderneming'-beschrijving bij grotere plekken. Bij jouw onderneming is die nog niet aanwezig — meestal komt die vanzelf zodra je profiel meer foto's en reviews heeft.",
      actionHint:
        "Werk regelmatig je profiel bij. Google's editorial summary verschijnt automatisch zodra je profiel volwassener wordt.",
    });
  }

  // Geen primaire categorie of generieke 'establishment' — Google
  // weet niet hoe het je moet categoriseren in zoekresultaten.
  if (
    !profile.primaryType ||
    profile.primaryType === 'establishment' ||
    profile.primaryType === 'point_of_interest'
  ) {
    findings.push({
      code: 'missing_primary_category',
      severity: 'warning',
      title: 'Geen specifieke hoofdcategorie',
      description:
        'Je profiel mist een specifieke categorie zoals "restaurant", "bistro" of "café". Daardoor verschijn je minder vaak bij relevante zoekopdrachten.',
      actionHint:
        'Stel een specifieke hoofdcategorie in via Google Business Profile → Bewerken → Categorie.',
    });
  }

  // ---- Tip checks ----
  // Foto-volume — meer foto's = meer profiel-views. Onder 10 is
  // mager, onder 5 echt arm. Concurrenten hebben gemiddeld 24 foto's.
  const photoCount = profile.photos.length;
  if (photoCount < 5) {
    findings.push({
      code: 'low_photo_count',
      severity: 'warning',
      title: `Maar ${photoCount} foto${photoCount === 1 ? '' : "'s"} op je profiel`,
      description:
        "Profielen met 10+ foto's krijgen gemiddeld 35% meer views dan die met minder. Je zit nu fors onder dat optimum.",
      actionHint:
        "Upload minimaal 10 foto's: gerechten (5×), interieur (3×), exterieur (1×), team (1×). Nieuwe foto's elke maand houdt je profiel vers.",
    });
  } else if (photoCount < 10) {
    findings.push({
      code: 'low_photo_count',
      severity: 'tip',
      title: `${photoCount} foto's — kan beter`,
      description:
        "Je hebt al wat foto's, maar 10+ is het optimum voor maximale views.",
      actionHint: `Voeg ${10 - photoCount} foto's toe. Mix: gerechten, interieur, exterieur, team.`,
    });
  }

  // Review-volume — onder 10 reviews ben je voor nieuwe gasten een
  // gokje. Mediaan-restaurant in Nederland heeft ~50 reviews.
  if (profile.userRatingCount === null || profile.userRatingCount < 10) {
    findings.push({
      code: 'low_review_count',
      severity: 'warning',
      title: `Maar ${profile.userRatingCount ?? 0} review${profile.userRatingCount === 1 ? '' : 's'}`,
      description:
        'Onder 10 reviews zien gasten je profiel als "nieuw" of "onbekend". Vanaf 30+ reviews kantelt vertrouwen significant.',
      actionHint:
        'Stuur tevreden gasten een korte WhatsApp / mail met je Google-review-link 1-2 dagen na hun bezoek. Tip: maak een QR-code voor op tafel of bij de bon.',
    });
  } else if (profile.userRatingCount < 30) {
    findings.push({
      code: 'low_review_count',
      severity: 'tip',
      title: `${profile.userRatingCount} reviews — bouw door`,
      description:
        'Je hebt een basis, maar 30+ reviews wekt veel meer vertrouwen.',
      actionHint:
        'Blijf actief gasten vragen om reviews. Eén nieuwe review per week is een gezond ritme.',
    });
  }

  // Lage rating — geen oordeel, alleen een nudge naar de eigenaar.
  if (profile.rating !== null && profile.rating < 4.0 && profile.userRatingCount && profile.userRatingCount >= 10) {
    findings.push({
      code: 'rating_below_4',
      severity: 'tip',
      title: `Gemiddelde rating ${profile.rating.toFixed(1)} — onder 4.0`,
      description:
        'Onder 4.0 sterren scrollen veel gasten door naar concurrenten. Vaak gaat het om 1-2 negatieve reviews die de rest neertrekken.',
      actionHint:
        'Reageer op je negatieve reviews met empathie en oplossing. Filly kan je hier antwoorden voor genereren via de Reviews-pagina.',
    });
  }

  // Openingstijden missen weekend — vaak vergeten bij nieuwe profielen
  if (
    profile.regularOpeningHours &&
    profile.regularOpeningHours.weekdayDescriptions.length > 0 &&
    profile.regularOpeningHours.weekdayDescriptions.length < 7
  ) {
    findings.push({
      code: 'incomplete_opening_hours',
      severity: 'warning',
      title: 'Niet alle weekdagen ingevuld',
      description: `Je hebt ${profile.regularOpeningHours.weekdayDescriptions.length} van 7 dagen ingevuld. Voor de ontbrekende dagen toont Google "gesloten" — ook als je open bent.`,
      actionHint:
        'Vul ook de gesloten-dagen expliciet in (als "Gesloten") via Google Business Profile → Openingstijden.',
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    findings: sortBySeverity(findings),
    summary: {
      critical: findings.filter((f) => f.severity === 'critical').length,
      warning: findings.filter((f) => f.severity === 'warning').length,
      tip: findings.filter((f) => f.severity === 'tip').length,
    },
  };
}

// Critical eerst, dan warning, dan tip — past bij hoe de UI ze toont.
const SEVERITY_ORDER: Record<AuditSeverity, number> = {
  critical: 0,
  warning: 1,
  tip: 2,
};
function sortBySeverity(findings: AuditFinding[]): AuditFinding[] {
  return [...findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
}
