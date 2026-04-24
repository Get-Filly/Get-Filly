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
import { AuthGuard } from '../common/auth.guard';
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
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly analyzer: WebsiteAnalyzerService,
    private readonly menuImporter: MenuImporterService,
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
  analyzeWebsite(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { url: string },
  ) {
    enforceAiRateLimit(user.id);
    return this.analyzer.analyze(body.url);
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
    );
  }
}
