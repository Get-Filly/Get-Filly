import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { RestaurantId } from '../common/restaurant-id.decorator';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

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
}
