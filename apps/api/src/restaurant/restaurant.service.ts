import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ZodError } from 'zod';
// Per-request user-JWT-client (RLS actief). Zie SupabaseModule voor uitleg.
import { RequestSupabaseService } from '../supabase/request-supabase.service';
import { GeocodingService } from '../geocoding/geocoding.service';
import { WebsiteAnalyzerService } from '../ai/website-analyzer.service';
import { AuditLogService } from '../common/audit-log.service';
import {
  RestaurantUpdateSchema,
  firstZodMessage,
} from './restaurant-update.schema';

// Velden die geocoding triggeren als ze wijzigen. Bij een wijziging
// op een van deze sleutels halen we automatisch nieuwe lat/long op.
const ADDRESS_FIELDS = new Set(['address', 'postal_code', 'city']);

@Injectable()
export class RestaurantService {
  private readonly logger = new Logger(RestaurantService.name);

  constructor(
    private readonly supabase: RequestSupabaseService,
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
  //   1. Zod-schema parsen → keurt onbekende velden af (allowlist) +
  //      valideert formaten (KvK = 8 cijfers, e-mail-regex, etc).
  //   2. Adres gewijzigd? Trigger PDOK-geocoding en zet lat/long mee
  //      in dezelfde update. Mislukt geocoding (geen match, netwerk-
  //      probleem)? Dan zetten we lat/long op null zodat de eigenaar
  //      ziet dat het niet meer klopt, geen oude coords laten staan
  //      die fout zijn.
  //
  // Het zod-schema (RestaurantUpdateSchema) is .strict(), een veld
  // dat niet expliciet is toegestaan wordt geweigerd, in plaats van
  // dat we een handmatige denylist moeten onderhouden. Bij elke nieuwe
  // DB-kolom: voeg toe aan het schema (bewuste keuze) of houd 'm
  // server-managed (default).
  async update(
    restaurantId: string,
    updates: Record<string, unknown>,
    userId: string,
  ) {
    // 1) Schema-parse. Bij een ZodError werpen we BadRequest met de
    // eerste foutmelding in NL, UI toont 'm direct boven het veld.
    let safe: Record<string, unknown>;
    try {
      // .parse() retourneert een nieuw object met alleen toegestane
      // velden + ge-transformeerde waardes (bv. KvK gestripped van
      // streepjes/spaties). Onbekende keys worden stilletjes weggehaald
      // (.strip is default zod-gedrag), zie schema-comments voor de
      // afweging. Hieronder loggen we welke keys we wegfilterden,
      // zodat we hygiëne-visibiliteit houden zonder de frontend te breken.
      safe = RestaurantUpdateSchema.parse(updates) as Record<string, unknown>;
    } catch (e) {
      if (e instanceof ZodError) {
        throw new BadRequestException(firstZodMessage(e));
      }
      throw e;
    }

    // Hygiëne-log: welke keys hebben we weggefilterd? Een handvol
    // is normaal (id, plan, latitude, de frontend stuurt het hele
    // form-object). Iets onverwachts → reden om schema te checken.
    const stripped = Object.keys(updates).filter(
      (k) => !(k in safe) && updates[k] !== undefined,
    );
    if (stripped.length > 0) {
      this.logger.debug(
        `Restaurant ${restaurantId} update: gefilterde velden ${stripped.join(', ')}`,
      );
    }

    // 2) Geocoding-trigger. We checken of een van de adres-velden in
    // de patch zit; zo ja, halen we de huidige rij op om het volledige
    // adres samen te stellen (de PATCH kan partial zijn, alleen city
    // bv.) en doen één geocode-call. Lat/long worden hier server-side
    // toegevoegd aan `safe`, die staan bewust NIET in het zod-schema
    // (cliënt kan ze nooit zelf zetten).
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
          `Geocode mislukt voor ${restaurantId}, coords gereset.`,
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
    // de waardes) zodat we geen PII in audit_log dumpen, namen,
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
  // om analyse, niet automatisch, want website-analyse kost een
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
    // resultaat in ai_usage (auto via AiService), geen extra werk.
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
    // Toon-tab (tone_of_voice + brand_story) + SEO-tab (keywords +
    // default_hashtags) + Basis (location_description + awards). Deze
    // ontbraken eerder in de analyzer waardoor die tabs leeg bleven na
    // 'Laat Filly invullen' (fix 2026-05-29).
    if (profile.tone_of_voice) updates.tone_of_voice = profile.tone_of_voice;
    if (profile.brand_story) updates.brand_story = profile.brand_story;
    if (profile.keywords && profile.keywords.length > 0)
      updates.keywords = profile.keywords;
    if (profile.default_hashtags && profile.default_hashtags.length > 0)
      updates.default_hashtags = profile.default_hashtags;
    if (profile.location_description)
      updates.location_description = profile.location_description;
    if (profile.awards && profile.awards.length > 0)
      updates.awards = profile.awards;
    if (profile.website_summary)
      updates.website_summary = profile.website_summary;
    if (profile.social_media && Object.keys(profile.social_media).length > 0) {
      updates.social_media = profile.social_media;
    }
    // Nieuwe velden uit de uitgebreide analyzer (commit 2026-04-29).
    // Alleen wegschrijven als Filly ze daadwerkelijk vond, bestaande
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
    // tagline/sfeer/USPs kan overschrijven, bij een klacht "mijn
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

  // Note: validatie + formaat-stripping (KvK-spaties, VAT-uppercase,
  // e-mail-regex etc) draait nu in RestaurantUpdateSchema (zie
  // restaurant-update.schema.ts). Eén schema = single source of truth
  // voor "wat mag eigenaar wijzigen + in welk formaat".
}
