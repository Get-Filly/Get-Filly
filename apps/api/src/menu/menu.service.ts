import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { MenuImporterService } from '../ai/menu-importer.service';

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

// Storage-bucket naam (aangemaakt in migratie 0011). Private bucket;
// alleen via authenticated requests bereikbaar.
const MENU_UPLOADS_BUCKET = 'menu-uploads';

// Resultaat van een menukaart-import (POST /api/menu/import-card).
// upload_id linkt naar menu_uploads-rij; items_imported is aantal
// menu_items dat is aangemaakt; items zelf zodat de UI ze direct
// kan tonen zonder extra fetchMenu-call.
export type ImportCardResult = {
  upload_id: string;
  file_name: string | null;
  items_imported: number;
  items: MenuItem[];
  notes: string | null;
  confidence: 'high' | 'medium' | 'low';
};

// Wat de UI nodig heeft voor de "Menu-kaart actief"-banner: id +
// originele filename + datum + aantal items. Bij geen actieve kaart
// returnen we null.
export type ActiveMenuCard = {
  id: string;
  file_name: string | null;
  uploaded_at: string;
  items_count: number;
};

@Injectable()
export class MenuService {
  private readonly logger = new Logger(MenuService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly importer: MenuImporterService,
  ) {}

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

  // ============================================================
  // Menukaart-import (Vision-flow)
  // ============================================================
  // Volledige flow van geüpload bestand naar menu_items in de DB:
  //   1. Bestand opslaan in `menu-uploads` Storage-bucket onder
  //      <restaurant_id>/<uuid>-<safeName>.
  //   2. menu_uploads-rij aanmaken (processed_at = null).
  //   3. MenuImporterService aanroepen → Claude Vision extraheert
  //      gerechten uit het bestand.
  //   4. Voor elk extracted item een menu_items-rij aanmaken met
  //      menu_upload_id FK zodat we weten welke items uit deze
  //      upload kwamen (voor latere "verwijder kaart" cascade).
  //   5. menu_uploads bijwerken met processed_at + extracted_items_count.
  //   6. Resultaat returnen zodat de UI direct kan tonen.
  //
  // Belangrijk: bij Vision-fouten of insert-fouten markeren we de
  // upload met processing_error zodat de eigenaar het kan zien en
  // opnieuw proberen. Het bron-bestand blijft staan voor audit.
  async importCard(
    restaurantId: string,
    userId: string | null,
    file: { buffer: Buffer; originalName: string; mimeType: string },
  ): Promise<ImportCardResult> {
    // 1) Pad samenstellen + bestand uploaden. Sanitize de filename
    // (alleen alfanumeriek + ._-) zodat we geen path-traversal of
    // malle storage-keys krijgen. UUID-prefix voorkomt collisions.
    const safeName = file.originalName
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 80) || 'menu';
    const path = `${restaurantId}/${randomUUID()}-${safeName}`;

    const { error: upErr } = await this.supabase.client.storage
      .from(MENU_UPLOADS_BUCKET)
      .upload(path, file.buffer, {
        contentType: file.mimeType,
        upsert: false,
      });
    if (upErr) {
      throw new InternalServerErrorException(
        `Kon bestand niet opslaan: ${upErr.message}`,
      );
    }

    // 2) menu_uploads-rij. processed_at blijft null tot Vision klaar is;
    // bij fout krijgt deze rij een processing_error zodat we audit-spoor
    // hebben van mislukte imports.
    const { data: uploadRow, error: insErr } = await this.supabase.client
      .from('menu_uploads')
      .insert({
        restaurant_id: restaurantId,
        file_path: path,
        file_name: file.originalName,
        file_size_bytes: file.buffer.length,
        mime_type: file.mimeType,
        uploaded_by: userId,
      })
      .select('id, file_name, created_at')
      .single();
    if (insErr) {
      // Rollback: storage-bestand opruimen zodat we geen weeszooi krijgen.
      await this.supabase.client.storage
        .from(MENU_UPLOADS_BUCKET)
        .remove([path])
        .catch(() => undefined);
      throw new InternalServerErrorException(insErr.message);
    }
    const uploadId = uploadRow.id as string;

    // 3) Vision-call. Bij fout: markeer upload als mislukt en gooi error
    // door — we laten het bron-bestand én de upload-rij staan zodat de
    // eigenaar via de UI kan zien dat het mis ging.
    let extracted;
    try {
      extracted = await this.importer.analyze(
        {
          buffer: file.buffer,
          mimeType: file.mimeType,
          originalName: file.originalName,
        },
        { restaurantId, userId: userId ?? undefined },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Onbekende fout.';
      await this.supabase.client
        .from('menu_uploads')
        .update({
          processing_error: msg,
          processed_at: new Date().toISOString(),
        })
        .eq('id', uploadId);
      throw e;
    }

    // 4) Items wegschrijven. We zetten allemaal in één bulk-insert zodat
    // de roundtrip kort blijft. Op individuele item-fouten gooien we
    // niet — Postgres geeft een aggregated error en we melden dat
    // generiek met aantal items.
    const rowsToInsert = extracted.items
      .filter((it) => it.name && it.name.trim().length > 0)
      .map((it, idx) => ({
        restaurant_id: restaurantId,
        menu_upload_id: uploadId,
        name: it.name.trim().slice(0, 200),
        description: it.description?.trim() || null,
        category: it.category?.trim().slice(0, 50) || null,
        price_cents:
          typeof it.price_cents === 'number' && it.price_cents >= 0
            ? Math.round(it.price_cents)
            : null,
        allergens:
          Array.isArray(it.allergens) && it.allergens.length > 0
            ? it.allergens.slice(0, 20)
            : null,
        is_available: true,
        // display_order incrementeel per import zodat originele kaart-
        // volgorde behouden blijft in de UI-lijst.
        display_order: idx,
      }));

    let insertedItems: MenuItem[] = [];
    if (rowsToInsert.length > 0) {
      const { data: inserted, error: itemsErr } = await this.supabase.client
        .from('menu_items')
        .insert(rowsToInsert)
        .select(
          'id, name, description, category, price_cents, is_signature, is_seasonal, season, is_available, dietary_tags',
        );
      if (itemsErr) {
        const msg = `${itemsErr.message} (na succesvolle Vision-analyse)`;
        await this.supabase.client
          .from('menu_uploads')
          .update({
            processing_error: msg,
            processed_at: new Date().toISOString(),
          })
          .eq('id', uploadId);
        throw new InternalServerErrorException(msg);
      }
      insertedItems = (inserted ?? []) as MenuItem[];
    }

    // 5) Upload-rij afronden met success-marker.
    await this.supabase.client
      .from('menu_uploads')
      .update({
        processed_at: new Date().toISOString(),
        extracted_items_count: insertedItems.length,
      })
      .eq('id', uploadId);

    this.logger.log(
      `Menu-kaart geïmporteerd voor restaurant ${restaurantId}: ${insertedItems.length} items uit ${file.originalName}`,
    );

    return {
      upload_id: uploadId,
      file_name: uploadRow.file_name as string | null,
      items_imported: insertedItems.length,
      items: insertedItems,
      notes: extracted.notes ?? null,
      confidence: extracted.confidence,
    };
  }

  // Welke menukaart is op dit moment "actief" voor dit restaurant?
  // Definitie: de meest recent succesvol verwerkte upload. Wordt door
  // de UI gebruikt om de "Menu-kaart actief"-banner te tonen na een
  // page-refresh.
  async getActiveCard(restaurantId: string): Promise<ActiveMenuCard | null> {
    const { data, error } = await this.supabase.client
      .from('menu_uploads')
      .select('id, file_name, created_at, extracted_items_count')
      .eq('restaurant_id', restaurantId)
      .not('processed_at', 'is', null)
      .is('processing_error', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new InternalServerErrorException(error.message);
    if (!data) return null;

    return {
      id: data.id as string,
      file_name: (data.file_name as string | null) ?? null,
      uploaded_at: data.created_at as string,
      items_count: (data.extracted_items_count as number | null) ?? 0,
    };
  }

  // Verwijder een menukaart inclusief de gerechten die eruit kwamen.
  // Storage-bestand + menu_uploads-rij + alle gekoppelde menu_items
  // gaan weg. Handmatig toegevoegde gerechten (zonder menu_upload_id)
  // blijven staan — die zijn niet aan deze kaart gebonden.
  async removeCard(
    restaurantId: string,
    uploadId: string,
  ): Promise<{ id: string; items_deleted: number }> {
    // 1) Bestaan + tenant-check.
    const { data: existing, error: fetchErr } = await this.supabase.client
      .from('menu_uploads')
      .select('id, file_path')
      .eq('id', uploadId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();
    if (fetchErr) throw new InternalServerErrorException(fetchErr.message);
    if (!existing) {
      throw new NotFoundException('Menukaart niet gevonden.');
    }

    // 2) Items weghalen die uit deze upload kwamen. Eerst een count zodat
    // we de UI kunnen vertellen hoeveel er zijn opgeruimd.
    const { count: itemsCount, error: countErr } = await this.supabase.client
      .from('menu_items')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .eq('menu_upload_id', uploadId);
    if (countErr) throw new InternalServerErrorException(countErr.message);

    if ((itemsCount ?? 0) > 0) {
      const { error: delItemsErr } = await this.supabase.client
        .from('menu_items')
        .delete()
        .eq('restaurant_id', restaurantId)
        .eq('menu_upload_id', uploadId);
      if (delItemsErr) {
        throw new InternalServerErrorException(delItemsErr.message);
      }
    }

    // 3) Storage-bestand opruimen. Niet-fataal: als 't faalt logt de
    // service het maar de DB-cleanup gaat door. Wees-bestanden zijn
    // vervelend maar geen blocker voor de gebruiker.
    if (existing.file_path) {
      const { error: rmErr } = await this.supabase.client.storage
        .from(MENU_UPLOADS_BUCKET)
        .remove([existing.file_path as string]);
      if (rmErr) {
        this.logger.warn(
          `Storage-cleanup faalde voor ${existing.file_path}: ${rmErr.message}`,
        );
      }
    }

    // 4) menu_uploads-rij weghalen.
    const { error: delUpErr } = await this.supabase.client
      .from('menu_uploads')
      .delete()
      .eq('id', uploadId)
      .eq('restaurant_id', restaurantId);
    if (delUpErr) throw new InternalServerErrorException(delUpErr.message);

    return { id: uploadId, items_deleted: itemsCount ?? 0 };
  }
}
