/**
 * ============================================================
 * Types voor de Marketing-hub (fase 1, 2026-05-06)
 * ============================================================
 *
 * Per-kanaal heeft eigen relevante metrics. We typen ze hier zodat
 * frontend + backend gegarandeerd dezelfde shape gebruiken.
 *
 * Voor nu alleen Mail-types, sociale kanalen (IG/FB/TikTok) volgen
 * pas na approvals (fase 5).
 * ============================================================
 */

// Aggregaat over alle mail die een restaurant heeft verzonden binnen
// de gevraagde periode. Counts + ratios + industrie-vergelijking.
export interface MailStats {
  // Periode waarover deze stats zijn berekend.
  periodDays: number;
  periodStart: string; // ISO
  periodEnd: string; // ISO

  // Counts (rauwe getallen)
  sent: number; // Totaal weggestuurd (excl. queued/failed)
  delivered: number; // Aangekomen bij ontvanger
  opened: number; // Tenminste 1 open-event
  clicked: number; // Tenminste 1 click-event
  bounced: number; // Hard of soft bounce
  complained: number; // Spam-rapportage
  unsubscribed: number; // Uitgeschreven via link in mail

  // Ratio's (0-1, in UI als % te tonen). Null als de noemer 0 is,
  // een lege "delivered" geeft geen zinvolle open-rate.
  openRate: number | null;
  clickRate: number | null;
  bounceRate: number | null;
  unsubscribeRate: number | null;

  // Industrie-mediaan voor de horeca. Voor MVP hardcoded per cuisine-
  // type (later vervangen door dynamische `campaign_benchmarks`-data).
  benchmark: {
    openRate: number; // 0.22 = 22%
    clickRate: number; // 0.031 = 3.1%
    bounceRate: number; // 0.018 = 1.8%
    source: string; // bv. "horeca-mediaan 2026"
  };

  // Aantal campagnes waaruit deze stats komen.
  campaignCount: number;
}

// Per-campagne stats, gebruikt in de mail-detail-pagina-tabel zodat
// de eigenaar kan zien welke campagne het beste presteerde.
export interface CampaignMailStats {
  campaignId: string;
  campaignName: string;
  campaignType: string; // mail / social / whatsapp, alleen 'mail' relevant hier
  status: string; // afgerond / actief / etc.
  scheduledFor: string | null;
  executedAt: string | null;

  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;

  openRate: number | null;
  clickRate: number | null;
}
