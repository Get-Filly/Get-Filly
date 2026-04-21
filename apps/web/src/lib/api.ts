const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export type CampaignType = "mail" | "social";
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
  const res = await fetch(`${API_URL}/campaigns`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export type CampaignDetail = Campaign & {
  subject_line: string | null;
  body: string | null;
  scheduled_for: string | null;
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
    // shared
    stats?: Record<string, number>;
  } | null;
};

export async function fetchCampaign(id: string): Promise<CampaignDetail> {
  const res = await fetch(`${API_URL}/campaigns/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
  const res = await fetch(`${API_URL}/guests`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export type Kpis = {
  today_pct: number | null;
  last_week_pct: number | null;
  month_avg_pct: number | null;
  month_guests: number;
  month_revenue_cents: number;
  pending_suggestions: number;
};

export async function fetchKpis(): Promise<Kpis> {
  const res = await fetch(`${API_URL}/kpi`, { cache: "no-store" });
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
  const res = await fetch(
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
  plan: "starter" | "pro" | "enterprise";
};

export async function fetchRestaurant(): Promise<Restaurant> {
  const res = await fetch(`${API_URL}/restaurant/me`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function updateRestaurant(
  updates: Partial<Restaurant>,
): Promise<Restaurant> {
  const res = await fetch(`${API_URL}/restaurant/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
  const res = await fetch(`${API_URL}/weather/me`, { cache: "no-store" });
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
    subject?: string;
    caption?: string;
    segment?: string;
    body?: string;
  };
  status: SuggestionStatus;
  rejection_reason: string | null;
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
  const res = await fetch(url, { cache: "no-store" });
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
  const res = await fetch(`${API_URL}/menu`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
  const res = await fetch(`${API_URL}/reviews`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function updateSuggestion(
  id: string,
  status: SuggestionStatus,
  rejection_reason?: string,
): Promise<AiSuggestion> {
  const res = await fetch(`${API_URL}/suggestions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, rejection_reason }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
