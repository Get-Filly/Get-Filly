import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

// Centrale wrapper rond de Anthropic SDK. Alle andere modules
// (reviews, suggesties, chat, menu-vision) roepen via deze service
// Claude aan, zodat we op één plek model-keuze, foutafhandeling,
// logging en later prompt-caching beheren.
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  // We houden de client in een veld zodat we 'm één keer initialiseren
  // bij opstart. Null betekent: API-key ontbreekt — de app mag dan nog
  // wel draaien (handig tijdens dev), maar elke AI-call gooit een
  // nette error zodra ie daadwerkelijk gebruikt wordt.
  private client: Anthropic | null = null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    } else {
      this.logger.warn(
        'ANTHROPIC_API_KEY ontbreekt in env — Filly-AI endpoints geven een 500 tot de key is toegevoegd.',
      );
    }
  }

  // Helper om de client te gebruiken. Gooit een heldere NL-error als
  // de key ontbreekt, zodat de frontend weet wat er aan de hand is
  // in plaats van een cryptische undefined-crash te zien.
  private getClient(): Anthropic {
    if (!this.client) {
      throw new InternalServerErrorException(
        'Anthropic API-key niet geconfigureerd. Zet ANTHROPIC_API_KEY in apps/api/.env.',
      );
    }
    return this.client;
  }

  // Generieke tekst-generatie. Elke caller geeft zijn eigen system-prompt
  // (de "rol" die Filly speelt voor die specifieke taak) en de user-prompt
  // (de concrete data: review, gast-info, menu, etc.).
  //
  // We kiezen per call welk model — default Sonnet 4.6 is de sweet spot
  // qua kwaliteit voor NL-teksten zoals review-replies en campagne-copy.
  // Voor snelle/simpele taken kan de caller Haiku 4.5 doorgeven, voor
  // zware context-redenaties Opus 4.7.
  async generateText(opts: {
    system: string;
    prompt: string;
    model?: string;
    maxTokens?: number;
  }): Promise<string> {
    const client = this.getClient();

    const response = await client.messages.create({
      model: opts.model ?? 'claude-sonnet-4-6',
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

    return textBlock.text;
  }
}
