const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export type CampaignType = "mail" | "social";
export type CampaignStatus = "actief" | "concept" | "ingepland" | "afgerond";

export type Campaign = {
  id: string;
  name: string;
  type: CampaignType;
  meta: string | null;
  status: CampaignStatus;
};

export async function fetchCampaigns(): Promise<Campaign[]> {
  const res = await fetch(`${API_URL}/campaigns`, { cache: "no-store" });
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
};

export async function fetchGuests(): Promise<Guest[]> {
  const res = await fetch(`${API_URL}/guests`, { cache: "no-store" });
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
