import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

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
  name: string;
  type: string; // bistro/brasserie/cafe/...
  // Adres — straat+nummer in één veld is makkelijker te verzamelen
  // dan apart; we splitsen niet want Supabase's restaurants.address
  // is al één text-veld.
  address?: string;
  postal_code?: string;
  city?: string;
  website_url?: string;
  description?: string;
  brand_tone?: 'casual' | 'professional' | 'playful';
};

export type OnboardingResult = {
  restaurantId: string;
};

@Injectable()
export class OnboardingService {
  constructor(private readonly supabase: SupabaseService) {}

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
        name,
        type,
        slug: slugify(name),
        address: input.address?.trim() || null,
        postal_code: input.postal_code?.trim() || null,
        city: input.city?.trim() || null,
        country: 'NL',
        website_url: input.website_url?.trim() || null,
        description: input.description?.trim() || null,
        brand_tone: input.brand_tone ?? 'casual',
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

    return { restaurantId: restaurant.id };
  }
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
