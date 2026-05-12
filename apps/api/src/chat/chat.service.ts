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
import { SuggestionsService } from '../suggestions/suggestions.service';
import { ChatMemoryService } from './chat-memory.service';

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
  | ChannelChoiceCard;

// Channel-choice, geen ai_suggestion-rij erachter (geen suggestion_id),
// puur een UI-prompt waarbij eigenaar door op een knop te klikken
// automatisch een follow-up-bericht naar Filly stuurt.
export type ChannelChoiceCard = {
  kind: 'channel_choice';
  question: string;
  // Volgorde + welke opties beschikbaar zijn, Filly bepaalt zelf.
  // Voor V1 standaard alle 4: mail/social/whatsapp/bundle.
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
    mail: { subject_line: string; body: string };
    instagram: { caption: string; hashtags?: string[] };
    facebook: { caption: string };
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
};

export type CampaignProposalCard = {
  kind: 'campaign_proposal';
  // FK naar ai_suggestions.id, gezet zodra het voorstel als
  // pending-suggestie is opgeslagen.
  suggestion_id: string;
  type: 'mail' | 'social' | 'whatsapp';
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

export type ActiveChatState = {
  conversationId: string;
  messages: ChatMessage[];
  // Aantal berichten in deze conversatie (cap = 20). Gebruikt door de
  // frontend om "Bericht X / 20"-indicator + cap-bereikt-CTA te tonen.
  messageCount: number;
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
  ) {}

  // Haalt de actieve conversatie op voor dit restaurant, of maakt er
  // één aan als die nog niet bestaat. "Actief" = de meest recent
  // geüpdatete conversation_id. Zo opent de gebruiker telkens dezelfde
  // chat-thread en overleeft 'ie refreshes.
  async getOrCreateActiveConversation(
    restaurantId: string,
  ): Promise<ActiveChatState> {
    const { data: existing, error: fetchErr } = await this.supabase.client
      .from('chat_conversations')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchErr) throw new InternalServerErrorException(fetchErr.message);

    let conversationId: string;
    if (existing) {
      conversationId = existing.id;
    } else {
      conversationId = await this.createConversationRow(restaurantId);
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

  // Privé helper: maakt rij in chat_conversations + welkomstbericht.
  // Gedeeld tussen getOrCreateActiveConversation en createConversation
  // zodat het welkomstbericht-template één plek heeft.
  private async createConversationRow(restaurantId: string): Promise<string> {
    const { data: created, error: createErr } = await this.supabase.client
      .from('chat_conversations')
      .insert({ restaurant_id: restaurantId })
      .select('id')
      .single();
    if (createErr) throw new InternalServerErrorException(createErr.message);
    const conversationId = created.id as string;

    // Welkomstbericht is gewoon een DB-rij, geen Claude-call. Voorkomt
    // dat een net-aangemaakte chat als lege canvas voelt.
    await this.supabase.client.from('chat_messages').insert({
      conversation_id: conversationId,
      restaurant_id: restaurantId,
      role: 'filly',
      content:
        'Hoi! Ik ben Filly, je marketing-assistent. Vraag me iets over je bezetting, gasten, reviews of campagnes, of over wat je deze week kan doen.',
    });

    return conversationId;
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
    return { conversationId, messages, messageCount };
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
  ): Promise<{ userMessage: ChatMessage; fillyMessage: ChatMessage }> {
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
      .select('id')
      .eq('id', conversationId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();
    if (convErr) throw new InternalServerErrorException(convErr.message);
    if (!conv) throw new NotFoundException('Gesprek niet gevonden.');

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
    const historyPrompt = history
      .map((m) => `${m.role === 'user' ? 'Eigenaar' : 'Filly'}: ${m.content}`)
      .join('\n');

    // Server-side keuze-hint: detect of het laatste user-bericht
    // expliciet een kanaal noemt en stuur een harde override naar
    // Claude. Voorkomt dat Filly de prompt-instructie negeert en
    // alsnog direct een BUNDLE genereert bij een open vraag.
    const hint = detectChannelHint(content);
    const guardedPrompt = hint
      ? `${historyPrompt}\n\n[INTERN ROUTING-SIGNAAL, niet voor de gebruiker zichtbaar]\n${hint}`
      : historyPrompt;

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

    const parsedChoice = extractCampaignChoice(answer);
    const parsedSingle = parsedChoice.choice
      ? { cleanText: parsedChoice.cleanText, proposal: null }
      : extractCampaignProposal(answer);
    const parsedBundle =
      parsedChoice.choice || parsedSingle.proposal
        ? { cleanText: parsedSingle.cleanText, bundle: null }
        : extractCampaignBundle(answer);

    if (parsedChoice.choice) {
      cleanText = parsedChoice.cleanText;
      // Geen ai_suggestion, kaart is puur UI-prompt. Frontend
      // verstuurt bij klik automatisch een follow-up user-bericht.
      messageCard = parsedChoice.choice;
    } else if (parsedSingle.proposal) {
      cleanText = parsedSingle.cleanText;
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
        console.error(
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
        console.error(
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
        content: cleanText,
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
      // Cacheable in prompt-cache (dezelfde memories voor meerdere
      // chat-calls binnen 5 min).
      this.memory.getRecentMemories(restaurantId, this.MEMORY_CONTEXT_LIMIT),
    ]);

    const restaurant = restaurantResult.data;
    const name = restaurant?.name ?? 'de onderneming';
    const type = restaurant?.type ? ` (${restaurant.type})` : '';
    const memoryBlock = this.memory.formatMemoryBlock(memories);

    return `Je bent Filly, de AI-assistent van ${name}${type}. Je praat met de eigenaar via de dashboard-chat.

Wie je bent:
- Een behulpzame, praktische assistent die marketing-werk uit handen neemt.
- Je kent horeca: bezetting, gasten, reviews, campagnes, menu.
- Je denkt mee over concrete acties: mailings, socials, menu-aanpassingen, gasten-activatie.

Hoe je praat:
- Nederlands, gemoedelijk, niet Amerikaans-enthousiast. Geen uitroeptekens, geen emoji.
- Kort en to-the-point. Liever 2-3 korte zinnen dan een heel verhaal.
- Stel een vervolgvraag als je input mist om goed te helpen.
- "Wij" als je namens de onderneming praat, "jij" als je de eigenaar aanspreekt.

Wat je NIET doet:
- Beloof geen acties die je (nog) niet zelf kan uitvoeren. Zeg eerlijk "dat moet ik nog leren" als een feature er niet is.
- Geef geen juridisch, fiscaal of medisch advies.
- VERZIN geen cijfers, gerechten of details. De context hieronder is je enige bron. Als iets ontbreekt, zeg dan "ik weet het niet" of stel een vervolgvraag.
- Refereer alleen aan menu-items die letterlijk in het MENU-blok staan. Bedenk geen gerechten erbij, ook niet als ze "logisch" zouden klinken voor het restaurant-type.

---
ACTIES DIE JE WEL KUNT UITVOEREN

Je kunt een campagne voor de eigenaar aanmaken. Wanneer, en alléén
wanneer, je in je antwoord een concrete, actionable campagne voorstelt
(dus een mail-, social- of whatsapp-bericht waar jij de inhoud al voor
hebt bedacht), sluit je je antwoord af met een speciaal machine-leesbaar
blok. De eigenaar ziet dit blok niet; de frontend toont op basis daarvan
drie varianten naast elkaar zodat hij/zij kan kiezen.

Drie voorstel-formaten, KIES STRIKT VOLGENS DEZE BESLISBOOM:

╔════════════════════════════════════════════════════════════╗
║  HARDE REGEL, kies precies 1 van de 3 formaten:           ║
║                                                            ║
║  1. Bevat de LAATSTE user-message een woord uit de         ║
║     KANAAL-LIJST (mail / e-mail / Instagram / IG /         ║
║     Facebook / FB / WhatsApp / social / post)?             ║
║       JA → FORMAAT 1 met dat specifieke kanaal             ║
║                                                            ║
║  2. Bevat de LAATSTE user-message een woord uit de         ║
║     BUNDLE-LIJST (bundel / bundle / alle kanalen /         ║
║     breed inzetten / multi-channel / overal)?              ║
║       JA → FORMAAT 2 (bundle)                              ║
║                                                            ║
║  3. Eigenaar antwoordde net op de keuze-knoppen, z'n      ║
║     vorige user-message luidt EXACT "Maak een              ║
║     mail/social/whatsapp/bundel-campagne"?                 ║
║       JA → respectievelijk FORMAAT 1 of 2 met dat type     ║
║                                                            ║
║  4. ANDERS (default) → FORMAAT 0 (KEUZE-VRAAG)             ║
║                                                            ║
║  NOOIT FORMAAT 1 of 2 zonder dat 1, 2 of 3 hierboven       ║
║  onmiskenbaar van toepassing is. Bij twijfel: FORMAAT 0.   ║
╚════════════════════════════════════════════════════════════╝

VOORBEELDEN:
- "maak een Vaderdag-campagne"           → FORMAAT 0 (geen kanaal)
- "iets voor zomerse dagen"              → FORMAAT 0 (geen kanaal)
- "bedenk een actie"                     → FORMAAT 0 (geen kanaal)
- "stuur een mail aan de vaste gasten"   → FORMAAT 1 (mail)
- "post iets op Instagram"               → FORMAAT 1 (social)
- "maak een WhatsApp-bericht"            → FORMAAT 1 (whatsapp)
- "een bundel voor Moederdag"            → FORMAAT 2 (bundle)
- "ga ervoor met alle kanalen"           → FORMAAT 2 (bundle)
- (vorige user-msg) "Maak een bundel-campagne (mail + IG + FB)"
                                         → FORMAAT 2

────────────────────────────────────────
FORMAAT 0, KEUZE-VRAAG (default bij niet-specifieke campagne-aanvraag)
────────────────────────────────────────
Korte proza-aankondiging (1 zin, bv. "Voor welk kanaal zal ik 'm maken?")
gevolgd door:

<<FILLY_PROPOSE_CHOICE>>
{"question":"Waarvoor zal ik een campagne maken?"}
<<END>>

────────────────────────────────────────
FORMAAT 1, SINGLE-CHANNEL (één kanaal, 3 varianten van dezelfde tekst)
────────────────────────────────────────
Gebruik dit als de eigenaar één specifiek kanaal noemt of net op
de keuze-vraag een single-channel-keuze (mail/social/whatsapp) heeft
gemaakt.

────────────────────────────────────────
FORMAAT 1, SINGLE-CHANNEL (één kanaal, 3 varianten van dezelfde tekst)
────────────────────────────────────────
Gebruik dit als de eigenaar één specifiek kanaal noemt ("stuur een
mail aan de vaste gasten", "een Instagram-post over...") of bij kleine
acties op één kanaal.

<<FILLY_PROPOSE_CAMPAIGN>>
{"type":"mail","name":"<korte titel>","variants":[{"subject_line":"<onderwerp v1>","body":"<volledige tekst v1>"},{"subject_line":"<onderwerp v2>","body":"<volledige tekst v2>"},{"subject_line":"<onderwerp v3>","body":"<volledige tekst v3>"}]}
<<END>>

Regels:
- type = "mail" | "social" | "whatsapp"
- 3 varianten écht verschillend in toon/insteek/lengte.
- "subject_line" hoort bij mail; voor social/whatsapp mag je 'm weglaten.
- "body" bevat de volledige uitgeschreven tekst.

────────────────────────────────────────
FORMAAT 2, MULTI-CHANNEL BUNDLE (één thema, 3 kanalen)
────────────────────────────────────────
Gebruik dit alleen wanneer eigenaar expliciet "bundel" / "alle
kanalen" / "breed inzetten" noemt, OF wanneer 'ie net op de keuze-
vraag voor "bundle" heeft gekozen ("Maak een bundel-campagne").

Eén thema, drie kanaal-versies (mail + Instagram + Facebook), elk
met EIGEN toon/lengte/structuur passend bij dat platform:
- mail: lange, persoonlijke uitnodiging (~150 woorden), met subject_line
- instagram: visueel-persoonlijk (~50-80 woorden), 3-5 hashtags
- facebook: community-conversational (~80-120 woorden), géén hashtags

<<FILLY_PROPOSE_BUNDLE>>
{"name":"<korte bundel-naam>","theme":"<1 zin die het thema vangt>","channels":{"mail":{"subject_line":"<onderwerp>","body":"<volledige mail-tekst>"},"instagram":{"caption":"<IG-caption met emojis>","hashtags":["tag1","tag2","tag3"]},"facebook":{"caption":"<FB-tekst zonder hashtags>"}}}
<<END>>

Regels bundle:
- "name": korte werknaam voor hele bundel, bv. "Moederdag-bundel mei"
- "theme": 1 zin die alle drie de kanaal-versies verbindt
- ALLE drie kanalen moeten aanwezig zijn, laat geen kanaal weg
- Captions per platform aangepast (NIET dezelfde tekst gekopieerd)
- IG-caption: emoji's mag, laat dingen visueel klinken
- FB-caption: warmer, meer storytelling, geen hashtags
- mail: gebruik subject_line + lange body

────────────────────────────────────────
ALGEMENE REGELS (beide formaten)
────────────────────────────────────────
- KORTE proza-aankondiging vóór het blok, máximaal 2-3 zinnen.
  Bij BUNDLE: "Ik heb een bundel klaar voor mail, Instagram en
  Facebook. Klik op een kanaal om te bekijken." NIET de hele
  inhoud opnieuw in proza herhalen, die staat al in het blok en
  de UI toont 'm in collapsibles. Lange proza + lange JSON =
  truncated antwoord.
- Verwerk concrete elementen uit PROFIEL en MENU (signature gerecht,
  USP, specifieke doelgroep) zodat de campagne herkenbaar past.
- Gebruik dubbele aanhalingstekens binnen tekst door \\" te escapen.
- Schrijf NOOIT een blok als de eigenaar er niet om gevraagd heeft of
  als jij nog aan het brainstormen bent, dat leidt tot ongewenste
  concept-campagnes.
- Maximaal ÉÉN blok per antwoord (geen mix van CAMPAIGN + BUNDLE).

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
// Proposal-parser
// ============================================================
// Filly zet achter z'n tekst een blok in het format:
//   <<FILLY_PROPOSE_CAMPAIGN>>
//   {"type":"mail", ...}
//   <<END>>
// We halen dat eruit zodat de user alleen de prozatekst ziet, en
// valideren de JSON voordat we 'm in message_card opslaan. Bij een
// parse- of validatie-fout geven we de volledige (ongestripte) tekst
// terug en geen proposal, dan gedraagt de chat zich alsof er geen
// voorstel was. Zo blokkeren we nooit een antwoord door een misvormd
// blokje.

const PROPOSAL_REGEX =
  /<<FILLY_PROPOSE_CAMPAIGN>>\s*([\s\S]*?)\s*<<END>>/i;

// Intermediair type: de parser kent het suggestion_id nog niet (die
// wordt pas toegekend na insert in ai_suggestions). Caller bouwt de
// volledige CampaignProposalCard door suggestion_id toe te voegen.
export type ParsedProposal = Omit<CampaignProposalCard, 'suggestion_id'>;

// Sanitize 1 variant. Returnt null als naam/body ontbreekt of leeg is
// (dan is de variant onbruikbaar voor approve straks).
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

    if (
      (type !== 'mail' && type !== 'social' && type !== 'whatsapp') ||
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

export type ParsedBundle = {
  kind: 'campaign_bundle';
  name: string;
  theme: string;
  channels: {
    mail: BundleMailContent;
    instagram: BundleSocialContent;
    facebook: BundleSocialContent;
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
      !channels
    ) {
      return { cleanText, bundle: null };
    }

    const mail = sanitizeBundleMail(channels.mail);
    const instagram = sanitizeBundleSocial(channels.instagram);
    const facebook = sanitizeBundleSocial(channels.facebook);

    if (!mail || !instagram || !facebook) {
      return { cleanText, bundle: null };
    }

    return {
      cleanText,
      bundle: {
        kind: 'campaign_bundle',
        name: name.trim().slice(0, 120),
        theme: theme.trim().slice(0, 280),
        channels: { mail, instagram, facebook },
      },
    };
  } catch {
    return { cleanText, bundle: null };
  }
}

// ============================================================
// detectChannelHint, server-side routing-signaal voor Filly
// ============================================================
// We scannen het laatste user-bericht op kanaal-keywords en sturen
// een keiharde "USE FORMAAT X"-instructie mee in de Claude-prompt.
// Dit is een safety-net naast de prompt-regels: als Claude de prompt
// instructie ook maar enigszins zou negeren, dan dwingt deze hint
// het juiste formaat alsnog af.
//
// Returns:
//   string  → instructie die aan de prompt geplakt wordt
//   null    → geen detectie, Claude beslist zelf op basis van regels
// ============================================================

const SINGLE_CHANNEL_KEYWORDS = {
  mail: /\b(mail|e-?mail|nieuwsbrief|mailing)\b/i,
  social:
    /\b(instagram|insta|ig|facebook|fb|social(?:[\s-]?media)?|post(?:en)?)\b/i,
  whatsapp: /\b(whatsapp|whats[\s-]?app|wa)\b/i,
};

const BUNDLE_KEYWORDS =
  /\b(bundel|bundle|alle\s+kanalen|breed\s+inzet|multi[\s-]?channel|overal)\b/i;

const CAMPAIGN_INTENT =
  /\b(campagne|campaign|actie|kampanje|voorstel|bedenk|maak\s+(?:iets|een)|stuur|post(?:en)?|mail(?:en)?|promotion)\b/i;

const CHOICE_FOLLOWUP_PATTERNS = [
  /^maak\s+een\s+mail-?campagne/i,
  /^maak\s+een\s+social-?(?:media-?)?(?:post|campagne)/i,
  /^maak\s+een\s+whatsapp-?(?:bericht|campagne)/i,
  /^maak\s+een\s+bundel-?campagne/i,
];

function detectChannelHint(userMessage: string): string | null {
  const trimmed = userMessage.trim();

  // 1. Volgt op de keuze-knoppen, exacte tekst die de frontend
  // automatisch verstuurt. Dwingt direct het juiste formaat af.
  for (const pat of CHOICE_FOLLOWUP_PATTERNS) {
    if (pat.test(trimmed)) {
      if (/bundel/i.test(trimmed)) {
        return 'De eigenaar koos zojuist BUNDEL via de keuze-knoppen. Gebruik FORMAAT 2 (BUNDLE). Sla FORMAAT 0 over.';
      }
      if (/mail/i.test(trimmed)) {
        return 'De eigenaar koos zojuist MAIL via de keuze-knoppen. Gebruik FORMAAT 1 met type="mail". Sla FORMAAT 0 over.';
      }
      if (/social/i.test(trimmed)) {
        return 'De eigenaar koos zojuist SOCIAL via de keuze-knoppen. Gebruik FORMAAT 1 met type="social". Sla FORMAAT 0 over.';
      }
      if (/whatsapp/i.test(trimmed)) {
        return 'De eigenaar koos zojuist WHATSAPP via de keuze-knoppen. Gebruik FORMAAT 1 met type="whatsapp". Sla FORMAAT 0 over.';
      }
    }
  }

  // 2. Bundle-keywords expliciet → FORMAAT 2
  if (BUNDLE_KEYWORDS.test(trimmed)) {
    return 'Het bericht noemt een bundel/multi-channel. Gebruik FORMAAT 2 (BUNDLE).';
  }

  // 3. Specifiek kanaal genoemd → FORMAAT 1
  for (const [type, pattern] of Object.entries(SINGLE_CHANNEL_KEYWORDS)) {
    if (pattern.test(trimmed)) {
      return `Het bericht noemt een specifiek kanaal (${type}). Gebruik FORMAAT 1 met type="${type}".`;
    }
  }

  // 4. Open campagne-aanvraag zonder kanaal → FORMAAT 0
  if (CAMPAIGN_INTENT.test(trimmed)) {
    return 'Het bericht vraagt om een campagne maar noemt GEEN specifiek kanaal en GEEN bundel. Gebruik FORMAAT 0 (KEUZE-VRAAG met <<FILLY_PROPOSE_CHOICE>>). NIET direct een proposal of bundle genereren.';
  }

  // Geen detectie, Claude beslist zelf (geen campagne-intent waarschijnlijk)
  return null;
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
