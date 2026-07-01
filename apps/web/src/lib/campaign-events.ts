// Losgekoppeld signaal tussen de Filly-chat/geleide flow en het campagne-bord.
// Beide staan op /campagnes, maar in aparte component-bomen. Wanneer de chat
// concept-campagnes aanmaakt (geleide flow of een chat-voorstel), seint 'ie
// dit event; het bord luistert erop en herlaadt automatisch, zodat de nieuwe
// concepten meteen verschijnen zonder handmatige refresh. Fail-safe: is het
// bord niet gemount, dan wordt het event genegeerd (bij de volgende mount
// haalt het sowieso verse data op).
export const CAMPAIGNS_CHANGED_EVENT = "filly:campaigns-changed";

export function notifyCampaignsChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CAMPAIGNS_CHANGED_EVENT));
  }
}
