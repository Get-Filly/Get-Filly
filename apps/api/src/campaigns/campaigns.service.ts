import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export type CampaignType = 'mail' | 'social';
export type CampaignStatus = 'actief' | 'concept' | 'ingepland' | 'afgerond';

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

  async findAll(): Promise<Campaign[]> {
    const { data, error } = await this.supabase.client
      .from('campaigns')
      .select('id, name, type, meta, status')
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []) as Campaign[];
  }
}
