import { Module } from '@nestjs/common';
import { BusynessController } from './busyness.controller';
import { BusynessCronController } from './busyness-cron.controller';
import { BusynessService } from './busyness.service';
import { ApifyClient } from './apify.client';
import { QuietFeedbackService } from './quiet-feedback.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { MeModule } from '../me/me.module';
import { EventsModule } from '../events/events.module';
import { WeatherModule } from '../weather/weather.module';
import { AuthGuard } from '../common/auth.guard';
import { BusinessAccessGuard } from '../common/business-access.guard';

@Module({
  // EventsModule + WeatherModule leveren de datum-signalen voor de rustige-
  // momenten-detectie (evenementen in de buurt, weersverwachting). Geen
  // cyclus: geen van beide importeert BusynessModule.
  imports: [SupabaseModule, MeModule, EventsModule, WeatherModule],
  controllers: [BusynessController, BusynessCronController],
  providers: [
    BusynessService,
    // QuietFeedbackService stond wél in exports maar niet hier. Nest weigert
    // dan de hele module te laden (UnknownExportException) en de API start
    // niet meer op — elk endpoint geeft 500. Zie de opmerking bij exports.
    QuietFeedbackService,
    ApifyClient,
    AuthGuard,
    BusinessAccessGuard,
  ],
  // Exporteren zodat de fase B-backend (Filly-context + auto-detectie)
  // de service later kan hergebruiken. Wat je hier exporteert MOET ook in
  // providers staan; anders faalt het opstarten van de hele applicatie en
  // niet alleen deze module.
  exports: [BusynessService, QuietFeedbackService],
})
export class BusynessModule {}
