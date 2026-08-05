/**
 * ============================================================
 * Branche-registry — de bron-van-waarheid voor de taxonomie
 * ============================================================
 *
 * Get-Filly begon horeca-only maar bedient meerdere branches
 * (wellness, kappers, sportscholen, ...). Deze registry is dé
 * plek waar we vastleggen wélke branches bestaan. De DB-kolom
 * `restaurants.industry` is vrije tekst (geen check-constraint);
 * validatie gebeurt hier via Zod tegen deze lijst. Gevolg: een
 * nieuwe branche toevoegen = alleen deze file + het bijbehorende
 * industry-pack, géén DB-migratie.
 *
 * Waarom in code en niet in een DB-lookup-tabel? De taxonomie ís
 * gedrag: elke branche bepaalt Filly's vaktaal, toon, timing en
 * kanaalkeuze (het industry-pack). Die regels leven toch in code
 * (net als filly-brain.config.ts), dus de lijst hoort daar ook —
 * één plek om te syncen, geen join-overhead.
 *
 * `enabled` = of de branche in de onboarding kiesbaar is. In deze
 * scaffold-fase is alleen `horeca` volledig uitgewerkt; de rest
 * staat klaar maar valt (nog) terug op de generieke pack-defaults.
 */

/** Alle branches die de registry kent. Uitbreiden = hier + een pack. */
export const INDUSTRIES = [
  'horeca',
  'wellness',
  'kapper',
  'sportschool',
] as const;

export type Industry = (typeof INDUSTRIES)[number];

/** Default-branche: elke bestaande zaak is horeca (zie mig 0066). */
export const DEFAULT_INDUSTRY: Industry = 'horeca';

export interface IndustryMeta {
  slug: Industry;
  /** Mens-leesbaar NL-label voor onboarding/UI. */
  label: string;
  /** Korte omschrijving voor de branche-keuze in onboarding. */
  description: string;
  /**
   * Kiesbaar in de onboarding? In de scaffold-fase alleen horeca af;
   * andere branches erven generieke defaults tot hun pack gevuld is.
   */
  enabled: boolean;
}

export const INDUSTRY_REGISTRY: Record<Industry, IndustryMeta> = {
  horeca: {
    slug: 'horeca',
    label: 'Horeca',
    description: 'Restaurant, café, bistro, brasserie — eten en drinken.',
    enabled: true,
  },
  wellness: {
    slug: 'wellness',
    label: 'Wellness & spa',
    description: 'Sauna, spa, massage- en beautysalon.',
    enabled: false,
  },
  kapper: {
    slug: 'kapper',
    label: 'Kapper & barbier',
    description: 'Kapsalon, barbershop.',
    enabled: false,
  },
  sportschool: {
    slug: 'sportschool',
    label: 'Sportschool',
    description: 'Gym, fitnessclub, personal-training-studio.',
    enabled: false,
  },
};

/** Type-guard: is deze string een geldige branche-slug? */
export function isIndustry(value: unknown): value is Industry {
  return typeof value === 'string' && (INDUSTRIES as readonly string[]).includes(value);
}

/**
 * Normaliseer een (mogelijk lege/onbekende) DB-waarde naar een geldige
 * branche. Onbekend of leeg → horeca. Gebruikt door de pack-resolver en
 * context-opbouw zodat een rare DB-waarde nooit Filly laat crashen.
 */
export function coerceIndustry(value: unknown): Industry {
  return isIndustry(value) ? value : DEFAULT_INDUSTRY;
}

/** Slugs die in de onboarding gekozen mogen worden (enabled=true). */
export function selectableIndustries(): IndustryMeta[] {
  return Object.values(INDUSTRY_REGISTRY).filter((m) => m.enabled);
}
