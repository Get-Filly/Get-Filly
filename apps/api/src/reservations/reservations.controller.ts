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
import { ReservationsService } from './reservations.service';
import { RestaurantId } from '../common/restaurant-id.decorator';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/current-user.decorator';

@UseGuards(AuthGuard, RestaurantAccessGuard)
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get()
  findRange(
    @RestaurantId() restaurantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const today = new Date();
    const defaultFrom =
      from ?? today.toISOString().slice(0, 10);
    const defaultTo =
      to ??
      new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
    return this.reservations.findRange(restaurantId, defaultFrom, defaultTo);
  }

  // Handmatige boeking (telefoon / walk-in) toevoegen. Body bevat
  // naam + datum + tijd + groepsgrootte als verplichte velden; rest
  // is optioneel. Frontend toont deze via een "Nieuwe reservering"-
  // knop rechtsboven op de reserveringen-pagina.
  @Post()
  create(
    @RestaurantId() restaurantId: string,
    @Body()
    body: {
      guest_name: string;
      reservation_date: string;
      reservation_time: string;
      party_size: number;
      guest_phone?: string | null;
      guest_email?: string | null;
      special_requests?: string | null;
      notes?: string | null;
    },
  ) {
    return this.reservations.create(restaurantId, body);
  }

  // Koppel reservering aan een Filly-campagne (handmatig vanuit de UI)
  // of ontkoppel door campaign_id=null te sturen. Hierop bouwen alle
  // Filly-ROI-aggregaties (KpiService, rapportages-pagina). Tot er
  // automatische attributie via send-engine is, is dit de enige manier
  // om data in de attributie-FK te krijgen.
  @Patch(':id/attribution')
  setAttribution(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { campaign_id: string | null },
  ) {
    // userId mee zodat audit-log per team-member traceerbaar blijft
    // welke reservering aan welke campagne gekoppeld is — Filly-ROI
    // staat of valt met deze attributie, dus auditbaarheid is cruciaal.
    return this.reservations.setAttribution(
      restaurantId,
      id,
      body.campaign_id,
      user.id,
    );
  }
}
