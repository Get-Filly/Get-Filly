import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { KnowledgeService } from './knowledge.service';

@Module({
  imports: [SupabaseModule],
  providers: [KnowledgeService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
