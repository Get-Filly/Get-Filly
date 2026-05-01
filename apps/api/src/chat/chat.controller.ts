import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { RestaurantId } from '../common/restaurant-id.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/current-user.decorator';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';
import { AiRateLimitGuard } from '../common/ai-rate-limit.guard';

@UseGuards(AuthGuard, RestaurantAccessGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  // Haalt de actieve chat-thread op bij dashboard-open. Maakt bij
  // eerste bezoek een lege conversation aan. Returnt conversationId +
  // laatste 20 berichten + messageCount zodat de UI de history direct
  // kan renderen + cap-indicator kan tonen.
  @Get('active')
  getActive(@RestaurantId() restaurantId: string) {
    return this.chat.getOrCreateActiveConversation(restaurantId);
  }

  // Lijst van alle conversaties voor de chat-history-dropdown. Title +
  // message_count + updated_at — geen messages of memory-summaries
  // (die zijn lazy bij switch).
  @Get('conversations')
  listConversations(@RestaurantId() restaurantId: string) {
    return this.chat.listConversations(restaurantId);
  }

  // Switcht naar een specifieke conversatie. Frontend roept dit aan
  // wanneer de eigenaar een titel aanklikt in de dropdown.
  @Get('conversations/:id')
  getConversation(
    @RestaurantId() restaurantId: string,
    @Param('id') id: string,
  ) {
    return this.chat.getConversation(restaurantId, id);
  }

  // Start expliciet een nieuwe lege conversatie. Aangeroepen via
  // "+ Nieuw gesprek"-knop in de dropdown, OF wanneer de eigenaar
  // bij een vol-gesprek op "Start nieuw gesprek"-CTA klikt.
  @Post('conversations')
  createConversation(@RestaurantId() restaurantId: string) {
    return this.chat.createConversation(restaurantId);
  }

  // Bericht sturen. Rate-limit-guard draait hier extra bovenop de
  // class-level guards: elke Claude-call telt mee voor de 100/uur
  // limiet per restaurant (gedeeld met reviews).
  @UseGuards(AiRateLimitGuard)
  @Post('messages')
  sendMessage(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { conversation_id: string; content: string },
  ) {
    return this.chat.sendMessage(
      restaurantId,
      user.id,
      body.conversation_id,
      body.content,
    );
  }
}
