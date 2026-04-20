import { Injectable, InternalServerErrorException } from '@nestjs/common';
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
  created_at: string;
};

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
      .select(
        'id, guest_id, guest_name, guest_phone, guest_email, reservation_date, reservation_time, party_size, status, source, notes, special_requests, table_code, created_at',
      )
      .eq('restaurant_id', restaurantId)
      .gte('reservation_date', from)
      .lte('reservation_date', to)
      .order('reservation_date', { ascending: true })
      .order('reservation_time', { ascending: true });

    if (error) throw new InternalServerErrorException(error.message);
    return (data ?? []) as Reservation[];
  }
}
