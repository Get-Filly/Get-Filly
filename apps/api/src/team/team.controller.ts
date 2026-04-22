import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { TeamService } from './team.service';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';
import { CurrentRestaurant } from '../common/current-restaurant.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import type { RestaurantAccess } from '../common/restaurant-access.service';
import type { AuthenticatedUser } from '../common/current-user.decorator';
import type { Module, Role } from '@getfilly/shared';

/**
 * ============================================================
 * TeamController — endpoints voor team-management
 * ============================================================
 *
 * Alle endpoints vereisen AuthGuard + RestaurantAccessGuard + rol "owner".
 * De owner-check doen we per methode (geen aparte guard nodig voor
 * één controller).
 */
@UseGuards(AuthGuard, RestaurantAccessGuard)
@Controller('team')
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get()
  async list(@CurrentRestaurant() ctx: RestaurantAccess) {
    this.requireOwner(ctx);
    return this.team.listMembers(ctx.restaurantId);
  }

  @Patch(':userId')
  async update(
    @CurrentRestaurant() ctx: RestaurantAccess,
    @Param('userId') userId: string,
    @Body() body: { role?: Role; permissions?: Module[] | null },
  ) {
    this.requireOwner(ctx);
    return this.team.updateMember(ctx.restaurantId, userId, body);
  }

  @Delete(':userId')
  async remove(
    @CurrentRestaurant() ctx: RestaurantAccess,
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    this.requireOwner(ctx);

    // Extra vangnet: je mag jezelf niet verwijderen (dan lock je
    // jezelf buiten het restaurant — ook als er nog andere owners zijn,
    // willen we dit expliciet niet toestaan via de UI). Wil de owner
    // echt weg? Dan eerst iemand anders owner maken, daarna loguit.
    if (userId === user.id) {
      throw new ForbiddenException(
        'Je kunt jezelf niet verwijderen uit je eigen restaurant.',
      );
    }

    await this.team.removeMember(ctx.restaurantId, userId);
    return { ok: true };
  }

  /**
   * Kleine helper: gooit 403 als de huidige user geen owner is in dit
   * restaurant. In elke methode aangeroepen zodat we één plek hebben
   * om de regel aan te passen.
   */
  private requireOwner(ctx: RestaurantAccess): void {
    if (ctx.role !== 'owner') {
      throw new ForbiddenException(
        'Alleen de eigenaar van dit restaurant mag het team beheren.',
      );
    }
  }
}
