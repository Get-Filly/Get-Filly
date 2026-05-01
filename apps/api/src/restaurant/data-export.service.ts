import { Injectable, InternalServerErrorException } from '@nestjs/common';
// Per-request user-JWT-client (RLS actief). Zie SupabaseModule voor uitleg.
import { RequestSupabaseService } from '../supabase/request-supabase.service';

// Volledig data-export voor één restaurant. Voldoet aan AVG art. 20
// (recht op gegevensoverdraagbaarheid): de eigenaar moet zijn data in
// een gestructureerd, gangbaar en machineleesbaar formaat kunnen
// ontvangen. Hier: één JSON-blob met alle business-data van het
// restaurant.
//
// Wat zit erin:
//   - restaurant-profiel (alle velden)
//   - alle gasten + voorkeuren
//   - alle reserveringen
//   - alle menu-items + menu-uploads-history
//   - alle campagnes + content per type
//   - alle reviews + responses
//   - alle ai_suggestions
//   - chat-history (conversations + messages)
//   - audit-log
//
// Wat zit er NIET in:
//   - storage-binaries (logo's, menu-PDFs) — staan in Supabase
//     Storage; URLs zijn meegenomen, eigenaar kan ze zelf downloaden.
//   - andere restaurants als de user toegang heeft tot meerdere — per
//     restaurant 1 export.
//   - tokens / API-keys.

@Injectable()
export class DataExportService {
  constructor(private readonly supabase: RequestSupabaseService) {}

  async exportRestaurantData(restaurantId: string): Promise<{
    exported_at: string;
    restaurant_id: string;
    data: Record<string, unknown>;
  }> {
    // Parallel ophalen om snelheid hoog te houden. Alle queries scopen
    // op restaurant_id zodat we geen data van andere klanten meenemen
    // (defense-in-depth bovenop tenant-guards).
    const tables = [
      'restaurants',
      'guests',
      'guest_visits',
      'reservations',
      'menu_items',
      'menu_uploads',
      'campaigns',
      'campaign_mail_content',
      'campaign_social_content',
      'campaign_whatsapp_content',
      'campaign_recipients',
      'reviews',
      'ai_suggestions',
      'chat_conversations',
      'chat_messages',
      'audit_log',
      'occupancy_days',
      'segments',
    ];

    const data: Record<string, unknown> = {};

    // Per tabel: select * where restaurant_id = X. Sommige tabellen
    // (campaign_*_content, chat_messages, campaign_recipients) hebben
    // geen directe restaurant_id-kolom — die filteren we via een join
    // op campaign-id of conversation-id van wat we al hebben.

    // Direct gerelateerd aan restaurant_id
    const directTables = [
      'restaurants',
      'guests',
      'guest_visits',
      'reservations',
      'menu_items',
      'menu_uploads',
      'campaigns',
      'reviews',
      'ai_suggestions',
      'chat_conversations',
      'audit_log',
      'occupancy_days',
      'segments',
    ];

    for (const table of directTables) {
      const { data: rows, error } = await this.supabase.client
        .from(table)
        .select('*')
        .eq('restaurant_id', restaurantId);
      if (error) {
        throw new InternalServerErrorException(
          `Export-fout op tabel ${table}: ${error.message}`,
        );
      }
      data[table] = rows ?? [];
    }

    // Indirect: campaign-content. We hebben de campaign-ids al in
    // data.campaigns; daarop joinen via `in` filter.
    const campaignIds = (data.campaigns as { id: string }[]).map((c) => c.id);
    if (campaignIds.length > 0) {
      for (const subTable of [
        'campaign_mail_content',
        'campaign_social_content',
        'campaign_whatsapp_content',
        'campaign_recipients',
      ]) {
        const { data: rows, error } = await this.supabase.client
          .from(subTable)
          .select('*')
          .in('campaign_id', campaignIds);
        if (error) {
          throw new InternalServerErrorException(
            `Export-fout op tabel ${subTable}: ${error.message}`,
          );
        }
        data[subTable] = rows ?? [];
      }
    } else {
      // Geen campagnes = geen content. Lege arrays voor consistente
      // structuur in de export.
      data['campaign_mail_content'] = [];
      data['campaign_social_content'] = [];
      data['campaign_whatsapp_content'] = [];
      data['campaign_recipients'] = [];
    }

    // Indirect: chat_messages. Conversation-ids al opgehaald.
    const conversationIds = (data.chat_conversations as { id: string }[]).map(
      (c) => c.id,
    );
    if (conversationIds.length > 0) {
      const { data: rows, error } = await this.supabase.client
        .from('chat_messages')
        .select('*')
        .in('conversation_id', conversationIds);
      if (error) {
        throw new InternalServerErrorException(
          `Export-fout op tabel chat_messages: ${error.message}`,
        );
      }
      data['chat_messages'] = rows ?? [];
    } else {
      data['chat_messages'] = [];
    }

    // Schoon de export door checks: tabellen die we niet bereikten
    // krijgen een lege array zodat het format consistent is.
    for (const t of tables) {
      if (!(t in data)) data[t] = [];
    }

    return {
      exported_at: new Date().toISOString(),
      restaurant_id: restaurantId,
      data,
    };
  }
}
