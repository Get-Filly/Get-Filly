import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { MeModule } from '../me/me.module';
import { AiModule } from '../ai/ai.module';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';
import { AiRateLimitGuard } from '../common/ai-rate-limit.guard';

// ChatModule bundelt alles wat Filly-chat op het dashboard nodig heeft.
// - SupabaseModule: om berichten op te slaan + op te halen
// - MeModule: exporteert RestaurantAccessService die de guard nodig heeft
// - AiModule: om Claude aan te roepen via onze centrale wrapper
// - Guards: standaard auth + tenant-isolation + AI-rate-limit
@Module({
  imports: [SupabaseModule, MeModule, AiModule],
  controllers: [ChatController],
  providers: [ChatService, AuthGuard, RestaurantAccessGuard, AiRateLimitGuard],
})
export class ChatModule {}
