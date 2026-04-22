import { Module } from '@nestjs/common';
import { TeamController } from './team.controller';
import { InvitesController } from './invites.controller';
import { TeamService } from './team.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { MeModule } from '../me/me.module';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

@Module({
  imports: [SupabaseModule, MeModule],
  controllers: [TeamController, InvitesController],
  providers: [TeamService, AuthGuard, RestaurantAccessGuard],
})
export class TeamModule {}
