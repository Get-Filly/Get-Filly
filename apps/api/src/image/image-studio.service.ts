import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RequestSupabaseService } from '../supabase/request-supabase.service';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditLogService } from '../common/audit-log.service';
import { ImageProviderService } from './image-provider.service';
import {
  buildEnhancePrompt,
  buildEditPrompt,
  buildGeneratePrompt,
  buildReformatPrompt,
  channelVisualForCampaign,
} from './image-prompts';

// ============================================================
// ImageStudioService, orchestratie van de Filly-beeldtool
// ============================================================
//
// Verbindt de campagne-context aan de beeld-provider:
//   1. valideert dat de campagne een concept is van deze business
//   2. laadt (bij verbeteren/aanpassen) de huidige campagne-foto
//   3. leidt de kanaal-verhouding af (via CHANNEL_RULES)
//   4. roept ImageProviderService aan (enhance/edit/generate)
//   5. slaat het resultaat als variant op in bucket 'campaign-media'
//      onder <business>/<campaign>/generated/<uuid>, geeft signed URLs
//   6. bewaakt maand- + uur-caps per business (kosten-beheersing)
//
// Bewust NIET auto-koppelen aan de campagne: de eigenaar keurt eerst een
// variant goed (zoals alles bij Filly) en roept dan apply() aan. Dat zet
// de gekozen foto pas op de campagne-content.
// ============================================================

const BUCKET = 'campaign-media';
// Beelden per business per maand / per uur. Env-overridebaar zodat we
// per deploy kunnen tunen zonder code-wijziging (spiegelt de AI-limiet).
const DEFAULT_MONTHLY_LIMIT = 200;
const DEFAULT_HOURLY_LIMIT = 30;
// Aantal varianten per klik. Default 1 (goedkoopst); max 2 voor keuze.
const MAX_VARIANTS = 2;

const IMAGE_EXTS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

export type ImageVariant = { path: string; signed_url: string };

// Resultaat per kanaal bij de fan-out (apply-all). status:
//   'master'       = entree-kanaal, master direct geplaatst (juiste ratio al)
//   'reformatted'  = master herkaderd naar dit kanaal-formaat en geplaatst
//   'skipped_mail' = mail heeft geen foto-kolom, overgeslagen
//   'failed'       = dit kanaal faalde (andere kanalen gaan gewoon door)
export type ApplyAllChannelResult = {
  campaignId: string;
  label: string;
  aspectRatio: string;
  status: 'master' | 'reformatted' | 'skipped_mail' | 'failed';
  path?: string;
  signed_url?: string;
};

type CampaignRow = {
  id: string;
  type: 'mail' | 'social' | 'whatsapp';
  status: string;
  // group_id koppelt de kanaal-rijen van een multi-channel bundel (mig 0032).
  // null = losse campagne (bundel-van-1).
  group_id: string | null;
};

@Injectable()
export class ImageStudioService {
  private readonly logger = new Logger(ImageStudioService.name);

  constructor(
    // RLS-client: campagne-checks + storage, gescoped op de user zijn business.
    private readonly supabase: RequestSupabaseService,
    // Service-role-client: image_usage-caps (RLS aan, geen user-policy).
    private readonly admin: SupabaseService,
    private readonly provider: ImageProviderService,
    private readonly audit: AuditLogService,
  ) {}

  // Of de beeldtool bruikbaar is (key aanwezig). De frontend kan hiermee
  // de knoppen tonen/verbergen i.p.v. ze te laten falen.
  isConfigured(): boolean {
    return this.provider.isConfigured();
  }

  // ---------------- Stand 1: verbeteren ----------------
  async enhance(
    businessId: string,
    userId: string,
    campaignId: string,
    count: number,
  ): Promise<{ variants: ImageVariant[] }> {
    const campaign = await this.loadConceptCampaign(businessId, campaignId);
    const source = await this.loadCurrentImage(businessId, campaign);
    const { aspectRatio, channel, label } =
      await this.resolveChannelVisual(campaign);
    const prompt = buildEnhancePrompt({ aspectRatio, channelLabel: label });

    const variants = await this.runVariants(count, () =>
      this.provider.edit({
        prompt,
        images: [{ base64: source.base64, mimeType: source.mimeType }],
        meta: { businessId, userId, feature: 'image_enhance' },
      }),
    );
    await this.storeAudit(businessId, userId, campaignId, 'enhance', {
      channel,
      variants: variants.length,
    });
    return { variants: await this.storeVariants(businessId, campaignId, variants) };
  }

  // ---------------- Stand 2: aanpassen met instructie ----------------
  async edit(
    businessId: string,
    userId: string,
    campaignId: string,
    instruction: string,
    count: number,
  ): Promise<{ variants: ImageVariant[] }> {
    const clean = instruction.trim();
    if (clean.length < 3) {
      throw new BadRequestException(
        'Geef een korte omschrijving van wat je wilt aanpassen.',
      );
    }
    if (clean.length > 500) {
      throw new BadRequestException(
        'Houd de omschrijving korter (maximaal 500 tekens).',
      );
    }
    const campaign = await this.loadConceptCampaign(businessId, campaignId);
    const source = await this.loadCurrentImage(businessId, campaign);
    const { aspectRatio, channel, label } =
      await this.resolveChannelVisual(campaign);
    const prompt = buildEditPrompt({
      instruction: clean,
      aspectRatio,
      channelLabel: label,
    });

    const variants = await this.runVariants(count, () =>
      this.provider.edit({
        prompt,
        images: [{ base64: source.base64, mimeType: source.mimeType }],
        meta: { businessId, userId, feature: 'image_edit' },
      }),
    );
    await this.storeAudit(businessId, userId, campaignId, 'edit', {
      channel,
      variants: variants.length,
    });
    return { variants: await this.storeVariants(businessId, campaignId, variants) };
  }

  // ---------------- Stand 3: genereren vanaf tekst ----------------
  async generate(
    businessId: string,
    userId: string,
    campaignId: string,
    userPrompt: string,
    count: number,
  ): Promise<{ variants: ImageVariant[] }> {
    const clean = userPrompt.trim();
    if (clean.length < 3) {
      throw new BadRequestException(
        'Beschrijf kort welke foto Filly moet maken.',
      );
    }
    if (clean.length > 500) {
      throw new BadRequestException(
        'Houd de omschrijving korter (maximaal 500 tekens).',
      );
    }
    const campaign = await this.loadConceptCampaign(businessId, campaignId);
    const { aspectRatio, channel, label } =
      await this.resolveChannelVisual(campaign);
    const prompt = buildGeneratePrompt({
      prompt: clean,
      aspectRatio,
      channelLabel: label,
    });

    const variants = await this.runVariants(count, () =>
      this.provider.generate({
        prompt,
        meta: { businessId, userId, feature: 'image_generate' },
      }),
    );
    await this.storeAudit(businessId, userId, campaignId, 'generate', {
      channel,
      variants: variants.length,
    });
    return { variants: await this.storeVariants(businessId, campaignId, variants) };
  }

  // ---------------- Variant toepassen op één kanaal ----------------
  // Zet een goedgekeurde variant als de foto van dit ene kanaal. Valideert
  // dat het pad binnen deze business+campagne valt (geen cross-tenant).
  async apply(
    businessId: string,
    campaignId: string,
    path: string,
  ): Promise<{ path: string; signed_url: string }> {
    const prefix = `${businessId}/${campaignId}/`;
    if (!path.startsWith(prefix)) {
      throw new BadRequestException('Ongeldig foto-pad voor deze campagne.');
    }
    const campaign = await this.loadConceptCampaign(businessId, campaignId);
    if (campaign.type === 'mail') {
      throw new BadRequestException(
        'Mail-campagnes ondersteunen nog geen foto.',
      );
    }
    await this.setChannelMedia(campaign, path);
    const signed_url = await this.sign(path);
    return { path, signed_url };
  }

  // ---------------- Fan-out: op ALLE kanalen van de bundel ----------------
  // Neemt de goedgekeurde master-foto van het entree-kanaal en zet 'm op elk
  // kanaal van de campagne-bundel in het JUISTE formaat:
  //   - entree-kanaal: de master heeft de ratio al -> direct plaatsen
  //   - andere kanalen: master herkaderen naar hun ratio (provider) -> plaatsen
  //   - Google Bedrijfsprofiel: alleen bijsnijden (representatief)
  //   - mail: overslaan (geen foto-kolom)
  // Eén falend kanaal stopt de rest niet (partial success). Caps worden vóór
  // de dure herkader-calls gecheckt.
  async applyAll(
    businessId: string,
    userId: string,
    campaignId: string,
    path: string,
  ): Promise<{ channels: ApplyAllChannelResult[] }> {
    const prefix = `${businessId}/${campaignId}/`;
    if (!path.startsWith(prefix)) {
      throw new BadRequestException('Ongeldig foto-pad voor deze campagne.');
    }
    const entry = await this.loadConceptCampaign(businessId, campaignId);
    const channels = await this.loadBundleChannels(businessId, entry);

    // Elk niet-entree foto-kanaal kost één herkader-call. Cap vóór de calls.
    const reformatTargets = channels.filter(
      (c) => c.id !== entry.id && c.type !== 'mail',
    );
    if (reformatTargets.length > 0) {
      await this.assertUnderCaps(businessId, reformatTargets.length);
    }

    // Master één keer downloaden (bron voor alle herkader-calls).
    const master =
      reformatTargets.length > 0 ? await this.downloadImage(path) : null;

    const results: ApplyAllChannelResult[] = [];
    for (const channel of channels) {
      const {
        aspectRatio,
        channel: fillyChannel,
        label,
      } = await this.resolveChannelVisual(channel);
      const base = { campaignId: channel.id, label, aspectRatio };

      if (channel.type === 'mail') {
        results.push({ ...base, status: 'skipped_mail' });
        continue;
      }
      try {
        if (channel.id === entry.id) {
          // Entree-kanaal: master heeft de juiste ratio al -> direct plaatsen.
          await this.setChannelMedia(channel, path);
          results.push({
            ...base,
            status: 'master',
            path,
            signed_url: await this.sign(path),
          });
        } else {
          const img = await this.provider.edit({
            prompt: buildReformatPrompt({
              aspectRatio,
              channelLabel: label,
              gbp: fillyChannel === 'google_business',
            }),
            images: [{ base64: master!.base64, mimeType: master!.mimeType }],
            meta: { businessId, userId, feature: 'image_reformat' },
          });
          const [stored] = await this.storeVariants(businessId, channel.id, [
            img,
          ]);
          await this.setChannelMedia(channel, stored.path);
          results.push({
            ...base,
            status: 'reformatted',
            path: stored.path,
            signed_url: stored.signed_url,
          });
        }
      } catch (err) {
        this.logger.warn(
          `Fan-out kanaal ${channel.id} (${label}) faalde: ${String(err)}`,
        );
        results.push({ ...base, status: 'failed' });
      }
    }

    await this.storeAudit(businessId, userId, campaignId, 'apply_all', {
      channels: results.length,
      reformatted: results.filter((r) => r.status === 'reformatted').length,
      failed: results.filter((r) => r.status === 'failed').length,
    });
    return { channels: results };
  }

  // ============================================================
  // Interne helpers
  // ============================================================

  // Campagne ophalen + valideren: bestaat, hoort bij business, is concept.
  private async loadConceptCampaign(
    businessId: string,
    campaignId: string,
  ): Promise<CampaignRow> {
    const { data, error } = await this.supabase.client
      .from('campaigns')
      .select('id, type, status, group_id')
      .eq('business_id', businessId)
      .eq('id', campaignId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException('Campagne niet gevonden.');
    if (data.status !== 'concept') {
      throw new BadRequestException(
        `De beeldtool werkt alleen op concept-campagnes (deze is ${data.status}).`,
      );
    }
    return data as CampaignRow;
  }

  // Kanaal-visual (FillyChannel + aspect-ratio + label) voor een campagne-rij.
  // Voor social halen we het echte platform uit campaign_social_content.
  // platforms[0], zodat Facebook (1.91:1), Google Business (4:3) etc. hun eigen
  // ratio krijgen i.p.v. de social-default (1:1). Zonder platform → default.
  private async resolveChannelVisual(campaign: CampaignRow) {
    let platform: string | null = null;
    if (campaign.type === 'social') {
      const { data } = await this.supabase.client
        .from('campaign_social_content')
        .select('platforms')
        .eq('campaign_id', campaign.id)
        .maybeSingle();
      const platforms = (data?.platforms as string[] | null) ?? [];
      platform = platforms[0] ?? null;
    }
    return channelVisualForCampaign(campaign.type, platform);
  }

  // Zet een foto-pad als media op één kanaal-rij. Social → media_urls[path];
  // whatsapp → media_url; mail → niets (geen foto-kolom).
  private async setChannelMedia(
    campaign: CampaignRow,
    path: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    if (campaign.type === 'social') {
      const { error } = await this.supabase.client
        .from('campaign_social_content')
        .update({ media_urls: [path], updated_at: now })
        .eq('campaign_id', campaign.id);
      if (error) throw new InternalServerErrorException(error.message);
    } else if (campaign.type === 'whatsapp') {
      const { error } = await this.supabase.client
        .from('campaign_whatsapp_content')
        .update({ media_url: path, updated_at: now })
        .eq('campaign_id', campaign.id);
      if (error) throw new InternalServerErrorException(error.message);
    }
    // mail: geen media-kolom, niets te doen.
  }

  // Download een foto uit campaign-media op pad → base64 + mime (bron voor de
  // fan-out-herkader-calls). Weigert video netjes.
  private async downloadImage(
    path: string,
  ): Promise<{ base64: string; mimeType: string }> {
    const mimeType = mimeFromPath(path);
    if (!mimeType) {
      throw new BadRequestException(
        'De beeldtool werkt alleen op foto\'s (JPG, PNG, WebP), niet op video.',
      );
    }
    const { data: blob, error } = await this.supabase.client.storage
      .from(BUCKET)
      .download(path);
    if (error || !blob) {
      throw new InternalServerErrorException(
        'Kon de gekozen foto niet laden. Probeer het opnieuw.',
      );
    }
    const buffer = Buffer.from(await blob.arrayBuffer());
    return { base64: buffer.toString('base64'), mimeType };
  }

  // Alle CONCEPT-kanaal-rijen van de bundel (of alleen de campagne zelf als er
  // geen group_id is). Elke rij = één kanaal. We raken nooit al-ingeplande
  // kanalen aan; alleen concepten zijn bewerkbaar.
  private async loadBundleChannels(
    businessId: string,
    entry: CampaignRow,
  ): Promise<CampaignRow[]> {
    if (!entry.group_id) return [entry];
    const { data, error } = await this.supabase.client
      .from('campaigns')
      .select('id, type, status, group_id')
      .eq('business_id', businessId)
      .eq('group_id', entry.group_id)
      .eq('status', 'concept');
    if (error) throw new InternalServerErrorException(error.message);
    const rows = (data as CampaignRow[] | null) ?? [];
    // Defensief: zorg dat het entree-kanaal er sowieso in zit.
    if (!rows.some((r) => r.id === entry.id)) rows.push(entry);
    return rows;
  }

  // Huidige campagne-foto laden (voor verbeteren/aanpassen). Haalt het
  // pad uit de content-tabel, downloadt de bytes en geeft base64 + mime.
  private async loadCurrentImage(
    businessId: string,
    campaign: CampaignRow,
  ): Promise<{ path: string; base64: string; mimeType: string }> {
    let path: string | null = null;
    if (campaign.type === 'social') {
      const { data } = await this.supabase.client
        .from('campaign_social_content')
        .select('media_urls')
        .eq('campaign_id', campaign.id)
        .maybeSingle();
      const urls = (data?.media_urls as string[] | null) ?? [];
      path = urls[0] ?? null;
    } else if (campaign.type === 'whatsapp') {
      const { data } = await this.supabase.client
        .from('campaign_whatsapp_content')
        .select('media_url')
        .eq('campaign_id', campaign.id)
        .maybeSingle();
      path = (data?.media_url as string | null) ?? null;
    }

    if (!path) {
      throw new BadRequestException(
        'Er staat nog geen foto op deze campagne. Upload eerst een foto of gebruik "Genereren".',
      );
    }
    const mimeType = mimeFromPath(path);
    if (!mimeType) {
      throw new BadRequestException(
        'De beeldtool werkt alleen op foto\'s (JPG, PNG, WebP), niet op video.',
      );
    }

    const { data: blob, error } = await this.supabase.client.storage
      .from(BUCKET)
      .download(path);
    if (error || !blob) {
      throw new InternalServerErrorException(
        'Kon de huidige foto niet laden. Probeer het opnieuw.',
      );
    }
    const buffer = Buffer.from(await blob.arrayBuffer());
    return { path, base64: buffer.toString('base64'), mimeType };
  }

  // Draai N provider-calls (na cap-check). Geeft de opgeleverde beelden
  // terug. Als een latere variant faalt maar een eerdere lukte, geven we
  // de gelukte terug (partial success) i.p.v. alles te laten mislukken.
  private async runVariants(
    count: number,
    call: () => Promise<{ base64: string; mimeType: string }>,
  ): Promise<Array<{ base64: string; mimeType: string }>> {
    const n = Math.min(Math.max(1, Math.floor(count) || 1), MAX_VARIANTS);
    const results: Array<{ base64: string; mimeType: string }> = [];
    let lastError: unknown = null;
    for (let i = 0; i < n; i++) {
      try {
        results.push(await call());
      } catch (err) {
        lastError = err;
        this.logger.warn(`Variant ${i + 1}/${n} faalde: ${String(err)}`);
      }
    }
    if (results.length === 0) {
      // Alles faalde: gooi de laatste (al NL-vertaalde) provider-fout door.
      throw lastError instanceof Error
        ? lastError
        : new InternalServerErrorException(
            'Er ging iets mis bij het maken van het beeld.',
          );
    }
    return results;
  }

  // Sla opgeleverde beelden op in campaign-media en geef signed URLs.
  private async storeVariants(
    businessId: string,
    campaignId: string,
    images: Array<{ base64: string; mimeType: string }>,
  ): Promise<ImageVariant[]> {
    const out: ImageVariant[] = [];
    for (const img of images) {
      const ext = IMAGE_EXTS[img.mimeType] ?? '.png';
      const path = `${businessId}/${campaignId}/generated/${randomUUID()}${ext}`;
      const buffer = Buffer.from(img.base64, 'base64');
      const { error } = await this.supabase.client.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType: img.mimeType, upsert: false });
      if (error) {
        this.logger.error(`Kon variant niet opslaan: ${error.message}`);
        throw new InternalServerErrorException(
          'Kon het gemaakte beeld niet opslaan. Probeer het opnieuw.',
        );
      }
      out.push({ path, signed_url: await this.sign(path) });
    }
    return out;
  }

  private async sign(path: string): Promise<string> {
    const { data, error } = await this.supabase.client.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60);
    if (error || !data) {
      throw new InternalServerErrorException(
        'Kon geen weergave-link voor het beeld maken.',
      );
    }
    return data.signedUrl;
  }

  // Maand- + uur-cap per business afdwingen VÓÓR we dure calls doen.
  // Houdt rekening met het aantal varianten dat deze call gaat maken.
  async assertUnderCaps(businessId: string, count: number): Promise<void> {
    const wanted = Math.min(Math.max(1, Math.floor(count) || 1), MAX_VARIANTS);
    const monthlyLimit = Number(
      process.env.IMAGE_MONTHLY_LIMIT_PER_BUSINESS ?? DEFAULT_MONTHLY_LIMIT,
    );
    const hourlyLimit = Number(
      process.env.IMAGE_HOURLY_LIMIT_PER_BUSINESS ?? DEFAULT_HOURLY_LIMIT,
    );

    const now = Date.now();
    const monthStart = startOfMonthIso();
    const hourAgo = new Date(now - 60 * 60 * 1000).toISOString();

    const monthUsed = await this.countUsage(businessId, monthStart);
    if (monthUsed + wanted > monthlyLimit) {
      throw new HttpException(
        {
          message: `Maandelijkse beeld-limiet bereikt (${monthlyLimit} per maand). Neem contact op als je meer nodig hebt.`,
          limit: monthlyLimit,
          used: monthUsed,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const hourUsed = await this.countUsage(businessId, hourAgo);
    if (hourUsed + wanted > hourlyLimit) {
      throw new HttpException(
        {
          message: `Even te veel beelden achter elkaar (${hourlyLimit} per uur). Probeer het straks opnieuw.`,
          limit: hourlyLimit,
          used: hourUsed,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async countUsage(
    businessId: string,
    sinceIso: string,
  ): Promise<number> {
    const { count, error } = await this.admin.client
      .from('image_usage')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .gte('created_at', sinceIso);
    if (error) {
      this.logger.error(`image_usage cap-query faalde: ${error.message}`);
      // Niet fail-open (kost-bescherming uit) maar ook niet stil doorlaten:
      // 503 zodat de UI "probeer zo opnieuw" toont.
      throw new HttpException(
        'Kon de beeld-limiet niet controleren. Probeer het zo opnieuw.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return count ?? 0;
  }

  private async storeAudit(
    businessId: string,
    userId: string,
    campaignId: string,
    operation: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.audit
      .log({
        businessId,
        userId,
        action: `campaign_image_${operation}`,
        entity_type: 'campaign',
        entity_id: campaignId,
        payload,
      })
      .catch(() => undefined);
  }
}

// Extensie → image-mime, of null als het geen ondersteund fotoformaat is
// (bv. video). Zo weigeren we video's netjes vóór we de provider bellen.
function mimeFromPath(path: string): string | null {
  const lower = path.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return null;
}

// Begin van de huidige maand in ISO (voor de maand-cap-query). Bewust
// UTC-gebaseerd; caps hoeven niet tot op de tijdzone nauwkeurig te zijn.
function startOfMonthIso(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
}
