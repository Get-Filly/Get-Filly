import { Module } from '@nestjs/common';
import { GuestsController } from './guests.controller';
import { GuestsService } from './guests.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { MeModule } from '../me/me.module';
import { AuthGuard } from '../common/auth.guard';
import { BusinessAccessGuard } from '../common/business-access.guard';

@Module({
  imports: [SupabaseModule, MeModule],
  controllers: [GuestsController],
  providers: [GuestsService, AuthGuard, BusinessAccessGuard],
})
export class GuestsModule {}
