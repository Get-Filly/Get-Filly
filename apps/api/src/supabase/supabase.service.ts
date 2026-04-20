import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  public readonly client: SupabaseClient;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('SUPABASE_URL');
    const key = this.config.get<string>('SUPABASE_SECRET_KEY');

    if (!url || !key) {
      throw new Error('Supabase env-variabelen ontbreken. Check apps/api/.env.');
    }

    this.client = createClient(url, key, {
      auth: { persistSession: false },
    });
  }
}
