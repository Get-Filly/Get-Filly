import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MenuSuggestionsService } from './menu-suggestions.service';
import { BusinessId } from '../common/business-id.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/current-user.decorator';
import { AuthGuard } from '../common/auth.guard';
import { BusinessAccessGuard } from '../common/business-access.guard';
import { AiRateLimitGuard } from '../common/ai-rate-limit.guard';

// AuthGuard verifieert het JWT; BusinessAccessGuard zorgt dat de
// user bij dit restaurant hoort. Beide op klasse-niveau zodat álle
// endpoints automatisch beschermd zijn.
@UseGuards(AuthGuard, BusinessAccessGuard)
@Controller('menu-suggestions')
export class MenuSuggestionsController {
  constructor(private readonly service: MenuSuggestionsService) {}

  // Lijst van voorstellen. Default status='pending' voor de
  // "Voorgesteld"-tab; status='rejected' voor de "Afgewezen"-tab.
  // Lazy expire-cleanup van pending gebeurt in de service.
  @Get()
  list(
    @BusinessId() businessId: string,
    @Query('status') status?: string,
  ) {
    if (status && status !== 'pending' && status !== 'rejected') {
      throw new BadRequestException(
        "Ongeldige status. Gebruik 'pending' of 'rejected'.",
      );
    }
    return this.service.list(businessId, status as 'pending' | 'rejected' | undefined);
  }

  // "✨ Vraag Filly om gerecht-voorstellen". AiRateLimitGuard staat
  // alleen voor de generate + refine endpoints, list/accept/reject
  // doen geen AI-calls dus die hoeven niet rate-limited.
  @Post('generate')
  @UseGuards(AiRateLimitGuard)
  generate(
    @BusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.generate(businessId, user.id);
  }

  // 1-klik accept: voorstel → echt menu_item.
  @Post(':id/accept')
  accept(
    @BusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.accept(businessId, id, user.id);
  }

  // Reject = status='rejected'. Niet hard-deleten zodat we later
  // kunnen leren welke voorstellen werden afgewezen (signal voor
  // prompt-tuning).
  @Delete(':id')
  reject(
    @BusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.reject(businessId, id, user.id);
  }

  // "Andere variant"-knop. Genereert nieuwe pending-rij; oude wordt
  // op refined_into gezet. Cap van 3 refines per origineel.
  @Post(':id/refine')
  @UseGuards(AiRateLimitGuard)
  refine(
    @BusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.refine(businessId, id, user.id);
  }
}
