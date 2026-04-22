import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TeamService } from './team.service';
import { AuthGuard } from '../common/auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthenticatedUser } from '../common/current-user.decorator';

/**
 * ============================================================
 * InvitesController — accept-flow voor team-uitnodigingen
 * ============================================================
 *
 * Dit endpoint staat los van de TeamController omdat het:
 *   - Geen actieve restaurant-context heeft (user heeft juist net de
 *     invite geklikt en wil gekoppeld WORDEN aan een restaurant).
 *   - Alleen AuthGuard vereist (user moet ingelogd zijn — de magic
 *     link van Supabase regelt die login automatisch).
 *
 * De owner-check en tenant-check zitten binnen acceptInvite():
 *   - Alleen de user wiens e-mail in de invite staat mag hem gebruiken.
 *   - De invite moet pending en niet verlopen zijn.
 */
@UseGuards(AuthGuard)
@Controller('invites')
export class InvitesController {
  constructor(private readonly team: TeamService) {}

  @Post('accept')
  async accept(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { token: string },
  ) {
    if (!body?.token || typeof body.token !== 'string') {
      throw new BadRequestException('Token ontbreekt.');
    }
    return this.team.acceptInvite(body.token, user.id, user.email);
  }
}
