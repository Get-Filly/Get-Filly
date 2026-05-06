import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

// Veelvoorkomende audit-actions. Geen exhaustive enum, services
// mogen ook custom strings gebruiken zolang ze snake_case zijn en
// duidelijk welke entity ze raken (`<entity>_<verb>`).
export type AuditAction =
  | 'campaign_created'
  | 'campaign_updated'
  | 'campaign_status_changed'
  | 'campaign_deleted'
  | 'campaign_attribution_set'
  | 'menu_item_created'
  | 'menu_item_updated'
  | 'menu_item_deleted'
  | 'menu_card_imported'
  | 'menu_card_removed'
  | 'restaurant_updated'
  | 'website_analyzed'
  | 'review_response_updated'
  | 'reservation_created'
  | 'reservation_attribution_set'
  | 'onboarding_completed'
  | string;

export type AuditEntityType =
  | 'campaign'
  | 'menu_item'
  | 'menu_upload'
  | 'restaurant'
  | 'review'
  | 'reservation'
  | 'guest'
  | 'ai_suggestion'
  | string;

// AuditLogService, centrale schrijver voor de audit_log-tabel.
//
// Gebruik:
//   constructor(private readonly audit: AuditLogService) {}
//   await this.audit.log({
//     restaurantId,
//     userId,
//     action: 'campaign_created',
//     entity_type: 'campaign',
//     entity_id: campaign.id,
//     payload: { name, type, source: 'chat-proposal' },
//   });
//
// Doel:
//   - **Compliance**: bij audits/AVG-vragen kunnen we per restaurant
//     terugzien wie wat wanneer heeft veranderd (bv. wie heeft mail-
//     opt-in van een gast aangezet/uit).
//   - **Debugging**: bij klant-support kunnen we zien wat er gebeurd
//     is voordat iets stuk ging ("die campagne is om 14:32 op
//     ingepland gezet, daarna terug naar concept om 14:35").
//   - **Filly-feedback**: welke voorstellen worden vaakst goedgekeurd
//     vs. afgewezen, input voor prompt-tuning.
//
// Fail-soft: als de audit-write faalt mag dat de hoofd-actie niet
// breken. We loggen een warning en gaan door. Beter een gemiste log
// dan een mislukte campagne-update voor de eindgebruiker.
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async log(opts: {
    restaurantId: string | null;
    userId: string | null;
    action: AuditAction;
    entity_type?: AuditEntityType;
    entity_id?: string | null;
    payload?: Record<string, unknown>;
    ip_address?: string | null;
    user_agent?: string | null;
  }): Promise<void> {
    try {
      const { error } = await this.supabase.client.from('audit_log').insert({
        restaurant_id: opts.restaurantId,
        user_id: opts.userId,
        action: opts.action,
        entity_type: opts.entity_type ?? null,
        entity_id: opts.entity_id ?? null,
        payload: opts.payload ?? null,
        ip_address: opts.ip_address ?? null,
        user_agent: opts.user_agent ?? null,
      });
      if (error) {
        this.logger.warn(
          `audit_log insert faalde voor action=${opts.action}: ${error.message}`,
        );
      }
    } catch (e) {
      // Onverwachte fout (netwerk, etc), log + door. Niet throwen
      // want dat zou de hoofd-actie van de caller stuk maken.
      this.logger.warn(
        `audit_log throw voor action=${opts.action}: ${String(e)}`,
      );
    }
  }
}
