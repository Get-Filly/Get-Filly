import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { SupabaseService } from '../supabase/supabase.service';

// Vertaal een ruwe Anthropic SDK-error naar een NL-vriendelijke
// HTTP-exceptie. Doel: Filly-features mogen nooit een raw stacktrace
// of cryptische Engelse error tonen aan de eigenaar, altijd iets
// uitlegbaars met "probeer over een paar minuten opnieuw"-flow waar
// dat past. We loggen het origineel zodat we in de api-logs nog wel
// kunnen debuggen.
function toNlException(
  error: unknown,
  feature: string,
  logger: Logger,
): never {
  // Connection-fouten (netwerk, DNS, timeout), Anthropic onbereikbaar.
  // 503 zodat de UI duidelijk kan zeggen "even niet beschikbaar".
  if (error instanceof Anthropic.APIConnectionError) {
    logger.warn(`[${feature}] Anthropic onbereikbaar: ${error.message}`);
    throw new ServiceUnavailableException(
      'Filly is even niet bereikbaar. Probeer het over een paar minuten opnieuw.',
    );
  }

  // Rate-limit van Anthropic (429), niet onze rate-limit.
  if (error instanceof Anthropic.RateLimitError) {
    logger.warn(`[${feature}] Anthropic rate-limit: ${error.message}`);
    throw new ServiceUnavailableException(
      'Filly is even druk. Wacht een minuut en probeer het opnieuw.',
    );
  }

  // Authentication / invalid-key, onze fout, niet die van de eigenaar.
  if (error instanceof Anthropic.AuthenticationError) {
    logger.error(
      `[${feature}] Anthropic auth-fout: ${error.message}, controleer ANTHROPIC_API_KEY.`,
    );
    throw new InternalServerErrorException(
      'Filly is verkeerd geconfigureerd. Wij zijn op de hoogte; probeer het later opnieuw.',
    );
  }

  // Server-side fouten van Anthropic (5xx, inclusief InternalServerError
  // en gateway-issues). Tijdelijk probleem hun kant.
  if (error instanceof Anthropic.APIError) {
    if (error.status && error.status >= 500) {
      logger.warn(
        `[${feature}] Anthropic server-error ${error.status}: ${error.message}`,
      );
      throw new ServiceUnavailableException(
        'Filly heeft last van een tijdelijke storing. Probeer het zo opnieuw.',
      );
    }
    // 4xx (behalve auth/rate-limit hierboven): onze request was mis,
    // bv. ongeldige model-naam of payload-fout. Log + generieke melding.
    logger.error(
      `[${feature}] Anthropic API-fout ${error.status}: ${error.message}`,
    );
    throw new InternalServerErrorException(
      'Er ging iets mis bij Filly. Probeer het opnieuw.',
    );
  }

  // Onbekend, generieke fout-handler. Log de hele error voor debugging.
  logger.error(`[${feature}] Onverwachte AI-fout: ${String(error)}`);
  throw new InternalServerErrorException(
    'Er ging iets mis bij Filly. Probeer het opnieuw.',
  );
}

// Metadata die elke AI-call ons moet geven, dit is verplicht zodat
// geen enkele Filly-feature per ongeluk zonder tracking draait.
// TypeScript dwingt de caller om feature mee te geven; restaurantId
// mag null zijn voor pre-onboarding calls (user heeft nog geen zaak).
export type AiCallMeta = {
  restaurantId: string | null;
  // Optioneel: scheduled jobs hebben geen user die klikt.
  userId?: string;
  // Snake-case identificatie van de Filly-feature.
  // Bestaande: 'review_reply', 'chat', 'analyze_website', 'menu_vision'.
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
        'ANTHROPIC_API_KEY ontbreekt in env, Filly-AI endpoints geven een 500 tot de key is toegevoegd.',
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
  // kom je niet eens door de TypeScript-check, bewust.
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
    // Activeer Anthropic prompt-caching op de system-prompt. Aanzetten
    // wanneer de system-prompt overwegend statisch is (zelfde profile/
    // menu/regels in opeenvolgende calls) zodat input-tokens binnen
    // 5 min TTL voor ~10% van de normale prijs hergebruikt worden.
    // Anthropic vereist minimaal ~1024 tokens om de cache te triggeren,
    // anders is cache_control een no-op (geen schade, geen winst).
    //
    // Vuistregel:
    //   - chat (system bevat hele profile + menu)        → true
    //   - refine 3 varianten (zelfde profile + menu)     → true
    //   - one-shot calls (review-reply, vision, schedule)→ false
    cacheSystem?: boolean;
  }): Promise<string> {
    const client = this.getClient();
    const model = opts.model ?? 'claude-sonnet-4-6';

    // Bouw het system-payload: string als geen caching, anders een
    // array met één text-block met cache_control. SDK accepteert beide.
    const systemParam: string | Anthropic.TextBlockParam[] = opts.cacheSystem
      ? [
          {
            type: 'text',
            text: opts.system,
            cache_control: { type: 'ephemeral' },
          },
        ]
      : opts.system;

    let response;
    try {
      response = await client.messages.create({
        model,
        max_tokens: opts.maxTokens ?? 1024,
        system: systemParam,
        messages: [{ role: 'user', content: opts.prompt }],
      });
    } catch (err) {
      toNlException(err, opts.meta.feature, this.logger);
    }

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

    // Fire-and-forget usage-logging, als dit faalt (bv. DB tijdelijk
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

    let response;
    try {
      response = await client.messages.create({
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
    } catch (err) {
      toNlException(err, opts.meta.feature, this.logger);
    }

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

  // ============================================================
  // Structured output via tool-use (gegarandeerd geldige JSON)
  // ============================================================
  // Anthropic tool-use dwingt Claude om een JSON-output te bouwen
  // die voldoet aan een vooraf gedefinieerd JSON-schema. De API
  // valideert het schema voordat de respons terugkomt, daardoor
  // hebben wij NOOIT meer een `JSON.parse`-fout te pakken op
  // halfgeparste markdown-codeblokken of trailing comma's.
  //
  // Hoe te gebruiken:
  //   const profile = await ai.generateStructured<MyType>({
  //     system: '...',
  //     prompt: '...',
  //     toolName: 'extract_profile',
  //     toolDescription: 'Extract the restaurant profile...',
  //     inputSchema: { type: 'object', properties: {...} },
  //     meta: {...},
  //   });
  //
  // Caller blijft verantwoordelijk voor het samenstellen van een
  // duidelijke system+prompt, schema-driven output is geen excuus
  // voor een vage prompt. Type-coercie naar `T` gebeurt alleen
  // op compile-time; runtime-shape volgt het schema dat de SDK
  // afdwingt.
  async generateStructured<T>(opts: {
    system: string;
    prompt: string;
    toolName: string;
    toolDescription: string;
    inputSchema: Anthropic.Tool.InputSchema;
    model?: string;
    maxTokens?: number;
    meta: AiCallMeta;
    cacheSystem?: boolean;
  }): Promise<T> {
    const client = this.getClient();
    const model = opts.model ?? 'claude-sonnet-4-6';

    const systemParam: string | Anthropic.TextBlockParam[] = opts.cacheSystem
      ? [
          {
            type: 'text',
            text: opts.system,
            cache_control: { type: 'ephemeral' },
          },
        ]
      : opts.system;

    let response;
    try {
      response = await client.messages.create({
        model,
        max_tokens: opts.maxTokens ?? 4096,
        system: systemParam,
        messages: [{ role: 'user', content: opts.prompt }],
        tools: [
          {
            name: opts.toolName,
            description: opts.toolDescription,
            input_schema: opts.inputSchema,
          },
        ],
        // Forceer Claude tot exact deze tool, anders zou hij ook
        // een gewone text-respons mogen geven en zijn we terug bij
        // af. `disable_parallel_tool_use` is hier impliciet (één tool).
        tool_choice: { type: 'tool', name: opts.toolName },
      });
    } catch (err) {
      toNlException(err, opts.meta.feature, this.logger);
    }

    const toolBlock = response.content.find((b) => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      this.logger.error(
        `Onverwacht Claude-antwoord zonder tool_use-block (feature=${opts.meta.feature}): ${JSON.stringify(response.content)}`,
      );
      throw new InternalServerErrorException(
        'Filly gaf geen gestructureerd antwoord terug. Probeer het nog eens.',
      );
    }

    // Diagnostic: bij stop_reason='max_tokens' heeft Claude midden
    // in zijn tool-call gestopt. De input is dan vaak incompleet
    // (lege of half-gevulde array). Loggen zodat we kunnen zien of
    // we de cap moeten ophogen voor specifieke features.
    if (response.stop_reason === 'max_tokens') {
      this.logger.warn(
        `max_tokens bereikt (feature=${opts.meta.feature}, cap=${opts.maxTokens ?? 4096}, output=${response.usage.output_tokens}). Tool-call mogelijk incompleet, overweeg cap te verhogen.`,
      );
    }

    void this.logUsage(opts.meta, model, response.usage).catch((err) => {
      this.logger.warn(`ai_usage-log gefaald: ${String(err)}`);
    });

    // Hardening: Anthropic dwingt het input-schema NIET af. Een afgekapte
    // (max_tokens) of misvormde tool-call kan null / een primitief / een array
    // teruggeven i.p.v. het verwachte object — dat zou downstream een
    // TypeError of corrupte DB-insert geven. Weiger zulke output met een nette
    // fout. Een leeg object {} laten we bewust door: callers die optionele
    // velden verwachten (of zelf een retry/validatie doen) handelen dat al af.
    // (Volledige per-caller zod-validatie blijft een grotere vervolgstap.)
    const input = toolBlock.input;
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      this.logger.error(
        `Ongeldige tool-output (geen object) (feature=${opts.meta.feature}, stop=${response.stop_reason}): ${JSON.stringify(input)}`,
      );
      throw new InternalServerErrorException(
        'Filly gaf een onvolledig antwoord terug. Probeer het nog eens.',
      );
    }
    return input as T;
  }

  // Vision/document-versie van generateStructured. Combineert het
  // file-block uit generateFromFile met de tool-use-flow van
  // generateStructured. Cruciaal voor menu-importer: PDFs/images van
  // menukaarten waarvan we een gestructureerde gerechtenlijst willen.
  async generateStructuredFromFile<T>(opts: {
    system: string;
    instruction: string;
    file: { base64: string; mimeType: string };
    toolName: string;
    toolDescription: string;
    inputSchema: Anthropic.Tool.InputSchema;
    model?: string;
    maxTokens?: number;
    meta: AiCallMeta;
  }): Promise<T> {
    const client = this.getClient();
    const model = opts.model ?? 'claude-opus-4-7';

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

    // Vision-calls met hoge max_tokens (drankkaarten op 24k) overschrijden
    // Anthropic's 10-minuten-grens voor non-streaming requests. Daarom
    // gebruiken we de stream-API: SDK streamt onder water en .finalMessage()
    // geeft hetzelfde Message-object terug als messages.create() zou doen.
    // Voor kleinere calls (menu_vision op 16k) werkt streaming ook prima,
    // dus consistent gebruiken voor alle Vision-calls.
    let response: Anthropic.Message;
    try {
      const stream = client.messages.stream({
        model,
        max_tokens: opts.maxTokens ?? 4096,
        system: opts.system,
        messages: [
          {
            role: 'user',
            content: [fileBlock, { type: 'text', text: opts.instruction }],
          },
        ],
        tools: [
          {
            name: opts.toolName,
            description: opts.toolDescription,
            input_schema: opts.inputSchema,
          },
        ],
        tool_choice: { type: 'tool', name: opts.toolName },
      });
      response = await stream.finalMessage();
    } catch (err) {
      toNlException(err, opts.meta.feature, this.logger);
    }

    const toolBlock = response.content.find((b) => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      this.logger.error(
        `Onverwacht Claude-Vision-antwoord zonder tool_use-block (feature=${opts.meta.feature}): ${JSON.stringify(response.content)}`,
      );
      throw new InternalServerErrorException(
        'Filly kon het bestand niet als gestructureerde data lezen. Probeer een andere foto/PDF.',
      );
    }

    // Cap-bereikt-warning, identiek aan generateStructured. Vooral
    // relevant bij vision: grote menu/wijnkaarten kunnen de output-
    // cap raken en eindigen in een halfgevuld items-array.
    if (response.stop_reason === 'max_tokens') {
      this.logger.warn(
        `max_tokens bereikt bij Vision (feature=${opts.meta.feature}, cap=${opts.maxTokens ?? 4096}, output=${response.usage.output_tokens}). Tool-call mogelijk incompleet, overweeg cap te verhogen.`,
      );
    }

    void this.logUsage(opts.meta, model, response.usage).catch((err) => {
      this.logger.warn(`ai_usage-log gefaald: ${String(err)}`);
    });

    // Hardening: Anthropic dwingt het input-schema NIET af. Een afgekapte
    // (max_tokens) of misvormde tool-call kan null / een primitief / een array
    // teruggeven i.p.v. het verwachte object — dat zou downstream een
    // TypeError of corrupte DB-insert geven. Weiger zulke output met een nette
    // fout. Een leeg object {} laten we bewust door: callers die optionele
    // velden verwachten (of zelf een retry/validatie doen) handelen dat al af.
    // (Volledige per-caller zod-validatie blijft een grotere vervolgstap.)
    const input = toolBlock.input;
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      this.logger.error(
        `Ongeldige tool-output (geen object) (feature=${opts.meta.feature}, stop=${response.stop_reason}): ${JSON.stringify(input)}`,
      );
      throw new InternalServerErrorException(
        'Filly gaf een onvolledig antwoord terug. Probeer het nog eens.',
      );
    }
    return input as T;
  }

  // Insert in ai_usage. Gaat via service_role (SupabaseService gebruikt
  // de service-key), dus RLS-policies raken dit niet.
  private async logUsage(
    meta: AiCallMeta,
    model: string,
    usage: Anthropic.Usage,
  ): Promise<void> {
    // Anthropic's usage:
    //   - input_tokens             = NIET-gecachte input (vol tarief)
    //   - cache_creation_input_tokens = ging naar cache (~125% tarief, eerste call)
    //   - cache_read_input_tokens  = uit cache (~10% tarief, hits)
    //   - output_tokens            = generated
    //
    // Voor de bestaande ai_usage-tabel houden we input_tokens als
    // niet-gecachte input én tellen cache_creation erbij op zodat dat
    // veld de "echte input"-kosten reflecteert. cached_input_tokens
    // krijgt de read-hits zodat het kosten-dashboard straks per call
    // kan zien hoeveel cache scheelde.
    const { error } = await this.supabase.client.from('ai_usage').insert({
      restaurant_id: meta.restaurantId,
      user_id: meta.userId ?? null,
      feature: meta.feature,
      model,
      input_tokens:
        usage.input_tokens + (usage.cache_creation_input_tokens ?? 0),
      output_tokens: usage.output_tokens,
      cached_input_tokens: usage.cache_read_input_tokens ?? null,
    });
    if (error) throw new Error(error.message);
  }
}
