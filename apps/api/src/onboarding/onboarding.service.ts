import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { GeocodingService } from '../geocoding/geocoding.service';
import { AuditLogService } from '../common/audit-log.service';
import { GoogleProfileService } from '../google-profile/google-profile.service';

// ============================================================
// OnboardingService — eerste-keer-setup voor een nieuwe user
// ============================================================
// Runt éénmalig per user bij het afronden van de onboarding-wizard:
//   1. Valideert de input (naam + type zijn minimaal nodig).
//   2. Maakt een nieuwe restaurants-rij met de opgegeven basics.
//   3. Koppelt de ingelogde user als OWNER in restaurant_users.
//   4. Zet onboarded_at = now() zodat dashboard 'm niet terugstuurt.
//
// Defense-in-depth:
//   - User mag maar 1× de wizard afronden. Als er al een restaurant
//     aan z'n user-id hangt, weigeren we (409). Anders kan iemand
//     door de wizard heen-en-weer te klikken tientallen restaurants
//     aanmaken.
//   - Alle writes via service_role (standaard), maar we scopen de
//     uniqueness-check op user_id, niet op restaurant_id.
// ============================================================

export type OnboardingInput = {
  // Basics (verplicht)
  name: string;
  type: string; // bistro/brasserie/cafe/...
  // Locatie
  address?: string;
  postal_code?: string;
  city?: string;
  // Branding
  brand_tone?: 'casual' | 'professional' | 'playful';
  description?: string;
  tagline?: string;
  atmosphere?: string;
  target_audience?: string;
  unique_selling_points?: string;
  special_events?: string;
  signature_dishes?: string[];
  cuisine_style?: string[];
  // Web
  website_url?: string;
  website_summary?: string;
  social_media?: Record<string, string>;
  // Google Business Profile (fase B). Optioneel — wizard zet 'm pas
  // als de eigenaar Filly's match-suggestie heeft bevestigd of een
  // andere uit de lijst heeft gekozen. Bij 'overslaan' blijft 'ie
  // null; eigenaar kan later koppelen via de hub.
  google_place_id?: string | null;
  // Operationele velden die WebsiteAnalyzer kan vinden op horeca-sites.
  // Allemaal optioneel — wizard stuurt ze alleen mee als Filly ze
  // daadwerkelijk extracted heeft, anders blijft de DB-kolom null en
  // vult de eigenaar 't later in via /dashboard/account.
  opening_hours?: Record<string, { open: string; close: string }>;
  contact_email?: string;
  contact_phone?: string;
  legal_name?: string;
  // Menu (uit fase C)
  menu_items?: Array<{
    name: string;
    description?: string;
    price_cents?: number;
    category?: string;
    subcategory?: string;
    allergens?: string[];
  }>;
  // Drankkaart (parallelle upload naast menukaart). Server-side
  // dwingen we category='drank' af; de subcategory komt uit Vision
  // (wijn-rood/wijn-wit/bier/cocktail/etc).
  drink_items?: Array<{
    name: string;
    description?: string;
    price_cents?: number;
    subcategory?: string;
  }>;
};

// Resultaat van een onboarding-run. `menuImport` is alleen gevuld
// als de wizard menu-items meestuurde. Zo kan de frontend onderscheid
// maken tussen:
//   - geen menu geüpload         → menuImport = null
//   - menu geïmporteerd           → menuImport.inserted > 0, error = null
//   - menu is mislukt (DB-fout)   → menuImport.inserted = 0, error gevuld
// Bij een mislukte menu-import blijft het restaurant gewoon bestaan;
// de user kan later handmatig of via menu-pagina opnieuw uploaden.
type ImportResult = {
  attempted: number;
  inserted: number;
  error: string | null;
};

export type OnboardingResult = {
  restaurantId: string;
  menuImport: ImportResult | null;
  drinkImport: ImportResult | null;
  // True als Filly's Google-match is geaccepteerd én de connect-call
  // is gelukt. False bij overslaan of bij Places-API-fouten (fail-soft).
  // Frontend kan dit gebruiken voor een "✓ Google-profiel ook gekoppeld"-
  // confirmatie op het succes-scherm.
  googlePlaceConnected: boolean;
};

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly geocoding: GeocodingService,
    private readonly audit: AuditLogService,
    // GoogleProfileService voor de optionele place_id-koppeling die
    // Filly tijdens stap 2 van de wizard heeft voorgesteld.
    private readonly googleProfile: GoogleProfileService,
  ) {}

  async completeOnboarding(
    userId: string,
    input: OnboardingInput,
  ): Promise<OnboardingResult> {
    // Stap 1 — validatie. Frontend doet dit ook, maar dubbel is veilig.
    const name = input.name?.trim();
    const type = input.type?.trim();
    if (!name || name.length < 2) {
      throw new BadRequestException('Naam van de zaak is verplicht.');
    }
    if (!type) {
      throw new BadRequestException('Type zaak is verplicht.');
    }
    if (input.website_url && !isValidUrl(input.website_url)) {
      throw new BadRequestException(
        'De website-URL is ongeldig. Gebruik het volledige adres, bv. https://jouwrestaurant.nl',
      );
    }

    // Stap 2 — bestaat er al een koppeling voor deze user?
    // Sinds 2026-05-01 mag een eigenaar meerdere zaken hebben (vestigingen,
    // 2e zaak, etc.). Vroeger blokkeerden we hier hard met een 409 om
    // accidentele dubbele wizard-runs af te vangen — die bescherming
    // verhuist nu naar de frontend (button-disable na submit + redirect-
    // away na succes). Backend houdt alleen een count voor de audit-log
    // zodat we kunnen zien hoeveelste zaak dit was voor deze eigenaar.
    const { count: existingCount, error: countErr } = await this.supabase.client
      .from('restaurant_users')
      .select('restaurant_id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (countErr) throw new InternalServerErrorException(countErr.message);
    const isAdditionalRestaurant = (existingCount ?? 0) > 0;

    // Stap 3 — FIRST public.users-spiegel-rij aanmaken (idempotent).
    // Zonder deze rij faalt de restaurant_users-insert later op zijn
    // FK (restaurant_users.user_id → public.users.id). Deze rij hoort
    // normaal door /auth/confirm of een trigger gezet te worden, maar
    // bij disabled email-confirmation is er nooit een moment waarop
    // dat gebeurt — dus zelf verzekeren hier.
    const { error: userErr } = await this.supabase.client
      .from('users')
      .upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true });
    if (userErr) throw new InternalServerErrorException(userErr.message);

    // Stap 4 — maak het restaurant aan met de ingevulde basics.
    // onboarded_at vullen we direct: dit ís het einde van de wizard.
    const { data: restaurant, error: createErr } = await this.supabase.client
      .from('restaurants')
      .insert({
        // Basics
        name,
        type,
        slug: slugify(name),
        // Locatie
        address: input.address?.trim() || null,
        postal_code: input.postal_code?.trim() || null,
        city: input.city?.trim() || null,
        country: 'NL',
        // Branding
        brand_tone: input.brand_tone ?? 'casual',
        description: input.description?.trim() || null,
        tagline: input.tagline?.trim() || null,
        atmosphere: input.atmosphere?.trim() || null,
        target_audience: input.target_audience?.trim() || null,
        unique_selling_points: input.unique_selling_points?.trim() || null,
        special_events: input.special_events?.trim() || null,
        signature_dishes: nonEmptyArray(input.signature_dishes),
        cuisine_style: nonEmptyArray(input.cuisine_style),
        // Web
        website_url: input.website_url?.trim() || null,
        website_summary: input.website_summary?.trim() || null,
        social_media: cleanSocialMedia(input.social_media),
        // Operationeel + zakelijk — door WebsiteAnalyzer gevuld als
        // Filly ze op de site kan vinden. Anders null en de eigenaar
        // vult ze later in /dashboard/account.
        opening_hours:
          input.opening_hours && Object.keys(input.opening_hours).length > 0
            ? input.opening_hours
            : null,
        contact_email: input.contact_email?.trim() || null,
        contact_phone: input.contact_phone?.trim() || null,
        legal_name: input.legal_name?.trim() || null,
        // Meta
        onboarded_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (createErr) throw new InternalServerErrorException(createErr.message);

    // Stap 5 — de user als owner koppelen. Dat is het moment waarop
    // RestaurantAccessGuard vanaf nu groen zal zeggen op het dashboard.
    const { error: linkErr } = await this.supabase.client
      .from('restaurant_users')
      .insert({
        restaurant_id: restaurant.id,
        user_id: userId,
        role: 'owner',
      });

    if (linkErr) {
      // Rollback: als de koppeling faalt hebben we een "weesrestaurant"
      // zonder eigenaar. Opruimen zodat we niet in een vreemde
      // half-staat blijven hangen.
      await this.supabase.client
        .from('restaurants')
        .delete()
        .eq('id', restaurant.id);
      throw new InternalServerErrorException(linkErr.message);
    }

    // Stap 6 — eventueel menu_items batch-inserten. Komt van fase C
    // (menu-Vision). Fail-soft: als deze insert flakes, hebben we nog
    // steeds een werkend restaurant — user kan menu-items later
    // handmatig toevoegen via menu-pagina. Maar we maken de fout
    // wél zichtbaar in de response (menuImport.error) zodat de
    // frontend de user kan waarschuwen i.p.v. stil verliezen.
    let menuImport: OnboardingResult['menuImport'] = null;
    if (input.menu_items && input.menu_items.length > 0) {
      const attempted = input.menu_items.length;
      const rows = input.menu_items.map((item) => ({
        restaurant_id: restaurant.id,
        name: item.name.trim(),
        description: item.description?.trim() || null,
        price_cents: item.price_cents ?? null,
        category: item.category?.trim() || null,
        subcategory: item.subcategory?.trim() || null,
        allergens: nonEmptyArray(item.allergens),
      }));
      const { error: menuErr } = await this.supabase.client
        .from('menu_items')
        .insert(rows);
      if (menuErr) {
        // Niet rollbacken: restaurant is nuttig zonder menu. Wel
        // console.error (niet warn) zodat we het in logs terugzien,
        // en meenemen in de response zodat frontend kan reageren.
        console.error(
          `Menu-items-insert gefaald voor ${restaurant.id}: ${menuErr.message}`,
        );
        menuImport = { attempted, inserted: 0, error: menuErr.message };
      } else {
        menuImport = { attempted, inserted: attempted, error: null };
      }
    }

    // Stap 6b — drank_items batch-inserten als de wizard een
    // drankkaart heeft meegestuurd. Identieke menu_items-tabel
    // (zelfde Filly-context, zelfde menu-pagina) maar met server-
    // side category='drank'. Fail-soft, identiek aan menu hierboven.
    let drinkImport: OnboardingResult['drinkImport'] = null;
    if (input.drink_items && input.drink_items.length > 0) {
      const attempted = input.drink_items.length;
      const rows = input.drink_items.map((item) => ({
        restaurant_id: restaurant.id,
        name: item.name.trim(),
        description: item.description?.trim() || null,
        price_cents: item.price_cents ?? null,
        category: 'drank', // server-side gedwongen
        subcategory: item.subcategory?.trim() || null,
      }));
      const { error: drinkErr } = await this.supabase.client
        .from('menu_items')
        .insert(rows);
      if (drinkErr) {
        console.error(
          `Drink-items-insert gefaald voor ${restaurant.id}: ${drinkErr.message}`,
        );
        drinkImport = { attempted, inserted: 0, error: drinkErr.message };
      } else {
        drinkImport = { attempted, inserted: attempted, error: null };
      }
    }

    // Stap 7 — adres → coördinaten via PDOK. Fail-soft: als PDOK
    // het adres niet kent of de call flakes, blijft lat/long null.
    // Geen weer-forecast voor die zaak tot hij z'n adres corrigeert,
    // maar onboarding zelf blokkeert niet. Bewust ná het aanmaken
    // van restaurant + owner-link zodat een geocode-fout geen
    // rollback triggert.
    await this.geocodeAndUpdate(restaurant.id, {
      address: input.address,
      postal_code: input.postal_code,
      city: input.city,
    });

    // Stap 8 — Google Business Profile koppelen als de eigenaar een
    // place_id heeft bevestigd in stap 2 van de wizard. Fail-soft:
    // als de Places-API down is of het place_id ongeldig blijkt, gaat
    // onboarding gewoon door. Eigenaar kan later via de hub alsnog
    // koppelen.
    //
    // Bewust ná de restaurant_users-link zodat connect() (die
    // RequestSupabaseService met user-JWT gebruikt) de update
    // mag uitvoeren — RLS-policy ziet de net-aangemaakte link.
    let googlePlaceConnected = false;
    if (input.google_place_id) {
      try {
        await this.googleProfile.connect(
          restaurant.id,
          userId,
          input.google_place_id,
        );
        googlePlaceConnected = true;
      } catch (err) {
        this.logger.warn(
          `Google-profiel-koppeling tijdens onboarding faalde voor restaurant ${restaurant.id}: ${(err as Error).message}. Eigenaar kan later via de hub koppelen.`,
        );
      }
    }

    // Audit: onboarding-afgerond. Markeert het moment waarop een
    // user een betalende-klant-kandidaat wordt — input voor "gemiddelde
    // tijd-tot-onboarded" en voor support ("wanneer is deze klant
    // begonnen?"). Inclusief telling van geïmporteerde items zodat
    // we kunnen zien hoe rijk de start-data was.
    await this.audit.log({
      restaurantId: restaurant.id,
      userId,
      action: 'onboarding_completed',
      entity_type: 'restaurant',
      entity_id: restaurant.id,
      payload: {
        type,
        had_website: Boolean(input.website_url),
        menu_items_imported: menuImport?.inserted ?? 0,
        drink_items_imported: drinkImport?.inserted ?? 0,
        // Hoeveelste zaak van deze eigenaar — voor support ("klant
        // breidt uit naar 3e vestiging") en cohort-analyse.
        sequence_index: (existingCount ?? 0) + 1,
        is_additional_restaurant: isAdditionalRestaurant,
        google_place_connected: googlePlaceConnected,
      },
    });

    return {
      restaurantId: restaurant.id,
      menuImport,
      drinkImport,
      googlePlaceConnected,
    };
  }

  // Helper: geocode het adres en sla lat/long op het restaurant op.
  // Géén return-value: caller hoeft niet te weten of het lukte. Bij
  // succes: logger.log met weergavenaam. Bij falen: GeocodingService
  // heeft al een warn gelogd — hier stil doorgaan.
  private async geocodeAndUpdate(
    restaurantId: string,
    address: {
      address?: string | null;
      postal_code?: string | null;
      city?: string | null;
    },
  ): Promise<void> {
    const coords = await this.geocoding.geocode(address);
    if (!coords) {
      return;
    }
    const { error } = await this.supabase.client
      .from('restaurants')
      .update({
        latitude: coords.latitude,
        longitude: coords.longitude,
      })
      .eq('id', restaurantId);
    if (error) {
      this.logger.warn(
        `Coords-update gefaald voor ${restaurantId}: ${error.message}`,
      );
      return;
    }
    this.logger.log(
      `Geocode OK voor ${restaurantId}: ${coords.matched_name} (type=${coords.match_type})`,
    );
  }
}

// Retourneer undefined (Postgres laat het dan nullable) i.p.v. een
// lege array te inserten — anders krijg je [] in de DB waar null
// netter is.
function nonEmptyArray(v: string[] | undefined): string[] | null {
  if (!v) return null;
  const filtered = v.map((s) => s.trim()).filter((s) => s.length > 0);
  return filtered.length > 0 ? filtered : null;
}

// social_media kolom is jsonb. We slaan alleen handles/URLs op die
// niet leeg zijn. Leeg object → null (netter dan '{}' in DB).
function cleanSocialMedia(
  v: Record<string, string> | undefined,
): Record<string, string> | null {
  if (!v) return null;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === 'string' && val.trim().length > 0) {
      out[k] = val.trim();
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

// Kleine URL-validator: alleen http(s)-schema's en een hostname.
// Niet super-streng; we willen typos en rare schema's vangen, niet
// elke mogelijke edge-case.
function isValidUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// Maakt een URL-safe slug van de restaurant-naam. Niet uniek (twee
// "Café Centraal" botsen), maar onze restaurants-tabel heeft een
// unique-constraint op slug → bij botsing moeten we rety'en met suffix.
// Voor nu houden we het simpel: als slug al bestaat, voegen we een
// korte random suffix toe. Beter later: slug wordt pas definitief
// bij account-settings.
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // diacrieten weg
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  // Voeg kleine random suffix toe zodat bij "Café Centraal" + "Cafe centraal"
  // geen unique-constraint-botsing optreedt. 5 tekens = genoeg entropy.
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base}-${suffix}`;
}
