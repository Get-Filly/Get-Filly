import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { GeocodingModule } from '../geocoding/geocoding.module';
import { EventsSyncService } from './events-sync.service';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';

// EventsModule — lokale evenementen voor het social-posting-brein.
//   - EventsSyncService: wekelijkse sitemap-sync evenementen.nl
//     (Vercel Cron → GET /api/events/sync met CRON_SECRET).
//   - EventsService: staffel-matching op afstand + prompt-blok
//     (gebruikt door suggestions + campaigns).
@Module({
  imports: [SupabaseModule, GeocodingModule],
  controllers: [EventsController],
  providers: [EventsSyncService, EventsService],
  exports: [EventsService],
})
export class EventsModule {}
