import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
// PILOT (2026-05-01): MenuService is de eerste service die de
// per-request user-JWT-client gebruikt i.p.v. het service-role-singleton.
// Daarmee draaien alle queries via RLS-policies en kan een user van
// restaurant A nooit menu_items van restaurant B lezen — óók niet als
// onze TS-guards onverhoopt zouden falen (defense-in-depth).
//
// SupabaseService blijft beschikbaar voor admin-flows die bewust RLS
// bypassen (audit-log, anonymization, account-deletion). MenuService
// gebruikt 'm hier expres NIET — alle reads/writes horen onder de
// permissies van de ingelogde user te draaien.
import { RequestSupabaseService } from '../supabase/request-supabase.service';
import { MenuImporterService } from '../ai/menu-importer.service';
import { AuditLogService } from '../common/audit-log.service';

export type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  // Sub-categorie. Voor drank-items: wijn-rood, bier, cocktail, etc.
  // Voor menu-items momenteel ongebruikt (null).
  subcategory: string | null;
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
  subcategory?: string | null;
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
  // 'menu' (regulier menukaart) of 'drinks' (drankkaart). Bepaalt
  // welke banner de UI toont — Menu-kaart actief vs Drankkaart actief.
  kind: 'menu' | 'drinks';
  file_name: string | null;
  uploaded_at: string;
  items_count: number;
};

@Injectable()
export class MenuService {
  private readonly logger = new Logger(MenuService.name);

  constructor(
    // RequestSupabaseService is Scope.REQUEST: NestJS bouwt 'm vers per
    // inkomende HTTP-call. MenuService + MenuController erven dit scope
    // automatisch — niet expliciet @Injectable({ scope: Scope.REQUEST })
    // op MenuService nodig, NestJS doet "scope bubbling" via de
    // dependency-graph.
    private readonly supabase: RequestSupabaseService,
    private readonly importer: MenuImporterService,
    private readonly audit: AuditLogService,
  ) {}

  async findAll(restaurantId: string): Promise<MenuItem[]> {
    const { data, error } = await this.supabase.client
      .from('menu_items')
      .select(
        'id, name, description, category, subcategory, price_cents, is_signature, is_seasonal, season, is_available, dietary_tags',
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
    userId: string,
  ): Promise<MenuItem> {
    const payload = this.normalizeInput(input, /* requireName */ true);

    const { data, error } = await this.supabase.client
      .from('menu_items')
      .insert({
        restaurant_id: restaurantId,
        ...payload,
      })
      .select(
        'id, name, description, category, subcategory, price_cents, is_signature, is_seasonal, season, is_available, dietary_tags',
      )
      .single();

    if (error) throw new InternalServerErrorException(error.message);

    // Audit: nieuw menu-item. Filly's prompts gebruiken menu_items als
    // bron — bij een klacht "Filly noemt een gerecht dat niet bestaat"
    // kunnen we via audit-log zien wie wanneer wat heeft toegevoegd.
    await this.audit.log({
      restaurantId,
      userId,
      action: 'menu_item_created',
      entity_type: 'menu_item',
      entity_id: data.id as string,
      payload: {
        name: data.name,
        category: data.category,
        is_signature: data.is_signature,
      },
    });

    return data as MenuItem;
  }

  // Bijwerken van een bestaand item. We doen eerst een gericht eq op
  // restaurant_id zodat een gebruiker van tenant A nooit een item van
  // tenant B kan raken (defense-in-depth bovenop de RestaurantAccessGuard).
  async update(
    restaurantId: string,
    id: string,
    input: UpdateMenuItemInput,
    userId: string,
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
        'id, name, description, category, subcategory, price_cents, is_signature, is_seasonal, season, is_available, dietary_tags',
      )
      .maybeSingle();

    if (error) throw new InternalServerErrorException(error.message);
    if (!data) {
      throw new NotFoundException('Gerecht niet gevonden.');
    }

    // Audit: alleen welke keys gewijzigd, niet de waardes — voorkomt
    // dat we prijs- of beschrijvings-history in audit_log dumpen.
    // Voor "wat is veranderd?" hebben we daarna nog de DB-row zelf.
    await this.audit.log({
      restaurantId,
      userId,
      action: 'menu_item_updated',
      entity_type: 'menu_item',
      entity_id: id,
      payload: { fields_changed: Object.keys(payload) },
    });

    return data as MenuItem;
  }

  async remove(
    restaurantId: string,
    id: string,
    userId: string,
  ): Promise<{ id: string }> {
    // Bevestig eerst dat 't bestaat én bij deze tenant hoort. Een 404
    // is voor de UI duidelijker dan een silent succes op een delete
    // die niets raakte.
    // We selecteren ook `name` mee zodat we 'm in de audit-payload
    // kunnen loggen — handig bij support ("wat heette dat gerecht
    // dat is verwijderd?") zonder dat we de DB-rij zelf nog hebben.
    const { data: existing, error: fetchErr } = await this.supabase.client
      .from('menu_items')
      .select('id, name')
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

    // Audit: gerecht verwijderd. Onomkeerbaar — bij een klacht
    // ("waarom is mijn signature dish weg?") moeten we kunnen zien
    // wie het heeft weggehaald en wanneer.
    await this.audit.log({
      restaurantId,
      userId,
      action: 'menu_item_deleted',
      entity_type: 'menu_item',
      entity_id: id,
      payload: { name: existing.name },
    });

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

    if ('subcategory' in input) {
      const v = input.subcategory;
      out.subcategory =
        typeof v === 'string' && v.trim().length > 0
          ? v.trim().slice(0, 50)
          : null;
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
    kind: 'menu' | 'drinks' = 'menu',
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
        kind, // 'menu' | 'drinks' — bepaalt welke banner de UI toont
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
        kind,
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
        // Drankkaart-import → server-side dwingen we category='drank'
        // ongeacht wat Claude eventueel teruggaf. Voor menukaart
        // gebruiken we wat de Vision-tool koos (al gevalideerd via
        // de enum in MENU_EXTRACTION_SCHEMA).
        category:
          kind === 'drinks'
            ? 'drank'
            : (it.category?.trim().slice(0, 50) || null),
        subcategory: it.subcategory?.trim().slice(0, 50) || null,
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
          'id, name, description, category, subcategory, price_cents, is_signature, is_seasonal, season, is_available, dietary_tags',
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

    // Audit: succesvolle kaart-import. Belangrijk omdat één import 50+
    // gerechten in één klap kan toevoegen — bij een klacht "mijn menu
    // heeft ineens veel meer items" zien we precies welke upload de
    // bron was. userId kan null zijn bij pre-onboarding-uploads.
    await this.audit.log({
      restaurantId,
      userId,
      action: 'menu_card_imported',
      entity_type: 'menu_upload',
      entity_id: uploadId,
      payload: {
        kind,
        file_name: file.originalName,
        items_imported: insertedItems.length,
        confidence: extracted.confidence,
      },
    });

    return {
      upload_id: uploadId,
      file_name: uploadRow.file_name as string | null,
      items_imported: insertedItems.length,
      items: insertedItems,
      notes: extracted.notes ?? null,
      confidence: extracted.confidence,
    };
  }

  // Welke kaarten zijn op dit moment "actief" voor dit restaurant?
  // Returnt maximaal twee rijen: 1 menu-kaart + 1 drankkaart, beide
  // de meest recent succesvol verwerkte upload van dat type. UI
  // gebruikt deze info om twee aparte banners te tonen.
  async getActiveCards(restaurantId: string): Promise<ActiveMenuCard[]> {
    const fetchByKind = async (
      kind: 'menu' | 'drinks',
    ): Promise<ActiveMenuCard | null> => {
      const { data, error } = await this.supabase.client
        .from('menu_uploads')
        .select('id, kind, file_name, created_at, extracted_items_count')
        .eq('restaurant_id', restaurantId)
        .eq('kind', kind)
        .not('processed_at', 'is', null)
        .is('processing_error', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw new InternalServerErrorException(error.message);
      if (!data) return null;

      return {
        id: data.id as string,
        kind: data.kind as 'menu' | 'drinks',
        file_name: (data.file_name as string | null) ?? null,
        uploaded_at: data.created_at as string,
        items_count: (data.extracted_items_count as number | null) ?? 0,
      };
    };

    const [menu, drinks] = await Promise.all([
      fetchByKind('menu'),
      fetchByKind('drinks'),
    ]);
    return [menu, drinks].filter((c): c is ActiveMenuCard => c !== null);
  }

  // Genereert een 1-uur signed URL voor het bron-bestand van een
  // upload zodat de UI 'm in een nieuw tabblad kan openen ("klik op
  // banner om te zien wat je destijds hebt geüpload"). Tenant-check
  // hier expliciet — anders zou een gebruiker een upload-id van een
  // andere zaak kunnen raden en de URL claimen.
  async getCardSignedUrl(
    restaurantId: string,
    uploadId: string,
  ): Promise<{ url: string }> {
    const { data: row, error: fetchErr } = await this.supabase.client
      .from('menu_uploads')
      .select('file_path, restaurant_id')
      .eq('id', uploadId)
      .maybeSingle();
    if (fetchErr) throw new InternalServerErrorException(fetchErr.message);
    if (!row || row.restaurant_id !== restaurantId) {
      throw new InternalServerErrorException('Upload niet gevonden.');
    }

    const { data: signed, error: urlErr } = await this.supabase.client.storage
      .from(MENU_UPLOADS_BUCKET)
      .createSignedUrl(row.file_path as string, 3600); // 1 uur
    if (urlErr || !signed?.signedUrl) {
      throw new InternalServerErrorException(
        urlErr?.message ?? 'Kon download-link niet genereren.',
      );
    }
    return { url: signed.signedUrl };
  }

  // Verwijder een menukaart inclusief de gerechten die eruit kwamen.
  // Storage-bestand + menu_uploads-rij + alle gekoppelde menu_items
  // gaan weg. Handmatig toegevoegde gerechten (zonder menu_upload_id)
  // blijven staan — die zijn niet aan deze kaart gebonden.
  async removeCard(
    restaurantId: string,
    uploadId: string,
    userId: string,
  ): Promise<{ id: string; items_deleted: number }> {
    // 1) Bestaan + tenant-check. Pakken ook file_name + kind zodat de
    // audit-payload (na cleanup) nog kan loggen wélke kaart het was.
    const { data: existing, error: fetchErr } = await this.supabase.client
      .from('menu_uploads')
      .select('id, file_path, file_name, kind')
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

    // Audit: kaart verwijderd. Kan tientallen items in één klap weghalen
    // (cascade) — bij een klacht "ineens is mijn halve menu weg" zien
    // we wié de kaart-delete heeft gedaan en hoeveel items eraan hingen.
    await this.audit.log({
      restaurantId,
      userId,
      action: 'menu_card_removed',
      entity_type: 'menu_upload',
      entity_id: uploadId,
      payload: {
        kind: existing.kind,
        file_name: existing.file_name,
        items_deleted: itemsCount ?? 0,
      },
    });

    return { id: uploadId, items_deleted: itemsCount ?? 0 };
  }
}
