import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { SupabaseService } from '../supabase/supabase.service';

// Metadata die elke AI-call ons moet geven — dit is verplicht zodat
// geen enkele Filly-feature per ongeluk zonder tracking draait.
// TypeScript dwingt de caller om restaurantId + feature mee te geven.
export type AiCallMeta = {
  restaurantId: string;
  // Optioneel: scheduled jobs hebben geen user die klikt.
  userId?: string;
  // Snake-case identificatie van de Filly-feature.
  // Bestaande: 'review_reply'. Binnenkort: 'chat', 'suggestion',
  // 'menu_vision'. Eén woord per feature is genoeg.
  feature: string;
};

// Centrale wrapper rond de Anthropic SDK. Alle Filly-features roepen
// hier langs zodat model-keuze, foutafhandeling, usage-logging en
// (later) prompt-caching op één plek leven.
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  // Client null = API-key ontbreekt. App mag draaien (handig tijdens
  // dev voor andere modules), maar elke AI-call gooit dan een nette
  // NL-error in plaats van te crashen op een undefined.
  private client: Anthropic | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
  ) {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    } else {
      this.logger.warn(
        'ANTHROPIC_API_KEY ontbreekt in env — Filly-AI endpoints geven een 500 tot de key is toegevoegd.',
      );
    }
  }

  private getClient(): Anthropic {
    if (!this.client) {
      throw new InternalServerErrorException(
        'Anthropic API-key niet geconfigureerd. Zet ANTHROPIC_API_KEY in apps/api/.env.',
      );
    }
    return this.client;
  }

  // Generieke tekst-generatie. Elke caller geeft zijn eigen system-prompt
  // (de "rol" die Filly speelt voor die taak), user-prompt (de concrete
  // data) én meta (wie vraagt het, voor welke feature). Zonder meta
  // kom je niet eens door de TypeScript-check — bewust.
  //
  // Model-default is Sonnet 4.6: balans kwaliteit/kosten voor NL-tekst.
  // Voor snelle/simpele taken kan de caller Haiku 4.5 doorgeven, voor
  // zware context-redenaties Opus 4.7.
  async generateText(opts: {
    system: string;
    prompt: string;
    model?: string;
    maxTokens?: number;
    meta: AiCallMeta;
  }): Promise<string> {
    const client = this.getClient();
    const model = opts.model ?? 'claude-sonnet-4-6';

    const response = await client.messages.create({
      model,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      messages: [{ role: 'user', content: opts.prompt }],
    });

    // Claude's response.content is een array van content-blocks. Voor
    // pure tekst-calls verwachten we één text-block; we pakken de eerste
    // en valideren dat hij ook echt type 'text' is (TypeScript narrowing).
    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      this.logger.error(
        `Onverwacht Claude-antwoord zonder text-block: ${JSON.stringify(response.content)}`,
      );
      throw new InternalServerErrorException(
        'Filly gaf geen tekst-antwoord terug. Probeer het nog eens.',
      );
    }

    // Fire-and-forget usage-logging — als dit faalt (bv. DB tijdelijk
    // traag) MAG de call niet mislukken, de gebruiker heeft al een
    // antwoord. We loggen een warning en gaan door.
    void this.logUsage(opts.meta, model, response.usage).catch((err) => {
      this.logger.warn(`ai_usage-log gefaald: ${String(err)}`);
    });

    return textBlock.text;
  }

  // Vision / document-versie van generateText: accepteert een bestand
  // (PDF, PNG, JPEG, WebP) als base64 + mime-type, plus een
  // tekst-instructie. Claude ziet eerst het bestand en dan de
  // instructie. Ideaal voor menu-scans, factuur-parsing, etc.
  //
  // Default-model is Opus 4.7: Vision-vragen vereisen vaak visueel
  // inzicht in layout (kolommen, groeperingen bij menu's, handschrift).
  // Sonnet 4.6 kan ook maar mist groepering eerder; Haiku is risky.
  async generateFromFile(opts: {
    system: string;
    instruction: string;
    file: { base64: string; mimeType: string };
    model?: string;
    maxTokens?: number;
    meta: AiCallMeta;
  }): Promise<string> {
    const client = this.getClient();
    const model = opts.model ?? 'claude-opus-4-7';

    // Anthropic splitst image en document op in twee verschillende
    // block-types. PDF = document, plaatjes = image.
    const fileBlock =
      opts.file.mimeType === 'application/pdf'
        ? ({
            type: 'document' as const,
            source: {
              type: 'base64' as const,
              media_type: 'application/pdf' as const,
              data: opts.file.base64,
            },
          } satisfies Anthropic.DocumentBlockParam)
        : ({
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: opts.file.mimeType as
                | 'image/jpeg'
                | 'image/png'
                | 'image/gif'
                | 'image/webp',
              data: opts.file.base64,
            },
          } satisfies Anthropic.ImageBlockParam);

    const response = await client.messages.create({
      model,
      max_tokens: opts.maxTokens ?? 4000,
      system: opts.system,
      messages: [
        {
          role: 'user',
          content: [fileBlock, { type: 'text', text: opts.instruction }],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      this.logger.error(
        `Onverwacht Claude-Vision-antwoord zonder text-block: ${JSON.stringify(response.content)}`,
      );
      throw new InternalServerErrorException(
        'Filly kon het bestand niet lezen. Probeer een andere foto/PDF.',
      );
    }

    void this.logUsage(opts.meta, model, response.usage).catch((err) => {
      this.logger.warn(`ai_usage-log gefaald: ${String(err)}`);
    });

    return textBlock.text;
  }

  // Insert in ai_usage. Gaat via service_role (SupabaseService gebruikt
  // de service-key), dus RLS-policies raken dit niet.
  private async logUsage(
    meta: AiCallMeta,
    model: string,
    usage: Anthropic.Usage,
  ): Promise<void> {
    const { error } = await this.supabase.client.from('ai_usage').insert({
      restaurant_id: meta.restaurantId,
      user_id: meta.userId ?? null,
      feature: meta.feature,
      model,
      // Anthropic's usage: input_tokens = NIET-gecachte input,
      // cache_read_input_tokens = wel-gecachte. Voor nu cachen we nog
      // niet; beide kunnen straks vol komen als we caching aanzetten.
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cached_input_tokens: usage.cache_read_input_tokens ?? null,
    });
    if (error) throw new Error(error.message);
  }
}
