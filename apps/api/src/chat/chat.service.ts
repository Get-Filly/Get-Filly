import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AiService } from '../ai/ai.service';
import { RestaurantContextService } from '../ai/restaurant-context.service';
import { SuggestionsService } from '../suggestions/suggestions.service';

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

// Eén variant van een campagne-voorstel. Filly genereert er normaal
// drie naast elkaar zodat de eigenaar kan kiezen i.p.v. iteratief
// blijven sparren.
export type ProposalVariant = {
  subject_line?: string;
  body: string;
};

export type CampaignProposalCard = {
  kind: 'campaign_proposal';
  // FK naar ai_suggestions.id — gezet zodra het voorstel als
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
};

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  // Hoeveel berichten we meegeven als context aan Claude. 20 is genoeg
  // voor een gesprek van ~10 turns en houdt kosten in bedwang: elke
  // extra msg = ~50-150 input-tokens.
  private readonly CONTEXT_WINDOW = 20;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly ai: AiService,
    private readonly context: RestaurantContextService,
    private readonly suggestionsService: SuggestionsService,
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
    // Unieke set — zelfde suggestie kan in theorie niet aan meerdere
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
    // frontend meteen de juiste UI-state kan renderen — "Concept
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
      // System bevat profile + menu + persona-rules — bij meerdere
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
    // proposal-loos bericht — de user ziet dan nog steeds Filly's
    // nette antwoord, alleen mist de proposal-knop. Veiliger dan de
    // hele chat-call laten falen.
    const parsed = extractCampaignProposal(answer);
    let messageCard: CampaignProposalCard | null = null;
    let suggestionId: string | null = null;

    if (parsed.proposal) {
      try {
        // We slaan de hele proposal op in suggested_campaign (incl.
        // alle varianten). Approve-flow leest later selected_index
        // en gebruikt die variant voor de campagne-aanmaak.
        const { id } = await this.suggestionsService.createFromChat(
          restaurantId,
          {
            type: parsed.proposal.type,
            name: parsed.proposal.name,
            variants: parsed.proposal.variants,
            selected_index: parsed.proposal.selected_index,
          },
        );
        suggestionId = id;
        messageCard = {
          ...parsed.proposal,
          suggestion_id: id,
        };
      } catch (err) {
        console.error(
          `ai_suggestion-insert gefaald (chat-proposal); chat werkt door zonder kaartje: ${
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
        content: parsed.cleanText,
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

    return {
      userMessage: userMsg as ChatMessage,
      fillyMessage: fillyMsg as ChatMessage,
    };
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
    const [restaurantResult, contextBlock] = await Promise.all([
      this.supabase.client
        .from('restaurants')
        .select('name, type')
        .eq('id', restaurantId)
        .maybeSingle(),
      this.context.buildFullContext(restaurantId),
    ]);

    const restaurant = restaurantResult.data;
    const name = restaurant?.name ?? 'de zaak';
    const type = restaurant?.type ? ` (${restaurant.type})` : '';

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
- VERZIN geen cijfers, gerechten of details. De context hieronder is je enige bron. Als iets ontbreekt, zeg dan "ik weet het niet" of stel een vervolgvraag.
- Refereer alleen aan menu-items die letterlijk in het MENU-blok staan. Bedenk geen gerechten erbij, ook niet als ze "logisch" zouden klinken voor het restaurant-type.

---
ACTIES DIE JE WEL KUNT UITVOEREN

Je kunt een campagne voor de eigenaar aanmaken. Wanneer — en alléén
wanneer — je in je antwoord een concrete, actionable campagne voorstelt
(dus een mail-, social- of whatsapp-bericht waar jij de inhoud al voor
hebt bedacht), sluit je je antwoord af met een speciaal machine-leesbaar
blok. De eigenaar ziet dit blok niet; de frontend toont op basis daarvan
drie varianten naast elkaar zodat hij/zij kan kiezen.

Formaat (LETTERLIJK zo, één paar tags per bericht, één JSON-object met
EXACT 3 varianten):

<<FILLY_PROPOSE_CAMPAIGN>>
{"type":"mail","name":"<korte titel>","variants":[{"subject_line":"<onderwerp v1>","body":"<volledige tekst v1>"},{"subject_line":"<onderwerp v2>","body":"<volledige tekst v2>"},{"subject_line":"<onderwerp v3>","body":"<volledige tekst v3>"}]}
<<END>>

Regels:
- Gebruik het blok ALLEEN als je bericht een uitgewerkte campagne bevat
  (niet bij algemene tips of brainstorm-ideeën).
- Eindig je gewone tekst eerst met een korte vraag als "Ik heb drie
  versies bedacht — kies je favoriet?" zodat de eigenaar weet dat er
  iets komt.
- type = "mail" | "social" | "whatsapp"
- "name" is een korte werknaam (max 60 tekens), bv. "Italiaanse avond mei"
- 3 varianten. Maak ze écht verschillend in toon/insteek/lengte —
  bv. v1 = warm-uitnodigend, v2 = zakelijk-direct, v3 = speels-kort.
  Niet alleen wat woorden anders.
- Verwerk concrete elementen uit PROFIEL en MENU in je voorstellen
  (bv. een signature gerecht, USP, of de specifieke doelgroep) zodat
  de campagne herkenbaar bij DEZE zaak past.
- "subject_line" hoort bij mail; voor social/whatsapp mag je 'm weglaten.
- "body" bevat de volledige uitgeschreven tekst die in de campagne komt.
- Gebruik dubbele aanhalingstekens binnen body door \\" te escapen.
- Schrijf NOOIT het blok als de eigenaar er niet om gevraagd heeft of
  als jij nog aan het brainstormen bent — dat leidt tot ongewenste
  concept-campagnes.

---
CONTEXT — alles wat je weet over deze zaak.
Drie secties, gescheiden door "---":
  1. PROFIEL — identiteit, doelgroep, USPs, faciliteiten, openingstijden, socials.
  2. MENU — alle beschikbare gerechten met prijzen + signature-markers.
  3. Actuele feiten — vandaag, weer, bezetting, reserveringen komende 7 dagen.

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
    let variants: ProposalVariant[] = [];
    if (Array.isArray(parsed.variants)) {
      variants = parsed.variants
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
