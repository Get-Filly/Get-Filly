import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ChatService, type ActiveActionInput } from './chat.service';
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
  // message_count + updated_at, geen messages of memory-summaries
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

  // Verwijder een conversatie + bijhorende berichten. Voor delete
  // probeert ChatService eerst de Haiku-summary op te slaan zodat
  // geleerde voorkeuren bewaard blijven in restaurant_chat_memory.
  @Delete('conversations/:id')
  deleteConversation(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.chat.deleteConversation(restaurantId, id, user.id);
  }

  // Lopende actie bijwerken (audit-item #8). De geleide flow PATCHt hier
  // bij elke keuze (dag/context/kanalen) zodat de gekozen state ook
  // server-side bekend is en de chat-prompt 'm meekrijgt. `reset: true`
  // wist de actie (bv. na een geslaagde generatie). Geen AI-call, dus
  // geen rate-limit-guard — alleen de class-level auth/tenant-guards.
  @Patch('conversations/:id/active-action')
  updateActiveAction(
    @RestaurantId() restaurantId: string,
    @Param('id') id: string,
    @Body() body: ActiveActionInput,
  ) {
    return this.chat.setActiveAction(restaurantId, id, body);
  }

  // Schrijf een Filly-notitie bij het gesprek (geen Claude-call). De geleide
  // flow gebruikt dit om ná het genereren een spoor in de historie te laten,
  // zodat de eigenaar bij terugkomst ziet wat er gebeurd is.
  @Post('conversations/:id/note')
  appendNote(
    @RestaurantId() restaurantId: string,
    @Param('id') id: string,
    @Body() body: { text?: string; card?: unknown },
  ) {
    return this.chat.appendNote(restaurantId, id, body?.text ?? '', body?.card);
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
