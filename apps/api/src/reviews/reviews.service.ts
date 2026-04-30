import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { SupabaseService } from '../supabase/supabase.service';
import { AiService } from '../ai/ai.service';
import { RestaurantContextService } from '../ai/restaurant-context.service';
import { AuditLogService } from '../common/audit-log.service';

// Schema voor de 3-varianten-tool. minItems/maxItems forceert
// precies 3 alternatieven — Claude kan er geen 1 of 5 maken.
const REVIEW_REPLY_VARIANTS_SCHEMA = {
  type: 'object',
  properties: {
    variants: {
      type: 'array',
      items: { type: 'string' },
      minItems: 3,
      maxItems: 3,
    },
  },
  required: ['variants'],
} as const satisfies Anthropic.Tool.InputSchema;

type ReviewReplyVariantsFromTool = {
  variants: string[];
};

export type ReviewSource = 'google' | 'tripadvisor' | 'thefork' | 'iens';

export type Review = {
  id: string;
  source: ReviewSource;
  rating: number;
  title: string | null;
  body: string | null;
  author: string | null;
  review_date: string | null;
  response_text: string | null;
  responded_at: string | null;
};

@Injectable()
export class ReviewsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly ai: AiService,
    // RestaurantContextService levert het profile-block (USPs, tagline,
    // sfeer, doelgroep, signature dishes etc). Filly gebruikt dat om
    // het review-antwoord echt bij DEZE zaak te laten passen i.p.v.
    // generieke "bedankt-voor-uw-bezoek"-tekst.
    private readonly context: RestaurantContextService,
    private readonly audit: AuditLogService,
  ) {}

  async findAll(restaurantId: string): Promise<Review[]> {
    const { data, error } = await this.supabase.client
      .from('reviews')
      .select(
        'id, source, rating, title, body, author, review_date, response_text, responded_at',
      )
      .eq('restaurant_id', restaurantId)
      .order('review_date', { ascending: false });

    if (error) throw new InternalServerErrorException(error.message);
    return (data ?? []) as Review[];
  }

  // Genereert een reply-voorstel via Claude. We scopen bewust op BEIDE
  // id's (review-id + restaurant-id) in de DB-query — zo kan een
  // kwaadwillende gebruiker niet iemand anders zijn review-id opsturen
  // en een suggestie afdwingen met zijn eigen X-Restaurant-Id header.
  // De tenant-isolation zit dus niet alleen in de guard, maar ook in
  // de query zelf: defense-in-depth.
  async generateReplySuggestion(
    restaurantId: string,
    reviewId: string,
    userId: string,
  ): Promise<{ suggestion: string }> {
    const { data: review, error: reviewErr } = await this.supabase.client
      .from('reviews')
      .select('id, source, rating, title, body, author')
      .eq('id', reviewId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();

    if (reviewErr) throw new InternalServerErrorException(reviewErr.message);
    if (!review) throw new NotFoundException('Review niet gevonden.');

    // Volledig profile-block ophalen: naam, type, USPs, tagline, sfeer,
    // doelgroep, signature dishes, brand_tone. Filly weet zo welke
    // toon hij moet aanslaan en kan in zijn reactie iets specifieks
    // noemen ("fijn dat je onze open keuken zo hebt ervaren") als de
    // gast iets aanstipt dat in het profiel staat.
    const profileBlock = await this.context.buildProfileBlock(restaurantId);
    if (!profileBlock) {
      throw new NotFoundException('Restaurant niet gevonden.');
    }

    const systemPrompt = buildReviewReplySystemPrompt(profileBlock);
    const userPrompt = buildReviewReplyUserPrompt(review);

    const suggestion = await this.ai.generateText({
      system: systemPrompt,
      prompt: userPrompt,
      // Sonnet 4.6 is hier de juiste keus — reply moet genuanceerd zijn,
      // toon-register raken, en iets van empathie tonen bij kritiek.
      // Haiku zou voor 5-sterren-bedankjes kunnen, maar we houden het
      // consistent voor nu.
      model: 'claude-sonnet-4-6',
      maxTokens: 400,
      meta: {
        restaurantId,
        userId,
        feature: 'review_reply',
      },
    });

    return { suggestion: suggestion.trim() };
  }

  // Lees gecachte filly-varianten voor een review. Géén generatie —
  // alleen state lezen. Frontend gebruikt dit bij modal-open om te
  // bepalen of er al een set staat (=> tonen) of dat er gegenereerd
  // moet (=> POST /refine).
  async getVariants(
    restaurantId: string,
    reviewId: string,
  ): Promise<{
    variants: string[];
    regenerate_count: number;
    can_regenerate: boolean;
  }> {
    const { data, error } = await this.supabase.client
      .from('reviews')
      .select('filly_variants, filly_variants_regen_count')
      .eq('id', reviewId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();

    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException('Review niet gevonden.');

    const variants = Array.isArray(data.filly_variants)
      ? (data.filly_variants as string[]).filter(
          (v): v is string => typeof v === 'string',
        )
      : [];
    const regenerate_count =
      typeof data.filly_variants_regen_count === 'number'
        ? data.filly_variants_regen_count
        : 0;
    return {
      variants,
      regenerate_count,
      can_regenerate: regenerate_count < 2,
    };
  }

  // Genereert 3 alternatieve reactie-versies voor een review en
  // cachet ze. count=0 → 3 nieuwe; count=1 → 3 extra (totaal 6);
  // count>=2 → BadRequest (kostenbeheersing).
  async refineVariants(
    restaurantId: string,
    reviewId: string,
    userId: string,
  ): Promise<{
    variants: string[];
    regenerate_count: number;
    can_regenerate: boolean;
  }> {
    const { data: review, error: reviewErr } = await this.supabase.client
      .from('reviews')
      .select(
        'id, source, rating, title, body, author, filly_variants, filly_variants_regen_count',
      )
      .eq('id', reviewId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();

    if (reviewErr) throw new InternalServerErrorException(reviewErr.message);
    if (!review) throw new NotFoundException('Review niet gevonden.');

    const currentCount =
      typeof review.filly_variants_regen_count === 'number'
        ? review.filly_variants_regen_count
        : 0;
    if (currentCount >= 2) {
      throw new BadRequestException(
        'Maximum aantal generaties bereikt voor deze review (3 + 3 = 6).',
      );
    }
    const existingVariants = Array.isArray(review.filly_variants)
      ? (review.filly_variants as string[]).filter(
          (v): v is string => typeof v === 'string',
        )
      : [];

    // Volledig profile-block voor toon-match + restaurant-identiteit.
    // Zelfde context als bij de single-suggestion call, zodat alle
    // varianten consistent klinken met de zaak.
    const profileBlock = await this.context.buildProfileBlock(restaurantId);
    if (!profileBlock) {
      throw new NotFoundException('Restaurant niet gevonden.');
    }

    // System-prompt: vraag 3 alternatieven via tool-use. Schema dwingt
    // precies 3 strings af in de variants-array.
    const baseSystem = buildReviewReplySystemPrompt(profileBlock);
    const systemPrompt = `${baseSystem}

EXTRA-REGEL VOOR DEZE CALL: lever je antwoord via de tool 'generate_review_reply_variants'. Geef precies 3 verschillende reacties — bv. v1 warm-empathisch, v2 zakelijk-direct, v3 kort-praktisch. Niet alleen wat woorden anders.`;

    const userPrompt = buildReviewReplyUserPrompt(review);

    const parsed =
      await this.ai.generateStructured<ReviewReplyVariantsFromTool>({
        system: systemPrompt,
        prompt: userPrompt,
        model: 'claude-sonnet-4-6',
        maxTokens: 1500,
        toolName: 'generate_review_reply_variants',
        toolDescription:
          'Lever 3 verschillende reactie-varianten op de gegeven review met onderling andere tonen.',
        inputSchema: REVIEW_REPLY_VARIANTS_SCHEMA,
        meta: {
          restaurantId,
          userId,
          feature: 'review_reply_variants',
        },
        // System bevat profile-block — bij 1× regenerate binnen 5 min
        // pakt caching ~90% korting.
        cacheSystem: true,
      });

    // Schema heeft minItems=3 maxItems=3, maar we zeven nog wel
    // lege strings eruit voor het geval Claude ergens "" heeft staan.
    const newVariants = parsed.variants
      .map((v) => v.trim())
      .filter((v) => v.length > 0);

    if (newVariants.length === 0) {
      throw new InternalServerErrorException(
        'Filly leverde geen bruikbare alternatieven. Probeer opnieuw.',
      );
    }

    // Append + count++. Defensieve cap op 6 totaal.
    const newAll = [...existingVariants, ...newVariants].slice(0, 6);
    const newCount = currentCount + 1;

    const { error: updErr } = await this.supabase.client
      .from('reviews')
      .update({
        filly_variants: newAll,
        filly_variants_regen_count: newCount,
      })
      .eq('id', reviewId)
      .eq('restaurant_id', restaurantId);
    if (updErr) throw new InternalServerErrorException(updErr.message);

    return {
      variants: newAll,
      regenerate_count: newCount,
      can_regenerate: newCount < 2,
    };
  }

  // Slaat het uiteindelijke antwoord op. De gebruiker kan de AI-suggestie
  // hebben overgenomen óf handmatig iets hebben ingetypt — deze functie
  // weet dat niet en boeit ook niet: we slaan gewoon op wat hij uiteindelijk
  // wil publiceren. Publicatie naar Google/Tripadvisor/etc. is later
  // werk (OAuth + platform-specifieke API's); voor nu is dit puur
  // opslaan in onze DB.
  async updateResponse(
    restaurantId: string,
    reviewId: string,
    responseText: string,
    userId: string,
  ): Promise<Review> {
    const trimmed = responseText.trim();
    if (!trimmed) {
      throw new BadRequestException('Antwoord mag niet leeg zijn.');
    }
    if (trimmed.length > 5000) {
      throw new BadRequestException('Antwoord is te lang (max 5000 tekens).');
    }

    // Weer dubbel scopen op review-id + restaurant-id. Als de update
    // 0 rijen raakt (id bestaat niet of hoort bij andere tenant) dan
    // geeft Supabase geen error maar wel een lege data-array — daarom
    // gebruiken we .select().single() achteraan om dat te detecteren.
    const { data, error } = await this.supabase.client
      .from('reviews')
      .update({
        response_text: trimmed,
        responded_at: new Date().toISOString(),
      })
      .eq('id', reviewId)
      .eq('restaurant_id', restaurantId)
      .select(
        'id, source, rating, title, body, author, review_date, response_text, responded_at',
      )
      .maybeSingle();

    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException('Review niet gevonden.');

    // Audit: review-antwoord opgeslagen. We loggen lengte + bron i.p.v.
    // de tekst zelf — voorkomt dat klant-namen of klacht-details in
    // het audit-logboek belanden. De DB-rij zelf bevat het volledige
    // antwoord nog, dus reconstructie is altijd mogelijk via de review.
    await this.audit.log({
      restaurantId,
      userId,
      action: 'review_response_updated',
      entity_type: 'review',
      entity_id: reviewId,
      payload: {
        source: data.source,
        rating: data.rating,
        response_length: trimmed.length,
      },
    });

    return data as Review;
  }
}

// System-prompt = Filly's "rol" voor deze specifieke taak. Hier leggen
// we vast wat voor soort antwoord we willen: toon, lengte, stijl.
// Het profile-block onderaan geeft Filly alle restaurant-specifieke
// context (USPs, tagline, sfeer, signature dishes) zodat de reactie
// echt bij DEZE zaak past — i.p.v. generiek "bedankt voor uw bezoek".
function buildReviewReplySystemPrompt(profileBlock: string): string {
  // Toon-B uit keuze-menu: gemoedelijk Nederlands, niet Amerikaans
  // enthousiast. Géén overdreven emoji of uitroeptekens, wel warm.
  return `Je bent Filly, de AI-assistent voor het hieronder beschreven restaurant. Je schrijft namens de zaak een publiek antwoord op een online review.

Stijl-richtlijnen:
- Schrijf in het Nederlands, gemoedelijk en oprecht, niet Amerikaans-enthousiast.
- Gebruik maximaal 3 à 4 zinnen. Liever kort en raak dan lang.
- Geen uitroeptekens behalve één aan het eind als het écht past. Geen emoji.
- Noem de gast bij voornaam als die bekend is.
- Bij positieve reviews: bedank oprecht, pik iets specifieks uit wat ze noemden, nodig ze uit om terug te komen.
- Bij kritische reviews: erken het probleem zonder in de verdediging te schieten, geef aan wat jullie ermee doen, bied eventueel een vervolg aan.
- Schrijf in de "wij"-vorm namens het team, niet "ik".
- Teken NIET af met een naam of handtekening — dat doet de eigenaar zelf later.
- Match de toon (brand_tone) en sfeer uit het profiel. Verwijs alleen naar
  feiten die in het profiel staan — verzin geen gerechten of details.

---
${profileBlock}
---

Geef alleen de tekst van het antwoord terug, zonder aanhef als "Antwoord:" of extra toelichting.`;
}

// User-prompt = de concrete review waarop Filly moet reageren.
// We geven rating + bron mee zodat Filly weet hoe zwaar ze er doorheen
// moet gaan bij kritiek (1-2 sterren = fouten erkennen, 5 sterren = bedanken).
function buildReviewReplyUserPrompt(review: {
  source: string;
  rating: number;
  title: string | null;
  body: string | null;
  author: string | null;
}): string {
  const parts = [
    `Bron: ${review.source}`,
    `Rating: ${review.rating}/5 sterren`,
    review.author ? `Van: ${review.author}` : null,
    review.title ? `Titel: ${review.title}` : null,
    `Review:\n${review.body ?? '(geen tekst, alleen sterren)'}`,
  ].filter(Boolean);

  return parts.join('\n') + '\n\nSchrijf een passend antwoord.';
}
