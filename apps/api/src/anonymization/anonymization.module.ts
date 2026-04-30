import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { AnonymizationService } from './anonymization.service';

// Anonimisering staat los van een specifiek domein (campagnes,
// restaurant) omdat hij door meerdere consumers wordt gebruikt:
//   - CampaignsService bij `status → afgerond` (continu opbouwen)
//   - AccountDeletionService bij verwijderverzoek (laatste vangnet)
//
// Net als AuditLogModule: geen controller, alleen een service die
// elders geïnjecteerd wordt.
@Module({
  imports: [SupabaseModule],
  providers: [AnonymizationService],
  exports: [AnonymizationService],
})
export class AnonymizationModule {}
