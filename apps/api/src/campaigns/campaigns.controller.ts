import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  CampaignsService,
  type CampaignStatus,
  type CampaignType,
} from './campaigns.service';
import { CampaignPerformanceService } from './campaign-performance.service';
import { CampaignFingerprintService } from './campaign-fingerprint.service';
import { MailService } from '../mail/mail.service';
import { RestaurantId } from '../common/restaurant-id.decorator';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/current-user.decorator';

@UseGuards(AuthGuard, RestaurantAccessGuard)
@Controller('campaigns')
export class CampaignsController {
  constructor(
    private readonly campaigns: CampaignsService,
    // MailService wordt vanuit MailModule geïnjecteerd. Bedoeling: alle
    // mail-flow-logica (recipients resolven, Resend-call, audit) blijft
    // in MailService; de controller is alleen entry-point + validatie.
    private readonly mail: MailService,
    private readonly performance: CampaignPerformanceService,
    private readonly fingerprint: CampaignFingerprintService,
  ) {}

  @Get()
  findAll(@RestaurantId() restaurantId: string) {
    return this.campaigns.findAll(restaurantId);
  }

  // Per 2026-05-12 (mig 0040): verwijderde (soft-deleted) campagnes
  // voor de Verwijderd-tab op /campagnes/history. Aparte route i.p.v.
  // query-param zodat URLs zelf-documenterend zijn en RLS makkelijk
  // te lezen blijft.
  @Get('deleted')
  findDeleted(@RestaurantId() restaurantId: string) {
    return this.campaigns.findDeleted(restaurantId);
  }

  // Per 2026-05-07 fase 4: bundle-detail. Retourneert de campaign_groups
  // rij + alle gekoppelde campagnes zodat de frontend een multi-channel
  // bundle-pagina kan tonen waarin eigenaar tussen kanalen kan switchen.
  @Get('bundle/:groupId')
  findBundle(
    @RestaurantId() restaurantId: string,
    @Param('groupId') groupId: string,
  ) {
    return this.campaigns.findBundle(restaurantId, groupId);
  }

  @Get(':id')
  findOne(@RestaurantId() restaurantId: string, @Param('id') id: string) {
    return this.campaigns.findById(restaurantId, id);
  }

  // ============================================================
  // Performance-endpoints (filly-brein hfst 9)
  // ============================================================

  // Score + breakdown voor één campagne. Returnt null als er nog geen
  // performance-rij bestaat (campagne nog niet 'actief' geweest, of
  // gemaakt vóór mig 0046).
  @Get(':id/performance')
  getPerformance(@Param('id') id: string) {
    return this.performance.getForCampaign(id);
  }

  // Outlier-markering: eigenaar geeft aan dat deze campagne "buiten de
  // controle viel" (slecht weer / staking / atypische context). De
  // performance-rij blijft zichtbaar in UI maar wordt geëxcludeerd uit
  // Filly's leerloop (winners/underperformers-queries filteren erop).
  @Post(':id/performance/outlier')
  markOutlier(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { reason?: string },
  ) {
    return this.performance.markOutlier(id, user.id, body?.reason ?? null);
  }

  @Delete(':id/performance/outlier')
  unmarkOutlier(@Param('id') id: string) {
    return this.performance.unmarkOutlier(id);
  }

  // Maakt een nieuwe campagne als 'concept'. Wordt aangeroepen vanaf
  // de Filly-chat zodra de eigenaar op "Ja, maak aan" klikt. Body:
  //   { name: string, type: 'mail'|'social'|'whatsapp',
  //     subject_line?: string, body: string }
  // RestaurantAccessGuard zorgt dat de user alleen mag schrijven naar
  // een restaurant waar hij toegang toe heeft.
  @Post()
  create(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      name?: string;
      type?: string;
      subject_line?: string | null;
      body?: string;
    },
  ) {
    const name = body.name?.trim();
    const content = body.body?.trim();
    const type = body.type;

    if (!name) {
      throw new BadRequestException('Campagne-naam is verplicht.');
    }
    if (!content) {
      throw new BadRequestException('Campagne-inhoud is verplicht.');
    }
    if (type !== 'mail' && type !== 'social' && type !== 'whatsapp') {
      throw new BadRequestException(
        "Ongeldig campagnetype. Gebruik 'mail', 'social' of 'whatsapp'.",
      );
    }

    return this.campaigns.create(
      restaurantId,
      {
        name,
        type: type as CampaignType,
        subject_line: body.subject_line ?? null,
        body: content,
      },
      user.id,
    );
  }

  // Status-transitie endpoint. Aparte route i.p.v. status-veld in
  // de generieke PATCH zodat valideerbare lifecycle-logica niet stil
  // kan worden omzeild (bv. concept-edit die per ongeluk een status-
  // wijziging meestuurt).
  @Patch(':id/status')
  updateStatus(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { status?: string },
  ) {
    const status = body.status;
    if (
      status !== 'concept' &&
      status !== 'ingepland' &&
      status !== 'actief' &&
      status !== 'afgerond'
    ) {
      throw new BadRequestException(
        'Ongeldige status. Gebruik concept, ingepland, actief of afgerond.',
      );
    }
    return this.campaigns.updateStatus(
      restaurantId,
      id,
      status as CampaignStatus,
      user.id,
    );
  }

  @Delete(':id')
  remove(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    // userId mee zodat audit-log laat zien wié verwijderde, onomkeerbaar
    // dus extra belangrijk dat de actor traceerbaar is.
    return this.campaigns.remove(restaurantId, id, user.id);
  }

  // POST /api/campaigns/:id/publish — publiceer een social-campagne nu
  // naar Facebook/Instagram. Idempotent (al gepubliceerd → no-op).
  // Gebruikt door "Activeer nu" in de detail-page.
  @Post(':id/publish')
  publish(@RestaurantId() restaurantId: string, @Param('id') id: string) {
    return this.campaigns.publishSocialCampaign(restaurantId, id);
  }

  // ============================================================
  // VARIANT-ENDPOINTS (per 2026-05-13, mig 0041)
  // ============================================================
  // Bron-van-waarheid is campaigns.variants + selected_variant_index.
  // Drie endpoints, allemaal beperkt tot status='concept' (service-
  // laag handhaaft).
  //
  // URL-structuur kiezen we zo dat ':idx' altijd een getal is (geen
  // ambiguïteit met sub-actions zoals '/select'). Daarom plakt /select
  // er als suffix achter en is /variants zonder idx alleen voor POST
  // (genereren).
  //
  //   PATCH /campaigns/:id/variants/:idx/select  → flip Gekozen
  //   PATCH /campaigns/:id/variants/:idx         → edit een versie
  //   POST  /campaigns/:id/variants              → genereer 3 nieuwe

  @Patch(':id/variants/:idx/select')
  selectVariant(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('idx') idxParam: string,
  ) {
    const idx = Number.parseInt(idxParam, 10);
    if (!Number.isFinite(idx)) {
      throw new BadRequestException(
        'Variant-index in URL moet een geheel getal zijn.',
      );
    }
    return this.campaigns.selectVariant(restaurantId, id, idx, user.id);
  }

  @Patch(':id/variants/:idx')
  editVariant(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('idx') idxParam: string,
    @Body() body: { subject_line?: string | null; body?: string },
  ) {
    const idx = Number.parseInt(idxParam, 10);
    if (!Number.isFinite(idx)) {
      throw new BadRequestException(
        'Variant-index in URL moet een geheel getal zijn.',
      );
    }
    return this.campaigns.editVariant(
      restaurantId,
      id,
      idx,
      {
        subject_line: body?.subject_line,
        body: body?.body,
      },
      user.id,
    );
  }

  @Post(':id/variants')
  generateMoreVariants(
    @RestaurantId() restaurantId: string,
    @Param('id') id: string,
    @Body() body: { instruction?: string },
  ) {
    return this.campaigns.generateMoreVariants(
      restaurantId,
      id,
      body?.instruction,
    );
  }

  // Upload een foto voor een concept-campagne (social of whatsapp).
  // Multipart-upload met 1 bestand. 10MB cap, JPG/PNG/WebP/GIF.
  // Vervangt eventueel oude foto in storage zodat we geen wezen
  // krijgen. Returnt het pad + 1-uur signed URL.
  @Post(':id/media')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadMedia(
    @RestaurantId() restaurantId: string,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Geen bestand ontvangen. Selecteer een foto om te uploaden.',
      );
    }
    return this.campaigns.uploadMedia(restaurantId, id, {
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname,
    });
  }

  @Delete(':id/media')
  deleteMedia(
    @RestaurantId() restaurantId: string,
    @Param('id') id: string,
  ) {
    return this.campaigns.deleteMedia(restaurantId, id);
  }

  // Bevestig of override het verzendmoment. Body { datetime: ISO }.
  // Wordt aangeroepen bij accepteren van het Filly-voorstel (frontend
  // stuurt suggested_scheduled_for) of bij handmatige edit.
  @Patch(':id/scheduled')
  setSchedule(
    @RestaurantId() restaurantId: string,
    @Param('id') id: string,
    @Body() body: { datetime?: string },
  ) {
    if (!body.datetime) {
      throw new BadRequestException('Tijdstip ontbreekt in request.');
    }
    return this.campaigns.setSchedule(restaurantId, id, body.datetime);
  }

  // ============================================================
  // POST /campaigns/:id/restore
  // ============================================================
  // Per 2026-05-21 (Floris-feedback): historie-campagnes terughalen
  // naar de kanban met nieuwe datum. Validaties zitten in de service
  // (status mag alleen concept/ingepland/actief, scheduled_for moet
  // in de toekomst, bron-campagne moet daadwerkelijk in de historie
  // zitten).
  @Post(':id/restore')
  restore(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { status?: string; scheduled_for?: string },
  ) {
    const status = body.status;
    if (
      status !== 'concept' &&
      status !== 'ingepland' &&
      status !== 'actief'
    ) {
      throw new BadRequestException(
        'Ongeldige status. Gebruik concept, ingepland of actief.',
      );
    }
    if (!body.scheduled_for) {
      throw new BadRequestException('Nieuwe datum ontbreekt in request.');
    }
    return this.campaigns.restoreFromHistory(
      restaurantId,
      id,
      status,
      body.scheduled_for,
      user.id,
    );
  }

  // ============================================================
  // POST /campaigns/:id/send
  // ============================================================
  // Verstuurt een mail-campagne via Resend. Twee modes:
  //   - 'test' → 1 mail naar opgegeven testEmail (eigenaar gebruikt
  //     z'n eigen adres om de visuele inhoud te checken voor de
  //     echte send-batch)
  //   - 'all_opted_in' → alle gasten van het restaurant met
  //     mail_opt_in=true en geldig e-mailadres
  //
  // Pre-flight checks zitten in MailService.sendCampaignByMode:
  //   - campagne moet type='mail' zijn
  //   - mail-content moet ingevuld zijn (subject + body)
  //   - bij 'all_opted_in': minimaal 1 opt-in gast vereist
  // Onomkeerbaar, front toont een confirm-modal voordat 'ie deze
  // call doet.
  // Aantal opt-in-gasten + eerste 5 namen + eigenaar's contact-mail.
  // Gebruikt door de detail-page verstuur-sectie zodat eigenaar
  // zie wie 'ie aanschrijft vóór 'ie op verstuur klikt.
  @Get(':id/recipients-preview')
  recipientsPreview(@RestaurantId() restaurantId: string) {
    return this.mail.getRecipientsPreview(restaurantId);
  }

  // Anti-repetitie-check (filly-brein hfst 8.6): vergelijkt de huidige
  // variant met recente campagnes en geeft waarschuwingen terug
  // (opening te gelijk / hashtags te overlappend / cta te vaak herhaald).
  // Lege array = niets aan de hand. UI toont de warnings naast de variant.
  @Get(':id/repetition-check')
  repetitionCheck(
    @RestaurantId() restaurantId: string,
    @Param('id') id: string,
  ) {
    return this.fingerprint.checkForCampaign(restaurantId, id);
  }

  @Post(':id/send')
  send(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body()
    body: { mode?: 'test' | 'all_opted_in'; testEmail?: string },
  ) {
    const mode = body?.mode ?? 'test';
    if (mode !== 'test' && mode !== 'all_opted_in') {
      throw new BadRequestException(
        "Ongeldige mode. Gebruik 'test' of 'all_opted_in'.",
      );
    }
    return this.mail.sendCampaignByMode(
      restaurantId,
      id,
      mode,
      { testEmail: body?.testEmail },
      user.id,
    );
  }
}
