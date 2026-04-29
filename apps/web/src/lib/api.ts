import { createClient } from "./supabase-browser";
import { getActiveRestaurantIdSync } from "./restaurant-context";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

/**
 * authedFetch — zoals `fetch`, maar stuurt automatisch mee:
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
 *   400 terug — de component die de call deed kan dat netjes als
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
  // bekijkt — essentieel voor multi-tenant isolatie.
  const restaurantId = getActiveRestaurantIdSync();
  if (restaurantId) {
    headers.set("X-Restaurant-Id", restaurantId);
  }

  return fetch(input, { ...init, headers });
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
};

export async function fetchCampaigns(): Promise<Campaign[]> {
  const res = await authedFetch(`${API_URL}/campaigns`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export type CampaignDetail = Campaign & {
  subject_line: string | null;
  body: string | null;
  scheduled_for: string | null;
  // Door Filly voorgesteld tijdstip + reasoning. Frontend toont deze
  // als "Filly stelt voor: …" en biedt accepteren/wijzigen-knoppen.
  suggested_scheduled_for: string | null;
  suggested_scheduled_reasoning: string | null;
  executed_at: string | null;
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

// Lees de gecachte filly-varianten van een campagne. Géén generatie —
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

// Hard delete. Alleen toegestaan voor concept — backend weigert
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
};

export async function fetchKpis(): Promise<Kpis> {
  // Dit is het eerste endpoint dat onder de AuthGuard staat, dus we
  // gebruiken authedFetch (stuurt JWT mee). Zonder geldige sessie
  // geeft de backend 401 terug en mislukt deze call.
  const res = await authedFetch(`${API_URL}/kpi`, { cache: "no-store" });
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
  // Bedrijfsgegevens (toegevoegd in migratie 0018) — voor mailings,
  // privacy-verklaring en algemene voorwaarden.
  legal_name: string | null;
  kvk_number: string | null;
  vat_number: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  email_from_name: string | null;
  email_reply_to: string | null;
  plan: "starter" | "pro" | "enterprise";
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
): Promise<AiSuggestion[]> {
  const url = status
    ? `${API_URL}/suggestions?status=${status}`
    : `${API_URL}/suggestions`;
  const res = await authedFetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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

// Variant-selectie: stel in welke van de 3 varianten de eigenaar
// verkiest. Backend update selected_index op de suggestion zodat
// approve + refine straks die variant gebruiken.
export async function selectSuggestionVariant(
  suggestionId: string,
  index: number,
): Promise<AiSuggestion> {
  const res = await authedFetch(
    `${API_URL}/suggestions/${suggestionId}/select-variant`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index }),
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
export async function refineSuggestion(
  suggestionId: string,
  instruction: string,
): Promise<AiSuggestion> {
  const res = await authedFetch(
    `${API_URL}/suggestions/${suggestionId}/refine`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction }),
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
// MenuService. `id` ontbreekt bewust — die wordt door de DB gegenereerd
// bij create en in de URL meegegeven bij update.
export type MenuItemInput = {
  name: string;
  description?: string | null;
  category?: string | null;
  price_cents?: number | null;
  is_signature?: boolean;
  is_seasonal?: boolean;
  season?: string | null;
  is_available?: boolean;
  dietary_tags?: string[];
};

// Helper: pak de NL-foutmelding uit een non-OK response. Backend stuurt
// `{ message: "Naam is verplicht." }`-vormige body. Bij ontbrekende of
// niet-JSON body vallen we terug op de HTTP-status zodat we nooit een
// leeg "Error: " in de UI tonen.
async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.message === "string") return body.message;
  } catch {
    // niet-JSON body — fallback gebruiken
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

// Welke menukaart is nu actief voor het ingelogde restaurant? null
// als er nog geen kaart is geüpload.
export async function fetchActiveMenuCard(): Promise<ActiveMenuCard | null> {
  const res = await authedFetch(`${API_URL}/menu/active-card`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Kon actieve menukaart niet ophalen"));
  }
  // Backend stuurt ofwel een object ofwel `null` (geen kaart).
  const json = await res.json();
  return json ?? null;
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
// overgenomen of handmatig iets hebben ingetypt — dat maakt voor dit
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
// Filly chat — dashboard-home assistent
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
  // /api/suggestions/:id/approve loopt — zelfde endpoint als bij
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
  // de chat of de suggestie al approved/rejected is — dan tonen we
  // direct "Concept aangemaakt →" i.p.v. de actie-knoppen opnieuw.
  suggestion_status?: "pending" | "approved" | "rejected" | "expired";
  approved_campaign_id?: string | null;
};
export type MessageCard = CampaignProposalCard;

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  message_card: MessageCard | null;
  created_at: string;
};

export type ActiveChatState = {
  conversationId: string;
  messages: ChatMessage[];
};

// Bij openen van het dashboard halen we de actieve chat op. Backend
// maakt 'm aan als die nog niet bestaat en geeft meteen een
// welkomstbericht van Filly.
export async function fetchActiveChat(): Promise<ActiveChatState> {
  const res = await authedFetch(`${API_URL}/chat/active`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Stuurt een bericht + wacht op Filly's antwoord. Backend slaat beide
// op in chat_messages en geeft ze terug zodat we ze aan de lijst
// kunnen toevoegen zonder opnieuw te hoeven fetchen.
export async function sendChatMessage(
  conversationId: string,
  content: string,
): Promise<{ userMessage: ChatMessage; fillyMessage: ChatMessage }> {
  const res = await authedFetch(`${API_URL}/chat/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversation_id: conversationId, content }),
  });
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
// actieve restaurant. Alleen de owner mag hier wijzigingen maken —
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
 * Accepteer een invite met token — roept /api/invites/accept aan.
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
 * Werkt ook als de oorspronkelijke mail niet aankwam — owner kan
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
