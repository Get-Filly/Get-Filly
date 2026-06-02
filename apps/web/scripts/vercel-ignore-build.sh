#!/usr/bin/env bash
# =============================================================================
# Vercel "Ignored Build Step" voor het get-filly-web project
# =============================================================================
# Doel: alleen een web-deploy starten als er sinds de LAATSTE GESLAAGDE deploy
# iets is veranderd dat de web-build raakt.
#
# Waarom dit bestaat: Vercel's ingebouwde "Skip unaffected projects" keek alleen
# naar de làátste commit van een push. Bij een push waarvan de laatste commit
# alleen docs/api raakte (bv. een docs(backlog)-commit als sluitstuk), sloeg
# Vercel de web-build ten onrechte over — terwijl een eerdere commit in
# dezelfde push wél apps/web wijzigde. Gevolg: productie bleef op oude code
# staan (zie 2026-06-02, de invite-only-wijziging die niet live kwam).
#
# Exit-codes (Vercel-conventie, let op de omgekeerde logica):
#   exit 0   → BUILD OVERSLAAN  (er is niets relevants veranderd)
#   exit !=0 → WEL BOUWEN
# We "falen naar bouwen": elke twijfel of fout → wél bouwen. Liever een
# overbodige build dan opnieuw stilletjes verouderde productie.
#
# Beschikbare variabelen (Vercel system env vars):
#   VERCEL_GIT_PREVIOUS_SHA = SHA van de laatste geslaagde deploy van dit
#       project + deze branch. Alléén gevuld als er een Ignored Build Step is
#       (= dit script). Leeg bij de allereerste deploy.
#   VERCEL_GIT_COMMIT_SHA   = de commit die nu gedeployed wordt.
# =============================================================================
set -euo pipefail

# Geen vorige deploy bekend (eerste keer met dit script, of de vorige deploy
# valt buiten Vercel's shallow clone van 10 commits) → veilig bouwen.
if [ -z "${VERCEL_GIT_PREVIOUS_SHA:-}" ]; then
  echo "Geen vorige deploy-SHA bekend → bouwen."
  exit 1
fi

# Dit script draait vanuit de Root Directory (apps/web); voor git-paden ankeren
# we aan de repo-root zodat de pathspecs kloppen.
cd "$(git rev-parse --show-toplevel)"

# Paden die de web-build kunnen beïnvloeden:
#   apps/web        → de app zelf
#   packages/shared → de @getfilly/shared workspace-package waar web van afhangt
#   pnpm-lock.yaml  → dependency-wijzigingen (bewust breed: liever te vaak bouwen)
#   package.json    → root-manifest (scripts/packageManager)
# Komt er later nóg een shared package bij waar web van afhangt, voeg die hier toe.
PATHS=(apps/web packages/shared pnpm-lock.yaml package.json)

# git diff --quiet: exit 0 = GEEN verschil in die paden → overslaan.
#                   exit !=0 = WEL verschil (of git faalt, bv. SHA buiten de
#                   shallow clone) → bouwen.
if git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" "$VERCEL_GIT_COMMIT_SHA" -- "${PATHS[@]}"; then
  echo "Geen web-relevante wijziging sinds vorige deploy → build overslaan."
  exit 0
else
  echo "Web-relevante wijziging gevonden → bouwen."
  exit 1
fi
