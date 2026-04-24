import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  CampaignsService,
  type CampaignType,
} from '../campaigns/campaigns.service';
import { AiService } from '../ai/ai.service';

export type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export type AiSuggestion = {
  id: string;
  trigger_type: string;
  trigger_context: Record<string, unknown> | null;
  suggested_campaign: SuggestedCampaign;
  status: SuggestionStatus;
  rejection_reason: string | null;
  approved_campaign_id: string | null;
  created_at: string;
  acted_at: string | null;
  confidence_score: number | null;
  expected_impact: {
    extra_reservations?: number;
    extra_revenue_cents?: number;
    retention_guests?: number;
  } | null;
  urgency: 'low' | 'medium' | 'high' | null;
  reasoning: string | null;
};

// Structuur van ai_suggestions.suggested_campaign. We zijn hier strikt
// in types omdat de approve-flow straks een campagne uit deze JSON
// bouwt — onbekende velden zouden in een DB-insert-fout lopen.
export type SuggestedCampaign = {
  type?: 'mail' | 'social' | 'whatsapp';
  name?: string;
  subject_line?: string;
  body?: string;
  // Andere velden (hero_photo, dishes, timing) worden in de UI getoond
  // maar zijn optioneel voor de campagne-creatie.
  [key: string]: unknown;
};

@Injectable()
export class SuggestionsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly campaigns: CampaignsService,
    private readonly ai: AiService,
  ) {}

  async findAll(
    restaurantId: string,
    status?: SuggestionStatus,
  ): Promise<AiSuggestion[]> {
    let query = this.supabase.client
      .from('ai_suggestions')
      .select(
        'id, trigger_type, trigger_context, suggested_campaign, status, rejection_reason, approved_campaign_id, created_at, acted_at, confidence_score, expected_impact, urgency, reasoning',
      )
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw new InternalServerErrorException(error.message);
    return (data ?? []) as AiSuggestion[];
  }

  async findById(
    restaurantId: string,
    suggestionId: string,
  ): Promise<AiSuggestion> {
    const { data, error } = await this.supabase.client
      .from('ai_suggestions')
      .select(
        'id, trigger_type, trigger_context, suggested_campaign, status, rejection_reason, approved_campaign_id, created_at, acted_at, confidence_score, expected_impact, urgency, reasoning',
      )
      .eq('id', suggestionId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();

    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException('Suggestie niet gevonden.');
    return data as AiSuggestion;
  }

  // Goedkeur-flow: zet status op approved, maak een campagne aan uit
  // suggested_campaign, koppel approved_campaign_id. Retourneert de
  // bijgewerkte suggestie + het id van de nieuwe campagne zodat de
  // frontend direct kan doorlinken naar /dashboard/campagnes/[id].
  //
  // Transactioneel-achtig: als het aanmaken van de campagne faalt,
  // blijft de suggestie 'pending' (geen half-geupdatete state). Als
  // de status-update faalt nadat de campagne al bestaat, loggen we
  // het probleem maar rollen de campagne niet terug — hij is dan al
  // zichtbaar in /campagnes en kan de gebruiker handmatig doorlopen.
  async approve(
    restaurantId: string,
    suggestionId: string,
  ): Promise<{ suggestion: AiSuggestion; campaignId: string }> {
    const suggestion = await this.findById(restaurantId, suggestionId);

    // Idempotent: als de suggestie al een keer is goedgekeurd (en de
    // campagne bestaat), geven we dezelfde campaignId terug zonder
    // opnieuw aan te maken. Voorkomt dubbele concept-campagnes als
    // de frontend na een navigatie z'n lokale state kwijt is en de
    // user opnieuw op "Goedkeuren" klikt. Stiller dan een error.
    if (
      suggestion.status === 'approved' &&
      suggestion.approved_campaign_id
    ) {
      return {
        suggestion,
        campaignId: suggestion.approved_campaign_id,
      };
    }

    // Afgewezen of verlopen → niet alsnog goedkeuren. User moet
    // eerst handmatig 'Terugzetten op open' doen. Dit is een bewuste
    // beslissingsgrens om stille 're-activations' te voorkomen.
    if (suggestion.status !== 'pending') {
      throw new InternalServerErrorException(
        `Deze suggestie is ${suggestion.status}. Zet 'm eerst terug op open via de Afgewezen-tab.`,
      );
    }

    const sc = suggestion.suggested_campaign ?? {};
    const type = sc.type;
    const name = typeof sc.name === 'string' ? sc.name.trim() : '';

    // Body-fallback-keten: chat-voorstellen hebben 'body' gevuld, maar
    // seed-/auto-gegenereerde suggesties soms alleen 'subject' of
    // 'caption'. In plaats van falen bouwen we een werkbare placeholder
    // op uit wat we wél hebben, aangevuld met de reasoning als context.
    // De eigenaar kan de campagne daarna editen op de concept-pagina.
    const rawBody =
      typeof sc.body === 'string' && sc.body.trim().length > 0
        ? sc.body.trim()
        : typeof sc.caption === 'string' && sc.caption.trim().length > 0
          ? (sc.caption as string).trim()
          : '';

    const rawSubject =
      typeof sc.subject_line === 'string' &&
      sc.subject_line.trim().length > 0
        ? sc.subject_line.trim()
        : typeof sc.subject === 'string' &&
            (sc.subject as string).trim().length > 0
          ? (sc.subject as string).trim()
          : '';

    // Als er geen body is, vallen we terug op het onderwerp + reasoning
    // zodat de concept-campagne tenminste iets leesbaars bevat om vanuit
    // te werken.
    const body =
      rawBody ||
      [rawSubject, suggestion.reasoning]
        .filter((x): x is string => typeof x === 'string' && x.length > 0)
        .join('\n\n') ||
      'Deze campagne is nog niet inhoudelijk uitgewerkt — klik op bewerken om de tekst toe te voegen.';

    if (
      (type !== 'mail' && type !== 'social' && type !== 'whatsapp') ||
      !name
    ) {
      throw new InternalServerErrorException(
        'Suggestie mist type of naam. Kan niet omzetten naar campagne.',
      );
    }

    const subject_line = rawSubject || null;

    // Campagne aanmaken als concept. CampaignsService rolt zelf terug
    // bij content-insert-fout; hier hoeven we daar niet nog een laag
    // omheen.
    const { id: campaignId } = await this.campaigns.create(restaurantId, {
      name,
      type: type as CampaignType,
      subject_line,
      body,
    });

    // Suggestie naar approved + FK koppelen.
    const { data: updated, error: updateErr } = await this.supabase.client
      .from('ai_suggestions')
      .update({
        status: 'approved',
        acted_at: new Date().toISOString(),
        approved_campaign_id: campaignId,
      })
      .eq('id', suggestionId)
      .eq('restaurant_id', restaurantId)
      .select(
        'id, trigger_type, trigger_context, suggested_campaign, status, rejection_reason, approved_campaign_id, created_at, acted_at, confidence_score, expected_impact, urgency, reasoning',
      )
      .single();

    if (updateErr) throw new InternalServerErrorException(updateErr.message);

    return { suggestion: updated as AiSuggestion, campaignId };
  }

  async updateStatus(
    restaurantId: string,
    suggestionId: string,
    status: SuggestionStatus,
    rejectionReason?: string,
  ): Promise<AiSuggestion> {
    const updates: Record<string, unknown> = {
      status,
      acted_at: new Date().toISOString(),
    };
    if (rejectionReason !== undefined) {
      updates.rejection_reason = rejectionReason;
    }

    const { data, error } = await this.supabase.client
      .from('ai_suggestions')
      .update(updates)
      .eq('id', suggestionId)
      .eq('restaurant_id', restaurantId)
      .select(
        'id, trigger_type, trigger_context, suggested_campaign, status, rejection_reason, approved_campaign_id, created_at, acted_at, confidence_score, expected_impact, urgency, reasoning',
      )
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    return data as AiSuggestion;
  }

  // Laat Filly de inhoud van een pending-suggestie aanpassen op basis
  // van een instructie van de eigenaar. Voorbeeld: "maak de sfeer
  // huiselijker" of "gebruik een korter onderwerp". Retourneert de
  // bijgewerkte suggested_campaign zodat de frontend direct kan
  // renderen zonder extra fetch. De user blijft in control: de
  // suggestie verplaatst niet van status (blijft pending), je beslist
  // later of je 'm goedkeurt.
  async refine(
    restaurantId: string,
    suggestionId: string,
    instruction: string,
  ): Promise<AiSuggestion> {
    const trimmed = instruction.trim();
    if (!trimmed) {
      throw new BadRequestException(
        'Geef aan wat Filly moet aanpassen (bv. "huiselijker" of "korter onderwerp").',
      );
    }
    if (trimmed.length > 1000) {
      throw new BadRequestException(
        'Aanpassings-instructie mag maximaal 1000 tekens zijn.',
      );
    }

    const suggestion = await this.findById(restaurantId, suggestionId);
    if (suggestion.status !== 'pending') {
      throw new BadRequestException(
        `Alleen open voorstellen zijn te bewerken (deze is ${suggestion.status}).`,
      );
    }

    const sc = suggestion.suggested_campaign ?? {};
    const currentType =
      typeof sc.type === 'string' ? (sc.type as string) : 'mail';
    const currentName =
      typeof sc.name === 'string' ? (sc.name as string) : '';
    const currentSubject =
      typeof sc.subject_line === 'string' && sc.subject_line
        ? (sc.subject_line as string)
        : typeof sc.subject === 'string'
          ? (sc.subject as string)
          : '';
    const currentBody =
      typeof sc.body === 'string' && sc.body
        ? (sc.body as string)
        : typeof sc.caption === 'string'
          ? (sc.caption as string)
          : '';

    // System-prompt voor de refine-call. Claude krijgt de huidige
    // campagne-structuur + de user-instructie en moet een volledige
    // nieuwe versie teruggeven in hetzelfde JSON-formaat. Zo blijft
    // de data-shape consistent (belangrijk voor approve-flow straks).
    const systemPrompt = `Je bent Filly, een AI-marketingassistent voor de horeca. Je past een bestaande campagne aan volgens de instructie van de eigenaar.

Geef ALTIJD exact dit JSON-formaat terug, zonder markdown-codeblok, zonder uitleg eromheen:

{
  "name": "<korte werknaam, max 60 tekens>",
  "type": "mail" | "social" | "whatsapp",
  "subject_line": "<alleen bij mail, anders weglaten>",
  "body": "<volledige uitgeschreven tekst>"
}

Regels:
- Behoud het type van de campagne tenzij de instructie expliciet vraagt om te wisselen.
- Schrijf in het Nederlands.
- Geen dubbele aanhalingstekens in de body tenzij geëscaped met \\".
- Verzin geen cijfers of feiten die niet in de oorspronkelijke versie stonden.`;

    const currentPayload = JSON.stringify(
      {
        name: currentName,
        type: currentType,
        subject_line: currentSubject || undefined,
        body: currentBody,
      },
      null,
      2,
    );

    const userPrompt = `Huidige campagne:\n${currentPayload}\n\nInstructie van de eigenaar:\n${trimmed}\n\nGeef de volledige nieuwe versie van de campagne.`;

    const answer = await this.ai.generateText({
      system: systemPrompt,
      prompt: userPrompt,
      model: 'claude-sonnet-4-6',
      maxTokens: 1200,
      meta: {
        restaurantId,
        feature: 'suggestion_refine',
      },
    });

    // Parse het antwoord. Als Claude er per ongeluk markdown omheen
    // plakt, halen we het eerste { ... }-blok eruit. Bij parse-fout:
    // niet crashen, gebruik de oude versie als fallback en gooi een
    // begrijpelijke fout naar de caller.
    const match = answer.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new InternalServerErrorException(
        'Filly gaf geen leesbaar antwoord. Probeer een andere instructie.',
      );
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      throw new InternalServerErrorException(
        'Kon Filly\'s antwoord niet lezen. Probeer het opnieuw.',
      );
    }

    const newName =
      typeof parsed.name === 'string' && parsed.name.trim().length > 0
        ? parsed.name.trim().slice(0, 120)
        : currentName;
    const newType =
      parsed.type === 'mail' ||
      parsed.type === 'social' ||
      parsed.type === 'whatsapp'
        ? parsed.type
        : currentType;
    const newBody =
      typeof parsed.body === 'string' && parsed.body.trim().length > 0
        ? parsed.body.trim()
        : currentBody;
    const newSubject =
      typeof parsed.subject_line === 'string' &&
      parsed.subject_line.trim().length > 0
        ? parsed.subject_line.trim().slice(0, 200)
        : undefined;

    const newSuggested: SuggestedCampaign = {
      ...sc,
      name: newName,
      type: newType as SuggestedCampaign['type'],
      body: newBody,
      subject_line: newSubject,
    };

    const { data: updated, error: updErr } = await this.supabase.client
      .from('ai_suggestions')
      .update({ suggested_campaign: newSuggested })
      .eq('id', suggestionId)
      .eq('restaurant_id', restaurantId)
      .select(
        'id, trigger_type, trigger_context, suggested_campaign, status, rejection_reason, approved_campaign_id, created_at, acted_at, confidence_score, expected_impact, urgency, reasoning',
      )
      .single();

    if (updErr) throw new InternalServerErrorException(updErr.message);
    return updated as AiSuggestion;
  }

  // Maakt een nieuwe suggestie aan. Wordt gebruikt door ChatService
  // wanneer Filly een campagne-voorstel doet in een gesprek. Retourneert
  // de id zodat de caller 'm kan koppelen aan het chat-bericht
  // (chat_messages.ai_suggestion_id).
  async createFromChat(
    restaurantId: string,
    suggested: SuggestedCampaign,
  ): Promise<{ id: string }> {
    const { data, error } = await this.supabase.client
      .from('ai_suggestions')
      .insert({
        restaurant_id: restaurantId,
        trigger_type: 'chat',
        suggested_campaign: suggested,
        status: 'pending',
      })
      .select('id')
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    return { id: data.id as string };
  }
}
