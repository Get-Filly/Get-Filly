import { Injectable, Logger } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
// Per-request user-JWT-client (RLS actief). Zie SupabaseModule voor uitleg.
// Fire-and-forget summarizeAndSave-calls werken: Node houdt deze instance
// in leven zolang de async-call referenties heeft op `this.supabase`.
import { RequestSupabaseService } from '../supabase/request-supabase.service';
import { AiService } from '../ai/ai.service';

// ============================================================
// ChatMemoryService, Filly's leerschat per restaurant
// ============================================================
//
// Probleem dat dit oplost:
//   Een chat heeft een cap van 20 berichten (kostenbescherming,
//   anders worden de input-tokens per turn duurder bij elke nieuwe
//   user-msg). Maar als de eigenaar in chat #1 zegt "ik vind die
//   formele toon niks, gebruik 'jij' niet 'u'", moet Filly dat in
//   chat #2 + #3 + #4 nog wéten, anders herhaalt 'ie de fout
//   eindeloos.
//
// Oplossing:
//   Bij cap-bereikt vat Haiku 4.5 de afgesloten chat samen, wat heeft
//   de eigenaar geprefereerd / afgewezen / geleerd. Die samenvatting
//   gaat in restaurant_chat_memory en wordt in de system-prompt van
//   álle volgende chats meegegeven (laatste 5 memories, cacheable).
//
// Waarom Haiku 4.5 (niet Sonnet of Opus):
//   Samenvatten is eenvoudige tekstverwerking. Haiku doet het prima
//   voor ~€0.001 per call vs ~€0.02 met Sonnet. Een eigenaar die
//   2 chats per dag vol-praat = €0.06 per maand aan memory-kosten.
//
// Waarom fire-and-forget:
//   De cap-check gebeurt synchroon in sendMessage maar de samenvatting
//   mag in de achtergrond. Eigenaar krijgt direct z'n nieuwe-gesprek-
//   CTA; de memory verschijnt 1-3 seconden later. Faalt 't? logger.warn
//   en de volgende cap-call probeert het opnieuw (idempotent voor
//   dezelfde conversatie via de unique source_conversation_id-check).
// ============================================================

// Tool-use schema voor Haiku. Forceer Claude tot exact dit formaat,
// geen JSON-parse-roulette zoals voor 2026-04-30 de norm was.
const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description:
        'Beknopte samenvatting (max 80 woorden) van wat de eigenaar in dit chat-' +
        'gesprek heeft afgewezen, geprefereerd, of geleerd dat relevant is voor ' +
        'volgende chats. Focus op: woordkeuze-voorkeuren, thema-afwijzingen, ' +
        'tone-correcties, specifieke instructies. Niet op: feitelijke vragen die ' +
        'eenmalig waren.',
      maxLength: 600,
    },
    has_learning: {
      type: 'boolean',
      description:
        'False als de chat alleen feitelijke vraag-antwoord was zonder voorkeur-' +
        'expressie. True bij élk signaal van afkeur, voorkeur, correctie of ' +
        'instructie. Bij false slaan we GEEN memory op (voorkomt prompt-bloat ' +
        'met betekenisloze "geen voorkeur uitgesproken"-rijen).',
    },
  },
  required: ['summary', 'has_learning'],
} as const satisfies Anthropic.Tool.InputSchema;

type SummaryResult = {
  summary: string;
  has_learning: boolean;
};

@Injectable()
export class ChatMemoryService {
  private readonly logger = new Logger(ChatMemoryService.name);

  constructor(
    private readonly supabase: RequestSupabaseService,
    private readonly ai: AiService,
  ) {}

  // Haalt de laatste N memories op voor een restaurant. Wordt door
  // ChatService.buildSystemPrompt gebruikt om de chat-prompt te
  // verrijken met geleerde voorkeuren. Limit-default 5, meer geeft
  // prompt-bloat zonder veel kwaliteit-winst (Filly wegen recente
  // signalen vanzelf zwaarder als ze in dezelfde context staan).
  //
  // Geeft een lege array bij geen memories, caller moet daar tegen
  // kunnen (geen "Eerder geleerd"-blok in de prompt is OK).
  async getRecentMemories(
    restaurantId: string,
    limit = 5,
  ): Promise<Array<{ summary: string; created_at: string }>> {
    const { data, error } = await this.supabase.client
      .from('restaurant_chat_memory')
      .select('summary, created_at')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      // Niet-fataal: chat-call moet gewoon doorgaan ook als memories
      // niet ophaalbaar zijn. Falback = lege array → geen memory-block
      // in system-prompt.
      this.logger.warn(`getRecentMemories faalde: ${error.message}`);
      return [];
    }
    return (data ?? []) as Array<{ summary: string; created_at: string }>;
  }

  // Render de memories als een human-leesbaar blok voor in de
  // system-prompt. Format:
  //   === EERDER GELEERD ===
  //   - 2026-04-28: Eigenaar wijst formele toon af, prefereert 'jij'
  //   - 2026-04-25: 'Gezellig' wordt te vaak gebruikt, vermijden
  //
  // Geeft lege string bij geen memories zodat caller 'm zonder
  // conditionals in de prompt kan plakken.
  formatMemoryBlock(
    memories: Array<{ summary: string; created_at: string }>,
  ): string {
    if (memories.length === 0) return '';

    const lines = memories.map((m) => {
      const date = m.created_at.slice(0, 10); // YYYY-MM-DD
      return `- ${date}: ${m.summary}`;
    });

    return [
      '=== EERDER GELEERD (uit afgesloten chats) ===',
      'De eigenaar heeft in eerdere chats het volgende uitgesproken.',
      'Houd hier rekening mee, herhaal niet wat hij al heeft afgewezen.',
      '',
      ...lines,
    ].join('\n');
  }

  // Vat een afgesloten chat samen en sla het op als memory. Wordt
  // fire-and-forget aangeroepen vanuit ChatService.sendMessage zodra
  // de cap is bereikt. Faal-tolerant: alle errors loggen + return.
  //
  // Idempotent via source_conversation_id-check: als er al een memory
  // voor deze conversation bestaat, doen we niets. Voorkomt dat een
  // dubbele cap-trigger (race tussen 2 user-msg-attempts) twee
  // memories voor dezelfde chat schrijft.
  async summarizeAndSave(opts: {
    restaurantId: string;
    userId: string;
    conversationId: string;
  }): Promise<void> {
    try {
      // 1) Idempotent-check: bestaat er al een memory voor deze conv?
      const { data: existing, error: existsErr } = await this.supabase.client
        .from('restaurant_chat_memory')
        .select('id')
        .eq('source_conversation_id', opts.conversationId)
        .limit(1)
        .maybeSingle();
      if (existsErr) {
        this.logger.warn(
          `Memory exists-check faalde voor conv ${opts.conversationId}: ${existsErr.message}`,
        );
        return;
      }
      if (existing) {
        // Memory voor deze chat bestaat al, niets te doen.
        return;
      }

      // 2) Haal alle berichten van de conversatie op (voor de cap = 20
      // dus altijd hanteerbaar in één query).
      const { data: msgs, error: msgErr } = await this.supabase.client
        .from('chat_messages')
        .select('role, content')
        .eq('conversation_id', opts.conversationId)
        .eq('restaurant_id', opts.restaurantId)
        .order('created_at', { ascending: true });
      if (msgErr) {
        this.logger.warn(
          `Memory msgs-fetch faalde: ${msgErr.message}`,
        );
        return;
      }
      if (!msgs || msgs.length === 0) return;

      // Render als transcript voor Claude. Filter system-msgs (zijn
      // gereserveerd voor toekomstige notificaties, niet relevant voor
      // memory-extractie).
      const transcript = msgs
        .filter((m) => m.role === 'user' || m.role === 'filly')
        .map(
          (m) =>
            `${m.role === 'user' ? 'Eigenaar' : 'Filly'}: ${(m.content as string) ?? ''}`,
        )
        .join('\n');

      // 3) Haiku-call met tool-use. has_learning-flag voorkomt dat we
      // alle chats samenvatten, alleen die met écht voorkeur-signaal.
      const result = await this.ai.generateStructured<SummaryResult>({
        system:
          'Je analyseert een afgesloten chat-gesprek tussen een restauran' +
          'teigenaar en zijn AI-assistent Filly. Je doel: extra' +
          'heer alleen DUURZAME voorkeuren (woordkeuze, thema-afwijzingen, ' +
          'tone-correcties, specifieke instructies). Eenmalige feitelijke ' +
          'vragen ("hoe was de bezetting gisteren?") tellen NIET als ' +
          'leerpunt. Geef has_learning=false als er niets duurzaams is.',
        prompt: `Hier is het volledige gesprek:\n\n${transcript}\n\nVat samen wat duurzaam relevant is.`,
        // Haiku 4.5, snel + goedkoop, ruim voldoende voor samenvatten.
        // ~€0.001 per call vs ~€0.02 met Sonnet.
        model: 'claude-haiku-4-5-20251001',
        maxTokens: 400,
        meta: {
          restaurantId: opts.restaurantId,
          userId: opts.userId,
          feature: 'chat-memory-summary',
        },
        toolName: 'save_memory',
        toolDescription:
          'Sla de gedestilleerde leerschat op (of skip als er niks duurzaams was).',
        inputSchema: SUMMARY_SCHEMA,
      });

      // 4) Skip als geen leerpunt, voorkomt prompt-bloat met "geen
      // voorkeuren uitgesproken"-rijen in toekomstige chats.
      if (!result.has_learning || !result.summary?.trim()) {
        this.logger.log(
          `Memory geskipt voor conv ${opts.conversationId}: geen duurzaam leerpunt.`,
        );
        return;
      }

      // 5) Wegschrijven. preferences_extracted blijft NULL voor MVP;
      // komt later wanneer we expliciete velden op de account-pagina
      // toevoegen ({forbidden_words, style_notes}).
      const { error: insertErr } = await this.supabase.client
        .from('restaurant_chat_memory')
        .insert({
          restaurant_id: opts.restaurantId,
          source_conversation_id: opts.conversationId,
          summary: result.summary.trim(),
          preferences_extracted: null,
        });
      if (insertErr) {
        this.logger.warn(
          `Memory insert faalde: ${insertErr.message}`,
        );
        return;
      }

      this.logger.log(
        `Memory opgeslagen voor conv ${opts.conversationId}: "${result.summary.slice(0, 60)}..."`,
      );
    } catch (e) {
      this.logger.warn(
        `summarizeAndSave throw voor conv ${opts.conversationId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
