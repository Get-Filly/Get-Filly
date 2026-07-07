import { useEffect } from "react";

/**
 * Waarschuwt de gebruiker bij het verlaten van de pagina (sluiten, verversen,
 * externe navigatie) zolang er onopgeslagen wijzigingen zijn. De browser toont
 * z'n eigen "weet je het zeker?"-dialoog; de exacte tekst is niet aanpasbaar.
 *
 * Alleen actief wanneer `dirty` true is, zodat we niet onnodig een listener
 * aanhangen. Werkt voor harde navigatie (beforeunload). In-app Next-navigatie
 * valt hier bewust buiten (vereist router-events); dit dekt het meest
 * voorkomende geval: per ongeluk wegklikken/verversen met open wijzigingen.
 */
export function useUnsavedChangesWarning(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Legacy-vereiste: een niet-lege returnValue triggert de dialoog.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}
