import { createClient } from "./supabase-browser";
import { getActiveRestaurantIdSync } from "./restaurant-context";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

/**
 * authedFetch, zoals `fetch`, maar stuurt automatisch mee:
 *   - Authorization: Bearer <jwt>  → wie ben je?
 *   - X-Restaurant-Id: <uuid>      → welk restaurant bekijk je?
 *
 * Hoe dit werkt:
 *   1. Supabase-sessie uit de browser halen (cookie/localStorage).
 *   2. Actieve restaurant-id uit localStorage halen (gezet door
 *      RestaurantContext zodra de user is ingelogd).
 *   3. Beide als headers meegeven aan fetch.
 *
 * Wat als er geen sessie / geen restaurant is:
 *   Dan stuurt hij de header niet mee. De backend geeft dan 401 of
 *   400 terug, de component die de call deed kan dat netjes als
 *   error tonen. Normaal gesproken gebeurt dit alleen heel kort op
 *   de eerste render voordat RestaurantContext geladen is.
 */
export async function authedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init?.headers);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  // Voeg het actieve restaurant-id toe (als we er een hebben).
  // Zo weet de backend welk restaurant de user op dit moment
  // bekijkt, essentieel voor multi-tenant isolatie.
  const restaurantId = getActiveRestaurantIdSync();
  if (restaurantId) {
    headers.set("X-Restaurant-Id", restaurantId);
  }

  return fetch(input, { ...init, headers });
}

// ============================================================
// Meta (Facebook/Instagram) koppeling + publiceren (stap 4)
// ============================================================

export type MetaStatus = {
  connected: boolean;
  page?: { id: string; name: string } | null;
};

export async function metaStatus(): Promise<MetaStatus> {
  const res = await authedFetch(`${API_URL}/integrations/meta/status`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as MetaStatus;
}

export type MetaPage = { id: string; name: string; hasInstagram: boolean };

export async function metaListPages(): Promise<MetaPage[]> {
  const res = await authedFetch(`${API_URL}/integrations/meta/pages`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as MetaPage[];
}

export async function metaSelectPage(pageId: string): Promise<void> {
  const res = await authedFetch(`${API_URL}/integrations/meta/select-page`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pageId }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export type MetaPublishResult = {
  facebook?: { id: string };
  instagram?: { id: string };
  errors: string[];
};

export async function metaPublish(input: {
  message: string;
  imageUrl?: string;
  toFacebook?: boolean;
  toInstagram?: boolean;
}): Promise<MetaPublishResult> {
  const res = await authedFetch(`${API_URL}/integrations/meta/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await res.json()) as MetaPublishResult & { message?: string };
  if (!res.ok) {
    throw new Error(data?.message ?? `HTTP ${res.status}`);
  }
  return data;
}

/** Trekt de Meta-koppeling van het actieve restaurant in (DELETE). */
export async function metaDisconnect(): Promise<void> {
  const res = await authedFetch(`${API_URL}/integrations/meta`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// ============================================================
// Google Bedrijfsprofiel koppeling (OAuth, business.manage)
// ============================================================

export type GoogleBusinessStatus = {
  connected: boolean;
  scopes?: string[];
  expiresAt?: string | null;
  updatedAt?: string;
};

export async function googleBusinessStatus(): Promise<GoogleBusinessStatus> {
  const res = await authedFetch(
    `${API_URL}/integrations/google-business/status`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as GoogleBusinessStatus;
}

/** Trekt de Google-Bedrijfsprofiel-koppeling van het restaurant in (DELETE). */
export async function googleBusinessDisconnect(): Promise<void> {
  const res = await authedFetch(
    `${API_URL}/integrations/google-business`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export type GoogleBusinessAccount = {
  name: string;
  accountName: string;
  type: string | null;
};

/**
 * Haalt de beheerde Google-Bedrijfsprofielen op (accounts.list). Bewijst
 * dat de business.manage-scope echt gebruikt wordt. Gooit met de
 * machine-leesbare `reason` (bv. "api_not_approved") als de Google-API-
 * toegang nog niet is goedgekeurd, zodat de UI dat netjes kan tonen.
 */
export async function googleBusinessProfile(): Promise<{
  accounts: GoogleBusinessAccount[];
}> {
  const res = await authedFetch(
    `${API_URL}/integrations/google-business/profile`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    let reason = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { reason?: string };
      if (body?.reason) reason = body.reason;
    } catch {
      /* geen JSON-body */
    }
    throw new Error(reason);
  }
  return (await res.json()) as { accounts: GoogleBusinessAccount[] };
}

/**
 * submitContactForm, publieke (NIET-authed) call voor het
 * contactformulier op /contact. Gebruikt gewone `fetch` zonder
 * Authorization/X-Restaurant-Id, want een bezoeker die een demo
 * aanvraagt heeft nog geen account/restaurant. De backend-route
 * (`POST /public/contact`) is @Public() en mailt de aanvraag naar
 * info@get-filly.com.
 *
 * `honeypot` is een verborgen anti-spam-veld: een echte gebruiker
 * laat het leeg, een bot vult het vaak in. De backend slikt de
 * aanvraag stil als het gevuld is.
 */
export type ContactFormInput = {
  name: string;
  restaurant: string;
  email: string;
  phone?: string;
  message: string;
  honeypot?: string;
};

export async function submitContactForm(
  input: ContactFormInput,
): Promise<void> {
  const res = await fetch(`${API_URL}/public/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    // Backend geeft bij validatie een NL-foutmelding terug; pak die
    // op zodat de gebruiker ziet wat er mis is.
    let msg = "Versturen mislukt. Probeer het later opnieuw.";
    try {
      const data = (await res.json()) as { message?: string | string[] };
      if (data?.message) {
        msg = Array.isArray(data.message) ? data.message.join(" ") : data.message;
      }
    } catch {
      // geen JSON-body, gebruik de fallback-melding
    }
    throw new Error(msg);
  }
}

export type CampaignType = "mail" | "social" | "whatsapp";
export type CampaignStatus = "actief" | "concept" | "ingepland" | "afgerond";

export type CampaignResultStats = {
  extra_reservations?: number;
  extra_revenue_cents?: number;
  retention_guests?: number;
  impressions?: number;
  likes?: number;
};

export type Campaign = {
  id: string;
  name: string;
  type: CampaignType;
  meta: string | null;
  status: CampaignStatus;
  result_stats: CampaignResultStats | null;
  // Per 2026-05-07 fase 4: group_id om bundle-rendering op
  // /campagnes mogelijk te maken. Null = stand-alone, niet-null +
  // groep heeft >1 leden = render als bundle-rij.
  group_id: string | null;
  scheduled_for: string | null;
  // Per 2026-05-12: body-snippet (~140 chars) voor de kanban-cards.
  // Backend joint campaign_mail_content / campaign_social_content
  // op type. Null als de campagne nog geen content heeft.
  body_preview: string | null;
  // Per 2026-05-12 (mig 0040): soft-delete-timestamp. Alleen gevuld
  // door fetchDeletedCampaigns(); standaard fetchCampaigns() filtert
  // deze al uit. Optional zodat normale flows er niks van merken.
  deleted_at?: string | null;
};

export async function fetchCampaigns(): Promise<Campaign[]> {
  const res = await authedFetch(`${API_URL}/campaigns`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Per 2026-05-12 (mig 0040): verwijderde campagnes voor de Verwijderd-
// tab op /campagnes/history. Backend filtert `deleted_at IS NOT NULL`.
export async function fetchDeletedCampaigns(): Promise<Campaign[]> {
  const res = await authedFetch(`${API_URL}/campaigns/deleted`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Per 2026-05-07 fase 4: bundle-detail ophalen voor de bundle-pagina.
// Per 2026-05-13 (fase C unified-detail-page):
//   - campaigns is nu CampaignDetail[] (incl. variants, content,
//     scheduled, reasoning) zodat 1 call alles oplevert voor de
//     unified-detail-page.
//   - id-param mag een group-id OF een campaign-id zijn (smart-
//     detect aan backend-kant). Bij een single-channel campaign
//     zonder group_id krijg je { group: null, campaigns: [detail] }.
export type CampaignBundle = {
  group: { id: string; name: string; theme: string | null } | null;
  campaigns: CampaignDetail[];
};

export async function fetchCampaignBundle(
  idOrGroupId: string,
): Promise<CampaignBundle> {
  const res = await authedFetch(
    `${API_URL}/campaigns/bundle/${idOrGroupId}`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// Per 2026-05-13 (mig 0041): shape van een enkele variant. Identiek
// aan ai_suggestions.suggested_campaign.channels[].variants zodat
// dezelfde frontend-component beide kan renderen.
export type CampaignVariant = {
  subject_line?: string | null;
  body: string;
};

export type CampaignDetail = Campaign & {
  subject_line: string | null;
  body: string | null;
  scheduled_for: string | null;
  // Door Filly voorgesteld tijdstip + reasoning. Frontend toont deze
  // als "Filly stelt voor: …" en biedt accepteren/wijzigen-knoppen.
  suggested_scheduled_for: string | null;
  suggested_scheduled_reasoning: string | null;
  executed_at: string | null;
  // Tijdstip waarop een Filly-variant is toegepast. Null = nog niet
  // gekozen → "Met Filly bewerken"-sectie wel zichtbaar. Niet-null →
  // sectie verbergen, geen verdere alternatieven mogelijk.
  variant_applied_at: string | null;
  // Per 2026-05-12: Filly's reasoning uit het bijbehorende voorstel
  // (gejoined via campaigns.ai_suggestion_id). Null = campagne is
  // handmatig aangemaakt of voorstel is verwijderd. Concept-detail
  // toont 'Waarom dit voorstel'-card als deze gevuld is.
  reasoning: string | null;
  // Per 2026-05-13 (mig 0041): alle versies + welke Gekozen is.
  // Bron-van-waarheid voor de Versies-grid op de unified-detail-page;
  // body/subject_line hierboven zijn afgeleid van
  // variants[selected_variant_index].
  variants: CampaignVariant[];
  selected_variant_index: number;
  // Aantal verstuurde mails (alleen mail-type). Voor status-label-keuze:
  // 'actief' + sent_count=0 → "Klaar voor verzending", >0 → "Verstuurd".
  sent_count: number;
  tags: string[] | null;
  created_at: string;
  content: {
    // mail
    subject_line?: string;
    preheader?: string;
    body_html?: string;
    body_plain?: string;
    from_name?: string;
    reply_to?: string;
    // social
    caption?: string;
    hashtags?: string[];
    media_urls?: string[];
    platforms?: string[];
    cta_link?: string;
    // whatsapp
    message_text?: string;
    template_name?: string;
    // media_url is whatsapp-specifiek (1 foto/video). Backend levert
    // hier een 1-uur signed URL voor preview, niet het ruwe storage-pad.
    media_url?: string | null;
    // shared
    stats?: Record<string, number>;
  } | null;
};

export async function fetchCampaign(id: string): Promise<CampaignDetail> {
  const res = await authedFetch(`${API_URL}/campaigns/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Maakt een nieuwe campagne als 'concept' aan. Wordt aangeroepen vanaf
// de Filly-chat na klik op "Ja, maak aan" bij een proposal-kaart.
// Response bevat het id zodat we de user meteen kunnen doorsturen
// naar /dashboard/campagnes/[id] voor de laatste controle.
export async function createCampaign(input: {
  name: string;
  type: CampaignType;
  subject_line?: string;
  body: string;
}): Promise<{ id: string }> {
  const res = await authedFetch(`${API_URL}/campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// Werkt een concept-campagne bij. Backend weigert als status niet
// 'concept' is zodat verzonden/ingeplande campagnes immutable blijven.
export async function updateCampaign(
  id: string,
  input: {
    name?: string;
    subject_line?: string | null;
    body?: string;
    // Markeer als variant-apply zodat backend variant_applied_at zet
    // en de UI de "Met Filly bewerken"-sectie verbergt.
    from_variant?: boolean;
  },
): Promise<{ id: string }> {
  const res = await authedFetch(`${API_URL}/campaigns/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// Status-transitie. Backend valideert toegestane mappings
// (concept→ingepland, ingepland→actief, actief→afgerond, etc).
// Voor Activeren wordt executed_at automatisch op now() gezet.
export async function updateCampaignStatus(
  id: string,
  status: CampaignStatus,
): Promise<{ id: string; status: CampaignStatus }> {
  const res = await authedFetch(`${API_URL}/campaigns/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export type CampaignVariantsState = {
  variants: Array<{ subject_line?: string; body: string }>;
  regenerate_count: number;
  can_regenerate: boolean;
};

// Lees de gecachte filly-varianten van een campagne. Géén generatie,
// alleen wat al in de DB staat. Bij page-open op detail-pagina hiermee
// checken of we initial moeten genereren of bestaande tonen.
export async function fetchCampaignVariants(
  id: string,
): Promise<CampaignVariantsState> {
  const res = await authedFetch(`${API_URL}/campaigns/${id}/variants`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Genereert 3 alternatieven en cachet ze server-side. Bij eerste call
// krijg je 3 varianten + count=1. Bij tweede call: 3 extra (totaal 6)
// + count=2. Daarna weigert backend (kostenbeheersing). Optionele
// instructie stuurt de varianten een richting op.
export async function generateCampaignVariants(
  id: string,
  instruction?: string,
): Promise<CampaignVariantsState> {
  const res = await authedFetch(`${API_URL}/campaigns/${id}/refine`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instruction: instruction ?? "" }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ============================================================
// VARIANT-ENDPOINTS (per 2026-05-13, mig 0041)
// ============================================================
// Bron-van-waarheid: campaigns.variants + selected_variant_index.
// Backend handhaaft status='concept' — anders 400. Frontend gates
// daarom de knoppen al via canEdit op de unified-detail-page.

// Wisselen welke versie 'Gekozen' is. Sync body/subject in
// campaign_*_content aan backend-kant.
export async function selectCampaignVariant(
  campaignId: string,
  index: number,
): Promise<{ id: string; selected_variant_index: number }> {
  const res = await authedFetch(
    `${API_URL}/campaigns/${campaignId}/variants/${index}/select`,
    { method: "PATCH" },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// Eén specifieke versie bewerken. Als idx == selected_variant_index
// wordt campaign_*_content ook gesynced (backend doet dit).
export async function editCampaignVariant(
  campaignId: string,
  index: number,
  patch: { subject_line?: string | null; body: string },
): Promise<{ id: string; variants: CampaignVariant[] }> {
  const res = await authedFetch(
    `${API_URL}/campaigns/${campaignId}/variants/${index}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// 3 nieuwe versies genereren door Filly. Cap op 6 totaal — daarna
// weigert backend (kostenbeheersing, zelfde grens als /refine).
export async function generateMoreCampaignVariants(
  campaignId: string,
  instruction?: string,
): Promise<{ id: string; variants: CampaignVariant[] }> {
  const res = await authedFetch(
    `${API_URL}/campaigns/${campaignId}/variants`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction: instruction ?? "" }),
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// Upload foto bij concept-campagne (social/whatsapp). Multipart-form
// met 1 file-veld 'file'. Backend valideert type + size, vervangt
// eventueel oude foto, returnt 1-uur signed URL voor preview.
export async function uploadCampaignMedia(
  campaignId: string,
  file: File,
): Promise<{ path: string; signed_url: string }> {
  const formData = new FormData();
  formData.append("file", file);
  // authedFetch voegt JWT + X-Restaurant-Id toe; multipart Content-
  // Type laat browser zelf bepalen (incl. boundary).
  const res = await authedFetch(
    `${API_URL}/campaigns/${campaignId}/media`,
    {
      method: "POST",
      body: formData,
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// Vraag Filly een verzendmoment voor te stellen. Cache-friendly:
// herhaalde calls zonder force=true returnen het opgeslagen voorstel.
// Met force=true overschrijft Claude de cache (kost tokens).
export async function suggestCampaignSchedule(
  campaignId: string,
  force = false,
): Promise<{
  suggested_scheduled_for: string;
  suggested_scheduled_reasoning: string;
}> {
  const res = await authedFetch(
    `${API_URL}/campaigns/${campaignId}/suggest-schedule`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force }),
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// Bevestig of override het scheduled_for-veld. Backend valideert dat
// status concept of ingepland is.
export async function setCampaignSchedule(
  campaignId: string,
  datetimeIso: string,
): Promise<{ id: string; scheduled_for: string }> {
  const res = await authedFetch(
    `${API_URL}/campaigns/${campaignId}/scheduled`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ datetime: datetimeIso }),
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// Per 2026-05-21: historie-campagne terugzetten naar de kanban met
// nieuwe datum. Validatie zit aan de backend-kant (status-keuze,
// toekomst-check, bron-campagne is echt historie).
export async function restoreCampaignFromHistory(
  campaignId: string,
  newStatus: "concept" | "ingepland" | "actief",
  scheduledForIso: string,
): Promise<{ id: string; status: CampaignStatus }> {
  const res = await authedFetch(
    `${API_URL}/campaigns/${campaignId}/restore`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: newStatus,
        scheduled_for: scheduledForIso,
      }),
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// Verwijder huidige foto van een concept-campagne (storage + DB-veld).
export async function deleteCampaignMedia(
  campaignId: string,
): Promise<{ id: string }> {
  const res = await authedFetch(
    `${API_URL}/campaigns/${campaignId}/media`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// Hard delete. Alleen toegestaan voor concept, backend weigert
// delete op verzonden/ingeplande/actieve/afgeronde campagnes omdat
// die audit-relevant zijn.
export async function deleteCampaign(id: string): Promise<{ id: string }> {
  const res = await authedFetch(`${API_URL}/campaigns/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ============================================================
// Mail-flow: campagne-send via Resend
// ============================================================
// Resultaat-shape van POST /api/campaigns/:id/send. Aantal verstuurd
// vs gefaald gebruiken we om de UI een nette success/warning-toast
// te laten tonen na de actie.
export type SendCampaignResult = {
  campaignId: string;
  total: number;
  sent: number;
  failed: number;
  failures: Array<{ email: string; error: string }>;
};

// Twee modes:
// - 'test': stuur 1 mail naar `testEmail` om visueel te checken.
// - 'all_opted_in': stuur naar alle gasten met mail_opt_in=true.
export async function sendCampaign(
  id: string,
  mode: "test" | "all_opted_in",
  testEmail?: string,
): Promise<SendCampaignResult> {
  const res = await authedFetch(`${API_URL}/campaigns/${id}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, testEmail }),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Versturen mislukt"));
  }
  return res.json();
}

// Publiceert een social-campagne nu naar Facebook/Instagram via de
// (goedgekeurde) Meta-koppeling. Idempotent: al gepubliceerd → no-op.
// Gebruikt in de "Activeer nu"-flow voor social-kanalen.
export async function publishCampaign(
  id: string,
): Promise<{ published: boolean; alreadyPublished?: boolean }> {
  const res = await authedFetch(`${API_URL}/campaigns/${id}/publish`, {
    method: "POST",
  });
  if (!res.ok) {
    // Backend geeft een duidelijke reden (geen koppeling / geen pagina /
    // Meta-fout); die tonen we in de activeer-foutmelding.
    throw new Error(await readErrorMessage(res, "Publiceren naar Facebook/Instagram mislukt"));
  }
  return res.json();
}

// ============================================================
// Eigen-domein-flow (stap 2)
// ============================================================
// Een restaurant kan z'n eigen domein koppelen zodat campagnes komen
// van bv. info@bistrodemo.nl ipv social@get-filly.com. Resend Domains
// API regelt de DKIM-records; wij tonen ze in de UI zodat de eigenaar
// ze kan plakken bij z'n DNS-host (TransIP/Versio/Namecheap/etc.).

export type DnsRecord = {
  type: "TXT" | "MX" | "CNAME";
  name: string;
  value: string;
  ttl?: string;
  priority?: number;
  status?: string;
};

export type MailDomainStatus = {
  // 'none' = geen domein gekoppeld → mail valt op default social@get-filly.com
  // 'pending' = registratie aangemaakt, DNS-records nog niet geverifieerd
  // 'verified' = klaar, mail komt van eigen domein
  // 'failed' = verify is geprobeerd maar DNS klopt niet
  status: "none" | "pending" | "verified" | "failed";
  domain: string | null;
  fromAddress: string | null;
  verifiedAt: string | null;
  records: DnsRecord[];
};

export async function fetchMailDomainStatus(): Promise<MailDomainStatus> {
  const res = await authedFetch(`${API_URL}/restaurant/me/mail-domain`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Status ophalen mislukt"));
  }
  return res.json();
}

export async function registerMailDomain(
  domain: string,
  fromAddress: string,
): Promise<MailDomainStatus> {
  const res = await authedFetch(`${API_URL}/restaurant/me/mail-domain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain, fromAddress }),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Registreren mislukt"));
  }
  return res.json();
}

// Wordt aangeroepen wanneer eigenaar op "Ik heb de records toegevoegd"
// klikt, Resend checkt DNS opnieuw en geeft binnen ~1s een nieuwe
// status terug. Bij 'pending' moet de eigenaar even later opnieuw
// proberen (DNS-propagatie 5-30 min).
export async function verifyMailDomain(): Promise<MailDomainStatus> {
  const res = await authedFetch(
    `${API_URL}/restaurant/me/mail-domain/verify`,
    { method: "POST" },
  );
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Verificatie mislukt"));
  }
  return res.json();
}

// Domein loskoppelen, bij Resend wordt 'ie verwijderd, lokaal worden
// de mail-velden geleegd. Vanaf dat moment valt mail-flow weer terug
// op social@get-filly.com.
export async function removeMailDomain(): Promise<{ removed: true }> {
  const res = await authedFetch(`${API_URL}/restaurant/me/mail-domain`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Verwijderen mislukt"));
  }
  return res.json();
}

export type Guest = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  birthday: string | null;
  visit_count: number;
  last_visit_at: string | null;
  tags: string[];
  mail_opt_in: boolean;
  source: string | null;
  average_spend_cents: number | null;
  lifetime_value_cents: number | null;
  preferences: { allergies?: string[]; dietary?: string[] } | null;
  notes: string | null;
  // Filly-attributie (sinds migratie 0022). Wordt automatisch gevuld
  // wanneer een reservering van deze gast aan een Filly-campagne
  // wordt gekoppeld via de reserveringen-pagina.
  acquired_via_campaign_id: string | null;
};

export type CustomerStatus =
  | "nieuw"
  | "vaste_gast"
  | "vip"
  | "at_risk"
  | "verloren";

export function computeCustomerStatus(g: Guest): CustomerStatus {
  const daysSinceLastVisit = g.last_visit_at
    ? Math.floor(
        (Date.now() - new Date(g.last_visit_at).getTime()) /
          (1000 * 60 * 60 * 24),
      )
    : null;

  const ltvEuro = (g.lifetime_value_cents ?? 0) / 100;

  if (daysSinceLastVisit !== null && daysSinceLastVisit > 180) return "verloren";
  if (daysSinceLastVisit !== null && daysSinceLastVisit > 90) return "at_risk";
  if (g.visit_count >= 10 || ltvEuro >= 1000) return "vip";
  if (g.visit_count < 3) return "nieuw";
  return "vaste_gast";
}

export async function fetchGuests(): Promise<Guest[]> {
  const res = await authedFetch(`${API_URL}/guests`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export type Kpis = {
  today_pct: number | null;
  weekday_avg_pct: number | null;
  month_avg_pct: number | null;
  month_guests: number;
  month_revenue_cents: number;
  pending_suggestions: number;
  // Lopende campagnes (status 'ingepland' of 'actief').
  active_campaigns: number;
  // Totaal gasten vandaag (estimated_guests).
  today_guests: number;
  // Subset: gasten via Filly vandaag (reservations met via_campaign_id).
  today_filly_guests: number;
  // Filly-attributie deze maand. Null voor share als er nog geen
  // totaal-aantal is om tegen af te zetten.
  month_filly_reservations: number;
  month_filly_guests: number;
  month_filly_share_pct: number | null;
  month_filly_revenue_cents: number;
};

export async function fetchKpis(): Promise<Kpis> {
  // Dit is het eerste endpoint dat onder de AuthGuard staat, dus we
  // gebruiken authedFetch (stuurt JWT mee). Zonder geldige sessie
  // geeft de backend 401 terug en mislukt deze call.
  const res = await authedFetch(`${API_URL}/kpi`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Per-campagne attributie deze maand, voor rapportages (per kanaal).
export type CampaignAttribution = {
  campaign_id: string;
  campaign_name: string;
  campaign_type: "mail" | "social" | "whatsapp";
  reservations: number;
  guests: number;
  estimated_revenue_cents: number;
};

export async function fetchFillyAttribution(): Promise<CampaignAttribution[]> {
  const res = await authedFetch(`${API_URL}/kpi/filly-attribution`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// 6-maanden Filly-ROI buckets voor de bar-grafiek.
export type FillyRoiMonth = {
  month: string; // "YYYY-MM"
  reservations: number;
  guests: number;
  estimated_revenue_cents: number;
};

export async function fetchFillyRoi6Months(): Promise<FillyRoiMonth[]> {
  const res = await authedFetch(`${API_URL}/kpi/filly-roi-6m`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export type OccupancyDay = {
  date: string;
  occupancy_pct: number;
  estimated_guests: number;
  estimated_revenue_cents: number;
};

export async function fetchOccupancy(
  year: number,
  month: number,
): Promise<OccupancyDay[]> {
  const res = await authedFetch(
    `${API_URL}/occupancy?year=${year}&month=${month}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Service-periode-config per dag. Gebruikt door dashboard week/dag-
// view + KPI-aggregaten + Filly-context. Mig 0038.
// - Top-level keys: vrije strings (default: breakfast/lunch/dinner)
// - Dag-keys: engels 3-letter (mon/tue/wed/thu/fri/sat/sun), zelfde
//   als opening_hours
// - Waarde per dag: null = niet actief, of:
//     { start: "HH:MM", end: "HH:MM", session_count: 1-4 }
export type ServicePeriodDay = {
  start: string;
  end: string;
  session_count: number;
};
export type ServicePeriods = {
  [serviceKey: string]: {
    [weekdayKey: string]: ServicePeriodDay | null;
  };
};

export type Restaurant = {
  id: string;
  name: string;
  slug: string | null;
  type: string | null;
  cuisine_style: string[] | null;
  description: string | null;
  tagline: string | null;
  target_audience: string | null;
  atmosphere: string | null;
  unique_selling_points: string | null;
  special_events: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  price_range: number | null;
  capacity_seats: number | null;
  capacity_terrace: number | null;
  has_terrace: boolean;
  has_private_room: boolean;
  has_kids_menu: boolean;
  // Eigenaar-doel voor doordeweekse bezetting (KPI-row). Sinds
  // migratie 0027. Null = gebruik 6-maanden-historie of fallback 68.
  target_weekday_occupancy_pct: number | null;
  // Wanneer schijnt de zon op het terras? Subset van
  // ['morning','afternoon','evening']. Null = nog niet ingesteld.
  // Filly gebruikt dit bij weer-getriggerde campagnes.
  terrace_sun_periods: string[] | null;
  // Soort terras: open / covered (vast overdekt) / convertible
  // (overdekbaar: zonnescherm met regen-stand, glas-schuifwanden).
  // Bepaalt of Filly bij regen alsnog terras kan voorstellen.
  terrace_type: "open" | "covered" | "convertible" | null;
  opening_hours: Record<string, { open: string; close: string }> | null;
  closed_dates: string[] | null;
  // Per-dag service-tijden (ontbijt/lunch/diner). Sinds mig 0038.
  // Top-level keys: breakfast/lunch/dinner. Dag-keys: mon..sun.
  // Waarde per dag: null (niet actief) of { start, end, session_count }.
  service_periods: ServicePeriods | null;
  brand_tone: "casual" | "professional" | "playful";
  signature_dishes: string[] | null;
  languages_spoken: string[] | null;
  social_media: Record<string, string> | null;
  website_url: string | null;
  website_summary: string | null;
  website_last_analyzed_at: string | null;
  menu_document_url: string | null;
  // Branding (bestaat sinds migratie 0001 maar nu pas in UI gebruikt).
  logo_url: string | null;
  brand_colors: { primary?: string; secondary?: string } | null;
  // Bedrijfsgegevens (toegevoegd in migratie 0018), voor mailings,
  // privacy-verklaring en algemene voorwaarden.
  legal_name: string | null;
  kvk_number: string | null;
  vat_number: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  email_from_name: string | null;
  email_reply_to: string | null;
  // Vanaf welke sterren-rating telt een review als "lage review" en
  // verschijnt 'ie in de overige-acties-strip op /dashboard/campagnes.
  // Range 1-5, default 3 (sinds mig 0036).
  low_review_threshold: number;
  // Vanaf welk bezetting-percentage telt een dag als "rustig" en
  // verschijnt 'ie in de overige-acties-strip (14 dgn vooruit).
  // Range 10-100, default 50 (sinds mig 0037).
  low_occupancy_threshold: number;
  // ----- Evenementen in voorstellen (mig 0054) -----
  // Welke event-typen Filly meeneemt in voorstellen.
  // null = alle categorieën; lege array = events uit.
  event_categories: string[] | null;
  // Vaste maximale afstand in km voor alle typen; null = slimme
  // staffel per type (markt/kermis 2, concert/sport 5, festival 10).
  event_max_distance_km: number | null;
  // Jaarlijkse NL-feestdagen meenemen in voorstellen (mig 0055).
  event_holidays_enabled: boolean;
  // ----- Reviews auto-reageren (mig 0051) -----
  // Aan/uit voor Filly's automatische review-reacties.
  reviews_auto_reply_enabled: boolean;
  // 'concept' = Filly zet een concept-reactie klaar ter goedkeuring;
  // 'publish' = Filly plaatst zelf (vereist GBP OAuth, fase E).
  reviews_auto_reply_mode: "concept" | "publish";
  // Eigen toon voor reviews-reacties; null = fallback op tone_of_voice.
  reviews_tone_of_voice: string | null;
  plan: "starter" | "pro" | "enterprise";
  // ----- Identiteit uitbreiding (mig 0044, 2026-05-21) -----
  // Bron-van-waarheid voor Filly's posts. Verhuist samen met de andere
  // identiteit-velden naar /dashboard/vindbaarheid/identiteit (was
  // /dashboard/account?tab=identiteit).
  location_description: string | null;
  keywords: string[] | null;
  default_hashtags: string[] | null;
  tone_of_voice: string | null;
  do_not_mention: string | null;
  brand_story: string | null;
  awards: string[] | null;
  target_audience_segments: string[] | null;
};

export async function fetchRestaurant(): Promise<Restaurant> {
  const res = await authedFetch(`${API_URL}/restaurant/me`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function updateRestaurant(
  updates: Partial<Restaurant>,
): Promise<Restaurant> {
  const res = await authedFetch(`${API_URL}/restaurant/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Opslaan mislukt"));
  }
  return res.json();
}

// Trigger handmatig de website-analyse. Backend leest de huidige
// website_url, draait Claude, en vult tagline/sfeer/USPs/etc op het
// restaurant. Returnt de bijgewerkte Restaurant zodat de UI de nieuwe
// velden direct kan tonen.
export async function analyzeRestaurantWebsite(): Promise<Restaurant> {
  const res = await authedFetch(`${API_URL}/restaurant/me/analyze-website`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Website-analyse mislukt"));
  }
  return res.json();
}

export type ForecastDay = {
  date: string;
  dayLabel: string;
  tempMin: number;
  tempMax: number;
  icon: string;
  description: string;
};

export async function fetchWeather(): Promise<ForecastDay[]> {
  const res = await authedFetch(`${API_URL}/weather/me`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export type SuggestionStatus = "pending" | "approved" | "rejected" | "expired";

export type AiSuggestion = {
  id: string;
  trigger_type: string;
  trigger_context: Record<string, unknown> | null;
  suggested_campaign: {
    name?: string;
    type?: "mail" | "social" | "whatsapp";
    // Per 2026-05-07: specifieker platform-veld dan 'type'. 'type' blijft
    // voor backwards-compat met legacy seed-data. Voor social-campagnes
    // specificeert 'platform' welk netwerk (instagram/facebook/tiktok).
    platform?:
      | "mail"
      | "whatsapp"
      | "instagram"
      | "facebook"
      | "tiktok";
    // Per 2026-05-07 fase 2b: multi-channel-array. Wanneer aanwezig,
    // bron-van-waarheid voor de UI; legacy top-level velden zijn dan
    // niet meer direct relevant maar worden gesynced met channels[0]
    // door de backend.
    channels?: Array<{
      id: string;
      platform:
        | "mail"
        | "whatsapp"
        | "instagram"
        | "facebook"
        | "tiktok";
      variants: Array<{ subject_line?: string; body?: string }>;
      selected_index: number;
      scheduled_for?: string;
      filly_scheduled_for?: string;
      filly_scheduled_reasoning?: string;
      restaurant_media_id?: string | null;
    }>;
    // Nieuwe shape (sinds 3-varianten-flow):
    variants?: Array<{
      subject_line?: string;
      body?: string;
    }>;
    selected_index?: number;
    // Legacy single-body shape (voor seed-data):
    subject?: string;
    subject_line?: string;
    caption?: string;
    segment?: string;
    body?: string;
    // Per 2026-05-07: eigenaar zet zelf een verzendmoment vóór
    // goedkeuring. ISO-datum, gevuld via /suggestions/:id/scheduled.
    // Bij approve overgenomen op de aangemaakte campagne. Null/undef =
    // nog niet gezet, CampaignSchedulePanel doet voorstel post-approve.
    scheduled_for?: string;
    // Per 2026-05-07: eigenaar koppelt een foto uit de bibliotheek
    // aan de suggestie. Alleen voor social/whatsapp. Bij approve
    // wordt het bestand gekopieerd naar campaign-media.
    restaurant_media_id?: string | null;
  };
  status: SuggestionStatus;
  rejection_reason: string | null;
  // Gezet zodra deze suggestie is goedgekeurd: de id van de
  // aangemaakte campagne. Frontend gebruikt dit om door te linken
  // naar /dashboard/campagnes/[id].
  approved_campaign_id: string | null;
  created_at: string;
  acted_at: string | null;
  confidence_score: number | null;
  expected_impact: {
    extra_reservations?: number;
    extra_revenue_cents?: number;
    retention_guests?: number;
  } | null;
  urgency: "low" | "medium" | "high" | null;
  reasoning: string | null;
};

export async function fetchSuggestions(
  status?: SuggestionStatus,
  excludeTriggerTypes?: string[],
): Promise<AiSuggestion[]> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (excludeTriggerTypes && excludeTriggerTypes.length > 0) {
    params.set("exclude", excludeTriggerTypes.join(","));
  }
  const qs = params.toString();
  const url = qs
    ? `${API_URL}/suggestions?${qs}`
    : `${API_URL}/suggestions`;
  const res = await authedFetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Proposal-details: tastbare invulling van een suggestie
// (hoofdgerecht + bijgerechten + timing + bundle-prijs +
// hero-foto-suggestie). Backend genereert via Claude bij eerste
// call (~2s) en cachet daarna op de suggestie zelf.
export type ProposalDetails = {
  mainDish?: {
    name: string;
    description: string;
    source: "menu" | "new";
    priceCents?: number;
  };
  sides?: Array<{
    name: string;
    description: string;
    source: "menu" | "new";
    priceCents?: number;
  }>;
  timing?: string;
  priceBundleCents?: number;
  priceBundleLabel?: string;
  heroImage?: {
    emoji: string;
    description: string;
  };
};

export async function fetchProposalDetails(
  suggestionId: string,
): Promise<ProposalDetails> {
  const res = await authedFetch(
    `${API_URL}/suggestions/${suggestionId}/proposal-details`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(
      await readErrorMessage(res, "Kon Filly's voorstel niet ophalen"),
    );
  }
  return res.json();
}

// "Filly bekijkt rustige dagen"-knop in de dashboard alert-bar.
// Detecteert dagen <50% in window 2-14 dagen + genereert per dag
// 1 toegespitste suggestie. Dagen met al een pending suggestie
// worden overgeslagen (anti-spam).
export async function detectLowOccupancySuggestions(): Promise<{
  detected: number;
  generated: number;
  skipped: number;
  suggestions: AiSuggestion[];
}> {
  const res = await authedFetch(
    `${API_URL}/suggestions/detect-low-occupancy`,
    { method: "POST" },
  );
  if (!res.ok) {
    throw new Error(
      await readErrorMessage(res, "Detectie lage bezetting mislukt"),
    );
  }
  return res.json();
}

// "Vraag Filly om voorstellen"-knop op het dashboard (popover met
// dag-multi-select). Stuurt expliciete dag-selectie naar backend
// (mix van low_occupancy + special_day items). Per item genereert
// Filly één voorstel + slaat 'm op in ai_suggestions.
export type GenerateForDatesItem = {
  date: string;
  kind: "low_occupancy" | "special_day";
  // Voor special_day: naam van de feestdag (Vaderdag, Kerst, etc).
  // Voor low_occupancy: niet gebruikt.
  name?: string;
  // Geleide flow (fase 2): door de eigenaar gekozen kanalen
  // (platform-namen) + context-hints (events/weer) die de generatie
  // sturen. Beide optioneel.
  channels?: string[];
  context?: string[];
};

// Day-context voor de geleide chat-flow (stap 2 + 3). Spiegelt
// DayContext in apps/api suggestions.service.ts.
export type DayContextChannel = {
  channel: "mail" | "instagram" | "facebook" | "whatsapp" | "google_business";
  label: string;
  recommended: boolean;
  note: string;
};
export type DayContext = {
  date: string;
  weather: {
    icon: string;
    description: string;
    tempMin: number;
    tempMax: number;
  } | null;
  events: Array<{
    name: string;
    category: string;
    place: string;
    distanceKm: number;
  }>;
  channels: DayContextChannel[];
};

// Leesbare context voor één gekozen dag: events in de buurt + weer +
// kanalen met bereik. Read-only, geen AI — voedt de geleide flow.
export async function fetchDayContext(date: string): Promise<DayContext> {
  const res = await authedFetch(
    `${API_URL}/suggestions/day-context?date=${encodeURIComponent(date)}`,
  );
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Dag-context laden mislukt"));
  }
  return res.json();
}

export async function generateSuggestionsForDates(
  items: GenerateForDatesItem[],
): Promise<{
  generated: number;
  suggestions: AiSuggestion[];
}> {
  const res = await authedFetch(
    `${API_URL}/suggestions/generate-for-dates`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    },
  );
  if (!res.ok) {
    throw new Error(
      await readErrorMessage(res, "Voorstellen genereren mislukt"),
    );
  }
  return res.json();
}

// "Vraag Filly om voorstellen"-knop op /campagnes. Triggert backend
// om 3-5 nieuwe ai_suggestions te genereren op basis van profile +
// menu + actuele bezetting/weer. Werkt vanaf seconde 1 na onboarding
// zolang er minimaal 3 menu-items zijn, anders BadRequest met een
// helpende NL-foutmelding.
export async function generateSuggestions(): Promise<{
  created: number;
  suggestions: AiSuggestion[];
}> {
  const res = await authedFetch(`${API_URL}/suggestions/generate`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(
      await readErrorMessage(res, "Voorstellen genereren mislukt"),
    );
  }
  return res.json();
}

// Goedkeur-flow: maakt een campagne aan uit de suggestie, zet de
// suggestion-status op approved en koppelt approved_campaign_id.
// Retourneert het campagne-id zodat we direct kunnen doorlinken.
export async function approveSuggestion(
  suggestionId: string,
): Promise<{ suggestion: AiSuggestion; campaignId: string }> {
  const res = await authedFetch(
    `${API_URL}/suggestions/${suggestionId}/approve`,
    { method: "POST" },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// Multi-channel bundle goedkeuren (sinds 2026-05-04). Maakt 1 group
// + per gekozen kanaal een campagne aan. Eigenaar selecteert in de
// chat-card welke kanalen hij wil; backend slaat ongekozen kanalen
// over (returnt null voor die IDs).
export type BundleChannel =
  | "mail"
  | "instagram"
  | "facebook"
  | "whatsapp"
  | "google_business";

export type ApproveBundleResult = {
  suggestion: AiSuggestion;
  groupId: string;
  // Generieke map kanaal → aangemaakte campagne-id (alleen aangemaakte).
  campaignIds: Partial<Record<BundleChannel, string>>;
  // Backwards-compat losse velden.
  mailCampaignId: string | null;
  instagramCampaignId: string | null;
  facebookCampaignId: string | null;
  whatsappCampaignId: string | null;
  googleBusinessCampaignId: string | null;
};

export async function approveBundleSuggestion(
  suggestionId: string,
  channels: BundleChannel[],
): Promise<ApproveBundleResult> {
  const res = await authedFetch(
    `${API_URL}/suggestions/${suggestionId}/approve-bundle`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channels }),
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// Variant-selectie: stel in welke van de 3 varianten de eigenaar
// verkiest. Backend update selected_index op de suggestion zodat
// approve + refine straks die variant gebruiken. Per 2026-05-07
// fase 2c: optioneel channel_id voor multi-channel.
export async function selectSuggestionVariant(
  suggestionId: string,
  index: number,
  channelId?: string,
): Promise<AiSuggestion> {
  const res = await authedFetch(
    `${API_URL}/suggestions/${suggestionId}/select-variant`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index, channel_id: channelId }),
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// Per 2026-05-07 fase 2b: voeg een extra kanaal toe aan een pending
// suggestie. Wordt gebruikt voor multi-channel-voorstellen: eigenaar
// kiest 'Instagram + WhatsApp' i.p.v. één kanaal. Backend syntheseert
// het kanaal met de body van het primaire kanaal als seed.
export async function addSuggestionChannel(
  suggestionId: string,
  platform:
    | "mail"
    | "whatsapp"
    | "instagram"
    | "facebook"
    | "tiktok"
    | "google_business",
): Promise<AiSuggestion> {
  const res = await authedFetch(
    `${API_URL}/suggestions/${suggestionId}/channels`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform }),
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// Verwijder een kanaal uit een pending-suggestie. Het laatste kanaal
// is niet verwijderbaar.
export async function removeSuggestionChannel(
  suggestionId: string,
  channelId: string,
): Promise<AiSuggestion> {
  const res = await authedFetch(
    `${API_URL}/suggestions/${suggestionId}/channels/${channelId}/remove`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// Per 2026-05-07: eigenaar koppelt een foto uit de bibliotheek aan
// een pending suggestie (alleen social/whatsapp). mediaId=null verbreekt
// de koppeling. Bij approve wordt het bestand server-side gekopieerd
// naar campaign-media zodat de campagne een eigen kopie heeft.
export async function setSuggestionMedia(
  suggestionId: string,
  mediaId: string | null,
  channelId?: string,
): Promise<AiSuggestion> {
  const res = await authedFetch(
    `${API_URL}/suggestions/${suggestionId}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ media_id: mediaId, channel_id: channelId }),
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// Per 2026-05-07: eigenaar bewerkt vóór goedkeuring de inhoud van
// een specifieke variant (subject + body). subject_line=null wist het.
// body lege string laat de oorspronkelijke staan (backend negeert).
export async function editSuggestionVariant(
  suggestionId: string,
  index: number,
  patch: { subject_line?: string | null; body?: string },
  channelId?: string,
): Promise<AiSuggestion> {
  const res = await authedFetch(
    `${API_URL}/suggestions/${suggestionId}/edit-variant`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index, channel_id: channelId, ...patch }),
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// Per 2026-05-07: eigenaar zet zelf een verzendmoment op een pending
// suggestie vóór goedkeuring. Bij goedkeuring wordt deze waarde
// gespiegeld naar campaigns.scheduled_for. Backend valideert dat de
// datum in de toekomst ligt en max 1 jaar vooruit.
export async function setSuggestionScheduled(
  suggestionId: string,
  scheduledForIso: string,
  channelId?: string,
): Promise<AiSuggestion> {
  const res = await authedFetch(
    `${API_URL}/suggestions/${suggestionId}/scheduled`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduled_for: scheduledForIso,
        channel_id: channelId,
      }),
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// Refine-flow: laat Filly de suggestie aanpassen op basis van een
// natuurlijke-taal-instructie ("maak huiselijker", "korter"). Werkt
// op de geselecteerde variant; andere blijven onaangetast.
//
// Per 2026-05-21 multi-channel-aware: voor channels[]-voorstellen
// target backend de varianten van het opgegeven channel_id. Bij
// legacy single-channel voorstellen mag channel_id leeg blijven.
export async function refineSuggestion(
  suggestionId: string,
  instruction: string,
  channelId?: string,
): Promise<AiSuggestion> {
  const res = await authedFetch(
    `${API_URL}/suggestions/${suggestionId}/refine`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instruction,
        ...(channelId ? { channel_id: channelId } : {}),
      }),
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// Suggestie-detail ophalen (voor bv. een detail-modal waarbij we
// actueel de inhoud willen tonen).
export async function fetchSuggestion(
  suggestionId: string,
): Promise<AiSuggestion> {
  const res = await authedFetch(`${API_URL}/suggestions/${suggestionId}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  // Sub-categorie. Voor drank-items: wijn-rood/bier/cocktail/etc.
  // Voor menu-items momenteel ongebruikt.
  subcategory: string | null;
  price_cents: number | null;
  is_signature: boolean;
  is_seasonal: boolean;
  season: string | null;
  is_available: boolean;
  dietary_tags: string[];
};

export async function fetchMenu(): Promise<MenuItem[]> {
  const res = await authedFetch(`${API_URL}/menu`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Input voor create + update. Velden komen 1-op-1 overeen met de backend
// MenuService. `id` ontbreekt bewust, die wordt door de DB gegenereerd
// bij create en in de URL meegegeven bij update.
export type MenuItemInput = {
  name: string;
  description?: string | null;
  category?: string | null;
  subcategory?: string | null;
  price_cents?: number | null;
  is_signature?: boolean;
  is_seasonal?: boolean;
  season?: string | null;
  is_available?: boolean;
  dietary_tags?: string[];
};

// ============================================================
// Menu-suggesties (Filly-gerecht-voorstellen)
// ============================================================
// Voorstellen leven in een aparte tabel `suggested_menu_items` zodat
// ze niet meetellen in de echte menu_items tot de eigenaar accepteert.
// Lifecycle: pending → accepted/rejected/refined_into/expired.

export type SuggestedMenuItemSourceType =
  | "gap_analysis"
  | "profile_based"
  | "seasonal"
  | "refined";

export type SuggestedMenuItemConfidence = "high" | "medium" | "low";

export type SuggestedMenuItemStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "refined_into"
  | "expired";

export type SuggestedMenuItem = {
  id: string;
  source_type: SuggestedMenuItemSourceType;
  name: string;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  // Filly geeft een prijs-RANGE (low/high in centen). Backend pakt
  // automatisch het midden bij accept; eigenaar kan 'm daarna in de
  // menu-pagina bijstellen.
  price_cents_low: number | null;
  price_cents_high: number | null;
  dietary_tags: string[];
  reasoning: string | null;
  confidence: SuggestedMenuItemConfidence;
  status: SuggestedMenuItemStatus;
  refined_from_id: string | null;
  refine_count: number;
  created_at: string;
};

// status default 'pending' (de Voorgesteld-tab); 'rejected' voor de
// Afgewezen-tab. Backend valideert; andere waardes geven 400.
export async function fetchMenuSuggestions(
  status: "pending" | "rejected" = "pending",
): Promise<SuggestedMenuItem[]> {
  const url = `${API_URL}/menu-suggestions?status=${status}`;
  const res = await authedFetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Voorstellen ophalen mislukt"));
  }
  return res.json();
}

// "✨ Vraag Filly om gerecht-voorstellen". Backend doet de Claude-call
// (Sonnet 4.6, ~3500 tokens) en returnt 3-5 nieuwe pending-rijen.
// Rate-limited op restaurant-niveau via AiRateLimitGuard.
export async function generateMenuSuggestions(): Promise<SuggestedMenuItem[]> {
  const res = await authedFetch(`${API_URL}/menu-suggestions/generate`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(
      await readErrorMessage(res, "Filly kon geen voorstellen maken"),
    );
  }
  return res.json();
}

// 1-klik accept: voorstel → echt menu_item. Returnt de id van het
// nieuwe menu_item zodat de UI eventueel naar dat item kan scrollen.
export async function acceptMenuSuggestion(
  suggestionId: string,
): Promise<{ menu_item_id: string }> {
  const res = await authedFetch(
    `${API_URL}/menu-suggestions/${suggestionId}/accept`,
    { method: "POST" },
  );
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Accepteren mislukt"));
  }
  return res.json();
}

// Soft-reject: status='rejected' (niet hard-deleten zodat we kunnen
// leren welke voorstellen werden afgewezen).
export async function rejectMenuSuggestion(
  suggestionId: string,
): Promise<{ id: string }> {
  const res = await authedFetch(
    `${API_URL}/menu-suggestions/${suggestionId}`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Verwijderen mislukt"));
  }
  return res.json();
}

// "Andere variant": Filly genereert één wezenlijk andere variant.
// Cap van 3 refines per origineel-voorstel, daarna geeft de backend
// een 400 met NL-tekst. Het oude voorstel wordt op 'refined_into'
// gezet en de nieuwe variant verschijnt als pending.
export async function refineMenuSuggestion(
  suggestionId: string,
): Promise<SuggestedMenuItem> {
  const res = await authedFetch(
    `${API_URL}/menu-suggestions/${suggestionId}/refine`,
    { method: "POST" },
  );
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Variant maken mislukt"));
  }
  return res.json();
}

// ============================================================
// Restaurant media-bibliotheek (foto's per restaurant)
// ============================================================
// Eigenaar uploadt foto's via account-pagina; gebruikt door
// CampaignMediaSlot ("Kies uit bibliotheek") en straks door Filly's
// suggesties. Cap: 20 foto's per restaurant. Vision-tag bij upload
// (Haiku 4.5) genereert description + tags voor matching.

export type RestaurantMediaItem = {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  description: string | null;
  tags: string[];
  uploaded_at: string;
  // Signed URL met 1u TTL, voor weergave in <img>-tags. Backend
  // re-genereert per list-call.
  url: string;
};

export async function fetchRestaurantMedia(): Promise<RestaurantMediaItem[]> {
  const res = await authedFetch(`${API_URL}/restaurant-media`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Foto's ophalen mislukt"));
  }
  return res.json();
}

export async function uploadRestaurantMedia(
  file: File,
): Promise<RestaurantMediaItem> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await authedFetch(`${API_URL}/restaurant-media`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Upload mislukt"));
  }
  return res.json();
}

export async function deleteRestaurantMedia(
  id: string,
): Promise<{ id: string }> {
  const res = await authedFetch(`${API_URL}/restaurant-media/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Verwijderen mislukt"));
  }
  return res.json();
}

// AVG-export: trigger een blob-download van de complete restaurant-
// data-export. Gebruikt authedFetch zodat het JWT meegestuurd wordt
// (die we via een <a href>-link niet mee kunnen geven).
export async function downloadRestaurantExport(): Promise<void> {
  const res = await authedFetch(`${API_URL}/restaurant/me/export`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Export mislukt (HTTP ${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `getfilly-export-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// AVG art. 17, recht op vergetelheid. Verwijdert de ingelogde
// user permanent inclusief alle owner-restaurants en gerelateerde
// data. Vereist letterlijke "VERWIJDER"-bevestiging, anders weigert
// de backend met BadRequest. Op succes returnt de backend een
// telling van wat is verwijderd; de frontend signt daarna direct uit.
export type AccountDeletionResult = {
  deleted_user_id: string;
  restaurants_deleted: number;
  campaigns_anonymized: number;
};

export async function deleteAccount(
  confirmation: string,
): Promise<AccountDeletionResult> {
  const res = await authedFetch(`${API_URL}/restaurant/me/account`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmation }),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Verwijderen mislukt"));
  }
  return res.json();
}

// Helper: pak de NL-foutmelding uit een non-OK response. Backend stuurt
// `{ message: "Naam is verplicht." }`-vormige body. Bij ontbrekende of
// niet-JSON body vallen we terug op de HTTP-status zodat we nooit een
// leeg "Error: " in de UI tonen.
async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.message === "string") return body.message;
  } catch {
    // niet-JSON body, fallback gebruiken
  }
  return `${fallback} (HTTP ${res.status})`;
}

export async function createMenuItem(input: MenuItemInput): Promise<MenuItem> {
  const res = await authedFetch(`${API_URL}/menu`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Toevoegen mislukt"));
  }
  return res.json();
}

export async function updateMenuItem(
  id: string,
  input: Partial<MenuItemInput>,
): Promise<MenuItem> {
  const res = await authedFetch(`${API_URL}/menu/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Opslaan mislukt"));
  }
  return res.json();
}

export async function deleteMenuItem(id: string): Promise<{ id: string }> {
  const res = await authedFetch(`${API_URL}/menu/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Verwijderen mislukt"));
  }
  return res.json();
}

// ============================================================
// Menukaart-import (PDF/foto via Claude Vision)
// ============================================================

export type ImportCardResult = {
  upload_id: string;
  file_name: string | null;
  items_imported: number;
  items: MenuItem[];
  notes: string | null;
  confidence: "high" | "medium" | "low";
};

export type ActiveMenuCard = {
  id: string;
  // 'menu' = regulier menukaart, 'drinks' = drankkaart. Bepaalt
  // welke banner de UI toont en welk type acties beschikbaar zijn.
  kind: "menu" | "drinks";
  file_name: string | null;
  uploaded_at: string;
  items_count: number;
};

// Upload een menukaart-bestand. Synchrone call: backend uploadt naar
// Storage, draait Claude Vision en schrijft alle gerechten weg
// voordat de response terugkomt. Kan 5-15s duren bij een vol menu;
// caller toont een progress-spinner zolang de Promise nog open is.
export async function importMenuCard(file: File): Promise<ImportCardResult> {
  const fd = new FormData();
  fd.append("file", file);
  // authedFetch zet automatisch JWT + X-Restaurant-Id; multipart
  // Content-Type laten we aan de browser zodat de boundary klopt.
  const res = await authedFetch(`${API_URL}/menu/import-card`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Menukaart importeren mislukt"));
  }
  return res.json();
}

// Drankkaart-upload, zelfde flow als importMenuCard maar gebruikt
// het drank-Vision-schema (wijn-rood/bier/cocktail/etc subcategorie)
// en forceert server-side category='drank' op alle items.
export async function importDrinksCard(
  file: File,
): Promise<ImportCardResult> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await authedFetch(`${API_URL}/menu/import-drinks-card`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    throw new Error(
      await readErrorMessage(res, "Drankkaart importeren mislukt"),
    );
  }
  return res.json();
}

// Welke kaarten zijn nu actief? Returnt 0-2 cards: maximaal 1
// menu-kaart + 1 drankkaart, beide de meest recent succesvol
// verwerkte upload van dat type.
export async function fetchActiveCards(): Promise<ActiveMenuCard[]> {
  const res = await authedFetch(`${API_URL}/menu/active-cards`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      await readErrorMessage(res, "Kon actieve kaarten niet ophalen"),
    );
  }
  return (await res.json()) as ActiveMenuCard[];
}

// Genereert een 1-uur signed URL voor een kaart-upload zodat de UI
// 'm in een nieuw tabblad kan openen ("klik op banner om je
// geüploade kaart te bekijken").
export async function fetchCardSignedUrl(
  uploadId: string,
): Promise<string> {
  const res = await authedFetch(`${API_URL}/menu/cards/${uploadId}/url`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      await readErrorMessage(res, "Kon kaart-link niet ophalen"),
    );
  }
  const json = (await res.json()) as { url: string };
  return json.url;
}

// Verwijder de actieve menukaart inclusief alle items die daar uit
// kwamen. Handmatig toegevoegde items blijven staan.
export async function deleteMenuCard(
  uploadId: string,
): Promise<{ id: string; items_deleted: number }> {
  const res = await authedFetch(`${API_URL}/menu/cards/${uploadId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Menukaart verwijderen mislukt"));
  }
  return res.json();
}

export type ReservationStatus =
  | "bevestigd"
  | "geannuleerd"
  | "no_show"
  | "ingecheckt"
  | "voltooid";

export type Reservation = {
  id: string;
  guest_id: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  guest_email: string | null;
  reservation_date: string;
  reservation_time: string;
  party_size: number;
  status: ReservationStatus;
  source: string | null;
  notes: string | null;
  special_requests: string | null;
  table_code: string | null;
  // Filly-attributie (sinds migratie 0022). Null = niet gekoppeld
  // aan een campagne. Als gevuld: uuid van de campagne. Eigenaar
  // kan dit handmatig zetten via dropdown op reserveringen-pagina;
  // straks automatisch via send-engine click-tracking.
  via_campaign_id: string | null;
  created_at: string;
};

export async function fetchReservations(
  from?: string,
  to?: string,
): Promise<Reservation[]> {
  const q = new URLSearchParams();
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  const url = `${API_URL}/reservations${q.toString() ? "?" + q.toString() : ""}`;
  const res = await authedFetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Handmatige reservering toevoegen (telefoon / walk-in). Backend zet
// status automatisch op 'bevestigd' en source op 'handmatig'. Frontend
// krijgt de volledige reservering terug zodat we 'm direct in de
// lijst kunnen tonen zonder nog een fetch.
export async function createReservation(input: {
  guest_name: string;
  reservation_date: string;
  reservation_time: string;
  party_size: number;
  guest_phone?: string;
  guest_email?: string;
  special_requests?: string;
  notes?: string;
}): Promise<Reservation> {
  const res = await authedFetch(`${API_URL}/reservations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// Koppel of ontkoppel een reservering aan een Filly-campagne.
// campaignId=null = ontkoppelen. Returnt de bijgewerkte reservering.
export async function setReservationAttribution(
  reservationId: string,
  campaignId: string | null,
): Promise<Reservation> {
  const res = await authedFetch(
    `${API_URL}/reservations/${reservationId}/attribution`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaign_id: campaignId }),
    },
  );
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Koppelen mislukt"));
  }
  return res.json();
}

// Status-overgang voor een reservering (bv. 'bevestigd' → 'ingecheckt').
// Wordt aangeroepen door de Inchecken-knop op /dashboard/reserveringen.
export async function setReservationStatus(
  reservationId: string,
  status: ReservationStatus,
): Promise<Reservation> {
  const res = await authedFetch(
    `${API_URL}/reservations/${reservationId}/status`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    },
  );
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Status wijzigen mislukt"));
  }
  return res.json();
}

export type ReviewSource = "google" | "tripadvisor" | "thefork" | "iens";

export type Review = {
  id: string;
  source: ReviewSource;
  rating: number;
  title: string | null;
  body: string | null;
  author: string | null;
  review_date: string | null;
  response_text: string | null;
  responded_at: string | null;
};

export async function fetchReviews(): Promise<Review[]> {
  const res = await authedFetch(`${API_URL}/reviews`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Vraagt Filly (Claude) om een reply-suggestie voor een specifieke review.
// Backend bouwt de prompt + doet de AI-call; wij krijgen alleen de tekst
// terug. POST omdat de call side-effects heeft (tokens verbruiken, logging).
export async function generateReviewReply(
  reviewId: string,
): Promise<{ suggestion: string }> {
  const res = await authedFetch(
    `${API_URL}/reviews/${reviewId}/reply-suggestion`,
    { method: "POST" },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export type ReviewVariantsState = {
  variants: string[];
  regenerate_count: number;
  can_regenerate: boolean;
};

// Lees gecachte filly-varianten van een review. Géén Claude-call.
export async function fetchReviewVariants(
  reviewId: string,
): Promise<ReviewVariantsState> {
  const res = await authedFetch(`${API_URL}/reviews/${reviewId}/variants`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Genereert 3 alternatieve reactie-varianten + cachet ze. Eerste call:
// 3. Tweede: 3 extra (totaal 6). Daarna weigert backend.
export async function refineReviewVariants(
  reviewId: string,
): Promise<ReviewVariantsState> {
  const res = await authedFetch(`${API_URL}/reviews/${reviewId}/refine`, {
    method: "POST",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// Slaat het uiteindelijke antwoord op. De user kan de AI-suggestie hebben
// overgenomen of handmatig iets hebben ingetypt, dat maakt voor dit
// endpoint niet uit. Backend retourneert de bijgewerkte review zodat
// de UI direct de nieuwe response_text + responded_at kan tonen.
export async function saveReviewReply(
  reviewId: string,
  responseText: string,
): Promise<Review> {
  const res = await authedFetch(`${API_URL}/reviews/${reviewId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response_text: responseText }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ============================================================
// Filly chat, dashboard-home assistent
// ============================================================

export type ChatRole = "filly" | "user" | "system";

// message_card hangt aan sommige Filly-berichten en bevat een voorstel
// voor een actie. Voor v1 alleen campagne-voorstellen; later komen er
// meer kinds (review_reply, guest_message, etc.). Frontend rendert
// een bijpassend kaartje onder het bericht.
export type ProposalVariant = {
  subject_line?: string;
  body: string;
};

export type CampaignProposalCard = {
  kind: "campaign_proposal";
  // FK naar ai_suggestions.id. Backend maakt de suggestie al aan
  // tijdens het chat-antwoord zodat de goedkeur-flow via
  // /api/suggestions/:id/approve loopt, zelfde endpoint als bij
  // auto-gegenereerde suggesties die we op /campagnes tonen.
  suggestion_id: string;
  type: "mail" | "social" | "whatsapp";
  name: string;
  // 3 varianten naast elkaar. Frontend toont ze in een grid; user
  // kiest favoriet (selected_index) en kan eventueel refinen voor
  // approve.
  variants: ProposalVariant[];
  selected_index: number;
  // Backend vult deze bij het ophalen van chat-historie vanuit de
  // ai_suggestions-join. Zo weet de frontend na navigatie terug naar
  // de chat of de suggestie al approved/rejected is, dan tonen we
  // direct "Concept aangemaakt →" i.p.v. de actie-knoppen opnieuw.
  suggestion_status?: "pending" | "approved" | "rejected" | "expired";
  approved_campaign_id?: string | null;
};

// Multi-channel bundle (sinds 2026-05-04). Filly genereert mail + IG
// + FB onder één thema; eigenaar kan ze als bundle accepteren via
// approveBundleSuggestion. Frontend rendert 'm als 3 collapsibles
// onder elkaar met per-kanaal "Push"-knop.
export type CampaignBundleCard = {
  kind: "campaign_bundle";
  suggestion_id: string;
  name: string;
  theme: string;
  channels: {
    // Sinds 2026-06-02 optioneel + 5 kanalen: een bundel bevat precies
    // de aangevinkte kanalen. WhatsApp/Google Business hebben alleen body.
    mail?: { subject_line: string; body: string };
    instagram?: { caption: string; hashtags?: string[] };
    facebook?: { caption: string };
    whatsapp?: { body: string };
    google_business?: { body: string };
  };
  suggestion_status?: "pending" | "approved" | "rejected" | "expired";
  approved_group_id?: string | null;
};

// Channel-choice, Filly's keuzeprompt vóór 'ie een campagne genereert.
// Geen ai_suggestion erachter; bij klik op een knop verstuurt frontend
// automatisch een user-bericht ("Maak een mail-campagne") zodat Filly
// in de volgende beurt het juiste formaat (proposal of bundle) levert.
export type ChannelChoiceCard = {
  kind: "channel_choice";
  question: string;
};

// Date-choice, sinds 2026-05-24. Filly vraagt eerst voor welke dag of
// gelegenheid (vóór de kanaal-keuze). Frontend stuurt bij keuze een
// follow-up "Voor [datum/gelegenheid]" zodat Filly het target meeneemt.
export type DateChoiceCard = {
  kind: "date_choice";
  question: string;
};

// Guided-start, sinds 2026-06-12: een getypt campagne-verzoek opent de
// geleide flow ín het gesprek. `date` = optioneel door Filly herleide
// doel-datum (uit "zondag"/"morgen"/...); leeg → flow start bij de
// dag-keuze.
export type GuidedStartCard = {
  kind: "guided_start";
  date?: string;
  // Optioneel gerecht/thema uit het verzoek dat de generatie stuurt.
  topic?: string;
};

export type MessageCard =
  | CampaignProposalCard
  | CampaignBundleCard
  | ChannelChoiceCard
  | DateChoiceCard
  | GuidedStartCard;

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  message_card: MessageCard | null;
  created_at: string;
};

// Gedeelde "lopende actie"-state per gesprek (audit-item #8). Eén bron-
// van-waarheid waar de geleide flow én de chat-LLM op lezen/schrijven,
// zodat een gekozen dag/thema niet verloren gaat zodra de eigenaar gaat
// typen. Spiegelt ActiveAction in apps/api chat.service.ts.
export type ActiveAction = {
  date?: string;
  topic?: string;
  channels?: string[];
  step?: string;
  updated_at?: string;
};

// Delta-vorm voor de PATCH. Per veld: weglaten = ongemoeid; null = WISSEN
// (bv. "+ Nog een dag" maakt datum/thema leeg zonder de actie te
// beëindigen); waarde = zetten. `reset: true` beëindigt de hele actie.
export type ActiveActionDelta = {
  date?: string | null;
  topic?: string | null;
  channels?: string[] | null;
  step?: string | null;
  reset?: boolean;
};

export type ActiveChatState = {
  conversationId: string;
  messages: ChatMessage[];
  // Aantal berichten in deze conversatie. Cap = 20. UI gebruikt dit
  // voor "Bericht X / 20"-indicator + cap-bereikt-CTA.
  messageCount: number;
  // De lopende actie of null. De geleide flow seed't z'n begintoestand
  // hieruit; de chat-orchestrator houdt 'm in sync.
  activeAction: ActiveAction | null;
};

// Lijst-item voor het chat-history-overzicht in de chat-card-header.
// Title kan null zijn als de conversatie nog te kort is voor de auto-
// title-generator (drempel = 3 user-messages).
export type ChatConversationSummary = {
  id: string;
  title: string | null;
  message_count: number;
  updated_at: string;
};

// Cap = 50 berichten per conversatie. Gedeeld constant tussen frontend
// en backend (in backend: ChatService.CONVERSATION_CAP). UI gebruikt 'm
// voor de "Bericht X / 50"-indicator. Bij wijziging: ook backend
// bijwerken zodat de cap-check consistent blijft.
export const CHAT_CONVERSATION_CAP = 50;

// Bij openen van het dashboard halen we de actieve chat op. Backend
// maakt 'm aan als die nog niet bestaat en geeft meteen een
// welkomstbericht van Filly.
export async function fetchActiveChat(): Promise<ActiveChatState> {
  const res = await authedFetch(`${API_URL}/chat/active`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Lijst van alle conversaties voor de chat-history-dropdown. Limit 50
// in de backend; oudere conversaties zijn niet meer bereikbaar via UI
// (bewust, Filly's memory-systeem onthoudt geleerde voorkeuren in
// restaurant_chat_memory, dus oude chats hoeven niet doorzoekbaar).
export async function fetchChatConversations(): Promise<
  ChatConversationSummary[]
> {
  const res = await authedFetch(`${API_URL}/chat/conversations`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Switch naar een specifieke conversatie. Returnt full state zodat UI
// de huidige messages kan vervangen + cap-indicator kan updaten.
export async function fetchChatConversation(
  conversationId: string,
): Promise<ActiveChatState> {
  const res = await authedFetch(
    `${API_URL}/chat/conversations/${conversationId}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Start een nieuwe lege conversatie. Gebruikt door "+ Nieuw gesprek"-
// knop in de dropdown EN door de cap-bereikt-CTA. Returnt direct de
// full state met welkomstbericht zodat UI naadloos kan switchen.
export async function createChatConversation(): Promise<ActiveChatState> {
  const res = await authedFetch(`${API_URL}/chat/conversations`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Verwijder een conversatie + bijhorende berichten. Voor delete probeert
// backend de Haiku-summary op te slaan zodat geleerde voorkeuren in
// restaurant_chat_memory bewaard blijven.
export async function deleteChatConversation(
  conversationId: string,
): Promise<{ id: string }> {
  const res = await authedFetch(
    `${API_URL}/chat/conversations/${conversationId}`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// Stuurt een bericht + wacht op Filly's antwoord. Backend slaat beide
// op in chat_messages en geeft ze terug zodat we ze aan de lijst
// kunnen toevoegen zonder opnieuw te hoeven fetchen.
//
// Bij cap-bereikt: backend gooit 400 BadRequest met NL-tekst. Caller
// vangt 'm op en toont "+ Nieuw gesprek"-CTA.
export async function sendChatMessage(
  conversationId: string,
  content: string,
): Promise<{
  userMessage: ChatMessage;
  fillyMessage: ChatMessage;
  // De (mogelijk bijgewerkte) lopende actie na deze beurt, zodat de
  // geleide flow direct in sync komt zonder reload.
  activeAction: ActiveAction | null;
}> {
  const res = await authedFetch(`${API_URL}/chat/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversation_id: conversationId, content }),
  });
  if (!res.ok) {
    // Probeer de NL-foutmelding van de backend te lezen, die bevat
    // bij cap-bereikt de duidelijke "Start een nieuw gesprek"-tekst.
    const body = await res.json().catch(() => null);
    const msg = body?.message ?? `HTTP ${res.status}`;
    const err = new Error(msg) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Werkt de lopende actie van een gesprek bij (audit-item #8). De geleide
// flow roept dit aan bij elke keuze (dag/kanalen) en met {reset:true} na
// een geslaagde generatie. Returnt de gemergede actie (of null bij reset).
export async function updateChatActiveAction(
  conversationId: string,
  delta: ActiveActionDelta,
): Promise<ActiveAction | null> {
  const res = await authedFetch(
    `${API_URL}/chat/conversations/${conversationId}/active-action`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(delta),
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function updateSuggestion(
  id: string,
  status: SuggestionStatus,
  rejection_reason?: string,
): Promise<AiSuggestion> {
  const res = await authedFetch(`${API_URL}/suggestions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, rejection_reason }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ============================================================
// Team management
// ============================================================
// Endpoints onder /api/team voor het beheren van teamleden binnen het
// actieve restaurant. Alleen de owner mag hier wijzigingen maken,
// de backend weigert het voor andere rollen met 403.

import type { Module, Role } from "@getfilly/shared";

export type TeamMember = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  permissions: { modules: Module[] } | null;
  created_at: string;
};

export async function fetchTeam(): Promise<TeamMember[]> {
  const res = await authedFetch(`${API_URL}/team`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Wijzig rol en/of custom permissies van een teamlid.
 *   - permissions: undefined → niet meegestuurd (blijft ongewijzigd)
 *   - permissions: null      → custom permissies UIT (terug naar rol-defaults)
 *   - permissions: Module[]  → custom permissies aan
 */
export async function updateTeamMember(
  userId: string,
  updates: { role?: Role; permissions?: Module[] | null },
): Promise<TeamMember> {
  const res = await authedFetch(`${API_URL}/team/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function removeTeamMember(userId: string): Promise<void> {
  const res = await authedFetch(`${API_URL}/team/${userId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// ============================================================
// Invites (team-uitnodigingen)
// ============================================================

export type InvitationRecord = {
  id: string;
  restaurant_id: string;
  email: string;
  role: Role;
  permissions: { modules: Module[] } | null;
  token: string;
  invited_by: string | null;
  expires_at: string;
  status: "pending" | "accepted" | "revoked";
  created_at: string;
};

export type CreateInviteResult = {
  invite: InvitationRecord;
  deliveredByEmail: boolean;
  manualLink?: string;
};

export async function fetchInvites(): Promise<InvitationRecord[]> {
  const res = await authedFetch(`${API_URL}/team/invites`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function createInvite(
  email: string,
  role: Role,
  permissions?: Module[] | null,
): Promise<CreateInviteResult> {
  const res = await authedFetch(`${API_URL}/team/invites`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, role, permissions }),
  });
  if (!res.ok) {
    // Probeer een leesbare foutmelding terug te geven voor de UI.
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${body ? ": " + body : ""}`);
  }
  return res.json();
}

export async function revokeInvite(inviteId: string): Promise<void> {
  const res = await authedFetch(`${API_URL}/team/invites/${inviteId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

/**
 * Accepteer een invite met token, roept /api/invites/accept aan.
 * De user moet ingelogd zijn voordat deze call werkt (magic link
 * logt ze automatisch in).
 */
export async function acceptInvite(
  token: string,
): Promise<{ restaurantId: string; role: Role }> {
  const res = await authedFetch(`${API_URL}/invites/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${body ? ": " + body : ""}`);
  }
  return res.json();
}

/**
 * Genereer een verse magic link voor een openstaande invite.
 * Werkt ook als de oorspronkelijke mail niet aankwam, owner kan
 * de link dan handmatig delen.
 */
export async function getInviteMagicLink(inviteId: string): Promise<string> {
  const res = await authedFetch(`${API_URL}/team/invites/${inviteId}/magic-link`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { link: string };
  return data.link;
}

// ============================================================
// Google Business Profile (fase B, 2026-05-05)
// ============================================================

// Subset van de Places-API velden die we in de UI gebruiken. Spiegelt
// PlaceDetails in apps/api/src/google-profile/types.ts, uitbreiden bij
// nieuwe features (let er dan ook op dat de backend FieldMask de
// velden meeneemt). Velden die Google soms weglaat staan als optional.
export type GooglePlaceDetails = {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  postalAddress: {
    streetAddress: string | null;
    locality: string | null;
    postalCode: string | null;
    administrativeArea: string | null;
    country: string | null;
  } | null;
  location: { latitude: number; longitude: number } | null;
  rating: number | null;
  userRatingCount: number | null;
  types: string[];
  primaryType: string | null;
  priceLevel: string | null;
  websiteUri: string | null;
  internationalPhoneNumber: string | null;
  regularOpeningHours: {
    weekdayDescriptions: string[];
    openNow: boolean | null;
  } | null;
  photos: Array<{ name: string; widthPx: number; heightPx: number }>;
  businessStatus: string | null;
  editorialSummary: string | null;
};

export type GoogleProfileMine = {
  connected: boolean;
  data: GooglePlaceDetails | null;
  syncedAt: string | null;
};

export type GooglePlaceSearchResult = {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  rating: number | null;
  userRatingCount: number | null;
};

// Lees gecachete Google-profile-data voor het actieve restaurant.
// connected=false → restaurant heeft nog geen koppeling. UI toont
// dan de "Koppel met Google"-flow.
export async function fetchGoogleProfileMine(): Promise<GoogleProfileMine> {
  const res = await authedFetch(`${API_URL}/google-profile/me`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Tekst-zoekopdracht naar Google Places. Werkt ALLEEN voor klanten met
// een actief restaurant (RestaurantAccessGuard op de hub-route).
// Voor de onboarding-wizard gebruiken we /onboarding/google-search.
export async function searchGoogleProfile(
  query: string,
): Promise<GooglePlaceSearchResult[]> {
  const res = await authedFetch(`${API_URL}/google-profile/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// Koppel een place_id aan het actieve restaurant. Backend fetcht direct
// de details om de cache te vullen, wij krijgen 'm in de response
// terug zodat de UI direct kan switchen naar de connected-state.
export async function connectGoogleProfile(
  placeId: string,
): Promise<{ data: GooglePlaceDetails; syncedAt: string }> {
  const res = await authedFetch(`${API_URL}/google-profile/me/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ placeId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// Force-refresh van de cached profile-data. Bypasst de 24u-TTL.
export async function refreshGoogleProfile(): Promise<{
  data: GooglePlaceDetails;
  syncedAt: string;
}> {
  const res = await authedFetch(`${API_URL}/google-profile/me/refresh`, {
    method: "POST",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// Ontkoppel het Google-profiel. Wist place_id + cache + synced_at.
// Klant kan later opnieuw koppelen.
export async function disconnectGoogleProfile(): Promise<{ ok: true }> {
  const res = await authedFetch(`${API_URL}/google-profile/me`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---- Profiel-audit (fase B) ----

export type AuditSeverity = "critical" | "warning" | "tip";

export type AuditFinding = {
  code: string;
  severity: AuditSeverity;
  title: string;
  description: string;
  actionHint: string;
};

export type AuditResult = {
  generatedAt: string;
  findings: AuditFinding[];
  summary: { critical: number; warning: number; tip: number };
};

// Backend-rules-engine die ~12 checks loopt over de gecachete profile-
// data. Vereist een actieve Google-koppeling, zonder geeft 404.
export async function fetchGoogleProfileAudit(): Promise<AuditResult> {
  const res = await authedFetch(`${API_URL}/google-profile/me/audit`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ---- Concurrent-benchmark (fase B) ----

export type CompetitorPlace = {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  rating: number | null;
  userRatingCount: number | null;
  primaryType: string | null;
  distanceMeters: number | null;
  photoCount: number;
};

// ============================================================
// Marketing-hub (fase 1, 2026-05-06)
// ============================================================

export type MailStats = {
  periodDays: number;
  periodStart: string;
  periodEnd: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
  openRate: number | null;
  clickRate: number | null;
  bounceRate: number | null;
  unsubscribeRate: number | null;
  benchmark: {
    openRate: number;
    clickRate: number;
    bounceRate: number;
    source: string;
  };
  campaignCount: number;
};

export type CampaignMailStats = {
  campaignId: string;
  campaignName: string;
  campaignType: string;
  status: string;
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
};

// Aggregaat-stats over de afgelopen N dagen (default 30).
export async function fetchMarketingMailStats(
  days: number = 30,
): Promise<MailStats> {
  const res = await authedFetch(`${API_URL}/marketing/mail/stats?days=${days}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Per-campagne tabel, default 90 dagen voor wat meer historie.
export async function fetchMarketingMailCampaigns(
  days: number = 90,
): Promise<CampaignMailStats[]> {
  const res = await authedFetch(
    `${API_URL}/marketing/mail/campaigns?days=${days}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ============================================================
// Google Business Profile competitors
// ============================================================

// Buurt-vergelijking. Default 1km radius; UI mag dit later parametrisch
// maken (slider 250m-3km bv).
export async function fetchGoogleProfileCompetitors(
  radiusMeters: number = 1000,
): Promise<CompetitorPlace[]> {
  const res = await authedFetch(
    `${API_URL}/google-profile/me/competitors?radius=${radiusMeters}`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ============================================================
// Health-score (vindbaarheid: SEO + GBP + Reviews + GEO)
// ============================================================
//
// Drie endpoints:
//   - POST /health/run        , trigger nieuwe audit, returnt snapshot
//   - GET  /health/latest     , laatste snapshot + findings + concurrenten
//   - GET  /health/history    , laatste N snapshots zonder findings (trend)
//
// Types matchen 1:1 met apps/api/src/health/types.ts (camelCased).

export type HealthCategory = "seo" | "gbp" | "reviews" | "geo";

export type HealthSeverity =
  | "info"
  | "low"
  | "medium"
  | "high"
  | "critical";

export type HealthRunSource = "manual" | "cron" | "onboarding";

export interface HealthFinding {
  id: string;
  healthScoreId: string;
  restaurantId: string;
  category: HealthCategory;
  checkKey: string;
  passed: boolean;
  severity: HealthSeverity;
  pointsLost: number;
  title: string;
  description: string | null;
  fixSuggestion: string | null;
  fixLink: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface HealthCompetitor {
  id: string;
  healthScoreId: string;
  restaurantId: string;
  placeId: string;
  name: string;
  distanceM: number;
  scoreTotal: number | null;
  scoreGbp: number | null;
  scoreReviews: number | null;
  rawData: Record<string, unknown> | null;
  rankInRadius: number;
}

export interface HealthSnapshot {
  id: string;
  restaurantId: string;
  scoreTotal: number;
  scoreSeo: number;
  scoreGbp: number;
  scoreReviews: number;
  scoreGeo: number;
  ranAt: string;
  runDurationMs: number | null;
  runSource: HealthRunSource;
  runnerVersion: string;
}

export interface HealthSnapshotFull extends HealthSnapshot {
  findings: HealthFinding[];
  competitors: HealthCompetitor[];
}

/** Start een nieuwe health-audit. Backend retourneert het complete snapshot. */
export async function runHealthAudit(): Promise<HealthSnapshotFull> {
  const res = await authedFetch(`${API_URL}/health/run`, {
    method: "POST",
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

/** Laatste snapshot of null als er nog nooit een audit is gedraaid. */
export async function fetchHealthLatest(): Promise<HealthSnapshotFull | null> {
  const res = await authedFetch(`${API_URL}/health/latest`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  // Backend kan letterlijk `null` returnen → JSON.parse maakt dat ook null.
  return res.json();
}

/**
 * Trend-data: laatste N snapshots (zonder findings/concurrenten).
 * Default 12 ≈ 3 maanden wekelijks.
 */
export async function fetchHealthHistory(
  limit: number = 12,
): Promise<HealthSnapshot[]> {
  const res = await authedFetch(
    `${API_URL}/health/history?limit=${limit}`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ============================================================
// Campaign performance (filly-brein hfst 9)
// ============================================================
//
// Per campagne: opens/clicks/reservations + success_score 0-100 +
// classification (winner/average/underperformer/no_data). null als
// er nog geen performance-rij is (campagne nog niet 'actief' geweest).

export type CampaignClassification =
  | "winner"
  | "average"
  | "underperformer"
  | "no_data";

export interface CampaignPerformance {
  id: string;
  campaign_id: string;
  restaurant_id: string;

  mail_delivered: number | null;
  mail_opened: number | null;
  mail_clicked: number | null;
  mail_bounced: number | null;
  mail_unsubscribed: number | null;

  social_reach: number | null;
  social_impressions: number | null;
  social_engagement: number | null;
  social_saves: number | null;
  social_video_views: number | null;
  social_watch_time_seconds: number | null;

  whatsapp_delivered: number | null;
  whatsapp_read: number | null;
  whatsapp_clicked: number | null;

  gbp_impressions: number | null;
  gbp_clicks: number | null;
  gbp_calls: number | null;
  gbp_directions: number | null;

  reservations_attributed: number;
  guests_attributed: number;
  revenue_attributed_cents: number;

  measurement_complete_at: string | null;
  success_score: number | null;
  classification: CampaignClassification | null;
  confounding_factors: Record<string, unknown> | null;

  marked_outlier: boolean;
  marked_outlier_reason: string | null;
  marked_outlier_at: string | null;

  created_at: string;
  updated_at: string;
}

export async function fetchCampaignPerformance(
  campaignId: string,
): Promise<CampaignPerformance | null> {
  const res = await authedFetch(
    `${API_URL}/campaigns/${campaignId}/performance`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  // Endpoint retourneert letterlijk `null` (zonder body) als er nog
  // geen performance-rij is. Dat wordt door Nest soms als lege body
  // verzonden waarop res.json() crasht. Lees eerst als tekst,
  // probeer pas dan te parsen.
  const text = await res.text();
  if (!text || text === "null") return null;
  try {
    return JSON.parse(text) as CampaignPerformance;
  } catch {
    return null;
  }
}

export async function markCampaignOutlier(
  campaignId: string,
  reason: string,
): Promise<{ ok: true }> {
  const res = await authedFetch(
    `${API_URL}/campaigns/${campaignId}/performance/outlier`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function unmarkCampaignOutlier(
  campaignId: string,
): Promise<{ ok: true }> {
  const res = await authedFetch(
    `${API_URL}/campaigns/${campaignId}/performance/outlier`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ============================================================
// Mail verzenden + ontvangers-preview
// ============================================================

export interface RecipientsPreview {
  totalCount: number;
  sampleNames: string[];
  ownerEmail: string | null;
}

// Anti-repetitie-check (filly-brein hfst 8.6)
export interface RepetitionWarning {
  kind: "opening" | "hashtags" | "cta";
  message: string;
}

/**
 * Vraagt de backend of de huidige variant te veel op recente campagnes
 * lijkt. Lege array = geen waarschuwing. Faalt stil (lege array) zodat
 * een check-fout nooit de detail-page blokkeert.
 */
export async function fetchRepetitionCheck(
  campaignId: string,
): Promise<RepetitionWarning[]> {
  try {
    const res = await authedFetch(
      `${API_URL}/campaigns/${campaignId}/repetition-check`,
      { cache: "no-store" },
    );
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function fetchRecipientsPreview(
  campaignId: string,
): Promise<RecipientsPreview> {
  const res = await authedFetch(
    `${API_URL}/campaigns/${campaignId}/recipients-preview`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export interface MailSendResult {
  sent: number;
  failures?: Array<{ email: string; error: string }>;
}

/** Verstuur een test-mail naar één opgegeven adres. */
export async function sendCampaignTest(
  campaignId: string,
  testEmail: string,
): Promise<MailSendResult> {
  const res = await authedFetch(`${API_URL}/campaigns/${campaignId}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "test", testEmail }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

/** Verstuur de campagne naar alle opt-in-gasten. Onomkeerbaar. */
export async function sendCampaignToAll(
  campaignId: string,
): Promise<MailSendResult> {
  const res = await authedFetch(`${API_URL}/campaigns/${campaignId}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "all_opted_in" }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}
