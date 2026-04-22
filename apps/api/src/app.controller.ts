import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { SupabaseService } from './supabase/supabase.service';
import { Public } from './common/public.decorator';

/**
 * AppController — basis-endpoints van de API.
 *
 * Deze endpoints zijn publiek: ze vereisen GEEN login. Dat doen we
 * met de @Public()-decorator (zie public.decorator.ts). Zonder die
 * markering zou de globale AuthGuard elke request hier ook blokkeren.
 *
 * Waarom publiek?
 *   - /hello:            simpel "leeft de server?"-controlepunt
 *   - /supabase-status:  controleert DB-verbinding, wordt gebruikt bij
 *                        development en monitoring — moet zonder login
 *                        bereikbaar zijn zodat tools kunnen pingen.
 */
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly supabase: SupabaseService,
  ) {}

  @Public()
  @Get('hello')
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
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
