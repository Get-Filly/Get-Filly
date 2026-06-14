import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthGuard } from './common/auth.guard';
import { SupabaseModule } from './supabase/supabase.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { GuestsModule } from './guests/guests.module';
import { KpiModule } from './kpi/kpi.module';
import { OccupancyModule } from './occupancy/occupancy.module';
import { RestaurantModule } from './restaurant/restaurant.module';
import { WeatherModule } from './weather/weather.module';
import { SuggestionsModule } from './suggestions/suggestions.module';
import { MenuModule } from './menu/menu.module';
import { MenuSuggestionsModule } from './menu-suggestions/menu-suggestions.module';
import { MailModule } from './mail/mail.module';
import { RestaurantMediaModule } from './restaurant-media/restaurant-media.module';
import { ReservationsModule } from './reservations/reservations.module';
import { ReviewsModule } from './reviews/reviews.module';
import { MeModule } from './me/me.module';
import { TeamModule } from './team/team.module';
import { AiModule } from './ai/ai.module';
import { ChatModule } from './chat/chat.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { GoogleProfileModule } from './google-profile/google-profile.module';
import { MarketingModule } from './marketing/marketing.module';
import { HealthModule } from './health/health.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { MetaModule } from './meta/meta.module';
import { SeoReportModule } from './seo-report/seo-report.module';
import { EventsModule } from './events/events.module';
import { GoogleBusinessModule } from './google-business/google-business.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SupabaseModule,
    CampaignsModule,
    GuestsModule,
    KpiModule,
    OccupancyModule,
    RestaurantModule,
    WeatherModule,
    SuggestionsModule,
    MenuModule,
    MenuSuggestionsModule,
    MailModule,
    RestaurantMediaModule,
    ReservationsModule,
    ReviewsModule,
    MeModule,
    TeamModule,
    AiModule,
    ChatModule,
    OnboardingModule,
    GoogleProfileModule,
    MarketingModule,
    HealthModule,
    IntegrationsModule,
    MetaModule,
    SeoReportModule,
    EventsModule,
    GoogleBusinessModule,
  ],
  controllers: [AppController],
  // AuthGuard staat hier als provider zodat NestJS hem kan
  // "injecteren" (Reflector + ConfigService) wanneer een controller
  // hem gebruikt via @UseGuards(AuthGuard). Hij is NOG NIET globaal
  // geactiveerd, dat gebeurt pas via APP_GUARD in een later stadium.
  providers: [AppService, AuthGuard],
})
export class AppModule {}
