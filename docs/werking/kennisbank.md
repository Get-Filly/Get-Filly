# Kennisbank "wat werkt" (intern)

De klant ziet dit nooit. Het stuurt Filly's keuze van formaat en hoek.

## Stroom
1. **Bron** registreren (`kb_sources`): naam, link, soort, betrouwbaarheid 1 tot 3, mag het commercieel.
2. **Ruwe import** (`kb_raw_imports`): het bestand precies zoals geleverd, elke vorm (csv of json).
3. **Normaliseren** naar metingen (`kb_observations`) met een mapping. Zie `kennisbank-voorbeeld-mapping.json`.
   Rijen die niet bruikbaar zijn worden geteld met reden. Opnieuw normaliseren vervangt de vorige metingen.
4. **Analyse** (`kb_insights`): per kanaal, wat formaat, hoek of dagdeel boven of onder het kanaalgemiddelde scoort.
   Gewogen mediaan (steekproef, betrouwbaarheid, versheid), alleen binnen dezelfde meetwaarde en eenheid.
   Drempels staan in `knowledge-params.ts`.
5. **Kennisblok**: `KnowledgeService.getBrief(kanalen)` levert een paar regels voor de prompt van Filly.
   Geen bronnen, geen aantallen, geen bedrijfsnamen. Zonder data of bij een storing is het leeg en verandert er niets.

## Gebruiken (vanuit apps/api, na `pnpm build`)
```
node --env-file=.env scripts/kb.js import bestand.csv --source "Naam" --kind studie --reliability 3 --commercial ja --mapping mapping.json
node --env-file=.env scripts/kb.js analyse
node --env-file=.env scripts/kb.js brief instagram,facebook
```

## Nog niet gebouwd
- Een plek om de kennisbank in te zien (staat op BACKLOG).
- Automatische eigen data (anoniem, zonder bedrijfsnamen) als bron.
- Foto- en videosuggesties uit de kennisbank.
