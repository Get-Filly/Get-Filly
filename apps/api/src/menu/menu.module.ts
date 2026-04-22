import { Module } from '@nestjs/common';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { MeModule } from '../me/me.module';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

@Module({
  imports: [SupabaseModule, MeModule],
  controllers: [MenuController],
  providers: [MenuService, AuthGuard, RestaurantAccessGuard],
})
export class MenuModule {}
