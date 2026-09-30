/**
 * Horeca-taal voor Filly's prompts.
 *
 * Get-Filly is horeca-only (besluit 2026-09-29). Deze drie teksten stonden
 * eerder in de horeca-pack van het branche-systeem en zijn hier
 * letterlijk overgenomen: de prompts blijven byte-identiek.
 */
export const HORECA_PACK = {
  // `Je bent Filly, ${systemFraming}.`
  systemFraming: 'een AI-assistent voor de horeca',
  // `Dit is een commerciële kans voor ${sectorLabel}.`
  sectorLabel: 'de horeca',
  // Melding wanneer het menu nog te leeg is voor voorstellen.
  menuGuardMessage:
    'Vul eerst je menukaart in (minimaal 3 gerechten) zodat Filly concrete voorstellen kan doen.',
} as const;
