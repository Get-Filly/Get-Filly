import { Injectable, Logger } from '@nestjs/common';
// Per-request user-JWT-client (RLS actief). Zie SupabaseModule voor uitleg.
import { RequestSupabaseService } from '../supabase/request-supabase.service';

// ============================================================
// ChannelReachService — gemeten bereik per kanaal voor AI-prompts
// ============================================================
//
// Het social-posting-brein weet wat statistisch het beste werkt voor
// een gemiddeld restaurant, maar niet of DIT restaurant op dat kanaal
// überhaupt publiek heeft. 200 woorden perfecte Instagram-copy om
// 21:00 is zinloos met 40 volgers terwijl Facebook wél een groot
// publiek heeft. Deze service meet wat we nú kunnen meten en bouwt daar een
// prompt-blok van, zodat Filly bereik meeweegt bij de kanaal-keuze
// en een alternatief kanaal voorstelt als het bereik tegenvalt.
//
// Databronnen per kanaal:
//   - instagram / facebook → koppel-status uit integration_credentials
//     (provider 'meta'). Volger-/bereik-aantallen komen uit de Meta
//     Insights API zodra die koppeling live is (zie BACKLOG
//     "IG/FB Insights-fetcher") — vul dan audienceSize + source
//     'followers' in fetchReach(), de rest van de keten (blok +
//     prompts) pakt het automatisch op.
//   - tiktok / google_business → idem, eigen provider-rij zodra de
//     OAuth-koppelingen bestaan.

/** Kanalen zoals de voorstellen-flows ze kennen (platform-namen). */
export type ReachChannel =
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'google_business';

export type ChannelReach = {
  channel: ReachChannel;
  /** Is het kanaal technisch bruikbaar (koppeling/opt-ins aanwezig)? */
  connected: boolean;
  /** Gemeten publieksgrootte; null = (nog) niet meetbaar. */
  audienceSize: number | null;
  /** Waar het getal vandaan komt. */
  source: 'followers' | 'none';
  /** NL-toelichting, gaat letterlijk de prompt in. */
  note: string;
};

@Injectable()
export class ChannelReachService {
  private readonly logger = new Logger(ChannelReachService.name);

  constructor(private readonly supabase: RequestSupabaseService) {}

  /**
   * Gemeten bereik per kanaal. Fail-soft: een query-fout levert
   * "onbekend" op in plaats van een gecrashte AI-feature.
   */
  async fetchReach(businessId: string): Promise<ChannelReach[]> {
    // Gekoppelde integraties: welke providers hebben een credential?
    // 'meta' dekt Instagram + Facebook; 'tiktok'/'google' volgen later.
    const providers = new Set<string>();
    try {
      const { data } = await this.supabase.client
        .from('integration_credentials')
        .select('provider')
        .eq('business_id', businessId);
      for (const row of (data ?? []) as Array<{ provider: string }>) {
        providers.add(row.provider);
      }
    } catch (err) {
      this.logger.warn(`Integratie-status gefaald: ${String(err)}`);
    }
    const metaConnected = providers.has('meta');

    // Alleen de vier kanalen die we aanbieden.
    return [
      {
        channel: 'instagram',
        connected: metaConnected,
        // TODO (Meta Insights-fetcher, zie BACKLOG): volger-aantal
        // ophalen en hier invullen met source 'followers'.
        audienceSize: null,
        source: 'none',
        note: metaConnected
          ? 'Gekoppeld via Meta; volger-aantal nog niet beschikbaar (Insights-koppeling volgt). Behandel het bereik als onzeker.'
          : 'NIET gekoppeld — publiceren kan nog niet en het organische bereik is onbekend.',
      },
      {
        channel: 'facebook',
        connected: metaConnected,
        audienceSize: null,
        source: 'none',
        note: metaConnected
          ? 'Gekoppeld via Meta; pagina-bereik nog niet beschikbaar (Insights-koppeling volgt). Behandel het bereik als onzeker.'
          : 'NIET gekoppeld — publiceren kan nog niet en het bereik is onbekend.',
      },
      {
        channel: 'tiktok',
        connected: providers.has('tiktok'),
        audienceSize: null,
        source: 'none',
        note: providers.has('tiktok')
          ? 'Gekoppeld; volger-aantal nog niet beschikbaar.'
          : 'NIET gekoppeld — bereik onbekend.',
      },
      {
        channel: 'google_business',
        connected: providers.has('google'),
        audienceSize: null,
        source: 'none',
        note: providers.has('google')
          ? 'Gekoppeld; impressie-data nog niet beschikbaar.'
          : 'NIET gekoppeld — wel hoge SEO-waarde zodra de koppeling er is.',
      },
    ];
  }

  /**
   * Bouwt het BEREIK PER KANAAL-blok voor injectie in een
   * system-prompt, inclusief de afweeg-regels.
   */
  async buildReachBlock(businessId: string): Promise<string> {
    const reach = await this.fetchReach(businessId);

    const labels: Record<ReachChannel, string> = {
      instagram: 'Instagram',
      facebook: 'Facebook',
      tiktok: 'TikTok',
      google_business: 'Google Business',
    };

    const lines: string[] = [];
    lines.push(
      'BEREIK PER KANAAL (gemeten — weeg dit zwaar mee bij de kanaal-keuze):',
    );
    for (const r of reach) {
      lines.push(`- ${labels[r.channel]}: ${r.note}`);
    }
    lines.push('');
    lines.push('BEREIK-REGELS:');
    lines.push(
      '- Een statistisch perfect tijdstip compenseert nooit een kanaal zonder publiek. Kies bij voorkeur kanalen met aantoonbaar bereik.',
    );
    lines.push(
      '- Is het inhoudelijk best passende kanaal zwak, onbekend of niet gekoppeld? Stel dan óók (of in plaats daarvan) een kanaal met bewezen bereik voor en benoem die afweging expliciet in je reasoning (bv. "Instagram is niet gekoppeld maar Facebook wel, dit werkt nú beter op Facebook").',
    );
    lines.push(
      '- Onbekend bereik is zélf een signaal: benoem het eerlijk, doe niet alsof het er is.',
    );
    return lines.join('\n');
  }
}
