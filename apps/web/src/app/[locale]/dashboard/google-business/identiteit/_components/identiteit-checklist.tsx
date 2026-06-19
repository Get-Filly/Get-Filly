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

import type { Restaurant } from "@/lib/api";
import {
  ProgressChecklist,
  type ProgressChecklistItem,
} from "../../../_components/progress-checklist";

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
): ProgressChecklistItem[] {
  return [
    { id: "name", label: "Restaurant-naam", done: strFilled(r.name) },
    { id: "tagline", label: "Tagline", done: strFilled(r.tagline) },
    {
      id: "description",
      label: "Volledige beschrijving",
      done: strFilled(r.description),
    },
    {
      id: "cuisine",
      label: "Keuken-stijl",
      done: arrFilled(r.cuisine_style),
    },
    {
      id: "target_audience",
      label: "Hoofd-doelgroep",
      done: strFilled(r.target_audience),
    },
    {
      id: "segments",
      label: "Doelgroep-segmenten",
      done: arrFilled(r.target_audience_segments),
    },
    {
      id: "location",
      label: "Locatie-omschrijving",
      done: strFilled(r.location_description),
    },
    {
      id: "media",
      label: "Foto's in bibliotheek",
      done: mediaCount > 0,
    },
    { id: "logo", label: "Logo", done: strFilled(r.logo_url) },
    {
      id: "brand_color",
      label: "Hoofdkleur",
      done: strFilled(r.brand_colors?.primary),
    },
  ];
}

export function buildToonChecklist(r: Restaurant): ProgressChecklistItem[] {
  return [
    {
      id: "atmosphere",
      label: "Sfeer & interieur",
      done: strFilled(r.atmosphere),
    },
    {
      id: "tone",
      label: "Tone-of-voice",
      done: strFilled(r.tone_of_voice),
    },
    {
      id: "story",
      label: "Brand-story",
      done: strFilled(r.brand_story),
    },
    {
      id: "do_not",
      label: "Wat doen we niet",
      done: strFilled(r.do_not_mention),
    },
    {
      id: "usp",
      label: "Unique selling points",
      done: strFilled(r.unique_selling_points),
    },
    {
      id: "signatures",
      label: "Signature dishes",
      done: arrFilled(r.signature_dishes),
    },
    {
      id: "awards",
      label: "Awards & certificeringen",
      done: arrFilled(r.awards),
    },
    {
      id: "events",
      label: "Speciale gelegenheden",
      done: strFilled(r.special_events),
    },
  ];
}

export function buildSeoChecklist(r: Restaurant): ProgressChecklistItem[] {
  return [
    {
      id: "keywords",
      label: "SEO-trefwoorden",
      done: arrFilled(r.keywords),
    },
    {
      id: "hashtags",
      label: "Vaste hashtags",
      done: arrFilled(r.default_hashtags),
    },
  ];
}

// Thin re-export zodat de identiteit-page één import-regel heeft
// voor de UI + de items-builders.
export { ProgressChecklist as IdentiteitChecklist };
