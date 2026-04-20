import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { SupabaseService } from './supabase/supabase.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly supabase: SupabaseService,
  ) {}

  @Get('hello')
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('supabase-status')
  async supabaseStatus() {
    // Simpele ping: vraag een niet-bestaande tabel op. Een "table not found"
    // fout betekent dat de verbinding + auth werken — dan zijn we goed.
    const { error } = await this.supabase.client
      .from('__ping__')
      .select('*')
      .limit(1);

    const tableNotFound =
      error?.code === '42P01' ||
      error?.code === 'PGRST205' ||
      (error?.message ?? '').includes('Could not find the table');

    if (!error || tableNotFound) {
      return { ok: true, message: 'Verbonden met Supabase ✓' };
    }

    return { ok: false, message: `Fout: ${error.message}` };
  }
}
