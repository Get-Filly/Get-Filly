import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { GeocodingService } from '../geocoding/geocoding.service';

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
  // Menu (uit fase C)
  menu_items?: Array<{
    name: string;
    description?: string;
    price_cents?: number;
    category?: string;
    allergens?: string[];
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
export type OnboardingResult = {
  restaurantId: string;
  menuImport: {
    attempted: number;
    inserted: number;
    error: string | null;
  } | null;
};

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly geocoding: GeocodingService,
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

    // Stap 2 — bestaat er al een koppeling voor deze user? Dan is hij
    // al door onboarding heen. Niet opnieuw een restaurant maken.
    const { data: existing, error: existErr } = await this.supabase.client
      .from('restaurant_users')
      .select('restaurant_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (existErr) throw new InternalServerErrorException(existErr.message);
    if (existing) {
      throw new ConflictException(
        'Je hebt al een restaurant gekoppeld. Herlaad het dashboard.',
      );
    }

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

    return { restaurantId: restaurant.id, menuImport };
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
