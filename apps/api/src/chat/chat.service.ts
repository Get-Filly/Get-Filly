import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AiService } from '../ai/ai.service';
import { RestaurantContextService } from '../ai/restaurant-context.service';

// Rollen zoals we ze in de chat_messages-tabel opslaan. 'filly' = assistant,
// 'user' = de restauranteigenaar, 'system' = interne/automatische berichten
// (bv. notificaties in de thread). Voor onze v1 gebruiken we alleen
// 'filly' en 'user' actief.
export type ChatRole = 'filly' | 'user' | 'system';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  created_at: string;
};

export type ActiveChatState = {
  conversationId: string;
  messages: ChatMessage[];
};

@Injectable()
export class ChatService {
  // Hoeveel berichten we meegeven als context aan Claude. 20 is genoeg
  // voor een gesprek van ~10 turns en houdt kosten in bedwang: elke
  // extra msg = ~50-150 input-tokens.
  private readonly CONTEXT_WINDOW = 20;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly ai: AiService,
    private readonly context: RestaurantContextService,
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
      // Eerste bezoek ooit: maak een lege conversatie aan + plaats een
      // welkomstbericht. Zonder die eerste regel voelt de chat leeg bij
      // eerste keer openen. Het welkomstbericht is gewoon een DB-rij,
      // dus geen Claude-call en dus ook geen kosten.
      const { data: created, error: createErr } = await this.supabase.client
        .from('chat_conversations')
        .insert({ restaurant_id: restaurantId })
        .select('id')
        .single();
      if (createErr) throw new InternalServerErrorException(createErr.message);
      conversationId = created.id;

      await this.supabase.client.from('chat_messages').insert({
        conversation_id: conversationId,
        restaurant_id: restaurantId,
        role: 'filly',
        content:
          'Hoi! Ik ben Filly, je marketing-assistent. Vraag me iets over je bezetting, gasten, reviews of campagnes — of over wat je deze week kan doen.',
      });
    }

    // Laatste N berichten ophalen, aflopend gesorteerd, daarna in code
    // weer omdraaien zodat oudste eerst staat (hoe een chat-UI 'm toont).
    const messages = await this.getRecentMessages(conversationId, restaurantId);
    return { conversationId, messages };
  }

  private async getRecentMessages(
    conversationId: string,
    restaurantId: string,
  ): Promise<ChatMessage[]> {
    const { data, error } = await this.supabase.client
      .from('chat_messages')
      .select('id, role, content, created_at')
      .eq('conversation_id', conversationId)
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(this.CONTEXT_WINDOW);

    if (error) throw new InternalServerErrorException(error.message);
    // Omdraaien → oudste eerst, zoals de UI 'm rendert.
    return ((data as ChatMessage[]) ?? []).reverse();
  }

  // Hoofd-actie: user stuurt een bericht, wij slaan het op, roepen
  // Claude aan met de context, slaan het antwoord op, sturen beide
  // terug. Bewust NIET streaming voor v1 — simpeler, goed genoeg.
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

    // 1) User-bericht opslaan VOOR we Claude aanroepen. Zo blijft
    // het bericht staan ook als Claude faalt — de user ziet 'm dan
    // wel in zijn history en kan later opnieuw proberen.
    const { data: userMsg, error: userErr } = await this.supabase.client
      .from('chat_messages')
      .insert({
        conversation_id: conversationId,
        restaurant_id: restaurantId,
        role: 'user',
        content: trimmed,
      })
      .select('id, role, content, created_at')
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

    // 3) Claude-call via onze wrapper. Auto-logging in ai_usage gebeurt
    // binnen AiService; rate-limit-guard heeft de call al laten passeren.
    const answer = await this.ai.generateText({
      system: systemPrompt,
      prompt: historyPrompt,
      model: 'claude-sonnet-4-6',
      maxTokens: 600,
      meta: {
        restaurantId,
        userId,
        feature: 'chat',
      },
    });

    // 4) Filly's antwoord opslaan.
    const { data: fillyMsg, error: fillyErr } = await this.supabase.client
      .from('chat_messages')
      .insert({
        conversation_id: conversationId,
        restaurant_id: restaurantId,
        role: 'filly',
        content: answer.trim(),
      })
      .select('id, role, content, created_at')
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

    return {
      userMessage: userMsg as ChatMessage,
      fillyMessage: fillyMsg as ChatMessage,
    };
  }

  // System-prompt voor chat: Filly's persona + restaurant-identiteit +
  // actuele feiten (weer, bezetting, reserveringen). De feiten komen
  // uit RestaurantContextService die ze parallel ophaalt. Eén extra
  // ronde naar de DB (~150ms) is verwaarloosbaar op een 1-3s Claude-call
  // en voorkomt dat Filly hallucineert over data die ze niet heeft.
  private async buildSystemPrompt(restaurantId: string): Promise<string> {
    const [restaurantResult, contextBlock] = await Promise.all([
      this.supabase.client
        .from('restaurants')
        .select('name, type, description, brand_tone')
        .eq('id', restaurantId)
        .maybeSingle(),
      this.context.buildContextBlock(restaurantId),
    ]);

    const restaurant = restaurantResult.data;
    const name = restaurant?.name ?? 'de zaak';
    const type = restaurant?.type ? ` (${restaurant.type})` : '';
    const desc = restaurant?.description
      ? `\nOver ${name}: ${restaurant.description}`
      : '';

    return `Je bent Filly, de AI-marketingassistent van ${name}${type}. Je praat met de eigenaar via de dashboard-chat.

Wie je bent:
- Een behulpzame, praktische assistent die marketing-werk uit handen neemt.
- Je kent horeca: bezetting, gasten, reviews, campagnes, menu.
- Je denkt mee over concrete acties: mailings, socials, menu-aanpassingen, gasten-activatie.

Hoe je praat:
- Nederlands, gemoedelijk, niet Amerikaans-enthousiast. Geen uitroeptekens, geen emoji.
- Kort en to-the-point. Liever 2-3 korte zinnen dan een heel verhaal.
- Stel een vervolgvraag als je input mist om goed te helpen.
- "Wij" als je namens de zaak praat, "jij" als je de eigenaar aanspreekt.

Wat je NIET doet:
- Beloof geen acties die je (nog) niet zelf kan uitvoeren. Zeg eerlijk "dat moet ik nog leren" als een feature er niet is.
- Geef geen juridisch, fiscaal of medisch advies.
- VERZIN geen cijfers. De feiten hieronder zijn je enige bron. Als je niets weet over iets, zeg dat dan.
${desc}

---
Hieronder staan de actuele feiten over de zaak. Gebruik deze als enige
bron voor cijfers over bezetting, weer en reserveringen:

${contextBlock}
---

Antwoord kort en direct. Geen "als Filly zou ik..." of "ik ben een AI" — spreek gewoon als Filly.`;
  }
}
