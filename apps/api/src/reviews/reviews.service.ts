import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AiService } from '../ai/ai.service';

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
  ): Promise<{ suggestion: string }> {
    const { data: review, error: reviewErr } = await this.supabase.client
      .from('reviews')
      .select('id, source, rating, title, body, author')
      .eq('id', reviewId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();

    if (reviewErr) throw new InternalServerErrorException(reviewErr.message);
    if (!review) throw new NotFoundException('Review niet gevonden.');

    // Restaurant-context halen we in één keer op — naam + type + toon
    // + beschrijving zijn genoeg om Filly's antwoord persoonlijk te
    // maken. Later kunnen we hier signature_dishes aan toevoegen als
    // de review een specifiek gerecht noemt.
    const { data: restaurant, error: restErr } = await this.supabase.client
      .from('restaurants')
      .select('name, type, description, brand_tone')
      .eq('id', restaurantId)
      .maybeSingle();

    if (restErr) throw new InternalServerErrorException(restErr.message);
    if (!restaurant) throw new NotFoundException('Restaurant niet gevonden.');

    const systemPrompt = buildReviewReplySystemPrompt(restaurant);
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
    });

    return { suggestion: suggestion.trim() };
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

    return data as Review;
  }
}

// System-prompt = Filly's "rol" voor deze specifieke taak. Hier leggen
// we vast wat voor soort antwoord we willen: toon, lengte, stijl.
// De restaurant-specifieke data zit erin zodat Filly zich inleeft.
function buildReviewReplySystemPrompt(restaurant: {
  name: string;
  type: string | null;
  description: string | null;
  brand_tone: string | null;
}): string {
  // Toon-B uit keuze-menu: gemoedelijk Nederlands, niet Amerikaans
  // enthousiast. Géén overdreven emoji of uitroeptekens, wel warm.
  return `Je bent Filly, de AI-assistent van ${restaurant.name}${
    restaurant.type ? ` (${restaurant.type})` : ''
  }. Je schrijft namens de zaak een publiek antwoord op een online review.

Stijl-richtlijnen:
- Schrijf in het Nederlands, gemoedelijk en oprecht, niet Amerikaans-enthousiast.
- Gebruik maximaal 3 à 4 zinnen. Liever kort en raak dan lang.
- Geen uitroeptekens behalve één aan het eind als het écht past. Geen emoji.
- Noem de gast bij voornaam als die bekend is.
- Bij positieve reviews: bedank oprecht, pik iets specifieks uit wat ze noemden, nodig ze uit om terug te komen.
- Bij kritische reviews: erken het probleem zonder in de verdediging te schieten, geef aan wat jullie ermee doen, bied eventueel een vervolg aan.
- Schrijf in de "wij"-vorm namens het team, niet "ik".
- Teken NIET af met een naam of handtekening — dat doet de eigenaar zelf later.

${restaurant.description ? `Context over de zaak: ${restaurant.description}` : ''}

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
