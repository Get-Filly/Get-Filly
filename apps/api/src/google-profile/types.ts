/**
 * ============================================================
 * Types voor de Google Places API (New) responses
 * ============================================================
 *
 * Wat hier staat is een SUBSET van de officiële Places-API-response.
 * We typen alleen wat we daadwerkelijk gebruiken, niet de volledige
 * 100+ velden uit de Google-spec. Bij uitbreiding voeg je toe wat
 * je nieuwe feature nodig heeft.
 *
 * Officiële docs:
 *   https://developers.google.com/maps/documentation/places/web-service/data-fields
 *
 * Field-mask conventie:
 *   Bij elke API-call MOET je een `X-Goog-FieldMask`-header meesturen.
 *   Daarmee zeg je "geef me alleen deze velden". Dat heeft TWEE doelen:
 *     1. Kosten-optimalisatie, Google rekent per veld-categorie
 *        (Basic, Pro, Enterprise). Smaller mask = goedkoper.
 *     2. Response-grootte, minder velden = sneller, minder bandbreedte.
 *   We kiezen overal voor een minimaal-praktische mask.
 * ============================================================
 */

// ---------- Search-response (text-search voor onboarding-detect) ----------

// Wat we nodig hebben voor de "Is dit jouw zaak?"-modal: genoeg om
// de gebruiker een match te laten herkennen. Rating + review-count
// helpen om het juiste filiaal te kiezen bij ketens.
export interface PlaceSearchResult {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  rating: number | null;
  userRatingCount: number | null;
}

// Field-mask die we sturen voor text-search. Houden we beperkt tot
// de Basic-tier velden (de goedkoopste prijs-categorie).
export const SEARCH_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.rating',
  'places.userRatingCount',
].join(',');

// ---------- Place-details-response (volledig profiel) ----------

// Het volledige profile-object dat we cachen in
// `restaurants.google_place_data`. Bij uitbreiding van de hub-features
// voegen we hier velden toe (bv. `editorialSummary`, `attributes`,
// `accessibilityOptions` etc.), let op: elke uitbreiding moet ook
// in DETAILS_FIELD_MASK hieronder.
export interface PlaceDetails {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  // Postal-address is gestructureerd (straat / huisnr / stad / postcode
  // / land), handiger dan formattedAddress voor regio-vergelijking.
  postalAddress: {
    streetAddress: string | null;
    locality: string | null;
    postalCode: string | null;
    administrativeArea: string | null;
    country: string | null;
  } | null;
  location: {
    latitude: number;
    longitude: number;
  } | null;
  rating: number | null;
  userRatingCount: number | null;
  // Pas-types op de plek (bv. ['restaurant', 'food']). Eerste = primair.
  types: string[];
  primaryType: string | null;
  // Prijsindicatie: PRICE_LEVEL_FREE..PRICE_LEVEL_VERY_EXPENSIVE.
  priceLevel: string | null;
  websiteUri: string | null;
  internationalPhoneNumber: string | null;
  // Openingstijden, Google levert ze als gestructureerde array per
  // weekdag. We bewaren de raw `weekdayDescriptions` (al opgemaakte
  // strings in lokale taal) en `periods` (machine-leesbaar).
  regularOpeningHours: {
    weekdayDescriptions: string[];
    openNow: boolean | null;
  } | null;
  // Foto-references: NIET de foto's zelf, maar een handle waarmee je
  // ze later kunt downloaden via de Photos-endpoint. We slaan ze op
  // zodat we lazy kunnen laden in de UI.
  photos: Array<{
    name: string;
    widthPx: number;
    heightPx: number;
  }>;
  // Bedrijfsstatus, OPERATIONAL / CLOSED_TEMPORARILY / CLOSED_PERMANENTLY.
  // Belangrijk voor de profiel-audit ("je profiel staat als 'tijdelijk
  // gesloten', wist je dat?").
  businessStatus: string | null;
  // Korte editorial summary van Google (maar paar regels). Niet altijd
  // aanwezig, vooral bij grotere/bekende plekken.
  editorialSummary: string | null;
}

// Field-mask voor place-details. Pro-tier (rating, photos, openingHours
// vallen daaronder). Iedereen onder dit mask telt als één call á $0,02.
export const DETAILS_FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'postalAddress',
  'location',
  'rating',
  'userRatingCount',
  'types',
  'primaryType',
  'priceLevel',
  'websiteUri',
  'internationalPhoneNumber',
  'regularOpeningHours',
  'photos',
  'businessStatus',
  'editorialSummary',
].join(',');

// ---------- Nearby-search (concurrent-benchmark) ----------

// Voor de buurt-vergelijking willen we per concurrent: rating, count,
// foto-volume. Geen openingstijden of beschrijving, we tonen alleen
// de hoofdstatistieken in een tabel.
export interface NearbyPlace {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  rating: number | null;
  userRatingCount: number | null;
  primaryType: string | null;
  // Distance in meter, niet door Google geleverd, berekenen wij zelf
  // op basis van lat/lng en het centrum-punt van de zoekopdracht.
  distanceMeters: number | null;
  photoCount: number;
}

export const NEARBY_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.rating',
  'places.userRatingCount',
  'places.primaryType',
  'places.location',
  'places.photos',
].join(',');

// ---------- Cache-helpers ----------

// TTL van 24 uur voor place-details. Google's data verandert weinig
// (openingstijden, rating-creep over weken). Een dagelijkse refresh
// is ruim voldoende. Bij een handmatige refresh-knop voor de eigenaar
// kunnen we deze TTL omzeilen.
export const PLACE_DATA_TTL_MS = 24 * 60 * 60 * 1000;
