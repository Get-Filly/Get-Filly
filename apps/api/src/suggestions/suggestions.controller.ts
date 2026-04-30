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
  ) {
    return this.suggestions.findAll(restaurantId, status);
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

  // Goedkeur-flow: suggestie → campagne. Aparte POST want het is
  // meer dan een status-update (er wordt een nieuwe resource
  // aangemaakt). Retourneert de bijgewerkte suggestie + id van
  // de nieuwe campagne zodat de frontend daarheen kan linken.
  @Post(':id/approve')
  approve(
    @RestaurantId() restaurantId: string,
    @Param('id') id: string,
  ) {
    return this.suggestions.approve(restaurantId, id);
  }

  // Refine-flow: laat Filly het voorstel aanpassen volgens een user-
  // instructie ("maak huiselijker", "korter onderwerp"). Body bevat
  // { instruction: string }. Werkt op de geselecteerde variant.
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
