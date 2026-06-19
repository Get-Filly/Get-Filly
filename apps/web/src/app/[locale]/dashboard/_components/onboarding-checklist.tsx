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
import { useTranslations } from "next-intl";
import {
  fetchCampaigns,
  fetchRestaurant,
  type Restaurant,
} from "@/lib/api";
import {
  ProgressChecklist,
  type ProgressChecklistItem,
} from "./progress-checklist";

function buildChecklist(
  restaurant: Restaurant,
  campaignCount: number,
  t: ReturnType<typeof useTranslations>,
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
      label: t("items.profile.label"),
      hint: t("items.profile.hint"),
      href: "/dashboard/account",
      done: profileBasicsDone,
    },
    {
      id: "hours",
      label: t("items.hours.label"),
      hint: t("items.hours.hint"),
      href: "/dashboard/account",
      done: openingHoursDone,
    },
    {
      id: "campaign",
      label: t("items.campaign.label"),
      hint: t("items.campaign.hint"),
      href: "/dashboard/campagnes",
      done: campaignCount > 0,
    },
    {
      id: "business",
      label: t("items.business.label"),
      hint: t("items.business.hint"),
      href: "/dashboard/account",
      done: businessDetailsDone,
    },
  ];
}

export function OnboardingChecklist() {
  const t = useTranslations("dash__components_onboarding_checklist");
  const [items, setItems] = useState<ProgressChecklistItem[] | null>(null);

  useEffect(() => {
    // Twee endpoints parallel; beide endpoints die de account-
    // pagina toch al kent (geen extra fetch-load voor de klant).
    Promise.all([fetchRestaurant(), fetchCampaigns()])
      .then(([restaurant, campaigns]) => {
        setItems(buildChecklist(restaurant, campaigns.length, t));
      })
      .catch(() => {
        // Fail-soft: bij fout verbergt de checklist zich. De pagina
        // mag nooit kapot gaan door een onboarding-component.
        setItems(null);
      });
  }, [t]);

  if (!items) return null;

  return (
    <ProgressChecklist
      title={t("title")}
      hint={t("hint")}
      items={items}
      collapseKey="getfilly_onboarding_checklist_collapsed_v1"
    />
  );
}
