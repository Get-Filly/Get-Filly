import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export type AiSuggestion = {
  id: string;
  trigger_type: string;
  trigger_context: Record<string, unknown> | null;
  suggested_campaign: Record<string, unknown>;
  status: SuggestionStatus;
  rejection_reason: string | null;
  created_at: string;
  acted_at: string | null;
};

@Injectable()
export class SuggestionsService {
  constructor(private readonly supabase: SupabaseService) {}

  async findAll(
    restaurantId: string,
    status?: SuggestionStatus,
  ): Promise<AiSuggestion[]> {
    let query = this.supabase.client
      .from('ai_suggestions')
      .select(
        'id, trigger_type, trigger_context, suggested_campaign, status, rejection_reason, created_at, acted_at',
      )
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw new InternalServerErrorException(error.message);
    return (data ?? []) as AiSuggestion[];
  }

  async updateStatus(
    restaurantId: string,
    suggestionId: string,
    status: SuggestionStatus,
    rejectionReason?: string,
  ): Promise<AiSuggestion> {
    const updates: Record<string, unknown> = {
      status,
      acted_at: new Date().toISOString(),
    };
    if (rejectionReason !== undefined) {
      updates.rejection_reason = rejectionReason;
    }

    const { data, error } = await this.supabase.client
      .from('ai_suggestions')
      .update(updates)
      .eq('id', suggestionId)
      .eq('restaurant_id', restaurantId)
      .select(
        'id, trigger_type, trigger_context, suggested_campaign, status, rejection_reason, created_at, acted_at',
      )
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    return data as AiSuggestion;
  }
}
