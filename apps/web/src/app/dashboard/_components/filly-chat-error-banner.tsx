"use client";

// FillyChatErrorBanner, rode banner boven het input-veld voor
// transient fouten (verzending mislukt, rate-limit bereikt, etc).
// Geen close-knop: het bericht verdwijnt zodra de eigenaar opnieuw
// een bericht stuurt, orchestrator zet error op null bij sendMsg-
// start. Bewust geen empty-state hier (return null bij ontbrekende
// message): de orchestrator beslist of het component überhaupt
// gerenderd wordt.
export function FillyChatErrorBanner({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: "8px 12px",
        margin: "0 12px 8px",
        background: "var(--red-soft, #fee)",
        color: "var(--red, #b00)",
        borderRadius: 6,
        fontSize: 12,
      }}
    >
      {message}
    </div>
  );
}
