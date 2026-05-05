import {
  BadRequestException,
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { OnboardingService, type OnboardingInput } from './onboarding.service';
import { WebsiteAnalyzerService } from '../ai/website-analyzer.service';
import { MenuImporterService } from '../ai/menu-importer.service';
import { GoogleProfileService } from '../google-profile/google-profile.service';
import type { PlaceSearchResult } from '../google-profile/types';
import { AuthGuard } from '../common/auth.guard';
import { Logger } from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/current-user.decorator';

// ============================================================
// /api/onboarding — eenmalige setup voor nieuwe users
// ============================================================
// Deze controller staat BEWUST buiten de RestaurantAccessGuard-keten
// (anders dan alle andere restaurant-endpoints). Reden: tijdens
// onboarding HEEFT de user nog geen restaurant — hij maakt 'm net
// aan. Dus we kunnen niet eisen dat X-Restaurant-Id meegestuurd wordt.
//
// Wel AuthGuard: de user moet ingelogd zijn (JWT valide).
// ============================================================

// Simpele in-memory rate-limit voor pre-onboarding AI-calls. De
// bestaande AiRateLimitGuard hangt aan restaurant_id; die bestaat
// hier nog niet. Vervanging: per user max N calls per window.
// Overleeft geen api-restart, is niet multi-instance correct. Voor
// een lokale dev-omgeving is dat prima; bij deploy naar Railway +
// meerdere instances verplaatst dit naar Redis (BACKLOG).
const AI_WINDOW_MS = 10 * 60 * 1000; // 10 min
const AI_MAX_PER_WINDOW = 5; // één user kan max 5 AI-calls/10min tijdens onboarding
const aiCallLog = new Map<string, number[]>();

function enforceAiRateLimit(userId: string): void {
  const now = Date.now();
  const history = aiCallLog.get(userId) ?? [];
  const recent = history.filter((t) => now - t < AI_WINDOW_MS);
  if (recent.length >= AI_MAX_PER_WINDOW) {
    throw new HttpException(
      {
        message: `Je hebt net ${recent.length} AI-analyses gedaan. Probeer over 10 minuten opnieuw.`,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
  recent.push(now);
  aiCallLog.set(userId, recent);
}

@UseGuards(AuthGuard)
@Controller('onboarding')
export class OnboardingController {
  private readonly logger = new Logger(OnboardingController.name);

  constructor(
    private readonly onboarding: OnboardingService,
    private readonly analyzer: WebsiteAnalyzerService,
    private readonly menuImporter: MenuImporterService,
    // Voor de Filly-Google-match na website-analyse (fase B,
    // 2026-05-05). searchByText doet géén DB-call dus het werkt
    // ook tijdens onboarding (geen restaurant_id nodig).
    private readonly googleProfile: GoogleProfileService,
  ) {}

  @Post('restaurant')
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: OnboardingInput,
  ) {
    return this.onboarding.completeOnboarding(user.id, body);
  }

  // Crawlt de opgegeven URL + subpagina's en stuurt de content naar
  // Claude voor profiel-extractie. Rate-limited op user-id zodat een
  // willekeurige script dat dit endpoint spamt onze Anthropic-rekening
  // niet leegtrekt.
  //
  // user.id wordt NIET meegegeven aan de analyzer voor ai_usage-logging:
  // de public.users-spiegelrij bestaat pas na onboarding-complete, dus
  // een user_id-referentie zou een FK-violation geven. We loggen deze
  // calls als "anonymous pre-onboarding" — je ziet ze terug met
  // restaurant_id IS NULL en user_id IS NULL in ai_usage.
  @Post('analyze-website')
  async analyzeWebsite(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { url: string },
  ) {
    enforceAiRateLimit(user.id);
    const result = await this.analyzer.analyze(body.url);

    // Filly-Google-match: als WebsiteAnalyzer een naam + adres of
    // stad heeft kunnen vinden, zoeken we direct in Google Places naar
    // de bijbehorende business. Top-1 match komt mee in de response
    // zodat de wizard 'm in stap 2 kan tonen.
    //
    // Fail-soft op alle fronten:
    //   - Geen naam? skip (geen zoekquery mogelijk).
    //   - Places-API down? skip + log warning.
    //   - Geen match? `place_match: null`.
    let placeMatch: PlaceSearchResult | null = null;
    if (result.name) {
      // Bouw query op basis van naam + locatie. Zonder locatie krijgt
      // Google bij gewone restaurant-namen (Bistro, De Kas, etc.) vaak
      // een match in de verkeerde stad — vandaar het belang van
      // adres/stad in de query.
      const locationHint = [result.address, result.postal_code, result.city]
        .filter(Boolean)
        .join(' ');
      const query = locationHint
        ? `${result.name} ${locationHint}`
        : result.name;
      try {
        const matches = await this.googleProfile.searchByText(query);
        placeMatch = matches[0] ?? null;
      } catch (err) {
        this.logger.warn(
          `Filly-Google-match faalde voor query "${query}": ${(err as Error).message}. Wizard gaat door zonder.`,
        );
      }
    }

    return { ...result, place_match: placeMatch };
  }

  // Search-endpoint specifiek voor de onboarding-wizard. Wordt
  // aangeroepen door de "Wijzigen"-knop bij Filly's Google-match —
  // eigenaar typt z'n eigen zoekopdracht en kiest uit max 5
  // alternatieven. Geen RestaurantAccessGuard want het restaurant
  // bestaat nog niet; alleen AuthGuard via klasse-niveau.
  //
  // Gebruikt dezelfde rate-limit als de andere AI-endpoints zodat
  // een script dat dit spamt onze Places-API-quota niet leegtrekt.
  @Post('google-search')
  async googleSearch(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { query: string },
  ) {
    if (!body?.query || typeof body.query !== 'string') {
      throw new BadRequestException('Body moet een `query` (string) bevatten.');
    }
    enforceAiRateLimit(user.id);
    return this.googleProfile.searchByText(body.query);
  }

  // Analyseert een geüploade menukaart via Claude Vision. Multipart-
  // upload met 1 bestand (PDF of foto). Tijdens onboarding bewaren we
  // het bronbestand NIET in Storage — user heeft nog geen restaurant-id,
  // dus geen pad waar we 'm kunnen opslaan. Bij heropen vanuit de
  // menu-pagina gaat het wél naar Storage (fase later).
  @Post('analyze-menu')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB hard cap
    }),
  )
  analyzeMenu(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Geen bestand ontvangen. Upload een foto of PDF van je menukaart.',
      );
    }
    enforceAiRateLimit(user.id);
    return this.menuImporter.analyze(
      {
        buffer: file.buffer,
        mimeType: file.mimetype,
        originalName: file.originalname,
      },
      // userId bewust niet meegeven: public.users-spiegelrij bestaat
      // pas na onboarding-complete, FK zou falen. Zie comment bij
      // analyzeWebsite hierboven.
      { restaurantId: null },
      'menu',
    );
  }

  // Analyseert een geüploade DRANKKAART via Claude Vision. Zelfde
  // upload-pattern als analyze-menu maar gebruikt een ander tool-
  // schema (subcategory-enum: wijn-rood/bier/cocktail/etc.) en
  // forceert server-side category='drank' op alle items.
  @Post('analyze-drinks')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  analyzeDrinks(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Geen bestand ontvangen. Upload een foto of PDF van je drankkaart.',
      );
    }
    enforceAiRateLimit(user.id);
    return this.menuImporter.analyze(
      {
        buffer: file.buffer,
        mimeType: file.mimetype,
        originalName: file.originalname,
      },
      { restaurantId: null },
      'drinks',
    );
  }
}
