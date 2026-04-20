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
