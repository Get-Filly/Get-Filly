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
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

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
