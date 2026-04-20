import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseModule } from './supabase/supabase.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { GuestsModule } from './guests/guests.module';
import { KpiModule } from './kpi/kpi.module';
import { OccupancyModule } from './occupancy/occupancy.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SupabaseModule,
    CampaignsModule,
    GuestsModule,
    KpiModule,
    OccupancyModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
