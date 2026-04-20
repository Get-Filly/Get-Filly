import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export type CampaignType = 'mail' | 'social' | 'whatsapp';
export type CampaignStatus =
  | 'concept'
  | 'ingepland'
  | 'actief'
  | 'afgerond'
  | 'gearchiveerd';

export type Campaign = {
  id: string;
  name: string;
  type: CampaignType;
  meta: string | null;
  status: CampaignStatus;
};

@Injectable()
export class CampaignsService {
  constructor(private readonly supabase: SupabaseService) {}

  async findAll(restaurantId: string): Promise<Campaign[]> {
    const { data, error } = await this.supabase.client
      .from('campaigns')
      .select('id, name, type, meta, status')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []) as Campaign[];
  }
}
