// Status van een campagne-voorstel-kaart in de Filly-chat.
//
// Een Filly-bericht kan max één voorstel-kaart bevatten ('campaign_proposal'
// in message_card). De gebruiker kan daarop klikken (Ja, maak aan / Nee,
// bedankt / Bekijk versies). Per kaart houden we lokaal bij in welke
// fase 'ie zit:
//   - pending     → kaart toont nog de actieknoppen
//   - creating    → roundtrip naar approve-endpoint loopt
//   - created     → campagne is aangemaakt, link naar detailpagina tonen
//   - dismissed   → eigenaar heeft 'Nee, bedankt' gekozen
//   - error       → backend gaf een fout, "Opnieuw proberen"-knop tonen
//
// Bewust een tagged-union: TypeScript dwingt af dat we alleen velden
// gebruiken die in de huidige fase ook bestaan (campaignId alleen bij
// 'created', message alleen bij 'error').
export type ProposalStatus =
  | { state: "pending" }
  | { state: "creating" }
  | { state: "created"; campaignId: string }
  | { state: "dismissed" }
  | { state: "error"; message: string };
