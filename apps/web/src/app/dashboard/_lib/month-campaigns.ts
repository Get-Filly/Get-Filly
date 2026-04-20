// Mock-campagnes voor de actieve maand. Vervangen door backend-data later.

export type CampaignStatus = "actief" | "concept" | "ingepland" | "afgerond";

export type Campaign = {
  id: string;
  type: "mail" | "social";
  name: string;
  meta: string; // bv. "17 apr · 248 gasten"
  status: CampaignStatus;
};

export const aprilCampaigns: Campaign[] = [
  {
    id: "c1",
    type: "mail",
    name: "Chef's Lunch — donderdag",
    meta: "17 apr · 248 gasten",
    status: "actief",
  },
  {
    id: "c2",
    type: "social",
    name: "Paasbrunch post",
    meta: "Instagram · 20 apr",
    status: "ingepland",
  },
  {
    id: "c3",
    type: "mail",
    name: "Voorjaarsmenu aankondiging",
    meta: "25 apr · 1.120 gasten",
    status: "concept",
  },
  {
    id: "c4",
    type: "social",
    name: "Terras-opening story",
    meta: "Instagram · 15 apr",
    status: "afgerond",
  },
];
