/**
 * ============================================================
 * Permissies-model voor Get Filly — GEDEELD tussen backend & frontend
 * ============================================================
 *
 * Dit bestand is de ÉÉN BRON VAN WAARHEID voor:
 *   1. Welke "modules" er zijn (pagina's/features in het dashboard).
 *   2. Welke rollen bestaan (owner/manager/staff).
 *   3. Welke modules elke rol DEFAULT mag zien.
 *   4. Hoe we uit "rol + eventuele overrides" de uiteindelijke
 *      permissies berekenen.
 *
 * Zowel apps/api (NestJS) als apps/web (Next.js) importeren hieruit
 * via `@getfilly/shared`. Zo kunnen frontend en backend nooit uit
 * sync raken qua module-keys of rol-defaults.
 *
 * Wijzig je iets hier? Beide apps gebruiken automatisch de nieuwe
 * definitie na de eerstvolgende compile / hot-reload.
 */

/**
 * Alle modules in het dashboard. Vul deze aan wanneer je een nieuwe
 * pagina/feature toevoegt.
 *
 * "as const" maakt de array read-only en levert strikte types op —
 * zo weet TypeScript exact welke strings een geldige module-key zijn.
 */
export const MODULES = [
  'dashboard',
  'taken',
  'suggesties',
  'reserveringen',
  'campagnes',
  'gasten',
  // 'marketing' (per 2026-05-06): overkoepelende hub voor alle
  // marketing-kanalen (mail, IG, FB, TikTok, later WhatsApp). Mail is
  // direct live via campaign_sends-data; sociale kanalen volgen na
  // Meta + TikTok approval.
  'marketing',
  // 'google_business' was 'reviews' tot 2026-05-05. Reviews zijn een
  // sub-feature van Google Business Profile, dus de hele sectie is
  // hernoemd naar de bredere hub. Migratie 0033 heeft bestaande
  // jsonb-permissions ook bijgewerkt.
  'google_business',
  'menu',
  'rapportages',
  'koppelingen',
  'account',
  'team',
] as const;

/**
 * Module-key als union-type. Gebruik Module overal waar je een
 * modulenaam verwacht — dan voorkomt TypeScript typfouten.
 *   Module = 'dashboard' | 'taken' | 'suggesties' | ...
 */
export type Module = (typeof MODULES)[number];

/**
 * De drie rollen die we ondersteunen.
 *   - owner:   eigenaar, mag alles (inclusief team-beheer + switcher)
 *   - manager: dagelijks werk, mag bijna alles behalve team-beheer
 *   - staff:   beperkt, alleen wat de eigenaar voor hem/haar aanvinkt
 */
export type Role = 'owner' | 'manager' | 'staff';

/**
 * Default-permissies per rol. Deze worden gebruikt als de user
 * geen custom permissions heeft (permissions = NULL in DB).
 *
 * Let op:
 *   - 'account' staat overal in — iedereen moet zijn eigen profiel
 *     kunnen beheren.
 *   - 'team' staat alleen bij owner — alleen de eigenaar mag
 *     collega's toevoegen/verwijderen en rollen wijzigen.
 *   - Manager heeft 'rapportages' wel — geen bezwaar, maar je kan
 *     dit later verfijnen (bv. geen financiële rapportages).
 */
export const DEFAULT_PERMISSIONS: Record<Role, readonly Module[]> = {
  owner: [
    'dashboard',
    'taken',
    'suggesties',
    'reserveringen',
    'campagnes',
    'gasten',
    'marketing',
    'google_business',
    'menu',
    'rapportages',
    'koppelingen',
    'account',
    'team',
  ],
  manager: [
    'dashboard',
    'taken',
    'suggesties',
    'reserveringen',
    'campagnes',
    'gasten',
    'marketing',
    'google_business',
    'menu',
    'rapportages',
    'account',
    // Geen 'team' en geen 'koppelingen' (eigenaar beheert integraties).
  ],
  staff: [
    'dashboard',
    'reserveringen',
    'gasten',
    'account',
    // Staff krijgt minimaal set. Eigenaar kan extra's toevoegen via
    // custom permissions (bv. 'menu' als je kok ook menu beheert).
  ],
};

/**
 * De structuur die we in restaurant_users.permissions opslaan
 * (als jsonb in de DB). Alleen een array van module-keys.
 */
export type StoredPermissions = {
  modules: Module[];
};

/**
 * Bereken de effectieve permissies voor een user:
 *   - Als er custom permissions zijn opgeslagen: gebruik die.
 *   - Anders: gebruik de defaults voor de rol.
 *
 * Waarom een aparte functie?
 *   Zo is er één plek waar deze logica zit. Als we later willen
 *   bijvoorbeeld "defaults ALTIJD toepassen, custom alleen toevoegen",
 *   wijzigen we het hier en overal werkt het mee.
 */
export function resolvePermissions(
  role: Role,
  customPermissions: StoredPermissions | null,
): readonly Module[] {
  if (customPermissions && Array.isArray(customPermissions.modules)) {
    // Filter ongeldige modulenamen eruit (bv. een oude module die we
    // hebben verwijderd). Dit beschermt ons tegen stale DB-data.
    return customPermissions.modules.filter((m): m is Module =>
      (MODULES as readonly string[]).includes(m),
    );
  }
  return DEFAULT_PERMISSIONS[role];
}

/**
 * Kleine helper om te checken of een user een specifieke module mag.
 * Leesbaarder dan `perms.includes('team')` op elke plek.
 */
export function hasModuleAccess(
  effectivePermissions: readonly Module[],
  module: Module,
): boolean {
  return effectivePermissions.includes(module);
}
