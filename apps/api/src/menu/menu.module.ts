import { Module } from '@nestjs/common';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { MeModule } from '../me/me.module';
import { AiModule } from '../ai/ai.module';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

// AiModule levert MenuImporterService — Claude Vision-analyse van een
// geüploade menukaart. Wordt gebruikt door MenuService.importCard om
// gerechten uit een PDF/foto te extraheren en als menu_items weg te
// schrijven.
@Module({
  imports: [SupabaseModule, MeModule, AiModule],
  controllers: [MenuController],
  providers: [MenuService, AuthGuard, RestaurantAccessGuard],
})
export class MenuModule {}
