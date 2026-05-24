import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
// Per-request user-JWT-client (RLS actief). Zie SupabaseModule voor uitleg.
import { RequestSupabaseService } from '../supabase/request-supabase.service';
// Service-role-client voor de campaign_performance-increment; nodig om
// ook bij webhook-flows zonder user-context te kunnen schrijven (Zenchef-
// sync e.d. zal hier later doorheen lopen).
import { SupabaseService } from '../supabase/supabase.service';
import { AuditLogService } from '../common/audit-log.service';

export type ReservationStatus =
  | 'bevestigd'
  | 'geannuleerd'
  | 'no_show'
  | 'ingecheckt'
  | 'voltooid';

export type Reservation = {
  id: string;
  guest_id: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  guest_email: string | null;
  reservation_date: string;
  reservation_time: string;
  party_size: number;
  status: ReservationStatus;
  source: string | null;
  notes: string | null;
  special_requests: string | null;
  table_code: string | null;
  // Filly-attributie (sinds migratie 0022). Null = geen koppeling
  // (default), gevuld = uuid van de campagne waaruit deze reservering
  // is voortgekomen. Nu nog handmatig zetbaar via UI; wordt straks
  // automatisch gevuld door de send-engine als een gast op een
  // campagne-link klikt.
  via_campaign_id: string | null;
  created_at: string;
};

// Selectie-string die we overal hergebruiken zodat we niet vergeten
// een nieuw veld in elk select-statement toe te voegen.
const RESERVATION_COLUMNS =
  'id, guest_id, guest_name, guest_phone, guest_email, reservation_date, reservation_time, party_size, status, source, notes, special_requests, table_code, via_campaign_id, created_at';

@Injectable()
export class ReservationsService {
  constructor(
    private readonly supabase: RequestSupabaseService,
    private readonly serviceSupabase: SupabaseService,
    private readonly audit: AuditLogService,
  ) {}

  /**
   * Increment campaign_performance.reservations_attributed +
   * guests_attributed. Revenue voorlopig op 0 zolang we nog geen
   * avg_check_cents per restaurant hebben (P2-backlog).
   *
   * Non-fataal: een gefaalde performance-write mag de reserverings-
   * flow nooit blokkeren. We loggen via console.warn (geen Logger-
   * injectie omdat 'ie nu nog niet in deze service zit).
   */
  private async incrementCampaignAttribution(
    campaignId: string,
    partySize: number,
  ): Promise<void> {
    try {
      // Eerst campaign + restaurant_id ophalen.
      const { data: campaign, error: campErr } = await this.serviceSupabase.client
        .from('campaigns')
        .select('restaurant_id')
        .eq('id', campaignId)
        .maybeSingle();
      if (campErr || !campaign) return;

      // Upsert performance-rij idempotent.
      await this.serviceSupabase.client.from('campaign_performance').upsert(
        {
          campaign_id: campaignId,
          restaurant_id: (campaign as { restaurant_id: string }).restaurant_id,
        },
        { onConflict: 'campaign_id', ignoreDuplicates: true },
      );

      // Read-modify-write. Bij hoog volume migreren naar Postgres RPC
      // voor atomic increment; voor v1 acceptabel.
      const { data: row } = await this.serviceSupabase.client
        .from('campaign_performance')
        .select('reservations_attributed, guests_attributed')
        .eq('campaign_id', campaignId)
        .maybeSingle();
      if (!row) return;

      const r = row as { reservations_attributed: number; guests_attributed: number };
      await this.serviceSupabase.client
        .from('campaign_performance')
        .update({
          reservations_attributed: r.reservations_attributed + 1,
          guests_attributed: r.guests_attributed + partySize,
        })
        .eq('campaign_id', campaignId);
    } catch (err) {
      console.warn(
        `Campaign-attributie increment gefaald voor ${campaignId}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  async findRange(
    restaurantId: string,
    from: string,
    to: string,
  ): Promise<Reservation[]> {
    const { data, error } = await this.supabase.client
      .from('reservations')
      .select(RESERVATION_COLUMNS)
      .eq('restaurant_id', restaurantId)
      .gte('reservation_date', from)
      .lte('reservation_date', to)
      .order('reservation_date', { ascending: true })
      .order('reservation_time', { ascending: true });

    if (error) throw new InternalServerErrorException(error.message);
    return (data ?? []) as Reservation[];
  }

  // Handmatige reservering aanmaken. Gebruikt voor telefoon- of
  // walk-in-boekingen die niet via een reserveringsplatform komen.
  // Minimale velden: naam, datum, tijd, groepsgrootte. Telefoon en
  // mail zijn optioneel (bij walk-ins heb je die vaak nog niet).
  // source = 'handmatig' zodat analytics later onderscheid kunnen
  // maken tussen bron-gevoed en door-ons-ingetikt.
  async create(
    restaurantId: string,
    input: {
      guest_name: string;
      reservation_date: string;
      reservation_time: string;
      party_size: number;
      guest_phone?: string | null;
      guest_email?: string | null;
      special_requests?: string | null;
      notes?: string | null;
    },
  ): Promise<Reservation> {
    const name = input.guest_name?.trim();
    if (!name) {
      throw new BadRequestException('Naam van de gast is verplicht.');
    }
    if (!input.reservation_date || !input.reservation_time) {
      throw new BadRequestException(
        'Datum en tijd van de reservering zijn verplicht.',
      );
    }
    if (!Number.isInteger(input.party_size) || input.party_size < 1) {
      throw new BadRequestException(
        'Groepsgrootte moet minimaal 1 zijn.',
      );
    }

    const { data, error } = await this.supabase.client
      .from('reservations')
      .insert({
        restaurant_id: restaurantId,
        guest_name: name,
        reservation_date: input.reservation_date,
        reservation_time: input.reservation_time,
        party_size: input.party_size,
        guest_phone: input.guest_phone?.trim() || null,
        guest_email: input.guest_email?.trim() || null,
        special_requests: input.special_requests?.trim() || null,
        notes: input.notes?.trim() || null,
        status: 'bevestigd',
        source: 'handmatig',
      })
      .select(RESERVATION_COLUMNS)
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    return data as Reservation;
  }

  // Koppel (of ontkoppel) een reservering aan een Filly-campagne.
  // Wordt aangeroepen vanuit de reserveringen-pagina met een dropdown
  // ("Via campagne…"). campaignId=null betekent "ontkoppelen".
  //
  // Validatie:
  //   - Reservering moet bij dit restaurant horen (tenant-isolatie).
  //   - Als campaignId gegeven: moet ook bij dit restaurant horen
  //     (anders zou je via een ID-gok een vreemde campagne kunnen
  //     koppelen, defense-in-depth bovenop de auth-guards).
  async setAttribution(
    restaurantId: string,
    reservationId: string,
    campaignId: string | null,
    userId: string,
  ): Promise<Reservation> {
    if (campaignId) {
      const { data: campaign, error: campErr } = await this.supabase.client
        .from('campaigns')
        .select('id')
        .eq('id', campaignId)
        .eq('restaurant_id', restaurantId)
        .maybeSingle();
      if (campErr) throw new InternalServerErrorException(campErr.message);
      if (!campaign) {
        throw new BadRequestException('Campagne niet gevonden.');
      }
    }

    const { data, error } = await this.supabase.client
      .from('reservations')
      .update({ via_campaign_id: campaignId })
      .eq('id', reservationId)
      .eq('restaurant_id', restaurantId)
      .select(RESERVATION_COLUMNS)
      .maybeSingle();

    if (error) throw new InternalServerErrorException(error.message);
    if (!data) {
      throw new NotFoundException('Reservering niet gevonden.');
    }

    // Auto-tag de gast: als deze reservering aan een gast gekoppeld is
    // én die gast nog geen acquired_via_campaign_id heeft, zetten we
    // 'm op dezelfde campagne. Zo verschijnt de gast automatisch in de
    // "Via Filly"-stat op de gasten-pagina + KPI-row.
    //
    // Niet-fataal als dit faalt: de reservering-update is al gelukt
    // en dat is wat de gebruiker zag, we loggen alleen.
    if (campaignId && data.guest_id) {
      const { error: guestErr } = await this.supabase.client
        .from('guests')
        .update({ acquired_via_campaign_id: campaignId })
        .eq('id', data.guest_id)
        .eq('restaurant_id', restaurantId)
        // Alleen overschrijven als nog niet gezet, eerste-attributie
        // wint. Latere koppelingen veranderen niet wie de gast oorspronkelijk
        // heeft binnengehaald.
        .is('acquired_via_campaign_id', null);
      if (guestErr) {
        // Log via console; geen Logger-injectie nu om de signature
        // klein te houden. Productie-logging gaat straks via Sentry.
        console.warn(
          `Guest auto-attributie faalde voor ${data.guest_id}: ${guestErr.message}`,
        );
      }
    }

    // Audit: attributie-wijziging, de meest cruciale logging want
    // hierop bouwen alle Filly-ROI cijfers.
    await this.audit.log({
      restaurantId,
      userId,
      action: 'reservation_attribution_set',
      entity_type: 'reservation',
      entity_id: reservationId,
      payload: { campaign_id: campaignId, guest_id: data.guest_id },
    });

    // Performance-aggregatie: campaign_performance bijwerken (hfst 9).
    // Fire-and-forget; non-fataal als 't faalt.
    if (campaignId) {
      void this.incrementCampaignAttribution(
        campaignId,
        data.party_size ?? 0,
      );
    }

    return data as Reservation;
  }

  // ============================================================
  // setStatus, status-overgang voor een reservering
  // ============================================================
  // Gebruikt door de 'Inchecken'-knop op /dashboard/reserveringen
  // (bevestigd → ingecheckt). Strict enum-check zodat een typo niet
  // de DB-check-constraint hoeft te triggeren.
  async setStatus(
    restaurantId: string,
    reservationId: string,
    status: string,
    userId: string,
  ): Promise<Reservation> {
    const allowed: ReservationStatus[] = [
      'bevestigd',
      'geannuleerd',
      'no_show',
      'ingecheckt',
      'voltooid',
    ];
    if (!allowed.includes(status as ReservationStatus)) {
      throw new BadRequestException(
        `Ongeldige status. Toegestaan: ${allowed.join(', ')}.`,
      );
    }

    const { data, error } = await this.supabase.client
      .from('reservations')
      .update({ status })
      .eq('id', reservationId)
      .eq('restaurant_id', restaurantId)
      .select(RESERVATION_COLUMNS)
      .maybeSingle();

    if (error) throw new InternalServerErrorException(error.message);
    if (!data) {
      throw new NotFoundException('Reservering niet gevonden.');
    }

    // Audit-log voor traceability (welk teamlid heeft wanneer welke
    // status gezet). Niet kritiek voor business-flow maar wel voor
    // ondersteuning bij gast-disputen.
    await this.audit.log({
      restaurantId,
      userId,
      action: 'reservation_status_set',
      entity_type: 'reservation',
      entity_id: reservationId,
      payload: { status },
    });

    return data as Reservation;
  }
}
