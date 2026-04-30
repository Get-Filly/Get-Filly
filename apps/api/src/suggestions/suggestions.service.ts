import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { SupabaseService } from '../supabase/supabase.service';
import {
  CampaignsService,
  type CampaignType,
} from '../campaigns/campaigns.service';
import { AiService } from '../ai/ai.service';
import { RestaurantContextService } from '../ai/restaurant-context.service';

// JSON-schema voor de suggestion-refine tool. Forceert dat Claude
// een geldige campagne-shape teruggeeft (type uit de 3 enum-waarden,
// geen verzonnen velden, geen markdown-codeblok-rest).
const SUGGESTION_REFINE_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    type: { type: 'string', enum: ['mail', 'social', 'whatsapp'] },
    subject_line: { type: 'string' },
    body: { type: 'string' },
  },
  required: ['type', 'body'],
} as const satisfies Anthropic.Tool.InputSchema;

type RefinedCampaignFromTool = {
  name?: string;
  type: 'mail' | 'social' | 'whatsapp';
  subject_line?: string;
  body: string;
};

// Schema voor proposal-details: hoofdgerecht + bijgerechten + timing
// + bundle-prijs + hero-foto. Maakt een suggestie tastbaar — eigenaar
// ziet niet alleen "comfort food campagne" maar ook "Rundersukade
// €18,95 met aardappelpuree, rode kool, spruitjes als 3-gangen €24,50".
//
// Het 'source'-veld op elk dish-object dwingt Claude expliciet aan te
// geven of een gerecht uit de bestaande menukaart komt OF een nieuwe
// suggestie is — voorkomt dat Filly stilletjes namen verzint die niet
// op de kaart staan.
const PROPOSAL_DETAILS_SCHEMA = {
  type: 'object',
  properties: {
    main_dish: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        source: { type: 'string', enum: ['menu', 'new'] },
        price_cents: { type: 'integer' },
      },
      required: ['name', 'description', 'source'],
    },
    sides: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          source: { type: 'string', enum: ['menu', 'new'] },
          price_cents: { type: 'integer' },
        },
        required: ['name', 'description', 'source'],
      },
    },
    timing: { type: 'string' },
    price_bundle_cents: { type: 'integer' },
    price_bundle_label: { type: 'string' },
    hero_image: {
      type: 'object',
      properties: {
        emoji: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['emoji', 'description'],
    },
  },
  // Niets verplicht — een suggestie kan ook prima bestaan zonder
  // bundel-prijs of zonder bijgerechten (bv. een social-post zonder
  // gerecht-context).
} as const satisfies Anthropic.Tool.InputSchema;

type ProposalDetailsFromTool = {
  main_dish?: {
    name: string;
    description: string;
    source: 'menu' | 'new';
    price_cents?: number;
  };
  sides?: Array<{
    name: string;
    description: string;
    source: 'menu' | 'new';
    price_cents?: number;
  }>;
  timing?: string;
  price_bundle_cents?: number;
  price_bundle_label?: string;
  hero_image?: {
    emoji: string;
    description: string;
  };
};

// Public-shape die de UI (camelCase) verwacht. Verschilt van de
// tool-shape (snake_case voor consistentie met Anthropic-conventies).
export type ProposalDetails = {
  mainDish?: {
    name: string;
    description: string;
    source: 'menu' | 'new';
    priceCents?: number;
  };
  sides?: Array<{
    name: string;
    description: string;
    source: 'menu' | 'new';
    priceCents?: number;
  }>;
  timing?: string;
  priceBundleCents?: number;
  priceBundleLabel?: string;
  heroImage?: {
    emoji: string;
    description: string;
  };
};

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

// Structuur van ai_suggestions.suggested_campaign. We ondersteunen
// twee shapes:
//   - Nieuw (sinds 3-varianten-flow): variants[] + selected_index
//   - Legacy: directe subject_line/body (voor seed-data en oudere
//     suggestion-rijen)
// Approve- en refine-logic checken eerst variants[], vallen anders
// terug op de legacy-velden.
export type SuggestedCampaign = {
  type?: 'mail' | 'social' | 'whatsapp';
  name?: string;
  // Nieuwe shape: max 3 alternatieven naast elkaar.
  variants?: Array<{
    subject_line?: string;
    body?: string;
  }>;
  selected_index?: number;
  // Legacy single-body shape (blijft bestaan voor seed-data).
  subject_line?: string;
  subject?: string;
  caption?: string;
  body?: string;
  segment?: string;
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
    // Voor de proposal-details-call: Filly heeft profile + menu-block
    // nodig zodat hij kan refereren aan échte gerechten met échte
    // prijzen ipv generieke "lekker comfort food"-tekst.
    private readonly context: RestaurantContextService,
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

  // Genereert de proposal-details voor één suggestie: hoofdgerecht +
  // bijgerechten + timing + bundle-prijs + hero-foto. Maakt een
  // suggestie tastbaar voor de eigenaar in de detail-modal.
  //
  // Cache: na 1× generation slaan we het resultaat op in
  // `suggested_campaign.proposal_details`. Volgende keer dat de modal
  // opent → 0 Claude-calls. Cache wordt ongeldig als de eigenaar de
  // campagne aanpast (refine-flow), want dan komt er een ander
  // hoofdgerecht-voorstel bij passen.
  async getProposalDetails(
    restaurantId: string,
    suggestionId: string,
  ): Promise<ProposalDetails> {
    const suggestion = await this.findById(restaurantId, suggestionId);

    // Cache-hit: eerder gegenereerd, geen Claude-call nodig.
    const cached = (suggestion.suggested_campaign as SuggestedCampaign)
      .proposal_details as ProposalDetails | undefined;
    if (cached && cached.mainDish) {
      return cached;
    }

    // Bouw rijke context: profile (sfeer/USPs/doelgroep) + menu
    // (echte gerechten met prijzen) + live-block (huidige bezetting,
    // weer) zodat Filly's voorstel past bij DEZE zaak op DIT moment.
    const [profileBlock, menuBlock] = await Promise.all([
      this.context.buildProfileBlock(restaurantId).catch(() => ''),
      this.context.buildMenuBlock(restaurantId).catch(() => ''),
    ]);

    const sc = suggestion.suggested_campaign;
    const campaignSnapshot = JSON.stringify(
      {
        type: sc.type,
        name: sc.name,
        body: sc.body || sc.variants?.[0]?.body,
        subject: sc.subject_line || sc.subject || sc.variants?.[0]?.subject_line,
      },
      null,
      2,
    );

    const systemPrompt = `Je bent Filly. Je krijgt een campagne-voorstel voor een specifiek restaurant en moet het concreet maken: welk hoofdgerecht past, welke bijgerechten, welk tijdstip, welke bundle-prijs, welke foto.

Je antwoord komt via de tool 'build_proposal_details'. Vul de tool-args in met een tastbare invulling van het voorstel.

Inhoudsregels:
- Schrijf in het Nederlands. Match de brand_tone uit het profiel.
- main_dish en sides: GEBRUIK BIJ VOORKEUR gerechten uit MENU (zie context). Zet source='menu' en pak de échte naam, beschrijving en prijs uit MENU.
- Alleen als geen passend menu-gerecht beschikbaar is, mag je een nieuw gerecht voorstellen met source='new'. Beschrijf het concreet (ingrediënten, bereiding) zodat de eigenaar weet wat hij zou koken.
- Maximaal 3 bijgerechten/sides. Geen losse drankjes als sides — alleen bij eet-gerechten relevant.
- timing: korte zin met dag(en) + tijdstip ("Donderdag t/m zondag · 17:00–22:00").
- price_bundle_cents: optioneel — alleen als een 2- of 3-gangen-bundel logisch is bij dit voorstel. In centen.
- price_bundle_label: zoals "3-gangen menu" of "2-gangen lunch". Korte tekst.
- hero_image: een passende emoji (1 stuk) + een korte fotoregie-beschrijving (max 100 tekens) die een fotograaf zou kunnen gebruiken. Géén foto-URL — die maken we later via een image-API.
- Als het voorstel een social-only post is zonder gerecht-context, mag je main_dish/sides leeg laten en alleen timing + hero_image vullen.

---
CONTEXT — alles wat je weet over deze zaak:

${profileBlock}

${menuBlock}
---`;

    const userPrompt = `Campagne-voorstel:
${campaignSnapshot}

Maak dit tastbaar volgens de regels.`;

    const raw = await this.ai.generateStructured<ProposalDetailsFromTool>({
      system: systemPrompt,
      prompt: userPrompt,
      model: 'claude-sonnet-4-6',
      maxTokens: 1500,
      toolName: 'build_proposal_details',
      toolDescription:
        'Bouw een tastbare invulling van een campagne-voorstel: hoofdgerecht, bijgerechten, timing, bundle-prijs en hero-foto-suggestie.',
      inputSchema: PROPOSAL_DETAILS_SCHEMA,
      meta: {
        restaurantId,
        feature: 'suggestion_proposal_details',
      },
      // Profile + menu in system-prompt → caching pakt korting bij
      // her-bezoek of bij meerdere suggesties achter elkaar bekijken.
      cacheSystem: true,
    });

    const proposal = toProposalDetails(raw);

    // Cache schrijven. We mergen 'm in de bestaande suggested_campaign-
    // jsonb zodat alle andere velden (variants, body, etc) ongewijzigd
    // blijven. Stille fail: als update flakes, retourneer toch het
    // resultaat — de eigenaar ziet 'm gewoon, alleen volgende keer
    // wordt 'ie opnieuw berekend.
    const updatedCampaign: SuggestedCampaign = {
      ...sc,
      proposal_details: proposal,
    };
    await this.supabase.client
      .from('ai_suggestions')
      .update({ suggested_campaign: updatedCampaign })
      .eq('id', suggestionId)
      .eq('restaurant_id', restaurantId);

    return proposal;
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

    // Variant-shape (nieuw, sinds 3-varianten-flow) wint van legacy.
    // Pak geselecteerde variant; als selected_index out-of-range is,
    // val terug op 0 zodat we niet falen op corrupte state.
    let variantBody = '';
    let variantSubject = '';
    if (Array.isArray(sc.variants) && sc.variants.length > 0) {
      const idx =
        typeof sc.selected_index === 'number' &&
        sc.selected_index >= 0 &&
        sc.selected_index < sc.variants.length
          ? sc.selected_index
          : 0;
      const variant = sc.variants[idx] ?? {};
      variantBody =
        typeof variant.body === 'string' ? variant.body.trim() : '';
      variantSubject =
        typeof variant.subject_line === 'string'
          ? variant.subject_line.trim()
          : '';
    }

    // Body-fallback-keten: variant → body → caption (legacy seed).
    // Plaats een werkbare placeholder op als alles leeg is, aangevuld
    // met reasoning als context, zodat de eigenaar in concept-edit
    // kan voortbouwen.
    const rawBody =
      variantBody ||
      (typeof sc.body === 'string' && sc.body.trim().length > 0
        ? sc.body.trim()
        : typeof sc.caption === 'string' && sc.caption.trim().length > 0
          ? (sc.caption as string).trim()
          : '');

    const rawSubject =
      variantSubject ||
      (typeof sc.subject_line === 'string' &&
      sc.subject_line.trim().length > 0
        ? sc.subject_line.trim()
        : typeof sc.subject === 'string' &&
            (sc.subject as string).trim().length > 0
          ? (sc.subject as string).trim()
          : '');

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

  // Selecteer welke variant de gebruiker als favoriet markeert.
  // Schrijft alleen selected_index naar de DB, behoudt de andere
  // varianten zodat user nog kan terugswitchen vóór goedkeuring.
  async selectVariant(
    restaurantId: string,
    suggestionId: string,
    index: number,
  ): Promise<AiSuggestion> {
    if (!Number.isInteger(index) || index < 0) {
      throw new BadRequestException('Variant-index moet een positief getal zijn.');
    }

    const suggestion = await this.findById(restaurantId, suggestionId);
    const sc = suggestion.suggested_campaign ?? {};
    const variants = Array.isArray(sc.variants) ? sc.variants : [];
    if (index >= variants.length) {
      throw new BadRequestException(
        `Geen variant op index ${index}; deze suggestie heeft er ${variants.length}.`,
      );
    }

    const newSc: SuggestedCampaign = { ...sc, selected_index: index };
    const { data: updated, error: updErr } = await this.supabase.client
      .from('ai_suggestions')
      .update({ suggested_campaign: newSc })
      .eq('id', suggestionId)
      .eq('restaurant_id', restaurantId)
      .select(
        'id, trigger_type, trigger_context, suggested_campaign, status, rejection_reason, approved_campaign_id, created_at, acted_at, confidence_score, expected_impact, urgency, reasoning',
      )
      .single();

    if (updErr) throw new InternalServerErrorException(updErr.message);
    return updated as AiSuggestion;
  }

  // Laat Filly de inhoud van een pending-suggestie aanpassen op basis
  // van een instructie van de eigenaar. Voorbeeld: "maak de sfeer
  // huiselijker" of "gebruik een korter onderwerp". Bij multi-variant
  // suggesties wordt alleen de geselecteerde variant herschreven —
  // de andere blijven beschikbaar voor terugschakelen. Retourneert
  // de bijgewerkte suggested_campaign zodat de frontend direct kan
  // renderen zonder extra fetch.
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

    // Multi-variant: pak geselecteerde variant. Legacy: pak directe
    // velden. We werken altijd op één variant tegelijk — gebruiker
    // kan ander variant kiezen vóór 'ie hier komt.
    const variants = Array.isArray(sc.variants) ? sc.variants : [];
    const selectedIdx =
      typeof sc.selected_index === 'number' &&
      sc.selected_index >= 0 &&
      sc.selected_index < variants.length
        ? sc.selected_index
        : 0;
    const selectedVariant = variants[selectedIdx];

    const currentSubject = selectedVariant?.subject_line
      ? (selectedVariant.subject_line as string)
      : typeof sc.subject_line === 'string' && sc.subject_line
        ? (sc.subject_line as string)
        : typeof sc.subject === 'string'
          ? (sc.subject as string)
          : '';
    const currentBody = selectedVariant?.body
      ? (selectedVariant.body as string)
      : typeof sc.body === 'string' && sc.body
        ? (sc.body as string)
        : typeof sc.caption === 'string'
          ? (sc.caption as string)
          : '';

    // System-prompt voor de refine-call. Tool-use forceert het JSON-
    // schema, dus we hoeven de structuur hier niet meer in tekst uit
    // te leggen — alleen de inhoudelijke regels blijven.
    const systemPrompt = `Je bent Filly, een AI-marketingassistent voor de horeca. Je past een bestaande campagne aan volgens de instructie van de eigenaar.

Je antwoord komt via de tool 'refine_campaign'. Vul de tool-args in met de volledige nieuwe versie van de campagne.

Inhoudsregels:
- Behoud het type van de campagne tenzij de instructie expliciet vraagt om te wisselen.
- Schrijf in het Nederlands.
- Verzin geen cijfers of feiten die niet in de oorspronkelijke versie stonden.
- Bij type=mail vul je ook subject_line; bij social/whatsapp laat je subject_line weg.`;

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

    const parsed = await this.ai.generateStructured<RefinedCampaignFromTool>({
      system: systemPrompt,
      prompt: userPrompt,
      model: 'claude-sonnet-4-6',
      maxTokens: 1500,
      toolName: 'refine_campaign',
      toolDescription:
        'Lever de aangepaste campagne aan op basis van de instructie van de eigenaar.',
      inputSchema: SUGGESTION_REFINE_SCHEMA,
      meta: {
        restaurantId,
        feature: 'suggestion_refine',
      },
    });

    // Schema garandeert al dat type een geldige enum is en body/type
    // aanwezig zijn. Wij voegen alleen de fallbacks toe op velden die
    // optioneel zijn én lengte-caps voor DB-veiligheid.
    const newName =
      parsed.name && parsed.name.trim().length > 0
        ? parsed.name.trim().slice(0, 120)
        : currentName;
    const newType = parsed.type;
    const newBody =
      parsed.body.trim().length > 0 ? parsed.body.trim() : currentBody;
    const newSubject =
      parsed.subject_line && parsed.subject_line.trim().length > 0
        ? parsed.subject_line.trim().slice(0, 200)
        : undefined;

    // Twee paden: bij multi-variant overschrijven we de geselecteerde
    // variant en behouden de andere. Bij legacy (geen variants) maken
    // we direct de body/subject_line top-level bij. Naam + type werken
    // we sowieso top-level bij omdat ze niet variant-specifiek zijn.
    let newSuggested: SuggestedCampaign;
    if (variants.length > 0) {
      const newVariants = [...variants];
      newVariants[selectedIdx] = {
        ...newVariants[selectedIdx],
        body: newBody,
        subject_line: newSubject,
      };
      newSuggested = {
        ...sc,
        name: newName,
        type: newType as SuggestedCampaign['type'],
        variants: newVariants,
      };
    } else {
      newSuggested = {
        ...sc,
        name: newName,
        type: newType as SuggestedCampaign['type'],
        body: newBody,
        subject_line: newSubject,
      };
    }

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

  // Maakt een nieuwe suggestie aan vanuit een chat-proposal. Accepteert
  // de hele suggested_campaign-shape (incl. variants) zodat we niets
  // verliezen tussen parser en DB. Retourneert de id zodat de caller
  // 'm kan koppelen aan het chat-bericht (chat_messages.ai_suggestion_id).
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

// Converteert de tool-shape (snake_case zoals Anthropic-conventie
// voorschrijft voor JSON-schema's) naar de UI-shape (camelCase zoals
// we elders in de frontend gebruiken). Filters lege strings + caps
// price_cents op niet-negatieve integers als safety-net.
function toProposalDetails(raw: ProposalDetailsFromTool): ProposalDetails {
  const trim = (s?: string) =>
    s && s.trim().length > 0 ? s.trim() : undefined;
  const safePrice = (p?: number) =>
    typeof p === 'number' && p >= 0 ? Math.round(p) : undefined;

  const out: ProposalDetails = {};

  if (raw.main_dish && raw.main_dish.name?.trim()) {
    out.mainDish = {
      name: raw.main_dish.name.trim(),
      description: raw.main_dish.description?.trim() ?? '',
      source: raw.main_dish.source,
      priceCents: safePrice(raw.main_dish.price_cents),
    };
  }

  if (raw.sides && raw.sides.length > 0) {
    const sides = raw.sides
      .filter((s) => s.name?.trim())
      .map((s) => ({
        name: s.name.trim(),
        description: s.description?.trim() ?? '',
        source: s.source,
        priceCents: safePrice(s.price_cents),
      }));
    if (sides.length > 0) out.sides = sides;
  }

  out.timing = trim(raw.timing);
  out.priceBundleCents = safePrice(raw.price_bundle_cents);
  out.priceBundleLabel = trim(raw.price_bundle_label);

  if (raw.hero_image && raw.hero_image.emoji?.trim()) {
    out.heroImage = {
      emoji: raw.hero_image.emoji.trim(),
      description: raw.hero_image.description?.trim() ?? '',
    };
  }

  return out;
}
