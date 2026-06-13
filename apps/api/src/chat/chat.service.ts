import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
// Per-request user-JWT-client (RLS actief). Zie SupabaseModule voor uitleg.
import { RequestSupabaseService } from '../supabase/request-supabase.service';
import { AiService } from '../ai/ai.service';
import { RestaurantContextService } from '../ai/restaurant-context.service';
import { ChannelReachService } from '../ai/channel-reach.service';
import { SuggestionsService } from '../suggestions/suggestions.service';
import { ChatMemoryService } from './chat-memory.service';
import { type ToneSignature } from '../ai/filly-brain.config';
import { naturalizeDashes } from '../ai/copy-style.guard';
import { CampaignFingerprintService } from '../campaigns/campaign-fingerprint.service';
import { resolveDutchDate } from '../common/dutch-date';

// Rollen zoals we ze in de chat_messages-tabel opslaan. 'filly' = assistant,
// 'user' = de restauranteigenaar, 'system' = interne/automatische berichten
// (bv. notificaties in de thread). Voor onze v1 gebruiken we alleen
// 'filly' en 'user' actief.
export type ChatRole = 'filly' | 'user' | 'system';

// message_card = gestructureerde payload die naast de prozatekst wordt
// opgeslagen wanneer Filly een actie voorstelt. Sinds 2026-05-04:
//   - 'campaign_proposal' : single-channel (mail OF social OF whatsapp)
//                            met 3 varianten van dezelfde tekst
//   - 'campaign_bundle'   : multi-channel (mail + IG + FB) onder 1 thema,
//                            elk met eigen caption-stijl
//   - 'channel_choice'    : Filly vraagt eerst welk kanaal, 4 knoppen
//                            (mail/social/whatsapp/bundle). Bij klik
//                            stuurt frontend automatisch een user-msg
//                            terug naar Filly zodat 'ie het juiste
//                            formaat genereert.
// Frontend rendert op basis van `kind` een bijpassend kaartje met
// actieknoppen. De ruwe JSON blijft in de DB zodat we proposals later
// kunnen audit-en en analyseren.
export type MessageCard =
  | CampaignProposalCard
  | CampaignBundleCard
  | ChannelChoiceCard
  | DateChoiceCard
  | GuidedStartCard;

// Guided-start: getypt campagne-verzoek opent de geleide flow (dezelfde
// als de lege-chat-staat) ín het gesprek. Geen ai_suggestion erachter —
// de flow maakt z'n eigen voorstel via generate-for-dates. `date` is de
// optioneel door Filly herleide doel-datum (uit "zondag"/"morgen"/
// "volgende week zondag"); leeg = flow begint bij de dag-keuze.
export type GuidedStartCard = {
  kind: 'guided_start';
  date?: string;
  // Optioneel gerecht/thema uit het verzoek ("doe iets met de Burrata")
  // dat de generatie stuurt. Leeg = Filly kiest zelf uit het menu.
  topic?: string;
};

// Channel-choice, geen ai_suggestion-rij erachter (geen suggestion_id),
// puur een UI-prompt waarbij eigenaar door op een knop te klikken
// automatisch een follow-up-bericht naar Filly stuurt.
export type ChannelChoiceCard = {
  kind: 'channel_choice';
  question: string;
  // Volgorde + welke opties beschikbaar zijn, Filly bepaalt zelf.
  // Voor V1 standaard alle 5: mail/instagram/facebook/whatsapp/google_business.
};

// Date-choice, sinds 2026-05-24: Filly vraagt eerst voor welke dag of
// gelegenheid (vóór de kanaal-keuze). Reden: kanaal is afgeleid van
// doel-deadline (zie filly-brein hoofdstuk 7 urgentie-vs-optimum).
// Bij klik op een snelle-keuze of datum: orchestrator stuurt een
// follow-up-bericht "Voor [datum-context]" zodat Filly de keuze in
// de volgende beurt meeneemt.
export type DateChoiceCard = {
  kind: 'date_choice';
  question: string;
};

// Bundle-versie van CampaignProposalCard. Wordt opgeslagen in
// chat_messages.message_card en in ai_suggestions.suggested_campaign
// (met trigger_type='chat_bundle'). Approve-flow detecteert kind en
// maakt 1 campaign_groups-rij + 3 campaigns + 3 content-rijen.
export type CampaignBundleCard = {
  kind: 'campaign_bundle';
  suggestion_id: string;
  name: string;
  theme: string;
  channels: {
    // Sinds 2026-06-02: de bundel ondersteunt alle 5 chat-kanalen, niet
    // langer alleen mail+IG+FB. Velden zijn OPTIONEEL: een bundel bevat
    // precies de kanalen die de eigenaar aanvinkte (minimaal 2).
    // WhatsApp (persoonlijk bericht) en Google Business (lokale profiel-
    // post) hebben geen onderwerp of hashtags, dus enkel een `body`.
    mail?: { subject_line: string; body: string };
    instagram?: { caption: string; hashtags?: string[] };
    facebook?: { caption: string };
    whatsapp?: { body: string };
    google_business?: { body: string };
  };
  // Status van onderliggende ai_suggestion + group-id na approve.
  suggestion_status?: string;
  approved_group_id?: string | null;
};

// Eén variant van een campagne-voorstel. Filly genereert er normaal
// drie naast elkaar zodat de eigenaar kan kiezen i.p.v. iteratief
// blijven sparren.
export type ProposalVariant = {
  subject_line?: string;
  body: string;
  // Verteltechniek van deze variant (filly-brein hfst 8.4). Filly labelt
  // 'm zelf bij generatie zodat we 3 verschillende tones kunnen afdwingen
  // én de fingerprint de tone direct kent (geen Haiku-classificatie nodig).
  // Optioneel voor backwards-compat met oude voorstellen.
  tone_signature?: ToneSignature;
};

export type CampaignProposalCard = {
  kind: 'campaign_proposal';
  // FK naar ai_suggestions.id, gezet zodra het voorstel als
  // pending-suggestie is opgeslagen.
  suggestion_id: string;
  // 'social' = Instagram/Facebook/TikTok (legacy umbrella).
  // 'google_business' is een eigen type omdat de post-shape én de
  // approve-flow afwijken (geen subject, alleen body; geen bundle-pad).
  type: 'mail' | 'social' | 'whatsapp' | 'google_business';
  name: string;
  // 3 varianten van Filly. Modal toont ze naast elkaar; eigenaar
  // selecteert favoriet, kan vervolgens bewerken/refinen voor
  // goedkeuren.
  variants: ProposalVariant[];
  // Welke variant is geselecteerd (default 0). Bij goedkeuren wordt
  // deze gebruikt om de campagne mee te vullen.
  selected_index: number;
  // Optioneel bij het ophalen: actuele status van de onderliggende
  // ai_suggestion zodat de UI na re-mount de juiste state toont.
  suggestion_status?: string;
  approved_campaign_id?: string | null;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  message_card: MessageCard | null;
  created_at: string;
};

// active_action (audit-item #8, 2026-06-12): de gedeelde "lopende
// actie"-state per gesprek. Eén bron-van-waarheid waar zowel de geleide
// flow (frontend-kaart) als de chat-LLM (server-prompt) op lezen/
// schrijven, zodat een in de flow gekozen dag/thema niet verloren gaat
// zodra de eigenaar gaat typen. Vervangt de oude tekst-annotatie-
// workaround in de history-prompt.
//
// - date/topic VOEDEN het LLM (in het "[LOPENDE ACTIE]"-promptblok).
// - channels/step zijn flow-eigendom (het LLM negeert ze); ze dienen
//   om de flow na een reload op de juiste stap te hervatten.
// Alle velden optioneel: een vers gesprek heeft (nog) geen actie.
export type ActiveAction = {
  date?: string; // ISO doel-datum (YYYY-MM-DD)
  topic?: string; // gerecht/thema dat de generatie stuurt
  channels?: string[]; // door de flow gekozen kanalen (platform-namen)
  step?: string; // flow-stap ("day"|"context"|"channels"|...); puur frontend
  updated_at?: string; // ISO, laatste mutatie (server-gezet)
};

export type ActiveChatState = {
  conversationId: string;
  messages: ChatMessage[];
  // Aantal berichten in deze conversatie (cap = 20). Gebruikt door de
  // frontend om "Bericht X / 20"-indicator + cap-bereikt-CTA te tonen.
  messageCount: number;
  // De lopende actie (zie ActiveAction) of null als er geen is. De flow
  // seed't z'n begintoestand hieruit; de chat-orchestrator houdt 'm in
  // sync via het PATCH-endpoint + de sendMessage-respons.
  activeAction: ActiveAction | null;
};

// Lijst-item voor het chat-history-overzicht in de frontend (dropdown
// in chat-card-header). Bevat alleen wat de UI direct nodig heeft,
// geen messages of memory_summary, die laden we lazy bij switch.
export type ChatConversationSummary = {
  id: string;
  // Auto-gegenereerd door ChatService.maybeGenerateTitle (2026-04-30)
  // na 3+ user-messages. Null als de conversatie nog te kort is voor
  // titel-generatie, UI toont dan een fallback ("Nieuw gesprek" of
  // "{datum}").
  title: string | null;
  message_count: number;
  updated_at: string;
};

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  // Hoeveel berichten we meegeven als context aan Claude. Bewust lager
  // dan CONVERSATION_CAP: bij een lange chat (>20 berichten) krijgt
  // Filly alleen de laatste 20 turns mee, wat input-tokens beheersbaar
  // houdt. Trade-off: hij vergeet het allereerste deel van het gesprek.
  // Voor 1000+ klanten weegt cost-control zwaarder dan totaal-recall;
  // de memory-summary (zie ChatMemoryService) vangt geleerde voorkeuren
  // alsnog op aan het einde van een conversatie.
  private readonly CONTEXT_WINDOW = 20;

  // Maximum berichten per conversatie (user + filly + system samen).
  // Kostenbescherming: bij elke chat-call sturen we de volledige
  // history mee, dus elke extra turn vergroot de input-tokens.
  // Combineert met chat-memory: bij cap-bereikt vat Filly de
  // conversatie samen en slaat 'm op in restaurant_chat_memory zodat
  // geleerde voorkeuren bewaard blijven voor volgende chats.
  // Bumped 30 → 50 (2026-05-12): ruimere chat zodat eigenaars meerdere
  // bundle-iteraties achter elkaar kunnen doen zonder steeds een
  // nieuw gesprek te moeten starten.
  private readonly CONVERSATION_CAP = 50;

  // Hoeveel recente memories meelopen in de system-prompt van een
  // nieuwe chat. 5 is een afweging: te weinig = Filly vergeet snel,
  // te veel = prompt-bloat (elke memory ~30-100 woorden). Cacheable
  // in prompt-cache zodat herhaalde chat-calls de memories niet
  // opnieuw doorpushen naar Anthropic.
  private readonly MEMORY_CONTEXT_LIMIT = 5;

  constructor(
    private readonly supabase: RequestSupabaseService,
    private readonly ai: AiService,
    private readonly context: RestaurantContextService,
    private readonly suggestionsService: SuggestionsService,
    private readonly memory: ChatMemoryService,
    // Voor leerloop-injectie: top-3 winners + underperformers per
    // kanaal als "SUCCESSFUL/AVOID PATTERNS" in de system-prompt.
    private readonly fingerprint: CampaignFingerprintService,
    // Gemeten bereik per kanaal (opt-ins + koppel-status) zodat Filly
    // tractie meeweegt bij kanaal-keuze en alternatieven voorstelt.
    private readonly reach: ChannelReachService,
  ) {}

  // Haalt de actieve conversatie op voor dit restaurant, of maakt er
  // één aan. Sessie-per-kalenderdag (2026-06-12): we hervatten de
  // laatste thread ALLEEN als 'ie vandaag (Europe/Amsterdam) nog is
  // bijgewerkt. Is de laatste van een eerdere dag, dan start een vers,
  // leeg gesprek — zodat elke nieuwe dag opent met de geleide flow
  // (Filly's dagen-vraag) i.p.v. een oude, doorgekabbelde thread.
  // Uitzondering: een lege oude thread hergebruiken we (geen zin om
  // elke dag een lege conversatie bij te maken).
  async getOrCreateActiveConversation(
    restaurantId: string,
  ): Promise<ActiveChatState> {
    const { data: existing, error: fetchErr } = await this.supabase.client
      .from('chat_conversations')
      .select('id, updated_at')
      .eq('restaurant_id', restaurantId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchErr) throw new InternalServerErrorException(fetchErr.message);

    // Kalenderdag in Europe/Amsterdam (en-CA → YYYY-MM-DD), zodat de
    // grens om middernacht NL-tijd ligt, niet UTC.
    const amsterdamDay = (value: string | Date): string =>
      new Date(value).toLocaleDateString('en-CA', {
        timeZone: 'Europe/Amsterdam',
      });

    let conversationId: string;
    if (!existing) {
      conversationId = await this.createConversationRow(restaurantId);
    } else if (
      amsterdamDay(existing.updated_at as string) === amsterdamDay(new Date())
    ) {
      // Van vandaag → hervatten (refresh overleeft, zelfde zitting).
      conversationId = existing.id;
    } else {
      // Van een eerdere dag: leeg → hergebruiken, anders vers gesprek.
      const { count } = await this.supabase.client
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', existing.id);
      conversationId =
        (count ?? 0) === 0
          ? existing.id
          : await this.createConversationRow(restaurantId);
    }

    return this.loadConversationState(restaurantId, conversationId);
  }

  // Switcht naar een specifieke conversatie. Gebruikt door de chat-
  // history-dropdown op de frontend wanneer de eigenaar een eerdere
  // conversatie aanklikt. Verifieert tenant-isolatie (dubbel scopen op
  // restaurant_id) zodat niemand een conversation-id van een andere
  // tenant kan opvragen door 'm te raden.
  async getConversation(
    restaurantId: string,
    conversationId: string,
  ): Promise<ActiveChatState> {
    const { data: conv, error: fetchErr } = await this.supabase.client
      .from('chat_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();
    if (fetchErr) throw new InternalServerErrorException(fetchErr.message);
    if (!conv) throw new NotFoundException('Gesprek niet gevonden.');

    return this.loadConversationState(restaurantId, conversationId);
  }

  // Lijst van alle conversaties voor dit restaurant, gesorteerd op
  // meest-recente-eerst. Wordt door de chat-history-dropdown gebruikt
  // om titels te tonen. Limit 50 want oudere conversaties zijn
  // visueel niet bereikbaar in een dropdown, wie écht ver wil
  // teruggraven kan in een latere iteratie een "load more"-knop
  // krijgen. Voor nu: 50 is genoeg voor maanden actieve chat.
  async listConversations(
    restaurantId: string,
  ): Promise<ChatConversationSummary[]> {
    const { data, error } = await this.supabase.client
      .from('chat_conversations')
      .select('id, title, updated_at')
      .eq('restaurant_id', restaurantId)
      .order('updated_at', { ascending: false })
      .limit(50);
    if (error) throw new InternalServerErrorException(error.message);

    const conversations = (data ?? []) as Array<{
      id: string;
      title: string | null;
      updated_at: string;
    }>;
    if (conversations.length === 0) return [];

    // Batch-count: één query voor message_counts van álle conversaties
    // i.p.v. 50 losse SELECTs. PostgREST heeft geen GROUP BY; we doen
    // 't client-side door alle conversation_ids in één keer op te halen.
    const ids = conversations.map((c) => c.id);
    const { data: msgRows, error: msgErr } = await this.supabase.client
      .from('chat_messages')
      .select('conversation_id')
      .in('conversation_id', ids);
    if (msgErr) throw new InternalServerErrorException(msgErr.message);

    const counts = new Map<string, number>();
    for (const row of msgRows ?? []) {
      const cid = row.conversation_id as string;
      counts.set(cid, (counts.get(cid) ?? 0) + 1);
    }

    return conversations.map((c) => ({
      id: c.id,
      title: c.title,
      message_count: counts.get(c.id) ?? 0,
      updated_at: c.updated_at,
    }));
  }

  // Start expliciet een nieuwe lege conversatie. Door eigenaar
  // aangeroepen via "+ Nieuw gesprek"-knop in de dropdown, OF
  // automatisch wanneer de cap bereikt is op de huidige conversatie.
  // Krijgt direct het welkomstbericht zodat de UI nooit leeg oogt.
  async createConversation(restaurantId: string): Promise<ActiveChatState> {
    const conversationId = await this.createConversationRow(restaurantId);
    return this.loadConversationState(restaurantId, conversationId);
  }

  // ============================================================
  // DELETE CONVERSATION, chat verwijderen + memory bewaren
  // ============================================================
  // Eigenaar wil oude chats kunnen opruimen, maar Filly's geleerde
  // voorkeuren (toon-correcties, woord-afwijzingen) moeten behouden
  // blijven voor volgende gesprekken. Daarom:
  //   1. Voor delete: probeer `summarizeAndSave` te draaien zodat
  //      eventuele leerpunten in `restaurant_chat_memory` landen.
  //      Idempotent, bij 2e poging skipt 'ie zichzelf.
  //   2. Daarna delete chat_conversations. CASCADE op chat_messages
  //      ruimt de berichten zelf op.
  //
  // Fail-soft op stap 1: als de Haiku-summary faalt (rate-limit,
  // Claude down) deleten we toch, eigenaar wil 't weg en wachten op
  // Anthropic-uptime is een slechte UX. Niet-kritieke data-loss.
  async deleteConversation(
    restaurantId: string,
    conversationId: string,
    userId: string,
  ): Promise<{ id: string }> {
    // Bestaan + tenant-check. RLS dwingt al af dat je alleen eigen
    // restaurant kunt raken, maar deze check geeft een nette
    // NotFoundException ipv silent succes.
    const { data: conv, error: fetchErr } = await this.supabase.client
      .from('chat_conversations')
      .select('id, restaurant_id')
      .eq('id', conversationId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();
    if (fetchErr) throw new InternalServerErrorException(fetchErr.message);
    if (!conv) {
      throw new InternalServerErrorException('Gesprek niet gevonden.');
    }

    // Memory eerst, fail-soft. Bij geen-leerzame-chat skipt de
    // service zelf via has_learning-flag.
    try {
      await this.memory.summarizeAndSave({
        restaurantId,
        userId,
        conversationId,
      });
    } catch (e) {
      this.logger.warn(
        `Memory-summary faalde voor conversation ${conversationId}, delete gaat door: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }

    // Delete, chat_messages cascadet via FK on delete cascade.
    const { error: delErr } = await this.supabase.client
      .from('chat_conversations')
      .delete()
      .eq('id', conversationId)
      .eq('restaurant_id', restaurantId);
    if (delErr) throw new InternalServerErrorException(delErr.message);

    return { id: conversationId };
  }

  // Privé helper: maakt rij in chat_conversations. BEWUST geen
  // welkomstbericht (sinds 2026-06-12): een leeg gesprek laat de
  // frontend de geleide on-ramp (FillyGuidedFlow) tonen — Filly's
  // openingsvraag met de dagen-keuze. Een geseed welkomstbericht
  // maakte het gesprek "niet-leeg" en blokkeerde die flow.
  private async createConversationRow(restaurantId: string): Promise<string> {
    const { data: created, error: createErr } = await this.supabase.client
      .from('chat_conversations')
      .insert({ restaurant_id: restaurantId })
      .select('id')
      .single();
    if (createErr) throw new InternalServerErrorException(createErr.message);
    return created.id as string;
  }

  // Privé helper: bouwt een ActiveChatState (messages + count) voor
  // een gegeven conversation. Gedeeld tussen getOrCreateActive,
  // getConversation, createConversation.
  private async loadConversationState(
    restaurantId: string,
    conversationId: string,
  ): Promise<ActiveChatState> {
    const messages = await this.getRecentMessages(
      conversationId,
      restaurantId,
    );
    const messageCount = await this.countMessages(conversationId);
    const activeAction = await this.getActiveAction(
      restaurantId,
      conversationId,
    );
    return { conversationId, messages, messageCount, activeAction };
  }

  // ============================================================
  // ACTIVE ACTION, gedeelde "lopende actie"-state (audit-item #8)
  // ============================================================
  // Leest de active_action-kolom voor één gesprek. Dubbel scopen op
  // restaurant_id = defense-in-depth; gooit NotFound als het gesprek
  // niet (van deze tenant) is, zodat het PATCH-endpoint geen vreemde
  // conversation-id kan muteren.
  async getActiveAction(
    restaurantId: string,
    conversationId: string,
  ): Promise<ActiveAction | null> {
    const { data, error } = await this.supabase.client
      .from('chat_conversations')
      .select('active_action')
      .eq('id', conversationId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException('Gesprek niet gevonden.');
    return (data.active_action as ActiveAction | null) ?? null;
  }

  // Muteert de lopende actie. delta=null → de actie is afgerond/verlaten
  // (bv. na een geslaagde generatie of expliciet "begin opnieuw"); we
  // zetten de kolom dan op null. Anders mergen we de delta over de
  // huidige state (server-authoritative: we herlezen de actuele waarde
  // zodat een gelijktijdige flow-PATCH niet stil overschreven wordt).
  async updateActiveAction(
    restaurantId: string,
    conversationId: string,
    delta: ActiveActionDelta | null,
  ): Promise<ActiveAction | null> {
    if (delta === null) {
      const { error } = await this.supabase.client
        .from('chat_conversations')
        .update({ active_action: null })
        .eq('id', conversationId)
        .eq('restaurant_id', restaurantId);
      if (error) throw new InternalServerErrorException(error.message);
      return null;
    }
    const current = await this.getActiveAction(restaurantId, conversationId);
    const merged = mergeActiveAction(current, delta);
    merged.updated_at = new Date().toISOString();
    const { error } = await this.supabase.client
      .from('chat_conversations')
      .update({ active_action: merged })
      .eq('id', conversationId)
      .eq('restaurant_id', restaurantId);
    if (error) throw new InternalServerErrorException(error.message);
    return merged;
  }

  // Controller-pad: valideert de rauwe PATCH-body en vertaalt 'm naar
  // een delta (of null bij reset) voor updateActiveAction. Houdt de
  // sanitisatie (ISO-datum, topic-cap, kanaal-whitelist) op één plek.
  async setActiveAction(
    restaurantId: string,
    conversationId: string,
    input: ActiveActionInput,
  ): Promise<ActiveAction | null> {
    if (input?.reset) {
      return this.updateActiveAction(restaurantId, conversationId, null);
    }
    return this.updateActiveAction(
      restaurantId,
      conversationId,
      sanitizeActionInput(input),
    );
  }

  // Telt alle berichten in een conversation. Wordt gebruikt voor:
  //   1. ActiveChatState.messageCount (UI-indicator)
  //   2. cap-check in sendMessage (block bij ≥ CONVERSATION_CAP)
  // Gebruikt count-only query (head=true), geen rijen, alleen aantal.
  private async countMessages(conversationId: string): Promise<number> {
    const { count, error } = await this.supabase.client
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId);
    if (error) throw new InternalServerErrorException(error.message);
    return count ?? 0;
  }

  private async getRecentMessages(
    conversationId: string,
    restaurantId: string,
  ): Promise<ChatMessage[]> {
    // Chat-berichten ophalen. ai_suggestion_id pakken we ook mee
    // zodat we daarna per campaign-proposal de actuele status +
    // approved_campaign_id kunnen verrijken via een tweede query.
    // Bewust géén PostgREST-embed gebruikt: die is stil-foutgevoelig
    // met aliases en schema-caches, een expliciete tweede query is
    // 100% voorspelbaar en voegt maar ~5ms toe.
    const { data, error } = await this.supabase.client
      .from('chat_messages')
      .select(
        'id, role, content, message_card, ai_suggestion_id, created_at',
      )
      .eq('conversation_id', conversationId)
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(this.CONTEXT_WINDOW);

    if (error) throw new InternalServerErrorException(error.message);

    type RawRow = {
      id: string;
      role: ChatRole;
      content: string;
      message_card: MessageCard | null;
      ai_suggestion_id: string | null;
      created_at: string;
    };

    const rows = (data as RawRow[]) ?? [];

    // Verzamel alle suggestion-ids die aan chat-berichten hangen.
    // Unieke set, zelfde suggestie kan in theorie niet aan meerdere
    // berichten hangen (insert is per bericht) maar we dedupliceren
    // defensief om de in-clause compact te houden.
    const suggestionIds = Array.from(
      new Set(
        rows
          .map((r) => r.ai_suggestion_id)
          .filter((id): id is string => typeof id === 'string'),
      ),
    );

    // Eén extra batch-query voor alle gekoppelde suggesties. Bij geen
    // koppelingen skippen we deze stap.
    let statusById = new Map<
      string,
      { status: string; approved_campaign_id: string | null }
    >();
    if (suggestionIds.length > 0) {
      const { data: suggestionRows, error: suggErr } =
        await this.supabase.client
          .from('ai_suggestions')
          .select('id, status, approved_campaign_id')
          .in('id', suggestionIds);
      if (suggErr) {
        // Niet fataal: we loggen en tonen dan gewoon de kaart in
        // z'n laatst-bekende state (message_card als opgeslagen bij
        // creation, meestal pending). Chat blijft functioneel.
        this.logger.warn(
          `Kon suggestie-statussen niet ophalen: ${suggErr.message}`,
        );
      } else {
        statusById = new Map(
          (suggestionRows ?? []).map((s) => [
            s.id as string,
            {
              status: s.status as string,
              approved_campaign_id: s.approved_campaign_id as string | null,
            },
          ]),
        );
      }
    }

    // Verrijk elke proposal-card met de actuele status zodat de
    // frontend meteen de juiste UI-state kan renderen, "Concept
    // aangemaakt →" bij approved, "Voorstel afgewezen" bij rejected.
    const enriched: ChatMessage[] = rows.map((m) => {
      const card = m.message_card ?? null;
      if (
        card?.kind === 'campaign_proposal' &&
        m.ai_suggestion_id &&
        statusById.has(m.ai_suggestion_id)
      ) {
        const linked = statusById.get(m.ai_suggestion_id);
        return {
          id: m.id,
          role: m.role,
          content: m.content,
          message_card: {
            ...card,
            suggestion_status: linked!.status,
            approved_campaign_id: linked!.approved_campaign_id,
          } as CampaignProposalCard,
          created_at: m.created_at,
        };
      }
      return {
        id: m.id,
        role: m.role,
        content: m.content,
        message_card: card,
        created_at: m.created_at,
      };
    });

    // Omdraaien → oudste eerst, zoals de UI 'm rendert.
    return enriched.reverse();
  }

  // Hoofd-actie: user stuurt een bericht, wij slaan het op, roepen
  // Claude aan met de context, slaan het antwoord op, sturen beide
  // terug. Bewust NIET streaming voor v1, simpeler, goed genoeg.
  async sendMessage(
    restaurantId: string,
    userId: string,
    conversationId: string,
    content: string,
  ): Promise<{
    userMessage: ChatMessage;
    fillyMessage: ChatMessage;
    // De (mogelijk bijgewerkte) lopende actie na deze beurt, zodat de
    // frontend de geleide flow direct in sync kan brengen zonder reload.
    activeAction: ActiveAction | null;
  }> {
    const trimmed = content.trim();
    if (!trimmed) throw new NotFoundException('Leeg bericht.');
    if (trimmed.length > 4000) {
      throw new NotFoundException('Bericht is te lang (max 4000 tekens).');
    }

    // Defense-in-depth: verifieer dat deze conversation bij dit
    // restaurant hoort. Anders kan iemand een conversation-id van
    // een andere tenant proberen met zijn eigen X-Restaurant-Id.
    const { data: conv, error: convErr } = await this.supabase.client
      .from('chat_conversations')
      .select('id, active_action')
      .eq('id', conversationId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();
    if (convErr) throw new InternalServerErrorException(convErr.message);
    if (!conv) throw new NotFoundException('Gesprek niet gevonden.');

    // Lopende actie (audit-item #8): de gedeelde state die de geleide
    // flow + de chat delen. We laden 'm hier zodat we 'm (a) als
    // deterministisch promptblok aan Filly kunnen meegeven en (b) na een
    // FILLY_START_GUIDED-emit kunnen bijwerken (datum/thema carry-forward).
    let activeAction = (conv.active_action as ActiveAction | null) ?? null;

    // Cap-check: tel bestaande berichten. Als we deze user-msg + Filly's
    // antwoord erbij optellen en boven CONVERSATION_CAP komen → blokkeer
    // met een NL-foutmelding zodat de UI een "+ Nieuw gesprek"-CTA
    // kan tonen. Reden: kosten-bescherming. Elke chat-call stuurt de
    // hele history mee aan Claude; we willen voorkomen dat eigenaars
    // 100-berichten-conversaties krijgen die per turn dure input-tokens
    // verbruiken.
    //
    // We checken op `>= CAP - 1` zodat de huidige user-msg + Filly's
    // antwoord (samen +2) niet over de grens schieten. Bij CAP=20:
    //   count = 18 → user wordt 19, Filly wordt 20 → toegestaan
    //   count = 19 → user wordt 20, Filly zou 21 worden → blokkeren
    const existingCount = await this.countMessages(conversationId);
    if (existingCount >= this.CONVERSATION_CAP - 1) {
      throw new BadRequestException(
        `Dit gesprek heeft de grens van ${this.CONVERSATION_CAP} berichten bereikt. Start een nieuw gesprek, Filly onthoudt wat 'ie hier heeft geleerd.`,
      );
    }

    // 1) User-bericht opslaan VOOR we Claude aanroepen. Zo blijft
    // het bericht staan ook als Claude faalt, de user ziet 'm dan
    // wel in zijn history en kan later opnieuw proberen.
    const { data: userMsg, error: userErr } = await this.supabase.client
      .from('chat_messages')
      .insert({
        conversation_id: conversationId,
        restaurant_id: restaurantId,
        role: 'user',
        content: trimmed,
      })
      .select('id, role, content, message_card, created_at')
      .single();
    if (userErr) throw new InternalServerErrorException(userErr.message);

    // 2) Context opbouwen: laatste N berichten (INCL. het net-opgeslagen
    // user-bericht) als "messages" naar Claude. System-prompt bevat
    // Filly's persona + restaurant-context.
    const history = await this.getRecentMessages(conversationId, restaurantId);
    const systemPrompt = await this.buildSystemPrompt(restaurantId);
    // Sinds audit-item #8: GEEN per-bericht-annotatie meer. De lopende
    // dag/thema komt deterministisch uit active_action (zie het
    // [LOPENDE ACTIE]-blok hieronder), niet uit tekst die Filly moet
    // herkennen. De history is dus weer kale who-content-regels.
    const historyPrompt = history
      .map((m) => {
        const who = m.role === 'user' ? 'Eigenaar' : 'Filly';
        return `${who}: ${m.content}`;
      })
      .join('\n');

    // De prompt-staart bouwen we uit losse interne blokken (niet voor de
    // gebruiker zichtbaar). Volgorde: de lopende actie eerst (zodat Filly
    // de actuele dag/thema kent), dan het kanaal-routing-signaal.
    const promptParts = [historyPrompt];

    // [LOPENDE ACTIE]-blok: vervangt de oude datum-annotatie. Voedt Filly
    // deterministisch met de gekozen dag/thema zodat 'ie de dag NIET
    // opnieuw vraagt en het gerecht niet kwijtraakt.
    const actionBlock = formatActiveActionBlock(activeAction);
    if (actionBlock) {
      promptParts.push(
        `[INTERN, niet voor de gebruiker zichtbaar]\n${actionBlock}`,
      );
    }

    // Server-side keuze-hint: detect of het laatste user-bericht
    // expliciet een kanaal noemt en stuur een harde override naar
    // Claude. Voorkomt dat Filly de prompt-instructie negeert en
    // alsnog direct een BUNDLE genereert bij een open vraag.
    const hint = detectCampaignHint(content);
    if (hint) {
      promptParts.push(
        `[INTERN ROUTING-SIGNAAL, niet voor de gebruiker zichtbaar]\n${hint}`,
      );
    }
    const guardedPrompt = promptParts.join('\n\n');

    // 3) Claude-call via onze wrapper. Auto-logging in ai_usage gebeurt
    // binnen AiService; rate-limit-guard heeft de call al laten passeren.
    const answer = await this.ai.generateText({
      system: systemPrompt,
      prompt: guardedPrompt,
      model: 'claude-sonnet-4-6',
      // Bumped 600 → 2000 (2026-05-04): enkelvoudige chat-replies passen
      // ruim in 600, maar BUNDLE-output (3 kanaal-versies + JSON-
      // overhead) heeft 1200-1800 tokens nodig. Bij truncation verdwijnt
      // <<END>> en komt de hele JSON als platte tekst in de chat.
      // Sonnet 4.6 met prompt-caching maakt 2000 tokens output betaalbaar.
      maxTokens: 2000,
      meta: {
        restaurantId,
        userId,
        feature: 'chat',
      },
      // System bevat profile + menu + persona-rules, bij meerdere
      // chat-berichten binnen 5 min levert caching ~90% korting op
      // input-tokens.
      cacheSystem: true,
    });

    // 4) Filly's antwoord parsen. Als Filly een concrete campagne
    // voorstelt, heeft hij volgens z'n system-prompt een speciaal
    // JSON-blok achter z'n tekst geplakt: <<FILLY_PROPOSE_CAMPAIGN>>
    // {...} <<END>>. We halen dat blok eruit zodat de user alleen
    // de nette proza ziet.
    //
    // Wanneer er een geldig voorstel in zit, maken we eerst een
    // ai_suggestion-rij (status='pending', trigger_type='chat') zodat:
    //   - hetzelfde voorstel ook zichtbaar is in de suggesties-sectie
    //     op /dashboard/campagnes (uniforme goedkeur-flow)
    //   - we het later via chat-edit kunnen verfijnen
    //   - goedkeuren automatisch via ai_suggestions.approve loopt die
    //     de campagne aanmaakt + approved_campaign_id koppelt
    //
    // Als de suggestie-insert faalt, vallen we terug op een
    // proposal-loos bericht, de user ziet dan nog steeds Filly's
    // nette antwoord, alleen mist de proposal-knop. Veiliger dan de
    // hele chat-call laten falen.
    // Drie mogelijke kaartjes (in volgorde van detectie):
    //   1. CHOICE (vraag eerst kanaal), geen ai_suggestion-rij
    //   2. CAMPAIGN (single-channel proposal)
    //   3. BUNDLE (multi-channel)
    // Filly schrijft er nooit meerdere; bij geen match → gewoon tekst.
    let messageCard: MessageCard | null = null;
    let suggestionId: string | null = null;
    let cleanText = answer.trim();

    // Parser-volgorde: guided-start eerst (de nieuwe primaire route —
    // campagne-maken via de geleide flow), dan de legacy date-choice/
    // channel-choice/proposal/bundle als vangnet mocht Filly toch nog
    // een oud blok sturen. Filly mag er per bericht maximaal één
    // produceren — bij meerdere is de eerste hier in volgorde leidend.
    // Geef de lopende doel-datum mee als referentie, zodat een relatieve
    // verschuiving ("een dag eerder") vanaf de huidige actie rekent.
    const parsedGuided = extractGuidedStart(answer, activeAction?.date ?? null);
    const parsedDateChoice = parsedGuided.card
      ? { cleanText: parsedGuided.cleanText, choice: null }
      : extractDateChoice(answer);
    const parsedChoice = parsedDateChoice.choice
      ? { cleanText: parsedDateChoice.cleanText, choice: null }
      : extractCampaignChoice(answer);
    const parsedSingle =
      parsedDateChoice.choice || parsedChoice.choice
        ? { cleanText: parsedChoice.cleanText, proposal: null }
        : extractCampaignProposal(answer);
    const parsedBundle =
      parsedDateChoice.choice || parsedChoice.choice || parsedSingle.proposal
        ? { cleanText: parsedSingle.cleanText, bundle: null }
        : extractCampaignBundle(answer);

    if (parsedGuided.card) {
      // Nieuwe primaire route: getypt campagne-verzoek → geleide flow
      // ín het gesprek. Geen ai_suggestion hier; de flow maakt 'm later
      // zelf via generate-for-dates.
      cleanText = parsedGuided.cleanText;

      // active_action bijwerken met wat het LLM nieuw aandroeg (een nét
      // genoemde dag en/of thema). We persisten ALTIJD — ook bij een lege
      // delta — zodat active_action non-null wordt: dat is het signaal
      // "er loopt een geleide actie" waarop de frontend de (enige) flow
      // toont, óók als er nog geen dag is ("welke dagen zijn er").
      const delta: ActiveActionDelta = {};
      if (parsedGuided.card.date) delta.date = parsedGuided.card.date;
      if (parsedGuided.card.topic) delta.topic = parsedGuided.card.topic;
      try {
        activeAction = await this.updateActiveAction(
          restaurantId,
          conversationId,
          delta,
        );
      } catch (err) {
        // Niet fataal: lukt de persist niet, dan tonen we de kaart in
        // z'n laatst-bekende staat (gemerged in-memory) en werkt de
        // chat door. De volgende emit probeert 't opnieuw.
        this.logger.warn(
          `active_action-update gefaald (guided_start); chat werkt door: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        activeAction = mergeActiveAction(activeAction, delta);
      }

      // De kaart vullen vanuit de (gemergede) lopende actie, NIET vanuit
      // wat het LLM toevallig herhaalde. Zo houdt een topic-only emit de
      // eerder (in de flow of een vorige beurt) gekozen datum vast — de
      // kern van audit-item #8.
      messageCard = {
        kind: 'guided_start',
        ...(activeAction?.date ? { date: activeAction.date } : {}),
        ...(activeAction?.topic ? { topic: activeAction.topic } : {}),
      };
    } else if (parsedDateChoice.choice) {
      cleanText = parsedDateChoice.cleanText;
      // Geen ai_suggestion; frontend verstuurt bij klik een follow-up
      // "Voor [gekozen datum/gelegenheid]" zodat Filly's volgende
      // beurt dit als gekozen target heeft.
      messageCard = parsedDateChoice.choice;
    } else if (parsedChoice.choice) {
      cleanText = parsedChoice.cleanText;
      // Geen ai_suggestion, kaart is puur UI-prompt. Frontend
      // verstuurt bij klik automatisch een follow-up user-bericht.
      messageCard = parsedChoice.choice;
    } else if (parsedSingle.proposal) {
      cleanText = parsedSingle.cleanText;
      // Observability (filly-brein hfst 8.4): waarschuw als de 3 varianten
      // niet elk een unieke tone_signature hebben. We rejecten NIET — de
      // eigenaar krijgt z'n voorstel altijd; dit is puur een signaal om te
      // monitoren hoe vaak Filly de variatie-regel negeert.
      const tones = parsedSingle.proposal.variants
        .map((v) => v.tone_signature)
        .filter((t): t is ToneSignature => !!t);
      if (
        parsedSingle.proposal.variants.length >= 2 &&
        new Set(tones).size < parsedSingle.proposal.variants.length
      ) {
        this.logger.warn(
          `Filly-proposal voor ${restaurantId} heeft niet-unieke tone-signatures (${
            tones.join(', ') || 'geen labels'
          }) over ${parsedSingle.proposal.variants.length} varianten.`,
        );
      }
      try {
        // We slaan de hele proposal op in suggested_campaign (incl.
        // alle varianten). Approve-flow leest later selected_index
        // en gebruikt die variant voor de campagne-aanmaak.
        const { id } = await this.suggestionsService.createFromChat(
          restaurantId,
          {
            type: parsedSingle.proposal.type,
            name: parsedSingle.proposal.name,
            variants: parsedSingle.proposal.variants,
            selected_index: parsedSingle.proposal.selected_index,
          },
        );
        suggestionId = id;
        messageCard = {
          ...parsedSingle.proposal,
          suggestion_id: id,
        };
      } catch (err) {
        this.logger.error(
          `ai_suggestion-insert gefaald (chat-proposal); chat werkt door zonder kaartje: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    } else if (parsedBundle.bundle) {
      cleanText = parsedBundle.cleanText;
      try {
        // Bundle wordt als 1 ai_suggestion-rij opgeslagen (trigger_type
        // 'chat_bundle') zodat het accept/reject-pattern hetzelfde
        // blijft als bij single-channel proposals. SuggestionsService
        // detecteert trigger_type bij approve en maakt dan
        // campaign_groups + 3 campaigns tegelijk.
        const { id } = await this.suggestionsService.createBundleFromChat(
          restaurantId,
          parsedBundle.bundle,
        );
        suggestionId = id;
        messageCard = {
          ...parsedBundle.bundle,
          suggestion_id: id,
        };
      } catch (err) {
        this.logger.error(
          `ai_suggestion-insert gefaald (chat-bundle); chat werkt door zonder kaartje: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    const { data: fillyMsg, error: fillyErr } = await this.supabase.client
      .from('chat_messages')
      .insert({
        conversation_id: conversationId,
        restaurant_id: restaurantId,
        role: 'filly',
        // Dash-sanitizer ook op chat-proza: de prompt-nudge alleen hield
        // de em-dashes er niet uit (audit-feedback Floris, 2026-06-12).
        content: naturalizeDashes(cleanText),
        message_card: messageCard,
        // ai_suggestion_id (bestaat sinds 0001) koppelt dit bericht
        // aan de suggestie. Handig voor toekomstige flows zoals
        // "toon alle chat-berichten die een bepaalde suggestie
        // hebben opgeleverd" of chat-edit-threads per suggestie.
        ai_suggestion_id: suggestionId,
      })
      .select('id, role, content, message_card, created_at')
      .single();
    if (fillyErr) throw new InternalServerErrorException(fillyErr.message);

    // 5) updated_at van de conversation bumpen zodat getOrCreateActive
    // 'm straks als "de actieve" teruggeeft. Fire-and-forget: als dit
    // faalt krijgt de user zijn antwoord alsnog.
    void this.supabase.client
      .from('chat_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId)
      .then(() => undefined);

    // 6) Auto-title-generation. Wordt in de achtergrond afgevuurd zodat
    // de gebruiker NIET op de extra Claude-call hoeft te wachten,
    // de chat-response gaat al terug. Loopt alleen als de title nog
    // niet gezet is. Zie maybeGenerateTitle voor de drempel + flow.
    void this.maybeGenerateTitle(restaurantId, userId, conversationId).catch(
      (e) => {
        this.logger.warn(
          `Auto-title gefaald voor conversation ${conversationId}: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      },
    );

    // 7) Cap-bereikt? Trigger memory-summary in de achtergrond. Na deze
    // turn zijn er user+filly = 2 berichten meer dan vóór deze call,
    // dus existingCount + 2 = totaal-na-turn. Bij CAP=20 geldt:
    //   existingCount = 18 → 18+2 = 20 → cap exact bereikt → summarize
    //   existingCount < 18 → nog ruimte → niet summarize
    // Idempotent: ChatMemoryService.summarizeAndSave checkt zelf of er
    // al een memory voor deze conversation bestaat.
    if (existingCount + 2 >= this.CONVERSATION_CAP) {
      void this.memory
        .summarizeAndSave({ restaurantId, userId, conversationId })
        .catch((e) => {
          this.logger.warn(
            `Memory-summary gefaald voor conv ${conversationId}: ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
        });
    }

    return {
      userMessage: userMsg as ChatMessage,
      fillyMessage: fillyMsg as ChatMessage,
      activeAction,
    };
  }

  // ============================================================
  // maybeGenerateTitle, Filly bedenkt een korte titel voor de chat
  // ============================================================
  //
  // Wanneer:
  //   - chat_conversations.title is nog null
  //   - er zijn ≥3 user-messages in deze conversatie (genoeg context)
  //
  // Drempel 3 user-messages:
  //   1 = "hi", te weinig om een goede titel te bedenken
  //   2 = vaak nog small-talk
  //   3 = onderwerp is duidelijk
  //
  // Fire-and-forget vanuit sendMessage. Faalt het? logger.warn + door.
  // De volgende keer dat een user-bericht binnenkomt proberen we 't
  // gewoon weer.
  //
  // Tool-use (geen JSON.parse-Russische-roulette zoals voor 2026-04-30
  // de norm was): één tool met `title` als enige property. Claude moet
  // 'm vullen, anders krijgen we geen response. Conform het tool-use-
  // pattern dat sinds 2026-04-30 voor alle Filly-flows geldt.
  private async maybeGenerateTitle(
    restaurantId: string,
    userId: string,
    conversationId: string,
  ): Promise<void> {
    // 1) Quick-check: is er al een titel? Zo ja, niets te doen.
    const { data: conv, error: convErr } = await this.supabase.client
      .from('chat_conversations')
      .select('title')
      .eq('id', conversationId)
      .maybeSingle();
    if (convErr || !conv) return;
    if (conv.title) return; // Al gezet, niet overschrijven.

    // 2) Tel user-messages in deze conversatie. .head=true + count
    // betekent: geen rijen ophalen, alleen de count terug. Goedkoop.
    const { count, error: countErr } = await this.supabase.client
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('role', 'user');
    if (countErr) return;

    const USER_MSG_THRESHOLD = 3;
    if ((count ?? 0) < USER_MSG_THRESHOLD) return;

    // 3) Pak de eerste 3 user-berichten + 3 filly-antwoorden als
    // context. Eerste berichten zijn meestal het meest indicatief
    // voor het onderwerp (latere chat dwaalt af). 6 berichten →
    // ~300-600 input-tokens, kost <€0,001 per call.
    const { data: msgs, error: msgsErr } = await this.supabase.client
      .from('chat_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(6);
    if (msgsErr || !msgs || msgs.length === 0) return;

    const transcript = msgs
      .map(
        (m) =>
          `${m.role === 'user' ? 'Eigenaar' : 'Filly'}: ${(m.content as string) ?? ''}`,
      )
      .join('\n');

    // 4) Claude-call met tool-use. Schema dwingt af dat we een title
    // krijgen, max 60 tekens (past in een sidebar-listitem).
    let result: { title: string };
    try {
      result = await this.ai.generateStructured<{ title: string }>({
        system:
          'Je bedenkt een korte, beschrijvende NL-titel voor een chat-' +
          'gesprek tussen een restauranteigenaar en zijn AI-marketing-' +
          'assistent Filly. De titel komt in een lijst met andere ' +
          'gesprekken, moet in 1 oogopslag duidelijk maken waar het ' +
          'over ging. Max 60 tekens. Geen aanhalingstekens, geen punt ' +
          'aan het eind. Voorbeelden: "Lente-actie voor terras", ' +
          '"Reactie op 1-ster review", "Inplannen wijnproeverij".',
        prompt: `Hier zijn de eerste berichten:\n\n${transcript}\n\nBedenk de titel.`,
        // Haiku 4.5 is snel + goedkoop, ruim voldoende voor een
        // 5-woorden titel. ~€0,001 per call vs ~€0,02 met Sonnet.
        model: 'claude-haiku-4-5-20251001',
        maxTokens: 100,
        meta: {
          restaurantId,
          userId,
          feature: 'chat-title',
        },
        toolName: 'set_title',
        toolDescription:
          'Sla de bedachte titel op voor deze chat-conversatie.',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description:
                'Korte NL-titel, max 60 tekens, geen aanhalings-' +
                'tekens of trailing punt.',
              maxLength: 60,
            },
          },
          required: ['title'],
        },
      });
    } catch (e) {
      // generateStructured gooit al een specifieke fout, we vangen
      // 'm op zodat de fire-and-forget-call niet ergens crasht.
      this.logger.warn(
        `Title-generatie Claude-call gefaald: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return;
    }

    const title = result.title?.trim().slice(0, 60);
    if (!title) return;

    // 5) Wegschrijven. Geen race-conditie afvangen: als er ondertussen
    // (zeer onwaarschijnlijk) iemand anders al een titel zette, mag
    // de nieuwe gewoon overschrijven, of we kunnen 'm conditioneel
    // schrijven met .is('title', null). Doen we voor zekerheid.
    await this.supabase.client
      .from('chat_conversations')
      .update({ title })
      .eq('id', conversationId)
      .is('title', null);

    this.logger.log(
      `Auto-title gezet voor conversation ${conversationId}: "${title}"`,
    );
  }

  // System-prompt voor chat: Filly's persona + volledige restaurant-
  // context (profiel + menu + actuele feiten). De context komt uit
  // RestaurantContextService die alle blokken parallel ophaalt. ~200ms
  // extra is verwaarloosbaar op een 1-3s Claude-call, en het verschil
  // in antwoord-kwaliteit is groot: Filly kent nu doelgroep, USPs,
  // menu-items + prijzen, openingstijden, socials, etc.
  //
  // Greet-naam: aparte mini-query naar restaurants. Klein dubbel werk
  // met de profiel-query in buildFullContext, maar de greeting voelt
  // persoonlijker als de eerste zin "van Bistro X" zegt i.p.v. "deze
  // zaak". Twee queries kosten minder dan 50ms verschil.
  private async buildSystemPrompt(restaurantId: string): Promise<string> {
    // Sinds 2026-06-12: de chat schrijft zelf GEEN campagnes meer — een
    // campagne-verzoek start de geleide flow (FILLY_START_GUIDED), die
    // de generatie (incl. kanaalregels/bereik/leerloop) server-side
    // doet via generate-for-dates. De chat-prompt heeft die blokken
    // (channel-rules / reach / learning) dus niet meer nodig.
    const [restaurantResult, contextBlock, memories] = await Promise.all([
      this.supabase.client
        .from('restaurants')
        .select('name, type')
        .eq('id', restaurantId)
        .maybeSingle(),
      this.context.buildFullContext(restaurantId),
      // Laatste N memories ophalen, Filly's leerschat uit afgesloten
      // chats. Wordt onderaan de prompt geplakt zodat 'ie weet wat de
      // eigenaar in eerdere chats heeft afgewezen / geprefereerd.
      this.memory.getRecentMemories(restaurantId, this.MEMORY_CONTEXT_LIMIT),
    ]);

    const restaurant = restaurantResult.data;
    const name = restaurant?.name ?? 'de onderneming';
    const type = restaurant?.type ? ` (${restaurant.type})` : '';
    const memoryBlock = this.memory.formatMemoryBlock(memories);

    return `Je bent Filly, de AI-assistent van ${name}${type}. Je praat met de eigenaar via de dashboard-chat.

Wie je bent:
- Een behulpzame, praktische assistent die CAMPAGNES voor het restaurant maakt.
- Je focus is één ding: campagnes en marketing-acties die gasten naar binnen halen — mailings, social posts, WhatsApp-berichten, Google Business-posts en bundels daarvan.
- Je kent de context (bezetting, gasten, menu, weer, events in de buurt) en gebruikt die om sterke, concrete campagnes te bedenken — maar je voorstel is ALTIJD een campagne.

Hoe je praat:
- Nederlands, gemoedelijk, niet Amerikaans-enthousiast. Geen uitroeptekens, geen emoji, geen gedachtestreepjes (— of –): schrijf met komma's en punten.
- Geen markdown: geen sterretjes voor vet (**), geen opsommingen met "-" of "*". Gewone lopende zinnen; de chat toont je tekst letterlijk, dus opmaak-tekens zien er rommelig uit.
- Kort en to-the-point. Liever 2-3 korte zinnen dan een heel verhaal.
- Stel een vervolgvraag als je input mist om goed te helpen.
- "Wij" als je namens de onderneming praat, "jij" als je de eigenaar aanspreekt.

Wat je NIET doet:
- Deze chat gaat ALLEEN over campagnes. Stel NOOIT losse klusjes voor als "werk je Google Business bij", "pas je menukaart aan", "beantwoord je reviews" of "controleer je openingstijden" — dat hoort op de eigen dashboard-pagina, niet hier. Vertaal elke vraag naar een concrete campagne; ontbreekt info, vraag dan door. Bij "wat stel je voor?", "wat kan ik doen?", "welke dag(en)?" of "wat raad je aan?" start je de geleide flow (zie hieronder) zodat de eigenaar klikbaar kiest — som dagen, kanalen of campagne-ideeën NOOIT op in proza.
- Beloof geen acties die je (nog) niet zelf kan uitvoeren. Zeg eerlijk "dat moet ik nog leren" als een feature er niet is.
- Geef geen juridisch, fiscaal of medisch advies.
- VERZIN geen cijfers, gerechten of details. De context hieronder is je enige bron. Als iets ontbreekt, zeg dan "ik weet het niet" of stel een vervolgvraag.
- Refereer alleen aan menu-items die letterlijk in het MENU-blok staan. Bedenk geen gerechten erbij, ook niet als ze "logisch" zouden klinken voor het restaurant-type.

---
ACTIES: HET STARTEN VAN EEN CAMPAGNE

Je schrijft campagnes NIET zelf in proza. Zodra de eigenaar iets wil
maken, posten, versturen of bedenken — óf je een campagne-gerelateerde
vraag stelt — een campagne, actie, mail, post, bericht, "doe iets voor
...", "bedenk een actie", "wat kan ik doen?", "wat stel je voor?", "welke
dag(en) raad je aan?" — start je de geleide flow met dit machine-blok. De
eigenaar ziet het blok niet; de frontend toont op basis daarvan de
geleide flow (dag → context → kanalen → tekst) ín het gesprek, met
aanklikbare opties. Som dus zelf GEEN dagen of opties op in tekst.

<<FILLY_START_GUIDED>>
{"day_phrase":"volgende week zondag","topic":"Burrata"}
<<END>>

Regels:
- "day_phrase": zet de dag/gelegenheid LETTERLIJK zoals de eigenaar 'm
  noemde ("morgen", "zaterdag", "komend weekend", "volgende week
  zondag", "20 juni", "Vaderdag"). REKEN ZELF NIETS OM naar een datum —
  het systeem doet dat deterministisch. Haal alleen de relevante woorden
  uit een rommelige zin ("doe iets leuks voor aankomende zondag" →
  day_phrase "aankomende zondag").
- DATUM: het systeem houdt de lopende doel-datum bij (zie het "[LOPENDE
  ACTIE]"-blok). Verwijst de eigenaar naar een dag, zet die frase dan
  LETTERLIJK in "day_phrase". Dat geldt voor een NIEUWE dag ("zaterdag",
  "over 5 dagen", "20 juni") én voor een VERSCHUIVING van de huidige dag
  ("een dag eerder", "de dag erna", "twee dagen later"). Het systeem
  rekent absolute dagen vanaf vandaag en verschuivingen vanaf de lopende
  datum, dus reken zelf niets om. Zegt de eigenaar niets over timing, laat
  "day_phrase"/"date" dan WEG (stuur {} of alleen "topic"); de bestaande
  datum blijft dan staan.
- "topic": noemt de eigenaar een gerecht, drankje, thema of "het menu"
  ("doe iets met de Burrata", "iets rond ons wijnaanbod"), zet dat dan
  in "topic". Anders weglaten — de flow kiest zelf uit het menu.
- Noemt 'ie GEEN dag en is er nog geen vastgesteld, stuur dan {} (of
  alleen topic) — de flow vraagt zelf welke dag.
- Eén korte proza-zin vóór het blok ("Ik zet 'm voor je klaar, kies
  hieronder."). Schrijf GEEN kanaalkeuze, GEEN campagnetekst en GEEN
  varianten in proza; de flow doet dat volledig. Stel hooguit één korte
  vervolgvraag als je echt niet weet WAT je moet maken — maar vraag
  NOOIT opnieuw naar de dag als die al bekend is.

Dit is je ENIGE manier om een campagne te starten — ook bij vage
verzoeken als "doe iets voor het menu" én bij vragen als "welke dag" of
"wat raad je aan". Schrijf nooit zelf een voorstel in proza en som NOOIT
dagen, kanalen of opties op in tekst — de geleide flow toont die
klikbaar. Alleen bij een bericht dat écht niet over een campagne gaat
antwoord je kort in proza, zonder blok.

---
CONTEXT, alles wat je weet over deze onderneming.
Drie secties, gescheiden door "---":
  1. PROFIEL, identiteit, doelgroep, USPs, faciliteiten, openingstijden, socials.
  2. MENU, alle beschikbare gerechten met prijzen + signature-markers.
  3. Actuele feiten, vandaag, weer, bezetting, reserveringen komende 7 dagen.

${contextBlock}
---
${memoryBlock ? `\n${memoryBlock}\n---\n` : ''}
Antwoord kort en direct. Geen "als Filly zou ik..." of "ik ben een AI", spreek gewoon als Filly.`;
  }
}

// ============================================================
// ACTIVE ACTION, pure helpers (audit-item #8)
// ============================================================
// Deterministisch + zonder side-effects zodat ze los te unit-testen zijn
// (zie chat.service.spec.ts). De service gebruikt ze voor de merge, de
// PATCH-validatie en het promptblok.

// Body-vorm van het PATCH-endpoint (rauw, ongevalideerd). De flow stuurt
// een partiële delta; `reset: true` = lopende actie afgerond/verlaten
// (kolom → null).
export type ActiveActionInput = {
  date?: string | null;
  topic?: string | null;
  channels?: unknown;
  step?: string | null;
  reset?: boolean;
};

// Delta voor de merge. Per veld: weggelaten (undefined) = ongemoeid laten;
// null = expliciet WISSEN (bv. "+ Nog een dag" maakt datum/thema leeg
// zónder de actie te beëindigen); een waarde = overschrijven.
export type ActiveActionDelta = {
  date?: string | null;
  topic?: string | null;
  channels?: string[] | null;
  step?: string | null;
};

// Toegestane kanaal-namen in active_action.channels (= platform-namen
// zoals de flow + generatie ze gebruiken). Onbekende waarden filteren we
// weg zodat prompt + downstream-generatie geen rommel binnenkrijgen.
const ALLOWED_ACTION_CHANNELS = new Set([
  'mail',
  'social',
  'instagram',
  'facebook',
  'whatsapp',
  'google_business',
  'tiktok',
]);

// Pure merge: delta over de bestaande state. Per veld: undefined =
// ongemoeid, null = wissen, waarde = overschrijven (zie ActiveActionDelta).
// Zo laat {topic} de datum staan, en wist {date:null} alleen de datum.
// updated_at zetten we NIET hier (dat doet de service na de merge) zodat
// deze functie deterministisch testbaar blijft.
export function mergeActiveAction(
  prev: ActiveAction | null,
  delta: ActiveActionDelta,
): ActiveAction {
  const next: ActiveAction = { ...(prev ?? {}) };
  const apply = <K extends 'date' | 'topic' | 'channels' | 'step'>(
    key: K,
    value: ActiveAction[K] | null | undefined,
  ): void => {
    if (value === undefined) return; // niet meegegeven → ongemoeid
    if (value === null) {
      delete next[key]; // expliciet wissen
      return;
    }
    next[key] = value;
  };
  apply('date', delta.date);
  apply('topic', delta.topic);
  apply('channels', delta.channels);
  apply('step', delta.step);
  return next;
}

// Valideert een rauwe PATCH-body → schone delta. Per veld: expliciet null
// → wissen; geldige waarde → zetten (ISO-datum-check, topic-cap 80,
// kanaal-whitelist, step als korte string); ongeldig/ontbrekend → weglaten.
export function sanitizeActionInput(
  input: ActiveActionInput,
): ActiveActionDelta {
  const delta: ActiveActionDelta = {};
  if (input.date === null) {
    delta.date = null;
  } else if (
    typeof input.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(input.date) &&
    !Number.isNaN(Date.parse(input.date))
  ) {
    delta.date = input.date;
  }
  if (input.topic === null) {
    delta.topic = null;
  } else if (typeof input.topic === 'string' && input.topic.trim()) {
    delta.topic = input.topic.trim().slice(0, 80);
  }
  if (input.channels === null) {
    delta.channels = null;
  } else if (Array.isArray(input.channels)) {
    const channels = (input.channels as unknown[])
      .filter((c): c is string => typeof c === 'string')
      .filter((c) => ALLOWED_ACTION_CHANNELS.has(c));
    delta.channels = Array.from(new Set(channels));
  }
  if (input.step === null) {
    delta.step = null;
  } else if (typeof input.step === 'string' && input.step.trim()) {
    delta.step = input.step.trim().slice(0, 20);
  }
  return delta;
}

// Bouwt het deterministische [LOPENDE ACTIE]-promptblok uit active_action.
// Leeg (geen datum/thema/kanalen) → lege string; dan plakken we niets aan
// de prompt. Vervangt de oude tekst-annotatie-workaround.
export function formatActiveActionBlock(action: ActiveAction | null): string {
  if (
    !action ||
    (!action.date &&
      !action.topic &&
      (!action.channels || action.channels.length === 0))
  ) {
    return '';
  }
  const lines: string[] = [
    action.date
      ? `- doel-datum: ${action.date}`
      : '- doel-datum: nog niet gekozen',
  ];
  if (action.topic) lines.push(`- thema/gerecht: ${action.topic}`);
  if (action.channels && action.channels.length > 0) {
    lines.push(`- gekozen kanalen: ${action.channels.join(', ')}`);
  }
  return [
    '[LOPENDE ACTIE — door het systeem bijgehouden, jij hoeft dit niet te onthouden]',
    ...lines,
    'Dit is de actie waar de eigenaar nu mee bezig is. Gebruik deze datum en dit thema; vraag de dag NIET opnieuw. Noemt de eigenaar een nieuwe dag of een nieuw gerecht, neem dat dan over.',
  ].join('\n');
}

// ============================================================
// LEGACY proposal-parsers (campaign / bundle / choice / date_choice)
// ============================================================
// BEWUST BEHOUDEN (audit-item #7, 2026-06-12), NIET dode code:
//   1. Backward-compat: bestaande gesprekken hebben message_cards van
//      deze kinds opgeslagen; de frontend rendert die historische
//      kaarten nog. Verwijderen zou oude threads breken.
//   2. Fallback: campagne-maken loopt sinds 2026-06-12 via de geleide
//      flow (<<FILLY_START_GUIDED>>). Mocht het LLM ooit terugvallen op
//      een oud FORMAAT-blok, dan vangen deze parsers het nog netjes op
//      i.p.v. dat de rauwe blok-tekst aan de eigenaar getoond wordt.
// Nieuwe campagne-creatie hoort NIET hier maar via extractGuidedStart.
//
// Format van een legacy-blok:
//   <<FILLY_PROPOSE_CAMPAIGN>>
//   {"type":"mail", ...}
//   <<END>>
// Bij een parse-/validatie-fout: volledige tekst terug + geen kaart
// (de chat gedraagt zich alsof er geen blok was).

const PROPOSAL_REGEX =
  /<<FILLY_PROPOSE_CAMPAIGN>>\s*([\s\S]*?)\s*<<END>>/i;

// Intermediair type: de parser kent het suggestion_id nog niet (die
// wordt pas toegekend na insert in ai_suggestions). Caller bouwt de
// volledige CampaignProposalCard door suggestion_id toe te voegen.
export type ParsedProposal = Omit<CampaignProposalCard, 'suggestion_id'>;

// Sanitize 1 variant. Returnt null als naam/body ontbreekt of leeg is
// (dan is de variant onbruikbaar voor approve straks).
// Toegestane tone-signatures (= ToneSignature uit filly-brain.config).
// Lokale set voor runtime-validatie van Claude-output.
const VALID_TONE_SIGNATURES = new Set<ToneSignature>([
  'feit_eerst',
  'verhaal_eerst',
  'vraag_eerst',
  'lijst',
  'stelling',
]);

function sanitizeVariant(v: unknown): ProposalVariant | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.body !== 'string' || o.body.trim().length === 0) return null;
  const variant: ProposalVariant = { body: o.body.trim() };
  if (
    typeof o.subject_line === 'string' &&
    o.subject_line.trim().length > 0
  ) {
    variant.subject_line = o.subject_line.trim().slice(0, 200);
  }
  // tone_signature: alleen overnemen als 't een geldige enum-waarde is.
  // Ongeldige/ontbrekende waarde → laat weg (backwards-compat).
  if (
    typeof o.tone_signature === 'string' &&
    VALID_TONE_SIGNATURES.has(o.tone_signature as ToneSignature)
  ) {
    variant.tone_signature = o.tone_signature as ToneSignature;
  }
  return variant;
}

export function extractCampaignProposal(
  raw: string,
): { cleanText: string; proposal: ParsedProposal | null } {
  const trimmed = raw.trim();
  const match = trimmed.match(PROPOSAL_REGEX);
  if (!match) {
    return { cleanText: trimmed, proposal: null };
  }
  const jsonPart = match[1].trim();
  const cleanText = trimmed.replace(PROPOSAL_REGEX, '').trim();

  try {
    const parsed = JSON.parse(jsonPart) as Record<string, unknown>;
    const type = parsed.type;
    const name = parsed.name;

    // google_business hoort er óók bij. De system-prompt laat Filly voor
    // "Maak een Google Business-post" bewust een blok met type
    // 'google_business' maken, en zowel CampaignProposalCard.type als de
    // approve-flow (suggestions.service) kennen dit type al sinds 2026-05-24.
    // Stond 'google_business' hier NIET in de toegestane lijst, dan keurde
    // de parser het voorstel af (proposal: null), vuurde er in sendMessage
    // geen enkele branch, en bleef het rauwe <<FILLY_PROPOSE_CAMPAIGN>>-blok
    // als platte tekst in de chat staan i.p.v. als nette kaart te renderen.
    if (
      (type !== 'mail' &&
        type !== 'social' &&
        type !== 'whatsapp' &&
        type !== 'google_business') ||
      typeof name !== 'string' ||
      name.trim().length === 0
    ) {
      return { cleanText, proposal: null };
    }

    // Twee paden: nieuwe variants[]-shape (3 varianten naast elkaar)
    // én legacy single-body (voor backwards-compat met oude prompt-
    // versies of als Claude per ongeluk de oude shape returnt). De
    // legacy-shape promoten we direct naar één variant in een array
    // zodat het downstream-model uniform is.
    //
    // Defensief: Claude geeft soms (zeldzame quirk, waargenomen
    // 2026-05-07) een array-veld als JSON-encoded string terug i.p.v.
    // een echte array. We parsen de string defensief vóór de check.
    let rawVariants: unknown = parsed.variants;
    if (typeof rawVariants === 'string') {
      try {
        const decoded = JSON.parse(rawVariants);
        if (Array.isArray(decoded)) rawVariants = decoded;
      } catch {
        // Onparseable → laat staan, valt door naar legacy-pad.
      }
    }
    let variants: ProposalVariant[] = [];
    if (Array.isArray(rawVariants)) {
      variants = rawVariants
        .map(sanitizeVariant)
        .filter((v): v is ProposalVariant => v !== null);
    } else if (typeof parsed.body === 'string' && parsed.body.trim()) {
      const single = sanitizeVariant({
        body: parsed.body,
        subject_line: parsed.subject_line,
      });
      if (single) variants = [single];
    }

    if (variants.length === 0) {
      return { cleanText, proposal: null };
    }

    const proposal: ParsedProposal = {
      kind: 'campaign_proposal',
      type,
      name: name.trim().slice(0, 120),
      variants,
      selected_index: 0,
    };
    return { cleanText, proposal };
  } catch {
    // JSON-fout: blok negeren, tekst wél opschonen (anders ziet user
    // het machine-formaat in zijn chat staan).
    return { cleanText, proposal: null };
  }
}

// ============================================================
// BUNDLE-parser (multi-channel: mail + IG + FB samen)
// ============================================================
// Filly's tweede formaat: één thema met 3 kanaal-versies tegelijk.
// Format:
//   <<FILLY_PROPOSE_BUNDLE>>
//   {"name":"...","theme":"...","channels":{"mail":{...},"instagram":{...},"facebook":{...}}}
//   <<END>>
// Regels parser:
//   - Alle 3 kanalen verplicht (mail + instagram + facebook)
//   - Mail heeft subject_line + body; IG/FB hebben caption
//   - Bij elk ontbrekend/leeg veld → null returnen (chat behandelt 'm
//     dan als gewone tekst zonder voorstel)

const BUNDLE_REGEX =
  /<<FILLY_PROPOSE_BUNDLE>>\s*([\s\S]*?)\s*<<END>>/i;

export type BundleMailContent = {
  subject_line: string;
  body: string;
};

export type BundleSocialContent = {
  caption: string;
  hashtags?: string[];
};

// WhatsApp + Google Business: platte tekst zonder onderwerp of hashtags.
// WhatsApp = persoonlijk bericht naar opt-in-gasten, Google Business =
// lokale profiel-post. Beide hebben alleen een body.
export type BundleTextContent = {
  body: string;
};

export type ParsedBundle = {
  kind: 'campaign_bundle';
  name: string;
  theme: string;
  // Optionele velden: een bundel bevat precies de aangevinkte kanalen
  // (minimaal 2). Zie extractCampaignBundle voor de validatie.
  channels: {
    mail?: BundleMailContent;
    instagram?: BundleSocialContent;
    facebook?: BundleSocialContent;
    whatsapp?: BundleTextContent;
    google_business?: BundleTextContent;
  };
};

function sanitizeBundleMail(v: unknown): BundleMailContent | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.subject_line !== 'string' || !o.subject_line.trim())
    return null;
  if (typeof o.body !== 'string' || !o.body.trim()) return null;
  return {
    subject_line: o.subject_line.trim().slice(0, 200),
    body: o.body.trim(),
  };
}

function sanitizeBundleSocial(v: unknown): BundleSocialContent | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.caption !== 'string' || !o.caption.trim()) return null;
  const out: BundleSocialContent = { caption: o.caption.trim() };
  if (Array.isArray(o.hashtags)) {
    out.hashtags = o.hashtags
      .filter((h): h is string => typeof h === 'string')
      .map((h) => h.trim().replace(/^#/, ''))
      .filter((h) => h.length > 0 && h.length <= 50)
      .slice(0, 10);
  }
  return out;
}

// Sanitize een platte-tekst-kanaal (WhatsApp / Google Business): enkel
// een niet-lege body. Returnt null als de body ontbreekt of leeg is.
function sanitizeBundleText(v: unknown): BundleTextContent | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.body !== 'string' || !o.body.trim()) return null;
  return { body: o.body.trim() };
}

export function extractCampaignBundle(
  raw: string,
): { cleanText: string; bundle: ParsedBundle | null } {
  const trimmed = raw.trim();
  const match = trimmed.match(BUNDLE_REGEX);
  if (!match) {
    return { cleanText: trimmed, bundle: null };
  }
  const jsonPart = match[1].trim();
  const cleanText = trimmed.replace(BUNDLE_REGEX, '').trim();

  try {
    const parsed = JSON.parse(jsonPart) as Record<string, unknown>;
    const name = parsed.name;
    const theme = parsed.theme;
    const channels = parsed.channels as Record<string, unknown> | undefined;

    if (
      typeof name !== 'string' ||
      !name.trim() ||
      typeof theme !== 'string' ||
      !theme.trim() ||
      !channels ||
      typeof channels !== 'object'
    ) {
      return { cleanText, bundle: null };
    }

    // Per kanaal sanitizen; alleen geldige kanalen nemen we mee. Zo kan
    // Filly een willekeurige subset van de 5 kanalen leveren — precies de
    // kanalen die de eigenaar aanvinkte. mail/IG/FB houden hun bestaande
    // shape; whatsapp/google_business zijn platte tekst (alleen body).
    const out: ParsedBundle['channels'] = {};
    const mail = sanitizeBundleMail(channels.mail);
    if (mail) out.mail = mail;
    const instagram = sanitizeBundleSocial(channels.instagram);
    if (instagram) out.instagram = instagram;
    const facebook = sanitizeBundleSocial(channels.facebook);
    if (facebook) out.facebook = facebook;
    const whatsapp = sanitizeBundleText(channels.whatsapp);
    if (whatsapp) out.whatsapp = whatsapp;
    const googleBusiness = sanitizeBundleText(channels.google_business);
    if (googleBusiness) out.google_business = googleBusiness;

    // Een bundel is per definitie multi-kanaal: minimaal 2 geldige
    // kanalen. Bij minder behandelen we 'm niet als bundel (dan had Filly
    // een los voorstel moeten sturen, FORMAAT 1).
    if (Object.keys(out).length < 2) {
      return { cleanText, bundle: null };
    }

    return {
      cleanText,
      bundle: {
        kind: 'campaign_bundle',
        name: name.trim().slice(0, 120),
        theme: theme.trim().slice(0, 280),
        channels: out,
      },
    };
  } catch {
    return { cleanText, bundle: null };
  }
}

// ============================================================
// detectCampaignHint, server-side routing-signaal voor Filly
// ============================================================
// Klik-first (2026-06-12): is het laatste user-bericht campagne-
// gerelateerd — een verzoek ("maak een actie") óf een vraag ("welke dag
// raad je aan", "wat zou je doen") — dan duwen we Filly keihard naar de
// GELEIDE FLOW (FILLY_START_GUIDED) i.p.v. een vrij-tekst-antwoord.
//
// De oude FORMAAT 0/1/2-steering (FILLY_PROPOSE_CHOICE / proposal /
// bundle) is bewust verwijderd: de system-prompt documenteert die niet
// meer, dus die hints lieten het LLM juist terugvallen op proza (de
// "welke dagen stel je voor"-bug, audit-feedback Floris).
//
// Returns:
//   string  → instructie die aan de prompt geplakt wordt
//   null    → geen campagne-intentie; Filly antwoordt gewoon in proza
// ============================================================

// Campagne-intentie: zowel expliciete maak-verzoeken als de "welke dag /
// wat raad je aan"-vragen die vroeger een proza-opsomming opleverden. In
// een campagne-only chat mag dit ruim matchen.
const CAMPAIGN_INTENT =
  /\b(campagne|campaign|actie|kampanje|voorstel|bedenk|maak\s+(?:iets|een)|stuur|post(?:en)?|mail(?:en)?|promotion|welke\s+(?:\w+\s+)?dag(?:en)?|(?:speciale|rustige|andere|volgende|deze|die)\s+dag(?:en)?|wat\s+(?:raad|stel|zou|kan)|raad\s+je\s+aan)\b/i;

export function detectCampaignHint(userMessage: string): string | null {
  if (!CAMPAIGN_INTENT.test(userMessage.trim())) return null;
  return [
    'Dit bericht is campagne-gerelateerd (een verzoek óf een vraag als',
    '"welke dag", "wat raad je aan"). Start de GELEIDE FLOW met een',
    '<<FILLY_START_GUIDED>>-blok en hooguit één korte proza-zin ervoor.',
    'Som NOOIT dagen, kanalen of opties op in vrije tekst — de flow toont',
    'die klikbaar. Vul "day_phrase" alleen als de eigenaar zelf een dag',
    'noemde; anders {} (of alleen "topic").',
  ].join(' ');
}

// ============================================================
// CHOICE-parser (kanaal-keuze-prompt)
// ============================================================
// Format:
//   <<FILLY_PROPOSE_CHOICE>>
//   {"question":"Waarvoor zal ik een campagne maken?"}
//   <<END>>
// Veel eenvoudiger dan proposal/bundle: alleen een vraag-tekst.
// De 4 opties (mail/social/whatsapp/bundle) zijn vast in de UI.

const CHOICE_REGEX =
  /<<FILLY_PROPOSE_CHOICE>>\s*([\s\S]*?)\s*<<END>>/i;

export type ParsedChoice = {
  kind: 'channel_choice';
  question: string;
};

export function extractCampaignChoice(
  raw: string,
): { cleanText: string; choice: ParsedChoice | null } {
  const trimmed = raw.trim();
  const match = trimmed.match(CHOICE_REGEX);
  if (!match) {
    return { cleanText: trimmed, choice: null };
  }
  const jsonPart = match[1].trim();
  const cleanText = trimmed.replace(CHOICE_REGEX, '').trim();

  try {
    const parsed = JSON.parse(jsonPart) as Record<string, unknown>;
    const question = parsed.question;
    if (typeof question !== 'string' || !question.trim()) {
      return { cleanText, choice: null };
    }
    return {
      cleanText,
      choice: {
        kind: 'channel_choice',
        question: question.trim().slice(0, 200),
      },
    };
  } catch {
    return { cleanText, choice: null };
  }
}

// ============================================================
// DATE-CHOICE-parser (datum-vraag, sinds 2026-05-24)
// ============================================================
// Format:
//   <<FILLY_PROPOSE_DATE_CHOICE>>
//   {"question":"Voor welke dag of gelegenheid?"}
//   <<END>>
// Filly stelt deze vraag EERST bij een ambigue campagne-aanvraag,
// vóór de kanaal-keuze. Reden: kanaal-keuze is afgeleid van de
// doel-deadline (zie filly-brein hoofdstuk 7 urgentie-vs-optimum).

// Guided-start: getypt campagne-verzoek → open de geleide flow ín het
// gesprek. Filly mag een door 'm herleide doel-datum meegeven (uit
// "zondag"/"morgen"/"volgende week zondag"); die valideren we hier
// (ISO, geldig, niet ver in 't verleden, ≤120 dgn vooruit). Een leeg
// of misvormd blok levert nog steeds een guided_start-kaart op zónder
// datum — de flow vraagt dan zelf de dag.
const GUIDED_START_REGEX =
  /<<FILLY_START_GUIDED>>\s*([\s\S]*?)\s*<<END>>/i;

export function extractGuidedStart(
  raw: string,
  // De lopende doel-datum (ISO), zodat relatieve verschuivingen ("een dag
  // eerder") vanaf de huidige actie rekenen i.p.v. vanaf vandaag.
  referenceIso?: string | null,
): { cleanText: string; card: GuidedStartCard | null } {
  const trimmed = raw.trim();
  const match = trimmed.match(GUIDED_START_REGEX);
  if (!match) {
    return { cleanText: trimmed, card: null };
  }
  const cleanText = trimmed.replace(GUIDED_START_REGEX, '').trim();

  let date: string | undefined;
  let topic: string | undefined;
  try {
    const parsed = JSON.parse(match[1].trim()) as Record<string, unknown>;
    // Voorkeur: 'day_phrase' (de dag zoals de eigenaar 'm noemde) →
    // deterministisch omgerekend in code (audit-item #2). Fallback:
    // 'date' (al-omgerekende ISO, bv. hergebruikt uit een eerdere
    // flow-annotatie). Beide door dezelfde range-check.
    let candidate: string | undefined;
    if (typeof parsed.day_phrase === 'string' && parsed.day_phrase.trim()) {
      candidate =
        resolveDutchDate(parsed.day_phrase, new Date(), referenceIso) ??
        undefined;
    }
    if (!candidate && typeof parsed.date === 'string') {
      candidate = parsed.date.trim();
    }
    if (
      candidate &&
      /^\d{4}-\d{2}-\d{2}$/.test(candidate) &&
      !Number.isNaN(Date.parse(candidate))
    ) {
      const days =
        (new Date(`${candidate}T12:00:00`).getTime() - Date.now()) /
        86_400_000;
      if (days >= -1 && days <= 120) date = candidate;
    }
    if (typeof parsed.topic === 'string' && parsed.topic.trim()) {
      topic = parsed.topic.trim().slice(0, 80);
    }
  } catch {
    // Misvormde JSON → flow zonder voorgevulde datum/topic.
  }

  return {
    cleanText,
    card: {
      kind: 'guided_start',
      ...(date ? { date } : {}),
      ...(topic ? { topic } : {}),
    },
  };
}

const DATE_CHOICE_REGEX =
  /<<FILLY_PROPOSE_DATE_CHOICE>>\s*([\s\S]*?)\s*<<END>>/i;

export type ParsedDateChoice = {
  kind: 'date_choice';
  question: string;
};

export function extractDateChoice(
  raw: string,
): { cleanText: string; choice: ParsedDateChoice | null } {
  const trimmed = raw.trim();
  const match = trimmed.match(DATE_CHOICE_REGEX);
  if (!match) {
    return { cleanText: trimmed, choice: null };
  }
  const jsonPart = match[1].trim();
  const cleanText = trimmed.replace(DATE_CHOICE_REGEX, '').trim();

  try {
    const parsed = JSON.parse(jsonPart) as Record<string, unknown>;
    const question = parsed.question;
    if (typeof question !== 'string' || !question.trim()) {
      return { cleanText, choice: null };
    }
    return {
      cleanText,
      choice: {
        kind: 'date_choice',
        question: question.trim().slice(0, 200),
      },
    };
  } catch {
    return { cleanText, choice: null };
  }
}
