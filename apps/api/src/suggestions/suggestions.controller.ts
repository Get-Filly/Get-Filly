import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  SuggestionsService,
  type SuggestionStatus,
} from './suggestions.service';
import { RestaurantId } from '../common/restaurant-id.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/current-user.decorator';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';
import { AiRateLimitGuard } from '../common/ai-rate-limit.guard';

@UseGuards(AuthGuard, RestaurantAccessGuard)
@Controller('suggestions')
export class SuggestionsController {
  constructor(private readonly suggestions: SuggestionsService) {}

  @Get()
  findAll(
    @RestaurantId() restaurantId: string,
    @Query('status') status?: SuggestionStatus,
    // 'exclude' kan een comma-gescheiden lijst trigger_types zijn die
    // niet getoond moeten worden. Gebruikt door /dashboard/campagnes
    // om chat_bundle-suggesties uit te sluiten, die horen alleen in
    // de chat-flow zelf, niet als losse suggestie-kaart.
    @Query('exclude') exclude?: string,
  ) {
    const excludeList = exclude
      ? exclude
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : undefined;
    return this.suggestions.findAll(restaurantId, status, excludeList);
  }

  @Get(':id')
  findOne(
    @RestaurantId() restaurantId: string,
    @Param('id') id: string,
  ) {
    return this.suggestions.findById(restaurantId, id);
  }

  // Detail-modal: hoofdgerecht + bijgerechten + timing + bundle-prijs
  // + hero-foto-suggestie. Eerste call genereert via Claude (~2s),
  // daarna gecachet op de suggestie (instant).
  @Get(':id/proposal-details')
  getProposalDetails(
    @RestaurantId() restaurantId: string,
    @Param('id') id: string,
  ) {
    return this.suggestions.getProposalDetails(restaurantId, id);
  }

  // Filly aan het werk-knop: genereert 3-5 nieuwe voorstellen op
  // basis van profiel + menu + bezetting/weer. AiRateLimitGuard
  // hangt erop zodat een eigenaar niet 100x per minuut kan klikken
  // (per-restaurant 100 calls/uur, voor alle Claude-features samen).
  @Post('generate')
  @UseGuards(AiRateLimitGuard)
  generate(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.suggestions.generateOnDemand(restaurantId, user.id);
  }

  // "Filly bekijkt rustige dagen"-knop in de dashboard alert-bar.
  // Detecteert dagen met < 50% bezetting in window 2-14 dagen vooruit
  // en genereert per dag een toegespitst voorstel. Skipt dagen die
  // al een pending low-occupancy-suggestie hebben.
  @Post('detect-low-occupancy')
  @UseGuards(AiRateLimitGuard)
  detectLowOccupancy(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.suggestions.detectAndGenerateLowOccupancy(
      restaurantId,
      user.id,
    );
  }

  // Aangesloten op de groene "Vraag Filly om voorstellen"-knop op
  // het dashboard (popover met dag-multi-select). Accepteert een
  // expliciete lijst items met kind low_occupancy | special_day.
  // Genereert per item een toegespitst voorstel.
  @Post('generate-for-dates')
  @UseGuards(AiRateLimitGuard)
  generateForDates(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      items?: Array<{
        date?: unknown;
        kind?: unknown;
        name?: unknown;
      }>;
    },
  ) {
    // Lichte input-sanitisatie: shape afdwingen, rest valideert de
    // service zelf (count, menu-pre-flight, etc).
    type SanitizedItem = {
      date: string;
      kind: 'low_occupancy' | 'special_day';
      name?: string;
    };
    const rawItems = Array.isArray(body?.items) ? body.items : [];
    const items: SanitizedItem[] = [];
    for (const r of rawItems) {
      if (typeof r?.date !== 'string') continue;
      if (r?.kind !== 'low_occupancy' && r?.kind !== 'special_day') {
        continue;
      }
      const item: SanitizedItem = { date: r.date, kind: r.kind };
      if (typeof r.name === 'string') item.name = r.name;
      items.push(item);
    }

    return this.suggestions.generateForSelectedDates(
      restaurantId,
      user.id,
      items,
    );
  }

  // Goedkeur-flow: suggestie → campagne. Aparte POST want het is
  // meer dan een status-update (er wordt een nieuwe resource
  // aangemaakt). Retourneert de bijgewerkte suggestie + id van
  // de nieuwe campagne zodat de frontend daarheen kan linken.
  @Post(':id/approve')
  approve(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    // userId mee zodat de campagne-create die hieruit volgt geen
    // null-actor in de audit-log laat, bij een team weten we dan
    // wié op "Goedkeuren" klikte.
    return this.suggestions.approve(restaurantId, id, user.id);
  }

  // Goedkeur-flow voor multi-channel-bundle (sinds 2026-05-04).
  // Werkt alleen op suggesties met trigger_type='chat_bundle'. Maakt
  // 1 campaign_groups + 3 campaigns (mail / IG / FB) tegelijk en geeft
  // alle 4 IDs terug zodat de frontend de drie campagne-detail-links
  // kan tonen.
  @Post(':id/approve-bundle')
  approveBundle(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body()
    body:
      | {
          channels?: Array<
            'mail' | 'instagram' | 'facebook' | 'whatsapp' | 'google_business'
          >;
        }
      | undefined,
  ) {
    // Frontend stuurt 'channels' vanuit de checkboxes mee; ongeselecteerde
    // kanalen worden niet aangemaakt. Sinds 2026-06-02 ook whatsapp +
    // google_business. Validatie van de waardes gebeurt in de service.
    const allowedBundleChannels = [
      'mail',
      'instagram',
      'facebook',
      'whatsapp',
      'google_business',
    ] as const;
    const validChannels = (body?.channels ?? []).filter(
      (c): c is (typeof allowedBundleChannels)[number] =>
        (allowedBundleChannels as readonly string[]).includes(c),
    );
    return this.suggestions.approveBundle(
      restaurantId,
      id,
      user.id,
      validChannels.length > 0 ? validChannels : undefined,
    );
  }

  // Refine-flow: laat Filly het voorstel aanpassen volgens een user-
  // instructie ("maak huiselijker", "korter onderwerp"). Per 2026-05-21
  // multi-channel-aware: bij channels[]-suggesties target de service
  // het kanaal via body.channel_id; bij legacy single-channel werkt
  // het op sc.variants (geen channel_id nodig).
  @Post(':id/refine')
  refine(
    @RestaurantId() restaurantId: string,
    @Param('id') id: string,
    @Body() body: { instruction?: string; channel_id?: string },
  ) {
    return this.suggestions.refine(
      restaurantId,
      id,
      body.instruction ?? '',
      body.channel_id,
    );
  }

  // Variant-selectie: zet welke van de 3 varianten de eigenaar
  // verkiest als basis voor refine/approve. Body: { index: number }.
  @Post(':id/select-variant')
  selectVariant(
    @RestaurantId() restaurantId: string,
    @Param('id') id: string,
    @Body() body: { index?: number; channel_id?: string },
  ) {
    const idx = typeof body.index === 'number' ? body.index : -1;
    return this.suggestions.selectVariant(
      restaurantId,
      id,
      idx,
      body.channel_id,
    );
  }

  // Per 2026-05-07: eigenaar zet zelf een verzendmoment op een pending
  // suggestie vóór goedkeuring. ISO-datum verplicht; backend valideert
  // toekomst + max 1 jaar vooruit. Per fase 2c: optioneel channel_id
  // voor multi-channel-voorstellen.
  @Post(':id/scheduled')
  setScheduled(
    @RestaurantId() restaurantId: string,
    @Param('id') id: string,
    @Body() body: { scheduled_for?: string; channel_id?: string },
  ) {
    return this.suggestions.setScheduled(
      restaurantId,
      id,
      body.scheduled_for ?? '',
      body.channel_id,
    );
  }

  // Per 2026-05-07 fase 2b: eigenaar voegt een extra kanaal toe aan
  // een pending-suggestie (multi-channel). Body { platform: 'mail' |
  // 'whatsapp' | 'instagram' | 'facebook' | 'tiktok' }.
  @Post(':id/channels')
  addChannel(
    @RestaurantId() restaurantId: string,
    @Param('id') id: string,
    @Body() body: { platform?: string },
  ) {
    return this.suggestions.addChannel(
      restaurantId,
      id,
      (body.platform ?? '') as
        | 'mail'
        | 'whatsapp'
        | 'instagram'
        | 'facebook'
        | 'tiktok',
    );
  }

  // Verwijder een kanaal uit een pending-suggestie. Het laatste kanaal
  // mag niet verwijderd worden (dan zou er geen voorstel meer zijn).
  @Post(':id/channels/:channelId/remove')
  removeChannel(
    @RestaurantId() restaurantId: string,
    @Param('id') id: string,
    @Param('channelId') channelId: string,
  ) {
    return this.suggestions.removeChannel(restaurantId, id, channelId);
  }

  // Per 2026-05-07: eigenaar koppelt vóór goedkeuring een foto uit
  // de bibliotheek aan een suggestie. Alleen voor social/whatsapp.
  // media_id=null verbreekt de koppeling.
  @Post(':id/media')
  setMedia(
    @RestaurantId() restaurantId: string,
    @Param('id') id: string,
    @Body() body: { media_id?: string | null; channel_id?: string },
  ) {
    return this.suggestions.setMedia(
      restaurantId,
      id,
      body.media_id ?? null,
      body.channel_id,
    );
  }

  // Per 2026-05-07: eigenaar bewerkt vóór goedkeuring een specifieke
  // variant (subject + body). Verplicht: index. Optioneel: subject_line
  // (null/lege string = wis), body (lege body = blijft staan).
  @Post(':id/edit-variant')
  editVariant(
    @RestaurantId() restaurantId: string,
    @Param('id') id: string,
    @Body()
    body: {
      index?: number;
      subject_line?: string | null;
      body?: string;
      channel_id?: string;
    },
  ) {
    const idx = typeof body.index === 'number' ? body.index : -1;
    return this.suggestions.editVariant(
      restaurantId,
      id,
      idx,
      {
        subject_line: body.subject_line,
        body: body.body,
      },
      body.channel_id,
    );
  }

  @Patch(':id')
  updateStatus(
    @RestaurantId() restaurantId: string,
    @Param('id') id: string,
    @Body() body: { status: SuggestionStatus; rejection_reason?: string },
  ) {
    return this.suggestions.updateStatus(
      restaurantId,
      id,
      body.status,
      body.rejection_reason,
    );
  }
}
