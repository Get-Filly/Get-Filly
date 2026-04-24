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

// message_card = gestructureerde payload die naast de prozatekst wordt
// opgeslagen wanneer Filly een actie voorstelt. Voor v1 alleen
// 'campaign_proposal'; later komen er meer (review_reply, guest_message).
// Frontend rendert op basis van `kind` een bijpassend kaartje met
// actieknoppen. De ruwe JSON blijft in de DB zodat we proposals later
// kunnen audit-en en analyseren.
export type MessageCard = CampaignProposalCard;

export type CampaignProposalCard = {
  kind: 'campaign_proposal';
  type: 'mail' | 'social' | 'whatsapp';
  name: string;
  // Mail-specifiek; optioneel voor social/whatsapp.
  subject_line?: string;
  // Hoofdtekst van het voorstel (mail-body, caption of whatsapp-bericht).
  body: string;
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
      .select('id, role, content, message_card, created_at')
      .eq('conversation_id', conversationId)
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(this.CONTEXT_WINDOW);

    if (error) throw new InternalServerErrorException(error.message);
    // Omdraaien → oudste eerst, zoals de UI 'm rendert.
    // Normaliseer message_card naar null als 'm ontbreekt (legacy rijen).
    return ((data as ChatMessage[]) ?? [])
      .map((m) => ({ ...m, message_card: m.message_card ?? null }))
      .reverse();
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

    // 4) Filly's antwoord parsen. Als Filly een concrete campagne
    // voorstelt, heeft hij volgens z'n system-prompt een speciaal
    // JSON-blok achter z'n tekst geplakt: <<FILLY_PROPOSE_CAMPAIGN>>
    // {...} <<END>>. We halen dat blok eruit zodat de user alleen
    // de nette proza ziet, en bewaren de JSON in message_card zodat
    // de frontend een "Zal ik deze aanmaken?"-kaartje kan tonen.
    const parsed = extractCampaignProposal(answer);

    const { data: fillyMsg, error: fillyErr } = await this.supabase.client
      .from('chat_messages')
      .insert({
        conversation_id: conversationId,
        restaurant_id: restaurantId,
        role: 'filly',
        content: parsed.cleanText,
        message_card: parsed.proposal ?? null,
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
ACTIES DIE JE WEL KUNT UITVOEREN

Je kunt een campagne voor de eigenaar aanmaken. Wanneer — en alléén
wanneer — je in je antwoord een concrete, actionable campagne voorstelt
(dus een mail-, social- of whatsapp-bericht waar jij de inhoud al voor
hebt bedacht), sluit je je antwoord af met een speciaal machine-leesbaar
blok. De eigenaar ziet dit blok niet; de frontend toont op basis daarvan
een knop "Zal ik deze aanmaken?".

Formaat (LETTERLIJK zo, één paar tags per bericht, één JSON-object):

<<FILLY_PROPOSE_CAMPAIGN>>
{"type":"mail","name":"<korte titel>","subject_line":"<onderwerp>","body":"<volledige tekst>"}
<<END>>

Regels:
- Gebruik het blok ALLEEN als je bericht een uitgewerkte campagne bevat
  (niet bij algemene tips of brainstorm-ideeën).
- Eindig je gewone tekst eerst met een korte vraag als "Zal ik 'm voor
  je aanmaken als concept?" zodat de eigenaar weet dat er een knop komt.
- type = "mail" | "social" | "whatsapp"
- "name" is een korte werknaam (max 60 tekens), bv. "Italiaanse avond mei"
- "subject_line" hoort bij mail; voor social/whatsapp mag je 'm weglaten.
- "body" bevat de volledige uitgeschreven tekst die in de campagne komt.
- Gebruik dubbele aanhalingstekens binnen body door \\" te escapen.
- Schrijf NOOIT het blok als de eigenaar er niet om gevraagd heeft of
  als jij nog aan het brainstormen bent — dat leidt tot ongewenste
  concept-campagnes.

---
Hieronder staan de actuele feiten over de zaak. Gebruik deze als enige
bron voor cijfers over bezetting, weer en reserveringen:

${contextBlock}
---

Antwoord kort en direct. Geen "als Filly zou ik..." of "ik ben een AI" — spreek gewoon als Filly.`;
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
// terug en geen proposal — dan gedraagt de chat zich alsof er geen
// voorstel was. Zo blokkeren we nooit een antwoord door een misvormd
// blokje.

const PROPOSAL_REGEX =
  /<<FILLY_PROPOSE_CAMPAIGN>>\s*([\s\S]*?)\s*<<END>>/i;

export function extractCampaignProposal(
  raw: string,
): { cleanText: string; proposal: CampaignProposalCard | null } {
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
    const body = parsed.body;

    if (
      (type !== 'mail' && type !== 'social' && type !== 'whatsapp') ||
      typeof name !== 'string' ||
      typeof body !== 'string' ||
      name.trim().length === 0 ||
      body.trim().length === 0
    ) {
      return { cleanText, proposal: null };
    }

    const proposal: CampaignProposalCard = {
      kind: 'campaign_proposal',
      type,
      name: name.trim().slice(0, 120),
      body: body.trim(),
    };
    if (
      typeof parsed.subject_line === 'string' &&
      parsed.subject_line.trim().length > 0
    ) {
      proposal.subject_line = parsed.subject_line.trim().slice(0, 200);
    }
    return { cleanText, proposal };
  } catch {
    // JSON-fout: blok negeren, tekst wél opschonen (anders ziet user
    // het machine-formaat in zijn chat staan).
    return { cleanText, proposal: null };
  }
}
