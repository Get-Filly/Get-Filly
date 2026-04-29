import { Module } from '@nestjs/common';
import { RestaurantController } from './restaurant.controller';
import { RestaurantService } from './restaurant.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { MeModule } from '../me/me.module';
import { GeocodingModule } from '../geocoding/geocoding.module';
import { AiModule } from '../ai/ai.module';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

// GeocodingModule levert de PDOK-call voor adres → lat/long; wordt
// automatisch getriggerd zodra adres/postcode/stad wordt bijgewerkt.
// AiModule levert WebsiteAnalyzerService voor de "Analyseer website"-knop.
@Module({
  imports: [SupabaseModule, MeModule, GeocodingModule, AiModule],
  controllers: [RestaurantController],
  providers: [RestaurantService, AuthGuard, RestaurantAccessGuard],
})
export class RestaurantModule {}
