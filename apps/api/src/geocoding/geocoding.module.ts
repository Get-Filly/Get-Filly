import { Module } from '@nestjs/common';
import { GeocodingService } from './geocoding.service';

// GeocodingModule, stateless HTTP-client voor PDOK Locatieserver.
// Heeft geen externe afhankelijkheden (geen Supabase, geen AI), dus
// pure export-module. Andere modules (bv. OnboardingModule) importeren
// 'm om GeocodingService te kunnen injecteren.
@Module({
  providers: [GeocodingService],
  exports: [GeocodingService],
})
export class GeocodingModule {}
