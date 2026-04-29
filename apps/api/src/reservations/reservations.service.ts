import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

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
  constructor(private readonly supabase: SupabaseService) {}

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
  //     koppelen — defense-in-depth bovenop de auth-guards).
  async setAttribution(
    restaurantId: string,
    reservationId: string,
    campaignId: string | null,
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
    return data as Reservation;
  }
}
