import {
  Body,
  Controller,
  Get,
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
  // laatste 20 berichten zodat de UI de history direct kan renderen.
  @Get('active')
  getActive(@RestaurantId() restaurantId: string) {
    return this.chat.getOrCreateActiveConversation(restaurantId);
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
