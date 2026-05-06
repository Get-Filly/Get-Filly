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
    body: { channels?: Array<'mail' | 'instagram' | 'facebook'> } | undefined,
  ) {
    // Frontend stuurt 'channels' vanuit de checkboxes mee; ongeselecteerde
    // kanalen worden niet aangemaakt. Validatie van de waardes gebeurt
    // in de service zodat we daar een nette NL-foutmelding produceren.
    const validChannels = (body?.channels ?? []).filter(
      (c): c is 'mail' | 'instagram' | 'facebook' =>
        c === 'mail' || c === 'instagram' || c === 'facebook',
    );
    return this.suggestions.approveBundle(
      restaurantId,
      id,
      user.id,
      validChannels.length > 0 ? validChannels : undefined,
    );
  }

  // Refine-flow: laat Filly het voorstel aanpassen volgens een user-
  // instructie ("maak huiselijker", "korter onderwerp"). Werkt alleen
  // op single-channel proposals.
  @Post(':id/refine')
  refine(
    @RestaurantId() restaurantId: string,
    @Param('id') id: string,
    @Body() body: { instruction?: string },
  ) {
    return this.suggestions.refine(restaurantId, id, body.instruction ?? '');
  }

  // Variant-selectie: zet welke van de 3 varianten de eigenaar
  // verkiest als basis voor refine/approve. Body: { index: number }.
  @Post(':id/select-variant')
  selectVariant(
    @RestaurantId() restaurantId: string,
    @Param('id') id: string,
    @Body() body: { index?: number },
  ) {
    const idx = typeof body.index === 'number' ? body.index : -1;
    return this.suggestions.selectVariant(restaurantId, id, idx);
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
