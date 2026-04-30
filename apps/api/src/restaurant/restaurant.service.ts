import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { GeocodingService } from '../geocoding/geocoding.service';
import { WebsiteAnalyzerService } from '../ai/website-analyzer.service';
import { AuditLogService } from '../common/audit-log.service';

// Velden die we NOOIT door de cliënt laten overschrijven, ongeacht wat
// er in de PATCH-body zit. Zijn server-managed (id/created_at) of
// expliciet beheerd via dedicated endpoints (plan/abonnement).
const FORBIDDEN_PATCH_FIELDS = new Set([
  'id',
  'created_at',
  'updated_at',
  'plan',
  'slug',
  // lat/long zetten we zelf bij geocoding — niet via direct edit.
  'latitude',
  'longitude',
]);

// Velden die geocoding triggeren als ze wijzigen. Bij een wijziging
// op een van deze sleutels halen we automatisch nieuwe lat/long op.
const ADDRESS_FIELDS = new Set(['address', 'postal_code', 'city']);

// Eenvoudige regex-validators. Bewust niet super-streng: we willen
// "het ziet er ongeveer goed uit" toetsen om typo's te vangen, niet
// een exhaustive RFC-parser zijn. Voor productie-mailings doen
// strengere check op verzendmoment.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const KVK_RE = /^\d{8}$/; // NL KvK = 8 cijfers
const VAT_RE_NL = /^NL\d{9}B\d{2}$/i; // NL btw-nummer

@Injectable()
export class RestaurantService {
  private readonly logger = new Logger(RestaurantService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly geocoding: GeocodingService,
    private readonly websiteAnalyzer: WebsiteAnalyzerService,
    private readonly audit: AuditLogService,
  ) {}

  async getById(restaurantId: string) {
    const { data, error } = await this.supabase.client
      .from('restaurants')
      .select('*')
      .eq('id', restaurantId)
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  // PATCH-flow:
  //   1. Forbidden velden eruit filteren (id, created_at, plan, lat/long).
  //   2. Lichte validatie op nieuwe velden (kvk = 8 cijfers, btw = NL...,
  //      e-mail = ongeveer-formaat). Strenge checks gebeuren bij echt
  //      gebruik (verzendmoment).
  //   3. Adres gewijzigd? Trigger PDOK-geocoding en zet lat/long mee
  //      in dezelfde update. Mislukt geocoding (geen match, netwerk-
  //      probleem)? Dan zetten we lat/long op null zodat de eigenaar
  //      ziet dat het niet meer klopt — geen oude coords laten staan
  //      die fout zijn.
  async update(
    restaurantId: string,
    updates: Record<string, unknown>,
    userId: string,
  ) {
    // 1) Forbidden velden weren.
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(updates)) {
      if (!FORBIDDEN_PATCH_FIELDS.has(k)) safe[k] = v;
    }

    // 2) Validatie. Werpen op formaat-fouten geeft de UI een nette
    // NL-melding; veld blijft onveranderd zodat eigenaar kan corrigeren.
    this.validate(safe);

    // 3) Geocoding-trigger. We checken of een van de adres-velden in
    // de patch zit; zo ja, halen we de huidige rij op om het volledige
    // adres samen te stellen (de PATCH kan partial zijn — alleen city
    // bv.) en doen één geocode-call.
    const addressChanging = Object.keys(safe).some((k) =>
      ADDRESS_FIELDS.has(k),
    );
    if (addressChanging) {
      const { data: current, error: curErr } = await this.supabase.client
        .from('restaurants')
        .select('address, postal_code, city')
        .eq('id', restaurantId)
        .maybeSingle();
      if (curErr) throw new InternalServerErrorException(curErr.message);

      const merged = {
        address: (safe.address as string | null) ?? current?.address ?? null,
        postal_code:
          (safe.postal_code as string | null) ?? current?.postal_code ?? null,
        city: (safe.city as string | null) ?? current?.city ?? null,
      };

      const result = await this.geocoding.geocode(merged);
      if (result) {
        safe.latitude = result.latitude;
        safe.longitude = result.longitude;
        this.logger.log(
          `Geocoded ${restaurantId}: ${result.latitude},${result.longitude}`,
        );
      } else {
        // Adres gewijzigd maar geen match meer: lat/long resetten
        // zodat features die op coords leunen (weer-context) zich
        // gracefully houden.
        safe.latitude = null;
        safe.longitude = null;
        this.logger.warn(
          `Geocode mislukt voor ${restaurantId} — coords gereset.`,
        );
      }
    }

    const { data, error } = await this.supabase.client
      .from('restaurants')
      .update({ ...safe, updated_at: new Date().toISOString() })
      .eq('id', restaurantId)
      .select()
      .single();

    if (error) throw new InternalServerErrorException(error.message);

    // Audit: welke velden gewijzigd. We loggen alleen de keys (niet
    // de waardes) zodat we geen PII in audit_log dumpen — namen,
    // emails, KvK staan dan niet in dat logboek. Voor compliance is
    // "veld X is om 14:32 aangepast" voldoende.
    await this.audit.log({
      restaurantId,
      userId,
      action: 'restaurant_updated',
      entity_type: 'restaurant',
      entity_id: restaurantId,
      payload: { fields_changed: Object.keys(safe) },
    });

    return data;
  }

  // Analyseer de website van het restaurant via Claude en sla het
  // resultaat op in de restaurant-rij. Gebruikt door de "Analyseer
  // website"-knop op de account-pagina. Endpoint vraagt expliciet
  // om analyse — niet automatisch, want website-analyse kost een
  // Claude-call (~€0,05) en eigenaar moet bewust kiezen.
  async analyzeWebsite(restaurantId: string, userId: string) {
    // Pak de huidige website_url op. Geen URL = duidelijke fout.
    const { data: r, error: rErr } = await this.supabase.client
      .from('restaurants')
      .select('website_url')
      .eq('id', restaurantId)
      .maybeSingle();
    if (rErr) throw new InternalServerErrorException(rErr.message);
    if (!r) throw new NotFoundException('Restaurant niet gevonden.');
    const url = (r.website_url as string | null)?.trim();
    if (!url) {
      throw new BadRequestException(
        'Vul eerst je website-URL in en sla op voordat je laat analyseren.',
      );
    }

    // De analyzer doet zelf de Claude-call + parsing. We loggen het
    // resultaat in ai_usage (auto via AiService) — geen extra werk.
    const profile = await this.websiteAnalyzer.analyze(url);

    // Map de extracted profile-velden naar onze DB-kolommen. Alleen
    // velden die NIET leeg zijn schrijven we weg, zodat een
    // eerder-gevulde tagline niet wordt vervangen door een lege string
    // als Claude die niet wist te halen.
    const updates: Record<string, unknown> = {
      website_last_analyzed_at: new Date().toISOString(),
    };
    if (profile.tagline) updates.tagline = profile.tagline;
    if (profile.description) updates.description = profile.description;
    if (profile.atmosphere) updates.atmosphere = profile.atmosphere;
    if (profile.target_audience)
      updates.target_audience = profile.target_audience;
    if (profile.unique_selling_points)
      updates.unique_selling_points = profile.unique_selling_points;
    if (profile.special_events) updates.special_events = profile.special_events;
    if (profile.cuisine_style && profile.cuisine_style.length > 0)
      updates.cuisine_style = profile.cuisine_style;
    if (profile.signature_dishes && profile.signature_dishes.length > 0)
      updates.signature_dishes = profile.signature_dishes;
    if (profile.website_summary)
      updates.website_summary = profile.website_summary;
    if (profile.social_media && Object.keys(profile.social_media).length > 0) {
      updates.social_media = profile.social_media;
    }
    // Nieuwe velden uit de uitgebreide analyzer (commit 2026-04-29).
    // Alleen wegschrijven als Filly ze daadwerkelijk vond — bestaande
    // ingevulde velden mogen niet worden overschreven met null.
    if (
      profile.opening_hours &&
      Object.keys(profile.opening_hours).length > 0
    ) {
      updates.opening_hours = profile.opening_hours;
    }
    if (profile.contact_email) updates.contact_email = profile.contact_email;
    if (profile.contact_phone) updates.contact_phone = profile.contact_phone;
    if (profile.legal_name) updates.legal_name = profile.legal_name;

    const { data: updated, error: updErr } = await this.supabase.client
      .from('restaurants')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', restaurantId)
      .select()
      .single();
    if (updErr) throw new InternalServerErrorException(updErr.message);

    this.logger.log(
      `Website-analyse uitgevoerd voor ${restaurantId} door user ${userId}`,
    );

    // Audit: handmatige website-analyse. Belangrijk omdat dit bestaande
    // tagline/sfeer/USPs kan overschrijven — bij een klacht "mijn
    // tagline is veranderd" weten we wie + wanneer.
    await this.audit.log({
      restaurantId,
      userId,
      action: 'website_analyzed',
      entity_type: 'restaurant',
      entity_id: restaurantId,
      payload: {
        url,
        confidence: profile.confidence,
        fields_filled: Object.keys(updates).filter(
          (k) => k !== 'website_last_analyzed_at',
        ),
      },
    });

    return updated;
  }

  // Validatie van patch-velden. Werpt BadRequestException met NL-tekst
  // bij formaat-fouten zodat de UI ze 1-op-1 kan tonen. Lege strings
  // ("") worden behandeld als "leegmaken" — toegestaan, geen validatie.
  private validate(body: Record<string, unknown>): void {
    if ('contact_email' in body) {
      const v = body.contact_email;
      if (v !== null && typeof v === 'string' && v.trim().length > 0) {
        if (!EMAIL_RE.test(v.trim())) {
          throw new BadRequestException(
            'Contact-e-mail lijkt geen geldig adres.',
          );
        }
      }
    }
    if ('email_reply_to' in body) {
      const v = body.email_reply_to;
      if (v !== null && typeof v === 'string' && v.trim().length > 0) {
        if (!EMAIL_RE.test(v.trim())) {
          throw new BadRequestException(
            'Reply-to-adres lijkt geen geldig e-mailadres.',
          );
        }
      }
    }
    if ('kvk_number' in body) {
      const v = body.kvk_number;
      if (v !== null && typeof v === 'string' && v.trim().length > 0) {
        // Sta toe dat eigenaar 'm met spaties of streepjes invoert,
        // we strippen die eruit voordat we toetsen.
        const stripped = v.replace(/[\s.-]/g, '');
        if (!KVK_RE.test(stripped)) {
          throw new BadRequestException(
            'KvK-nummer moet 8 cijfers zijn.',
          );
        }
        body.kvk_number = stripped;
      }
    }
    if ('vat_number' in body) {
      const v = body.vat_number;
      if (v !== null && typeof v === 'string' && v.trim().length > 0) {
        const stripped = v.replace(/[\s.-]/g, '').toUpperCase();
        if (!VAT_RE_NL.test(stripped)) {
          throw new BadRequestException(
            'BTW-nummer moet NL-formaat zijn (NL123456789B01).',
          );
        }
        body.vat_number = stripped;
      }
    }
    if ('contact_phone' in body) {
      const v = body.contact_phone;
      if (v !== null && typeof v === 'string' && v.trim().length > 0) {
        // Heel licht: alleen checken dat er minstens 8 cijfers in zitten.
        // Internationale nummers (+31...) en NL-nummers (06-, 020-)
        // moeten beide door.
        const digits = v.replace(/\D/g, '');
        if (digits.length < 8) {
          throw new BadRequestException(
            'Contact-telefoon lijkt te kort. Gebruik bv. 020-1234567 of +31201234567.',
          );
        }
      }
    }
    if ('email_from_name' in body) {
      const v = body.email_from_name;
      if (v !== null && typeof v === 'string' && v.length > 100) {
        throw new BadRequestException(
          'Afzender-naam mag maximaal 100 tekens zijn.',
        );
      }
    }
    if ('legal_name' in body) {
      const v = body.legal_name;
      if (v !== null && typeof v === 'string' && v.length > 200) {
        throw new BadRequestException(
          'Juridische bedrijfsnaam mag maximaal 200 tekens zijn.',
        );
      }
    }
  }
}
