import { Controller, Get } from '@nestjs/common';
import { KpiService } from './kpi.service';

@Controller('kpi')
export class KpiController {
  constructor(private readonly kpi: KpiService) {}

  @Get()
  getKpis() {
    return this.kpi.getKpis();
  }
}
