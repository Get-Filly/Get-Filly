import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { BusinessAccessService } from '../common/business-access.service';

/**
 * MeModule, bevat endpoints over de ingelogde user.
 * Heeft SupabaseModule nodig omdat BusinessAccessService de DB
 * aanspreekt om te weten bij welke restaurants de user hoort.
 */
@Module({
  imports: [SupabaseModule],
  controllers: [MeController],
  providers: [BusinessAccessService],
  // Exporteer zodat andere modules (bv. toekomstige TeamModule)
  // de service kunnen hergebruiken zonder hem opnieuw te declareren.
  exports: [BusinessAccessService],
})
export class MeModule {}
