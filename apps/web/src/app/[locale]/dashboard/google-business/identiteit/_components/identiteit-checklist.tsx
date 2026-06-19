"use client";

// ============================================================
// IdentiteitChecklist, voortgang per sub-tab op Vindbaarheid
// ============================================================
// Per 2026-05-21 (Floris-feedback v2): refactored om de gedeelde
// <ProgressChecklist /> te gebruiken zodat account + Vindbaarheid
// identieke look + gedrag hebben (done items eruit, max 4 open
// zichtbaar, collapse-toggle i.p.v. dismiss).
//
// Deze file levert puur de items-builders per sub-tab. De UI
// komt uit <ProgressChecklist />.
//
// De labels zijn geïnternationaliseerd via next-intl. Omdat de
// builders gewone functies zijn (geen React-componenten) kunnen ze
// zelf geen useTranslations() aanroepen; de aanroepende component
// haalt de translator op met
//   const t = useTranslations("dash_google_business_identiteit_components_identiteit_checklist");
// en geeft 't' door aan elke builder.

import type { useTranslations } from "next-intl";
import type { Restaurant } from "@/lib/api";
import {
  ProgressChecklist,
  type ProgressChecklistItem,
} from "../../../_components/progress-checklist";

// Translator-type voor deze namespace, zodat de builders typed blijven.
type ChecklistT = ReturnType<
  typeof useTranslations<"dash_google_business_identiteit_components_identiteit_checklist">
>;

// Helper: array niet-leeg + niet-null.
function arrFilled(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0;
}
// Helper: string niet-null + na trim niet-leeg.
function strFilled(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

export function buildBasicsChecklist(
  r: Restaurant,
  mediaCount: number,
  t: ChecklistT,
): ProgressChecklistItem[] {
  return [
    { id: "name", label: t("basics.name"), done: strFilled(r.name) },
    { id: "tagline", label: t("basics.tagline"), done: strFilled(r.tagline) },
    {
      id: "description",
      label: t("basics.description"),
      done: strFilled(r.description),
    },
    {
      id: "cuisine",
      label: t("basics.cuisine"),
      done: arrFilled(r.cuisine_style),
    },
    {
      id: "target_audience",
      label: t("basics.targetAudience"),
      done: strFilled(r.target_audience),
    },
    {
      id: "segments",
      label: t("basics.segments"),
      done: arrFilled(r.target_audience_segments),
    },
    {
      id: "location",
      label: t("basics.location"),
      done: strFilled(r.location_description),
    },
    {
      id: "media",
      label: t("basics.media"),
      done: mediaCount > 0,
    },
    { id: "logo", label: t("basics.logo"), done: strFilled(r.logo_url) },
    {
      id: "brand_color",
      label: t("basics.brandColor"),
      done: strFilled(r.brand_colors?.primary),
    },
  ];
}

export function buildToonChecklist(
  r: Restaurant,
  t: ChecklistT,
): ProgressChecklistItem[] {
  return [
    {
      id: "atmosphere",
      label: t("toon.atmosphere"),
      done: strFilled(r.atmosphere),
    },
    {
      id: "tone",
      label: t("toon.tone"),
      done: strFilled(r.tone_of_voice),
    },
    {
      id: "story",
      label: t("toon.story"),
      done: strFilled(r.brand_story),
    },
    {
      id: "do_not",
      label: t("toon.doNot"),
      done: strFilled(r.do_not_mention),
    },
    {
      id: "usp",
      label: t("toon.usp"),
      done: strFilled(r.unique_selling_points),
    },
    {
      id: "signatures",
      label: t("toon.signatures"),
      done: arrFilled(r.signature_dishes),
    },
    {
      id: "awards",
      label: t("toon.awards"),
      done: arrFilled(r.awards),
    },
    {
      id: "events",
      label: t("toon.events"),
      done: strFilled(r.special_events),
    },
  ];
}

export function buildSeoChecklist(
  r: Restaurant,
  t: ChecklistT,
): ProgressChecklistItem[] {
  return [
    {
      id: "keywords",
      label: t("seo.keywords"),
      done: arrFilled(r.keywords),
    },
    {
      id: "hashtags",
      label: t("seo.hashtags"),
      done: arrFilled(r.default_hashtags),
    },
  ];
}

// Thin re-export zodat de identiteit-page één import-regel heeft
// voor de UI + de items-builders.
export { ProgressChecklist as IdentiteitChecklist };
