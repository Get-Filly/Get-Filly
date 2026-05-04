import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RequestSupabaseService } from '../supabase/request-supabase.service';
import { AuditLogService } from '../common/audit-log.service';
import { MediaTaggerService } from './media-tagger.service';

// ============================================================
// RestaurantMediaService — foto-bibliotheek per restaurant
// ============================================================
//
// Eigenaar uploadt foto's via account-pagina. Maximaal 20 foto's per
// restaurant — gecapt om Filly's prompt-context behapbaar te houden
// en storage-kosten te beperken. Bestanden komen in de bestaande
// 'restaurant-assets' bucket onder pad <restaurant_id>/photos/<uuid>.
//
// Bij elke upload: synchrone Vision-tag-call via MediaTaggerService.
// Eigenaar wacht ~3-5s maar krijgt direct een foto met description +
// tags zichtbaar — Filly kan 'm dan al gebruiken in volgende
// campagne-suggesties zonder vertraging.
// ============================================================

const BUCKET = 'restaurant-assets';
const MAX_PHOTOS_PER_RESTAURANT = 20;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export type RestaurantMediaItem = {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  description: string | null;
  tags: string[];
  uploaded_at: string;
  // Signed URL met TTL voor weergave. Genereerd per list-call zodat we
  // private-bucket-veilig blijven; 1 uur TTL is genoeg voor de UI.
  url: string;
};

@Injectable()
export class RestaurantMediaService {
  private readonly logger = new Logger(RestaurantMediaService.name);

  constructor(
    private readonly supabase: RequestSupabaseService,
    private readonly tagger: MediaTaggerService,
    private readonly audit: AuditLogService,
  ) {}

  // ============================================================
  // LIST — alle foto's van een restaurant + public URLs
  // ============================================================
  // We gebruiken getPublicUrl ipv createSignedUrl omdat de bucket
  // 'restaurant-assets' al een anon-read-policy heeft (sinds mig 0003,
  // bedoeld voor publieke logo-vertoning in mail-templates en og-images).
  // Public URLs zijn:
  //   - direct geldig zonder signing-roundtrip
  //   - geen TTL-management
  //   - veilig genoeg: paden zijn UUID-prefix (256 bits random),
  //     niet raadbaar
  //   - foto's zijn sowieso bedoeld om in publieke campagne-mails te
  //     verschijnen
  async list(restaurantId: string): Promise<RestaurantMediaItem[]> {
    const { data, error } = await this.supabase.client
      .from('restaurant_media')
      .select(
        'id, file_path, file_name, mime_type, size_bytes, description, tags, uploaded_at',
      )
      .eq('restaurant_id', restaurantId)
      .order('uploaded_at', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);
    if (!data || data.length === 0) return [];

    return data.map((row) => {
      const { data: pub } = this.supabase.client.storage
        .from(BUCKET)
        .getPublicUrl(row.file_path as string);
      return {
        id: row.id as string,
        file_name: row.file_name as string,
        mime_type: row.mime_type as string,
        size_bytes: row.size_bytes as number,
        description: (row.description as string | null) ?? null,
        tags: (row.tags as string[] | null) ?? [],
        uploaded_at: row.uploaded_at as string,
        url: pub.publicUrl,
      };
    });
  }

  // ============================================================
  // UPLOAD — nieuwe foto + Vision-tag
  // ============================================================
  async upload(
    restaurantId: string,
    userId: string,
    file: { buffer: Buffer; originalName: string; mimeType: string },
  ): Promise<RestaurantMediaItem> {
    // Stap 1 — input-validatie. Eigenaar krijgt een nette NL-melding
    // ipv ruwe Multer/Supabase-fouten bij verkeerde mime-types of
    // te grote files.
    if (!ALLOWED_MIME_TYPES.has(file.mimeType)) {
      throw new BadRequestException(
        'Alleen JPEG, PNG of WebP-foto\'s worden ondersteund.',
      );
    }
    if (file.buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `Bestand is te groot. Maximaal ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB per foto.`,
      );
    }

    // Stap 2 — cap-check. Eigenaar moet eerst opruimen voordat 'ie
    // de 21e foto kan uploaden. Cap helpt ook Filly's prompt-context
    // behapbaar te houden bij campagne-suggesties.
    const { count, error: countErr } = await this.supabase.client
      .from('restaurant_media')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId);
    if (countErr) throw new InternalServerErrorException(countErr.message);
    if ((count ?? 0) >= MAX_PHOTOS_PER_RESTAURANT) {
      throw new BadRequestException(
        `Je foto-bibliotheek zit vol (${MAX_PHOTOS_PER_RESTAURANT} foto's max). Verwijder eerst een foto voordat je een nieuwe upload.`,
      );
    }

    // Stap 3 — file-pad samenstellen. UUID-prefix voorkomt collisions
    // en raden van paden. Sanitize de filename om path-traversal
    // tegen te gaan.
    const ext = pickExtension(file.mimeType);
    const fileName = file.originalName
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 80) || `photo${ext}`;
    const path = `${restaurantId}/photos/${randomUUID()}${ext}`;

    // Stap 4 — Storage upload. Bij fout: nette NL-melding, geen DB-rij.
    const { error: upErr } = await this.supabase.client.storage
      .from(BUCKET)
      .upload(path, file.buffer, {
        contentType: file.mimeType,
        upsert: false,
      });
    if (upErr) {
      throw new InternalServerErrorException(
        `Kon foto niet opslaan: ${upErr.message}`,
      );
    }

    // Stap 5 — Vision-tag (Haiku 4.5). Sync zodat de UI direct met
    // description + tags terug krijgt. Bij fout van de tagger valt
    // 'ie zelf terug op lege defaults — upload slaagt sowieso.
    const tagResult = await this.tagger.tag(
      { buffer: file.buffer, mimeType: file.mimeType },
      { restaurantId, userId },
    );

    // Stap 6 — DB-rij. Bij DB-fout rollback we de Storage-upload zodat
    // we geen weeszooi krijgen.
    const { data: row, error: insErr } = await this.supabase.client
      .from('restaurant_media')
      .insert({
        restaurant_id: restaurantId,
        file_path: path,
        file_name: fileName,
        mime_type: file.mimeType,
        size_bytes: file.buffer.length,
        description: tagResult.description || null,
        tags: tagResult.tags,
        uploaded_by: userId,
      })
      .select(
        'id, file_path, file_name, mime_type, size_bytes, description, tags, uploaded_at',
      )
      .single();
    if (insErr) {
      await this.supabase.client.storage
        .from(BUCKET)
        .remove([path])
        .catch(() => undefined);
      throw new InternalServerErrorException(insErr.message);
    }

    // Stap 7 — audit-log voor traceerbaarheid bij latere AVG-vragen
    // ("welke foto's zijn er ooit van mij geüpload?").
    await this.audit.log({
      restaurantId,
      userId,
      action: 'restaurant_media_uploaded',
      entity_type: 'restaurant_media',
      entity_id: row.id as string,
      payload: {
        file_name: fileName,
        size_bytes: file.buffer.length,
        tags_count: tagResult.tags.length,
      },
    });

    // Stap 8 — public URL voor directe weergave in de UI (zie list-
    // commentaar over waarom public ipv signed).
    const { data: pub } = this.supabase.client.storage
      .from(BUCKET)
      .getPublicUrl(path);

    return {
      id: row.id as string,
      file_name: row.file_name as string,
      mime_type: row.mime_type as string,
      size_bytes: row.size_bytes as number,
      description: (row.description as string | null) ?? null,
      tags: (row.tags as string[] | null) ?? [],
      uploaded_at: row.uploaded_at as string,
      url: pub.publicUrl,
    };
  }

  // ============================================================
  // REMOVE — foto definitief verwijderen
  // ============================================================
  async remove(
    restaurantId: string,
    mediaId: string,
    userId: string,
  ): Promise<{ id: string }> {
    const { data: row, error: fetchErr } = await this.supabase.client
      .from('restaurant_media')
      .select('id, file_path, file_name')
      .eq('id', mediaId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();
    if (fetchErr) throw new InternalServerErrorException(fetchErr.message);
    if (!row) throw new NotFoundException('Foto niet gevonden.');

    // Storage eerst — als die faalt willen we niet de DB-rij weg
    // hebben en het bestand laten staan. Andersom: als DB-delete faalt
    // staat er een wees-bestand — minder erg, kunnen we cron-cleanen.
    const { error: rmErr } = await this.supabase.client.storage
      .from(BUCKET)
      .remove([row.file_path as string]);
    if (rmErr) {
      this.logger.warn(
        `Storage-delete faalde voor ${row.file_path}: ${rmErr.message}`,
      );
    }

    const { error: delErr } = await this.supabase.client
      .from('restaurant_media')
      .delete()
      .eq('id', mediaId)
      .eq('restaurant_id', restaurantId);
    if (delErr) throw new InternalServerErrorException(delErr.message);

    await this.audit.log({
      restaurantId,
      userId,
      action: 'restaurant_media_deleted',
      entity_type: 'restaurant_media',
      entity_id: mediaId,
      payload: { file_name: row.file_name },
    });

    return { id: mediaId };
  }
}

function pickExtension(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    default:
      return '';
  }
}
