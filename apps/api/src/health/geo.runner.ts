import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import type {
  HealthRunner,
  RunnerContext,
  RunnerFinding,
  RunnerResult,
} from './types';

/**
 * ============================================================
 * GeoRunner — Generative Engine Optimization (AI-zichtbaarheid)
 * ============================================================
 *
 * Wat meten we?
 *   Of jouw restaurant genoemd wordt wanneer iemand een AI (Claude in
 *   dit geval) vraagt "wat zijn goede restaurants in {stad}?". Dat is
 *   het kern-signaal van GEO: hoe prominent ben je in de kennis van
 *   AI-assistenten, die steeds vaker als zoek-vervanger fungeren.
 *
 * Hoe werkt het?
 *   We runnen 5 prompt-variaties parallel. Claude geeft per prompt een
 *   genummerde lijst van 8-10 restaurants. Wij parsen de lijst en
 *   checken of jouw naam matched (case-insensitive substring + tolerante
 *   fuzzy-match). Positie in de lijst weegt mee: top-3 = volle punten,
 *   later in de lijst = afnemend.
 *
 * Wat we BEWUST NIET doen (nog):
 *   - Geen web_search tool: zou extra kosten ($10/1k searches) én meet
 *     iets anders (current SERP-data) dan AI-kennis. Op de [[project_getfilly]]
 *     backlog (Perplexity / OpenAI GPT-search / Google AI Overviews).
 *   - Geen prompt-caching: 5 verschillende prompts per restaurant, dus
 *     geen herbruikbare system-prompt om te cachen.
 *
 * Kosten-schatting:
 *   5 prompts × ~500 input + 600 output tokens = ~5500 tokens per audit.
 *   Sonnet 4.6 ≈ $0.003 per audit. 1000 klanten × 1 audit/week = $3/week.
 *
 * Eerlijke waarschuwing in de UI:
 *   Voor kleine zaken zal Claude vaak GEEN naam geven (geen training-data
 *   over hen). Score zal dan 0 zijn. De fix-suggestion legt uit dat
 *   GEO een nieuw veld is en richt zich op brondata-versterking (review-
 *   sites, persvermeldingen, etc.) i.p.v. tech-fixes.
 * ============================================================
 */

/** Tijdslimit per prompt, hoog genoeg voor Sonnet 4.6 generation. */
const PROMPT_TIMEOUT_MS = 30_000;

/**
 * Punten per prompt (5 × 20 = 100). Binnen één prompt kun je maximaal
 * 20 punten halen, gemoduleerd door positie in de lijst:
 *   - rang 1-3   : 100%  (= 20)
 *   - rang 4-5   : 75%   (= 15)
 *   - rang 6-8   : 50%   (= 10)
 *   - rang 9-10  : 25%   (= 5)
 *   - niet in top-10 / niet genoemd : 0
 */
const POINTS_PER_PROMPT = 20;

interface PromptOutcome {
  promptId: string;
  promptText: string;
  /** Lijst-positie (1-based) waarin restaurant voorkwam, 0 = niet genoemd. */
  rank: number;
  /** Aantal restaurants dat Claude noemde (voor context). */
  totalListed: number;
  /** Claude's hele antwoord, voor debug (eerste 1000 chars). */
  rawSnippet: string;
}

@Injectable()
export class GeoRunner implements HealthRunner {
  readonly category = 'geo' as const;
  private readonly logger = new Logger(GeoRunner.name);

  constructor(private readonly ai: AiService) {}

  async run(ctx: RunnerContext): Promise<RunnerResult> {
    // Zonder stad kunnen we geen geografische prompt opbouwen.
    if (!ctx.city) {
      return {
        category: 'geo',
        score: 0,
        findings: [
          {
            category: 'geo',
            checkKey: 'geo.city_required',
            passed: false,
            severity: 'critical',
            pointsLost: 100,
            title: 'Geen stad ingesteld',
            description:
              'Om je AI-zichtbaarheid te meten hebben we de stad van je restaurant nodig.',
            fixSuggestion:
              'Vul je adres in via Instellingen → Identiteit. Filly leest de stad daaruit.',
            fixLink: '/dashboard/account?tab=identiteit',
            details: null,
          },
        ],
      };
    }

    // Bouw de 5 prompt-variaties op basis van beschikbare context.
    const prompts = this.buildPrompts(ctx);

    // Parallel uitvoeren. Per-prompt try/catch zodat 1 timeout de
    // andere 4 prompts niet meesleurt.
    const outcomes = await Promise.all(
      prompts.map((p) => this.runOnePrompt(p, ctx)),
    );

    // Score = som van punten per prompt-uitkomst, geclamped 0-100.
    const totalPoints = outcomes.reduce(
      (sum, o) => sum + this.pointsForRank(o.rank),
      0,
    );
    const score = Math.max(0, Math.min(100, totalPoints));

    // Findings: één per prompt + één samenvattend bovenaan.
    const findings: RunnerFinding[] = [];

    // Samenvattend finding — UI toont 'm bovenaan.
    const mentions = outcomes.filter((o) => o.rank > 0).length;
    findings.push({
      category: 'geo',
      checkKey: 'geo.summary',
      passed: mentions > 0,
      severity: mentions === 0 ? 'high' : 'info',
      pointsLost: 0, // punten verdeeld over de prompts hieronder
      title:
        mentions === 0
          ? 'AI noemt je restaurant nog niet'
          : `AI noemt je in ${mentions} van ${outcomes.length} zoekopdrachten`,
      description:
        mentions === 0
          ? `In ${outcomes.length} verschillende vragen aan Claude over restaurants in ${ctx.city} kwam jouw zaak nog niet voor. Dat is normaal voor minder bekende zaken — GEO bouw je op via reviews, persvermeldingen en blogposts die AI's leren kennen.`
          : `Je AI-zichtbaarheid is op gang. Hoe vaker je in onafhankelijke bronnen (review-sites, blogs, kranten) genoemd wordt, hoe hoger je in AI-aanbevelingen komt.`,
      fixSuggestion:
        mentions === 0
          ? 'Bouw aan vermeldingen in externe bronnen: vraag bloggers/journalisten voor een review, zorg voor 30+ Google-reviews, claim profielen op TripAdvisor/IENS/The Fork.'
          : 'Blijf werken aan onafhankelijke vermeldingen. Test deze score elke 2-3 maanden om je voortgang te zien.',
      fixLink: '/dashboard/reviews',
      details: { mentions, totalPrompts: outcomes.length },
    });

    // Per-prompt findings (UI toont ze als detail-lijst).
    for (const o of outcomes) {
      findings.push({
        category: 'geo',
        checkKey: `geo.prompt.${o.promptId}`,
        passed: o.rank > 0,
        severity: o.rank > 0 ? 'info' : 'medium',
        pointsLost:
          o.rank > 0
            ? 0
            : Math.max(0, POINTS_PER_PROMPT - this.pointsForRank(o.rank)),
        title:
          o.rank > 0
            ? `Genoemd op positie ${o.rank} bij "${o.promptText}"`
            : `Niet genoemd bij "${o.promptText}"`,
        description:
          o.totalListed > 0
            ? `Claude noemde ${o.totalListed} restaurants in zijn antwoord.`
            : 'Claude gaf geen restaurant-namen terug (mogelijk te algemene vraag).',
        fixSuggestion: null,
        fixLink: null,
        details: {
          rank: o.rank,
          totalListed: o.totalListed,
          rawSnippet: o.rawSnippet,
        },
      });
    }

    return { category: 'geo', score, findings };
  }

  // ============================================================
  // Prompt-builder
  // ============================================================

  private buildPrompts(ctx: RunnerContext): Array<{
    id: string;
    text: string;
  }> {
    const city = ctx.city!; // gegarandeerd, gecheckt in run()
    const prompts: Array<{ id: string; text: string }> = [
      {
        id: 'best_in_city',
        text: `Beste restaurants in ${city}`,
      },
      {
        id: 'where_to_eat',
        text: `Waar kan ik lekker eten in ${city}?`,
      },
      {
        id: 'recommendation',
        text: `Restaurant-aanrader voor een avondje uit in ${city}`,
      },
    ];

    // Stijl-specifiek als we de keuken kennen
    if (ctx.cuisineStyle && ctx.cuisineStyle.length > 0) {
      const style = ctx.cuisineStyle[0];
      prompts.push({
        id: 'cuisine_specific',
        text: `Beste ${style} restaurant in ${city}`,
      });
    } else {
      prompts.push({
        id: 'fine_dining',
        text: `Goed restaurant voor speciale gelegenheid in ${city}`,
      });
    }

    // Romantisch-diner of soortgelijk segment
    prompts.push({
      id: 'romantic',
      text: `Romantisch restaurant in ${city} voor een diner`,
    });

    return prompts;
  }

  // ============================================================
  // Single-prompt-uitvoer + naam-matching
  // ============================================================

  private async runOnePrompt(
    prompt: { id: string; text: string },
    ctx: RunnerContext,
  ): Promise<PromptOutcome> {
    try {
      const text = await this.callClaudeWithTimeout(prompt.text, ctx.restaurantId);
      const list = this.parseRestaurantList(text);
      const rank = this.findRank(list, ctx.name);

      return {
        promptId: prompt.id,
        promptText: prompt.text,
        rank,
        totalListed: list.length,
        rawSnippet: text.slice(0, 1000),
      };
    } catch (err) {
      this.logger.warn(
        `GEO-prompt ${prompt.id} faalde voor ${ctx.restaurantId}: ${
          err instanceof Error ? err.message : err
        }`,
      );
      return {
        promptId: prompt.id,
        promptText: prompt.text,
        rank: 0,
        totalListed: 0,
        rawSnippet: '',
      };
    }
  }

  private async callClaudeWithTimeout(
    promptText: string,
    restaurantId: string,
  ): Promise<string> {
    const result = await Promise.race([
      this.ai.generateText({
        system:
          'Je bent een lokale food-expert die concrete restaurant-namen aanbeveelt. Geef alleen ECHTE restaurant-namen (geen verzonnen namen, geen algemene termen). Format ALTIJD als genummerde lijst met 8-10 items: "1. Restaurant Naam — korte beschrijving". Als je geen specifieke namen kent voor de gevraagde stad, zeg dat dan eerlijk in plaats van iets te verzinnen.',
        prompt: promptText,
        // Sonnet 4.6 = beste balans kwaliteit/kosten voor deze taak.
        model: 'claude-sonnet-4-6',
        maxTokens: 800,
        meta: {
          restaurantId,
          feature: 'health_geo_audit',
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('GEO-prompt timeout')),
          PROMPT_TIMEOUT_MS,
        ),
      ),
    ]);
    return result;
  }

  /**
   * Parse Claude's antwoord: zoek regels van het patroon
   * "1. Restaurant Naam — beschrijving" of varianten met . of )
   * Returnt de gevonden restaurant-namen in volgorde.
   */
  private parseRestaurantList(text: string): string[] {
    const names: string[] = [];
    // Match regels die beginnen met cijfer + scheidingsteken (. of ))
    const lineRegex = /^\s*(\d{1,2})[.)]\s+(.+?)(?:\s*[—–-]\s*.*)?$/gm;
    let match: RegExpExecArray | null;
    while ((match = lineRegex.exec(text)) !== null) {
      // match[2] is alles na "N. " en vóór het eerste em-dash/streepje
      const rawName = match[2].trim();
      // Strip dubbele aanhalingstekens, asterisks (markdown bold), etc.
      const cleaned = rawName.replace(/^["'*]+|["'*]+$/g, '').trim();
      if (cleaned.length > 0) {
        names.push(cleaned);
      }
    }
    return names;
  }

  /**
   * Zoekt het restaurant in de lijst met tolerante matching:
   *   - case-insensitive
   *   - kale substring-match
   *   - punctuation-insensitive
   * Returnt 1-based positie of 0 als niet gevonden.
   */
  private findRank(list: string[], target: string): number {
    const norm = (s: string): string =>
      s
        .toLowerCase()
        // Strip "Restaurant"/"Bistro"/"Café" prefixen die Claude graag toevoegt
        .replace(/^(restaurant|bistro|brasserie|caf[eé]|eetcafe|eethuis)\s+/i, '')
        // Strip alle non-alfanumerieke chars voor robuuste match
        .replace(/[^a-z0-9]/g, '')
        .trim();

    const targetNorm = norm(target);
    if (targetNorm.length === 0) return 0;

    for (let i = 0; i < list.length; i++) {
      const itemNorm = norm(list[i]);
      if (itemNorm.includes(targetNorm) || targetNorm.includes(itemNorm)) {
        return i + 1;
      }
    }
    return 0;
  }

  /**
   * Punten op basis van lijst-positie. Niet genoemd = 0,
   * hoe hoger in de lijst hoe meer punten.
   */
  private pointsForRank(rank: number): number {
    if (rank === 0) return 0;
    if (rank <= 3) return POINTS_PER_PROMPT;        // 20
    if (rank <= 5) return Math.round(POINTS_PER_PROMPT * 0.75); // 15
    if (rank <= 8) return Math.round(POINTS_PER_PROMPT * 0.5);  // 10
    if (rank <= 10) return Math.round(POINTS_PER_PROMPT * 0.25); // 5
    return 0;
  }
}
