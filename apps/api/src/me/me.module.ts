import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { RestaurantAccessService } from '../common/restaurant-access.service';

/**
 * MeModule — bevat endpoints over de ingelogde user.
 * Heeft SupabaseModule nodig omdat RestaurantAccessService de DB
 * aanspreekt om te weten bij welke restaurants de user hoort.
 */
@Module({
  imports: [SupabaseModule],
  controllers: [MeController],
  providers: [RestaurantAccessService],
  // Exporteer zodat andere modules (bv. toekomstige TeamModule)
  // de service kunnen hergebruiken zonder hem opnieuw te declareren.
  exports: [RestaurantAccessService],
})
export class MeModule {}
