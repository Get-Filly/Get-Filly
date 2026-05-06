import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { RequestSupabaseService } from '../supabase/request-supabase.service';
import { AuditLogService } from '../common/audit-log.service';

// ============================================================
// MailDomainService, eigen-domein-flow via Resend Domains API
// ============================================================
//
// Stap 2 van de mail-feature: een restaurant kan z'n eigen domein
// koppelen zodat campagnes komen van bv. info@bistrodemo.nl in plaats
// van de standaard social@get-filly.com.
//
// Flow:
//   1. eigenaar: POST /restaurant/me/mail-domain { domain, fromAddress }
//      → wij roepen resend.domains.create({ name: domain })
//      → Resend returnt 4 DNS-records (DKIM + SPF + MX) die de eigenaar
//        moet plakken in z'n eigen registrar
//      → wij slaan id, records en status='pending' op
//   2. eigenaar plakt records bij z'n DNS-host (TransIP, Versio, etc.)
//   3. eigenaar: POST /restaurant/me/mail-domain/verify
//      → wij roepen resend.domains.verify(id)
//      → Resend checkt DNS-propagatie
//      → status wordt 'pending' (nog niet rond) of 'verified' (klaar)
//   4. eigenaar: GET /restaurant/me/mail-domain (frontend pollt)
//      → wij roepen resend.domains.get(id) en geven status terug
//   5. zodra verified: MailService gebruikt mail_from_address i.p.v.
//      social@get-filly.com, pure klant-branding zonder "via Get Filly"
//
// Mapping: Resend's status (not_started/pending/verified/failed) →
// onze enum (pending/verified/failed). 'not_started' = direct na
// registratie, 'pending' = verify gestart, beide tonen we als 'pending'.
// ============================================================

// DNS-records die de UI moet tonen aan de eigenaar. Resend's eigen
// shape genormaliseerd zodat de frontend onafhankelijk is van de SDK.
export type DnsRecord = {
  type: 'TXT' | 'MX' | 'CNAME';
  name: string;       // bv. "resend._domainkey" of "send"
  value: string;      // wat in het DNS-veld geplakt wordt
  ttl?: string;
  priority?: number;  // alleen bij MX
  status?: string;    // Resend's record-status (pending/verified)
};

export type MailDomainStatus = {
  // Heeft de eigenaar een domein geregistreerd? Zo nee: alle andere
  // velden null en status 'none'.
  domain: string | null;
  fromAddress: string | null;
  status: 'none' | 'pending' | 'verified' | 'failed';
  verifiedAt: string | null;
  // Records alleen bij actieve registratie. Frontend toont ze in een
  // copy-friendly tabel.
  records: DnsRecord[];
};

@Injectable()
export class MailDomainService {
  private readonly logger = new Logger(MailDomainService.name);
  private readonly resend: Resend;

  constructor(
    config: ConfigService,
    private readonly supabase: RequestSupabaseService,
    private readonly audit: AuditLogService,
  ) {
    const apiKey = config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      throw new Error('RESEND_API_KEY ontbreekt in .env.');
    }
    this.resend = new Resend(apiKey);
  }

  // ============================================================
  // GET STATUS, voor "Mail-instellingen"-sectie op account-pagina
  // ============================================================
  // Returnt huidige domein-staat + altijd-actuele DNS-records.
  // Bij 'pending' pollt frontend deze endpoint elke ~10s totdat
  // 'verified' of 'failed' verschijnt.
  async getStatus(restaurantId: string): Promise<MailDomainStatus> {
    const { data, error } = await this.supabase.client
      .from('restaurants')
      .select(
        'mail_domain, mail_from_address, mail_domain_status, mail_resend_domain_id, mail_domain_verified_at',
      )
      .eq('id', restaurantId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException('Restaurant niet gevonden.');

    if (!data.mail_resend_domain_id) {
      return {
        domain: null,
        fromAddress: null,
        status: 'none',
        verifiedAt: null,
        records: [],
      };
    }

    // Bij Resend opvragen voor verse status + records. Caching kan
    // later toegevoegd worden; voor nu is een live-call goedkoop
    // genoeg en garandeert correcte status.
    const remote = await this.resend.domains.get(
      data.mail_resend_domain_id as string,
    );
    if (remote.error) {
      this.logger.warn(
        `Resend domain.get faalde voor ${data.mail_resend_domain_id}: ${remote.error.message}`,
      );
    }

    const records = mapRecords(remote.data?.records);
    const remoteStatus = mapStatus(remote.data?.status);

    // Als Resend's status afwijkt van wat we lokaal opgeslagen hebben,
    // syncen we 'm direct. Vooral relevant als de eigenaar net z'n DNS
    // heeft toegevoegd en de polling Resend's verified-event opvangt.
    if (remoteStatus !== data.mail_domain_status) {
      const update: Record<string, unknown> = {
        mail_domain_status: remoteStatus,
      };
      if (remoteStatus === 'verified' && !data.mail_domain_verified_at) {
        update.mail_domain_verified_at = new Date().toISOString();
      }
      await this.supabase.client
        .from('restaurants')
        .update(update)
        .eq('id', restaurantId);
    }

    return {
      domain: data.mail_domain as string | null,
      fromAddress: data.mail_from_address as string | null,
      status: remoteStatus,
      verifiedAt:
        remoteStatus === 'verified'
          ? ((data.mail_domain_verified_at as string | null) ??
            new Date().toISOString())
          : null,
      records,
    };
  }

  // ============================================================
  // REGISTER, domein aanmaken bij Resend + opslaan
  // ============================================================
  async register(
    restaurantId: string,
    domain: string,
    fromAddress: string,
    userId: string,
  ): Promise<MailDomainStatus> {
    const cleanDomain = domain.trim().toLowerCase();
    const cleanFrom = fromAddress.trim().toLowerCase();

    if (!isValidDomain(cleanDomain)) {
      throw new BadRequestException(
        'Ongeldig domein. Gebruik formaat zoals "bistrodemo.nl" zonder http:// of /paden.',
      );
    }
    if (!isValidEmailOnDomain(cleanFrom, cleanDomain)) {
      throw new BadRequestException(
        `Het verzendadres moet eindigen op @${cleanDomain}.`,
      );
    }

    // Check of er al een domein staat, voorkom dat we een tweede
    // Resend-domain aanmaken zonder de oude eerst op te ruimen.
    const { data: existing, error: exErr } = await this.supabase.client
      .from('restaurants')
      .select('mail_resend_domain_id, mail_domain')
      .eq('id', restaurantId)
      .maybeSingle();
    if (exErr) throw new InternalServerErrorException(exErr.message);
    if (existing?.mail_resend_domain_id) {
      throw new BadRequestException(
        `Er is al een mail-domein gekoppeld (${existing.mail_domain}). Verwijder die eerst voordat je een ander koppelt.`,
      );
    }

    // Resend domains.create, region zelfde als ons hoofd-domein (EU).
    const created = await this.resend.domains.create({
      name: cleanDomain,
      region: 'eu-west-1',
    });

    if (created.error || !created.data) {
      throw new InternalServerErrorException(
        `Resend kon het domein niet aanmaken: ${created.error?.message ?? 'onbekend'}`,
      );
    }

    const resendDomainId = created.data.id;

    // Opslaan in restaurants. Status begint op 'pending', eigenaar
    // heeft nog geen DNS-records geplakt.
    const { error: updErr } = await this.supabase.client
      .from('restaurants')
      .update({
        mail_domain: cleanDomain,
        mail_from_address: cleanFrom,
        mail_domain_status: 'pending',
        mail_resend_domain_id: resendDomainId,
        mail_domain_verified_at: null,
      })
      .eq('id', restaurantId);
    if (updErr) {
      // Rollback bij Resend zodat we geen zwevende domein-rij hebben
      await this.resend.domains.remove(resendDomainId).catch(() => undefined);
      throw new InternalServerErrorException(updErr.message);
    }

    await this.audit.log({
      restaurantId,
      userId,
      action: 'mail_domain_registered',
      entity_type: 'restaurant',
      entity_id: restaurantId,
      payload: { domain: cleanDomain, from: cleanFrom },
    });

    return {
      domain: cleanDomain,
      fromAddress: cleanFrom,
      status: 'pending',
      verifiedAt: null,
      records: mapRecords(created.data.records),
    };
  }

  // ============================================================
  // VERIFY, Resend laat DNS opnieuw controleren
  // ============================================================
  async verify(
    restaurantId: string,
    userId: string,
  ): Promise<MailDomainStatus> {
    const { data, error } = await this.supabase.client
      .from('restaurants')
      .select('mail_resend_domain_id, mail_domain_status')
      .eq('id', restaurantId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data?.mail_resend_domain_id) {
      throw new BadRequestException(
        'Geen mail-domein gekoppeld. Registreer er eerst eentje.',
      );
    }

    // Trigger verify; Resend geeft direct een response terug. We halen
    // daarna de actuele status op via getStatus zodat we altijd de
    // laatste waarheid presenteren.
    const verifyResult = await this.resend.domains.verify(
      data.mail_resend_domain_id as string,
    );
    if (verifyResult.error) {
      throw new InternalServerErrorException(
        `Verify-call faalde: ${verifyResult.error.message}`,
      );
    }

    const fresh = await this.getStatus(restaurantId);

    if (fresh.status === 'verified') {
      await this.audit.log({
        restaurantId,
        userId,
        action: 'mail_domain_verified',
        entity_type: 'restaurant',
        entity_id: restaurantId,
        payload: { domain: fresh.domain },
      });
    }

    return fresh;
  }

  // ============================================================
  // REMOVE, koppeling verbreken
  // ============================================================
  // Verwijdert het domein bij Resend en leegt onze velden. Daarna
  // valt de send-flow automatisch terug op social@get-filly.com.
  async remove(
    restaurantId: string,
    userId: string,
  ): Promise<{ removed: true }> {
    const { data, error } = await this.supabase.client
      .from('restaurants')
      .select('mail_resend_domain_id, mail_domain')
      .eq('id', restaurantId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data?.mail_resend_domain_id) {
      throw new BadRequestException('Geen mail-domein om te verwijderen.');
    }

    const removed = await this.resend.domains.remove(
      data.mail_resend_domain_id as string,
    );
    if (removed.error) {
      // Niet-fataal: misschien is het domein bij Resend al weg. We
      // ruimen lokaal hoe dan ook op zodat de UI niet vastzit.
      this.logger.warn(
        `Resend domain.remove faalde: ${removed.error.message}, lokaal toch opruimen.`,
      );
    }

    const { error: updErr } = await this.supabase.client
      .from('restaurants')
      .update({
        mail_domain: null,
        mail_from_address: null,
        mail_domain_status: null,
        mail_resend_domain_id: null,
        mail_domain_verified_at: null,
      })
      .eq('id', restaurantId);
    if (updErr) throw new InternalServerErrorException(updErr.message);

    await this.audit.log({
      restaurantId,
      userId,
      action: 'mail_domain_removed',
      entity_type: 'restaurant',
      entity_id: restaurantId,
      payload: { domain: data.mail_domain },
    });

    return { removed: true };
  }
}

// ============================================================
// Helpers
// ============================================================

// Resend's record-shape → onze genormaliseerde shape. SDK kan iets
// als { record, name, type, ttl, value, priority?, status? } leveren;
// we pakken alleen wat de UI gebruikt.
function mapRecords(remote: unknown): DnsRecord[] {
  if (!Array.isArray(remote)) return [];
  return remote
    .map((r): DnsRecord | null => {
      if (!r || typeof r !== 'object') return null;
      const obj = r as Record<string, unknown>;
      const type = String(obj.type ?? '').toUpperCase();
      if (type !== 'TXT' && type !== 'MX' && type !== 'CNAME') return null;
      return {
        type: type as 'TXT' | 'MX' | 'CNAME',
        name: String(obj.name ?? ''),
        value: String(obj.value ?? ''),
        ttl: obj.ttl ? String(obj.ttl) : undefined,
        priority:
          typeof obj.priority === 'number' ? obj.priority : undefined,
        status: obj.status ? String(obj.status) : undefined,
      };
    })
    .filter((r): r is DnsRecord => r !== null);
}

function mapStatus(
  remote: unknown,
): 'pending' | 'verified' | 'failed' {
  const s = String(remote ?? '').toLowerCase();
  if (s === 'verified') return 'verified';
  if (s === 'failed' || s === 'error' || s === 'temporary_failure') {
    return 'failed';
  }
  // not_started + pending + onbekend → 'pending'
  return 'pending';
}

function isValidDomain(s: string): boolean {
  // Strikt genoeg om typos te vangen, ruim genoeg voor exotische TLDs.
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(
    s,
  );
}

function isValidEmailOnDomain(email: string, domain: string): boolean {
  const m = email.match(/^[^\s@]+@(.+)$/);
  if (!m) return false;
  return m[1].toLowerCase() === domain.toLowerCase();
}
