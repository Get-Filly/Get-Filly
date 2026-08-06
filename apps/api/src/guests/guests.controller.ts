import { Controller, Get, UseGuards } from '@nestjs/common';
import { GuestsService } from './guests.service';
import { BusinessId } from '../common/business-id.decorator';
import { AuthGuard } from '../common/auth.guard';
import { BusinessAccessGuard } from '../common/business-access.guard';

@UseGuards(AuthGuard, BusinessAccessGuard)
@Controller('guests')
export class GuestsController {
  constructor(private readonly guests: GuestsService) {}

  @Get()
  findAll(@BusinessId() businessId: string) {
    return this.guests.findAll(businessId);
  }
}
