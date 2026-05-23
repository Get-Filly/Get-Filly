"use client";

// ============================================================
// OnboardingChecklist, setup-stappen voor nieuwe klanten
// ============================================================
// Wordt op de account-pagina ingehangen (bovenaan, onder de
// page-subtitle). De meeste items linken naar diezelfde pagina,
// dus de checklist staat letterlijk naast het invul-werk.
//
// Per 2026-05-21 (Floris-feedback): UI/UX is verhuisd naar de
// gedeelde <ProgressChecklist /> zodat account + Vindbaarheid
// dezelfde look hebben. Dismiss-flag is vervangen door collapse-
// flag: eigenaar kan 'm inklappen maar niet meer permanent
// wegklikken. Pas bij 100% verdwijnt de hele checklist vanzelf.
//
// Items die op /vindbaarheid/identiteit thuishoren (logo + menu
// + identiteit-velden) zijn weggevallen — die staan nu daar in
// hun eigen per-tab checklist.

import { useEffect, useState } from "react";
import {
  fetchCampaigns,
  fetchRestaurant,
  type Restaurant,
} from "../../../lib/api";
import {
  ProgressChecklist,
  type ProgressChecklistItem,
} from "./progress-checklist";

function buildChecklist(
  restaurant: Restaurant,
  campaignCount: number,
): ProgressChecklistItem[] {
  // Per 2026-05-21: alleen items die nog ONDER Account vallen.
  // Logo + menukaart + identiteit-velden zijn verhuisd naar
  // /dashboard/vindbaarheid/identiteit en krijgen daar hun eigen
  // checklist per sub-tab.
  const profileBasicsDone =
    !!restaurant.name &&
    !!restaurant.type &&
    !!restaurant.address &&
    !!restaurant.postal_code &&
    !!restaurant.city &&
    restaurant.capacity_seats != null;

  const openingHoursDone =
    restaurant.opening_hours != null &&
    Object.keys(restaurant.opening_hours).length > 0;

  // KvK + legal_name samen, handig voor mailings en verplicht
  // op verloop voor verzonden marketing-uitingen.
  const businessDetailsDone =
    !!restaurant.legal_name && !!restaurant.kvk_number;

  return [
    {
      id: "profile",
      label: "Profielbasis: type, adres en capaciteit",
      hint: "Zonder dit kan Filly geen voorstellen op maat doen.",
      href: "/dashboard/account",
      done: profileBasicsDone,
    },
    {
      id: "hours",
      label: "Openingstijden invullen",
      hint: "Voorkomt dat Filly mailings verstuurt op gesloten dagen.",
      href: "/dashboard/account",
      done: openingHoursDone,
    },
    {
      id: "campaign",
      label: "Eerste campagne aanmaken",
      hint: "Maak een test-concept om de flow te leren kennen.",
      href: "/dashboard/campagnes",
      done: campaignCount > 0,
    },
    {
      id: "business",
      label: "Bedrijfsgegevens (legal name + KvK)",
      hint: "Verschijnt in mail-footers en is verplicht voor mailings naar gasten.",
      href: "/dashboard/account",
      done: businessDetailsDone,
    },
  ];
}

export function OnboardingChecklist() {
  const [items, setItems] = useState<ProgressChecklistItem[] | null>(null);

  useEffect(() => {
    // Twee endpoints parallel; beide endpoints die de account-
    // pagina toch al kent (geen extra fetch-load voor de klant).
    Promise.all([fetchRestaurant(), fetchCampaigns()])
      .then(([restaurant, campaigns]) => {
        setItems(buildChecklist(restaurant, campaigns.length));
      })
      .catch(() => {
        // Fail-soft: bij fout verbergt de checklist zich. De pagina
        // mag nooit kapot gaan door een onboarding-component.
        setItems(null);
      });
  }, []);

  if (!items) return null;

  return (
    <ProgressChecklist
      title="Filly aan het werk zetten"
      hint="Vink deze setup-stappen af zodat Filly betere voorstellen kan doen. De lijst verdwijnt vanzelf zodra alles ✓ is."
      items={items}
      collapseKey="getfilly_onboarding_checklist_collapsed_v1"
    />
  );
}
