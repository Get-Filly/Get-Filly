import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price_cents: number | null;
  is_signature: boolean;
  is_seasonal: boolean;
  season: string | null;
  is_available: boolean;
  dietary_tags: string[];
};

// Input voor create. Alle velden behalve `name` zijn optioneel; defaults
// worden door de DB gezet (is_available=true, is_signature=false, etc.).
// Bewust geen `id` of `restaurant_id` — die zetten we server-side zodat
// de cliënt nooit kan schrijven naar een andere tenant.
export type CreateMenuItemInput = {
  name: string;
  description?: string | null;
  category?: string | null;
  price_cents?: number | null;
  is_signature?: boolean;
  is_seasonal?: boolean;
  season?: string | null;
  is_available?: boolean;
  dietary_tags?: string[];
};

// Update: alle velden optioneel — caller stuurt alleen wat hij wil
// wijzigen. Lege strings → null voor description/category/season zodat
// de UI consistent omgaat met "leegmaken".
export type UpdateMenuItemInput = Partial<CreateMenuItemInput>;

// Toegestane waarden voor `season`. Komt overeen met de CHECK-constraint
// in migratie 0001 (`season in ('spring','summer','autumn','winter')`).
const VALID_SEASONS = new Set(['spring', 'summer', 'autumn', 'winter']);

@Injectable()
export class MenuService {
  constructor(private readonly supabase: SupabaseService) {}

  async findAll(restaurantId: string): Promise<MenuItem[]> {
    const { data, error } = await this.supabase.client
      .from('menu_items')
      .select(
        'id, name, description, category, price_cents, is_signature, is_seasonal, season, is_available, dietary_tags',
      )
      .eq('restaurant_id', restaurantId)
      .order('category', { ascending: true });

    if (error) throw new InternalServerErrorException(error.message);
    return (data ?? []) as MenuItem[];
  }

  // Maak een nieuw menu-item aan. Validatie hier (niet alleen DB-CHECK)
  // zodat we duidelijke NL-foutmeldingen aan de UI kunnen geven i.p.v.
  // ruwe Postgres-errors. restaurant_id wordt door de controller via
  // de tenant-context bepaald; cliënt kan dit niet zelf instellen.
  async create(
    restaurantId: string,
    input: CreateMenuItemInput,
  ): Promise<MenuItem> {
    const payload = this.normalizeInput(input, /* requireName */ true);

    const { data, error } = await this.supabase.client
      .from('menu_items')
      .insert({
        restaurant_id: restaurantId,
        ...payload,
      })
      .select(
        'id, name, description, category, price_cents, is_signature, is_seasonal, season, is_available, dietary_tags',
      )
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    return data as MenuItem;
  }

  // Bijwerken van een bestaand item. We doen eerst een gericht eq op
  // restaurant_id zodat een gebruiker van tenant A nooit een item van
  // tenant B kan raken (defense-in-depth bovenop de RestaurantAccessGuard).
  async update(
    restaurantId: string,
    id: string,
    input: UpdateMenuItemInput,
  ): Promise<MenuItem> {
    const payload = this.normalizeInput(input, /* requireName */ false);
    if (Object.keys(payload).length === 0) {
      throw new BadRequestException('Geen velden om bij te werken.');
    }

    const { data, error } = await this.supabase.client
      .from('menu_items')
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .select(
        'id, name, description, category, price_cents, is_signature, is_seasonal, season, is_available, dietary_tags',
      )
      .maybeSingle();

    if (error) throw new InternalServerErrorException(error.message);
    if (!data) {
      throw new NotFoundException('Gerecht niet gevonden.');
    }
    return data as MenuItem;
  }

  async remove(
    restaurantId: string,
    id: string,
  ): Promise<{ id: string }> {
    // Bevestig eerst dat 't bestaat én bij deze tenant hoort. Een 404
    // is voor de UI duidelijker dan een silent succes op een delete
    // die niets raakte.
    const { data: existing, error: fetchErr } = await this.supabase.client
      .from('menu_items')
      .select('id')
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();
    if (fetchErr) throw new InternalServerErrorException(fetchErr.message);
    if (!existing) {
      throw new NotFoundException('Gerecht niet gevonden.');
    }

    const { error: delErr } = await this.supabase.client
      .from('menu_items')
      .delete()
      .eq('id', id)
      .eq('restaurant_id', restaurantId);
    if (delErr) throw new InternalServerErrorException(delErr.message);

    return { id };
  }

  // Validatie + normalisatie van input. Accepteert zowel create- als
  // update-payloads (verschil zit in `requireName`). Geeft alleen de
  // velden terug die daadwerkelijk meekomen — geen impliciete defaults
  // bij update zodat een PATCH op alleen `is_available` niet per ongeluk
  // ook andere velden overschrijft.
  private normalizeInput(
    input: CreateMenuItemInput | UpdateMenuItemInput,
    requireName: boolean,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};

    if (requireName || typeof input.name === 'string') {
      const name = (input.name ?? '').trim();
      if (!name) {
        throw new BadRequestException('Naam is verplicht.');
      }
      if (name.length > 200) {
        throw new BadRequestException('Naam mag maximaal 200 tekens zijn.');
      }
      out.name = name;
    }

    if ('description' in input) {
      const v = input.description;
      out.description =
        typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
    }

    if ('category' in input) {
      const v = input.category;
      out.category =
        typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
    }

    if ('price_cents' in input) {
      const v = input.price_cents;
      if (v === null || v === undefined) {
        out.price_cents = null;
      } else if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
        throw new BadRequestException('Prijs moet 0 of hoger zijn.');
      } else if (v > 100_000_00) {
        // 100k euro cap — voorkomt dat een typo €1.000.000 invoert.
        throw new BadRequestException('Prijs mag maximaal €100.000 zijn.');
      } else {
        out.price_cents = Math.round(v);
      }
    }

    if ('is_signature' in input) out.is_signature = Boolean(input.is_signature);
    if ('is_available' in input) out.is_available = Boolean(input.is_available);

    if ('is_seasonal' in input) {
      out.is_seasonal = Boolean(input.is_seasonal);
      // Seizoen wordt alléén bewaard als is_seasonal=true. Anders forceren
      // we 'm op null — voorkomt rare combinaties als "niet seizoens­
      // gebonden, maar wel lente" die de UI later kunnen verwarren.
      if (!out.is_seasonal) out.season = null;
    }

    if ('season' in input) {
      const v = input.season;
      if (v === null || v === undefined || v === '') {
        out.season = null;
      } else if (typeof v !== 'string' || !VALID_SEASONS.has(v)) {
        throw new BadRequestException(
          'Seizoen moet spring, summer, autumn of winter zijn.',
        );
      } else {
        out.season = v;
      }
    }

    if ('dietary_tags' in input) {
      const v = input.dietary_tags;
      if (v === null || v === undefined) {
        out.dietary_tags = [];
      } else if (!Array.isArray(v)) {
        throw new BadRequestException('Dieet-tags moet een lijst zijn.');
      } else {
        const cleaned = v
          .filter((t): t is string => typeof t === 'string')
          .map((t) => t.trim())
          .filter((t) => t.length > 0 && t.length <= 50);
        if (cleaned.length > 20) {
          throw new BadRequestException(
            'Maximaal 20 dieet-tags per gerecht.',
          );
        }
        // Dedupe maar behoud volgorde — eerste voorkomen wint.
        out.dietary_tags = Array.from(new Set(cleaned));
      }
    }

    return out;
  }
}
