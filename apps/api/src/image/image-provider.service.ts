import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';

// ============================================================
// ImageProviderService, centrale wrapper rond de beeld-provider
// ============================================================
//
// Spiegelt bewust AiService: één plek waar model-keuze, foutafhandeling
// en usage-logging voor BEELD-generatie/-bewerking leven. AiService
// (Claude) kan beelden alleen ANALYSEREN (vision); genereren/bewerken
// vereist een aparte provider. Die zit hier.
//
// Provider (v1): Google Gemini image ("Nano Banana") via de REST-API
// van de Generative Language API. Puur `fetch`, geen extra SDK-dependency.
// Feature-gated op GEMINI_API_KEY: ontbreekt de key, dan blijft de app
// draaien en geeft elke beeld-call een nette NL-500 (net als AiService
// zonder ANTHROPIC_API_KEY). Zo kunnen we de hele infra bouwen en mergen
// vóórdat de key er is; de knop werkt zodra Floris 'm in Vercel zet.
//
// Model is env-overridebaar (GEMINI_IMAGE_MODEL) omdat de Nano-Banana-
// familie snel beweegt; default is een bekend-goede image-model-id.
// ============================================================

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-2.5-flash-image';
// Beeld-calls duren langer dan tekst; ruime timeout maar niet oneindig.
const REQUEST_TIMEOUT_MS = 60_000;

export type ImageInput = {
  base64: string;
  mimeType: string;
};

export type ImageResult = {
  base64: string;
  mimeType: string;
};

export type ImageCallMeta = {
  businessId: string;
  userId?: string;
  // 'image_enhance' | 'image_edit' | 'image_generate'
  feature: string;
};

@Injectable()
export class ImageProviderService {
  private readonly logger = new Logger(ImageProviderService.name);

  private readonly apiKey: string | null;
  private readonly model: string;

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
  ) {
    this.apiKey = this.config.get<string>('GEMINI_API_KEY') ?? null;
    this.model =
      this.config.get<string>('GEMINI_IMAGE_MODEL') ?? DEFAULT_MODEL;
    if (!this.apiKey) {
      this.logger.warn(
        'GEMINI_API_KEY ontbreekt in env, Filly-beeldtool geeft een 500 tot de key is toegevoegd.',
      );
    }
  }

  // Of de provider bruikbaar is. Handig voor de frontend/feature-flag:
  // zonder key verbergen we de beeld-knoppen liever dan ze te laten falen.
  isConfigured(): boolean {
    return this.apiKey !== null;
  }

  // Genereren vanaf tekst (stand 3): geen input-foto, alleen een prompt.
  async generate(opts: {
    prompt: string;
    meta: ImageCallMeta;
  }): Promise<ImageResult> {
    return this.callGemini({
      parts: [{ text: opts.prompt }],
      operation: 'generate',
      meta: opts.meta,
    });
  }

  // Bewerken/verbeteren (stand 1 + 2): één of meer input-foto's + een
  // tekst-instructie. Verbeteren = een vaste kwaliteits-instructie;
  // aanpassen = de instructie van de eigenaar ("doe hier tapas op").
  async edit(opts: {
    prompt: string;
    images: ImageInput[];
    meta: ImageCallMeta;
  }): Promise<ImageResult> {
    if (opts.images.length === 0) {
      throw new InternalServerErrorException(
        'Beeld-bewerking zonder invoerfoto aangeroepen (developer-fout).',
      );
    }
    const parts = [
      // Instructie eerst, dan de foto('s): het model leest de opdracht
      // en past 'm toe op de meegegeven beelden.
      { text: opts.prompt },
      ...opts.images.map((img) => ({
        inlineData: { mimeType: img.mimeType, data: img.base64 },
      })),
    ];
    return this.callGemini({ parts, operation: 'edit', meta: opts.meta });
  }

  // ============================================================
  // Interne Gemini-call: bouwt de request, mapt fouten naar NL-excepties
  // en trekt het eerste image-part uit de respons.
  // ============================================================
  private async callGemini(opts: {
    parts: unknown[];
    operation: 'generate' | 'edit';
    meta: ImageCallMeta;
  }): Promise<ImageResult> {
    if (!this.apiKey) {
      throw new InternalServerErrorException(
        'Beeld-provider niet geconfigureerd. Zet GEMINI_API_KEY in de API-env.',
      );
    }

    const url = `${GEMINI_BASE_URL}/models/${this.model}:generateContent`;
    const body = {
      contents: [{ role: 'user', parts: opts.parts }],
      // Dwing een BEELD-respons af (anders zou het model tekst kunnen geven).
      generationConfig: { responseModalities: ['IMAGE'] },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      // Netwerk/timeout: provider onbereikbaar → 503 zodat de UI "even
      // niet beschikbaar" kan tonen (spiegelt AiService's connection-case).
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[${opts.meta.feature}] Beeld-provider onbereikbaar: ${msg}`,
      );
      throw new ServiceUnavailableException(
        'Filly kan de beeldtool even niet bereiken. Probeer het over een paar minuten opnieuw.',
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      // 429 = provider-rate-limit; 5xx = tijdelijke storing hun kant.
      if (res.status === 429 || res.status >= 500) {
        this.logger.warn(
          `[${opts.meta.feature}] Beeld-provider ${res.status}: ${detail.slice(0, 500)}`,
        );
        throw new ServiceUnavailableException(
          'De beeldtool is even druk of heeft een storing. Probeer het zo opnieuw.',
        );
      }
      // 401/403 = onze key/config fout; 400 = onze payload. Log + generiek.
      this.logger.error(
        `[${opts.meta.feature}] Beeld-provider-fout ${res.status}: ${detail.slice(0, 500)}`,
      );
      if (res.status === 401 || res.status === 403) {
        throw new InternalServerErrorException(
          'De beeldtool is verkeerd geconfigureerd. Wij zijn op de hoogte; probeer het later opnieuw.',
        );
      }
      throw new InternalServerErrorException(
        'Er ging iets mis bij het maken van het beeld. Probeer het opnieuw.',
      );
    }

    const json = (await res.json().catch(() => null)) as GeminiResponse | null;
    const image = extractFirstImage(json);
    if (!image) {
      // Model gaf geen beeld terug (bv. safety-block of tekst-only respons).
      const finish = json?.candidates?.[0]?.finishReason ?? 'onbekend';
      this.logger.warn(
        `[${opts.meta.feature}] Geen beeld in respons (finishReason=${finish}).`,
      );
      throw new InternalServerErrorException(
        'Filly kon hier geen beeld van maken. Probeer een andere foto of omschrijving.',
      );
    }

    // Fire-and-forget usage-log: mag de call nooit laten falen.
    void this.logUsage(opts.meta, opts.operation).catch((err) => {
      this.logger.warn(`image_usage-log gefaald: ${String(err)}`);
    });

    return image;
  }

  // Insert in image_usage via service_role (RLS-bypass), spiegelt
  // AiService.logUsage. Eén rij = één opgeleverd beeld.
  private async logUsage(
    meta: ImageCallMeta,
    operation: 'generate' | 'edit',
  ): Promise<void> {
    const { error } = await this.supabase.client.from('image_usage').insert({
      business_id: meta.businessId,
      user_id: meta.userId ?? null,
      feature: meta.feature,
      provider: 'gemini',
      model: this.model,
      operation,
      image_count: 1,
    });
    if (error) throw new Error(error.message);
  }
}

// ---- Respons-typing (minimaal, alleen wat we lezen) ----
type GeminiInlinePart = {
  inlineData?: { mimeType?: string; data?: string };
  // REST kan ook snake_case teruggeven; we lezen beide vormen defensief.
  inline_data?: { mime_type?: string; data?: string };
};
type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: GeminiInlinePart[] };
    finishReason?: string;
  }>;
};

// Trek het eerste inline-image-part uit de respons. Defensief voor zowel
// camelCase (inlineData/mimeType) als snake_case (inline_data/mime_type),
// omdat de proto-JSON-mapping van de REST-API beide kan hanteren.
function extractFirstImage(json: GeminiResponse | null): ImageResult | null {
  const parts = json?.candidates?.[0]?.content?.parts;
  if (!parts) return null;
  for (const part of parts) {
    const inline = part.inlineData ?? part.inline_data;
    const data = inline?.data;
    const mimeType =
      (part.inlineData?.mimeType ?? part.inline_data?.mime_type) || 'image/png';
    if (data) return { base64: data, mimeType };
  }
  return null;
}
