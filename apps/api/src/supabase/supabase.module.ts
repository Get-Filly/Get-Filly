import { Module } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { RequestSupabaseService } from './request-supabase.service';

/**
 * Twee Supabase-services naast elkaar:
 *
 *   - SupabaseService          → service_role, singleton, RLS-bypass.
 *                                Voor audit-log, anonymization,
 *                                account-deletion, pre-onboarding,
 *                                ai_usage zonder restaurant_id.
 *
 *   - RequestSupabaseService   → user-JWT, per-request scope, RLS-actief.
 *                                Voor alle user-facing reads/writes.
 *                                Defense-in-depth bovenop de TS-guards.
 *
 * Services die de RequestSupabaseService injecteren worden zelf ook
 * REQUEST-scoped (NestJS regelt dit automatisch, de "scope bubbles up"
 * door de provider-keten heen).
 */
@Module({
  providers: [SupabaseService, RequestSupabaseService],
  exports: [SupabaseService, RequestSupabaseService],
})
export class SupabaseModule {}
