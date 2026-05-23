import { Injectable, Logger } from '@nestjs/common';
import { GoogleProfileService } from '../google-profile/google-profile.service';
import type { AuditFinding, AuditSeverity } from '../google-profile/audit';
import type {
  HealthRunner,
  RunnerContext,
  RunnerFinding,
  RunnerResult,
} from './types';

/**
 * ============================================================
 * GbpRunner — Google Business Profile-kwaliteit
 * ============================================================
 *
 * Strategie:
 *   We hergebruiken de bestaande `runAudit()` uit google-profile/audit.ts
 *   (9 deterministische checks op de gecachete Place-details) en
 *   vertalen die naar RunnerFindings met een puntenbudget per severity.
 *
 *   Reviews-specifieke audit-codes (low_review_count, rating_below_4)
 *   filteren we hier eruit, die worden door ReviewsRunner verwerkt zodat
 *   we niet dubbel tellen.
 *
 * Geen Google-koppeling = sub-score 0 + 1 critical finding.
 * Dat is een normale staat (klant heeft GBP nog niet gekoppeld), geen
 * runner-failure. De UI biedt dan een directe link naar de koppel-flow.
 *
 * Caching:
 *   GoogleProfileService.getMine() heeft al 24u TTL (PLACE_DATA_TTL_MS).
 *   Wekelijkse health-runs raken dus 1× per week 1 Places-call per
 *   restaurant. Bij 1000 klanten = ~143 calls/dag → ruim binnen Places
 *   free-tier quota ($200/maand credit).
 * ============================================================
 */

/** Codes uit runAudit() die OVER reviews gaan; die laten we aan ReviewsRunner. */
const REVIEW_AUDIT_CODES = new Set<string>([
  'low_review_count',
  'rating_below_4',
]);

/**
 * Punten-budget per severity. Som over GBP-codes komt ~100 uit bij
 * gemiddelde slechte profielen; goede profielen krijgen ~100 score.
 *
 * Critical wegen het zwaarst omdat ze direct conversie kosten
 * (gesloten-vermelding, geen telefoon, etc.).
 */
const SEVERITY_POINTS: Record<AuditSeverity, number> = {
  critical: 30,
  warning: 12,
  tip: 3,
};

/** Vertaalt severity-tier naar onze HealthSeverity-tier (5 niveaus). */
const SEVERITY_MAP: Record<AuditSeverity, RunnerFinding['severity']> = {
  critical: 'critical',
  warning: 'high',
  tip: 'low',
};

@Injectable()
export class GbpRunner implements HealthRunner {
  readonly category = 'gbp' as const;
  private readonly logger = new Logger(GbpRunner.name);

  constructor(private readonly googleProfile: GoogleProfileService) {}

  async run(ctx: RunnerContext): Promise<RunnerResult> {
    // Geen Place-koppeling? Score 0, critical finding met fix-link.
    if (!ctx.placeId) {
      return {
        category: 'gbp',
        score: 0,
        findings: [
          {
            category: 'gbp',
            checkKey: 'gbp.profile_connected',
            passed: false,
            severity: 'critical',
            pointsLost: 100,
            title: 'Geen Google Business Profile gekoppeld',
            description:
              'Zonder Google-koppeling kunnen we je profiel niet beoordelen. Het GBP-profiel is de #1 vindbaarheids-bron voor lokale horeca.',
            fixSuggestion:
              'Koppel je Google Business Profile via de GBP-hub. Duurt 1 minuut.',
            fixLink: '/dashboard/account?tab=koppelingen',
            details: null,
          },
        ],
      };
    }

    // Place-data + audit-findings ophalen (cached, 24u TTL).
    let audit: { findings: AuditFinding[] };
    try {
      audit = await this.googleProfile.getAudit(ctx.restaurantId);
    } catch (err) {
      // Profile-data niet beschikbaar (place verwijderd, API down, etc.).
      // We gooien om Promise.allSettled in HealthService 'm op te vangen
      // en als 'runner_failed' te markeren.
      this.logger.warn(
        `GBP-audit niet beschikbaar voor ${ctx.restaurantId}: ${
          err instanceof Error ? err.message : err
        }`,
      );
      throw err;
    }

    // GBP-relevante findings filteren (review-codes laten we aan ReviewsRunner).
    const gbpFindings = audit.findings.filter(
      (f) => !REVIEW_AUDIT_CODES.has(f.code),
    );

    const findings: RunnerFinding[] = gbpFindings.map((f) => ({
      category: 'gbp',
      checkKey: `gbp.${f.code}`,
      passed: false, // runAudit returnt alleen failed checks (positieve worden niet teruggegeven)
      severity: SEVERITY_MAP[f.severity],
      pointsLost: SEVERITY_POINTS[f.severity],
      title: f.title,
      description: f.description,
      fixSuggestion: f.actionHint,
      // Deep-link naar de GBP-hub waar de eigenaar 't direct kan fixen
      fixLink: '/dashboard/account?tab=koppelingen',
      details: { auditCode: f.code, originalSeverity: f.severity },
    }));

    // Sub-score = 100 - som-verloren-punten. Clamp 0-100.
    const lost = findings.reduce((sum, f) => sum + f.pointsLost, 0);
    const score = Math.max(0, Math.min(100, 100 - lost));

    // Als alles in orde is, voegen we 1 'passed' finding toe zodat de
    // UI iets positiefs kan tonen ("Je profiel ziet er goed uit!").
    if (findings.length === 0) {
      findings.push({
        category: 'gbp',
        checkKey: 'gbp.profile_healthy',
        passed: true,
        severity: 'info',
        pointsLost: 0,
        title: 'Profiel ziet er goed uit',
        description:
          'Alle gecontroleerde profiel-velden zijn ingevuld en consistent.',
        fixSuggestion: null,
        fixLink: null,
        details: null,
      });
    }

    return { category: 'gbp', score, findings };
  }
}
