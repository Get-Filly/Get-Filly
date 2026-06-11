#!/usr/bin/env bash
# =============================================================================
# Vercel "Ignored Build Step" voor het get-filly-api project
# =============================================================================
# Spiegel van apps/web/scripts/vercel-ignore-build.sh (zie daar voor de
# volledige achtergrond van de 2026-06-02 web-bug). Voor api lost dit twee
# kanten van hetzelfde probleem op:
#   1. Een echte api-wijziging werd overgeslagen als de láátste commit van
#      een push alleen niet-api-bestanden raakte (Vercel's "Skip unaffected
#      projects" keek alleen naar die laatste commit).
#   2. Docs-only pushes (bv. een BACKLOG-commit) triggerden juist een
#      overbodige api-redeploy.
# Dit script diff't over de volledige range sinds de laatste geslaagde
# deploy, dus beide gevallen kloppen voortaan.
#
# Exit-codes (Vercel-conventie, let op de omgekeerde logica):
#   exit 0   → BUILD OVERSLAAN  (er is niets relevants veranderd)
#   exit !=0 → WEL BOUWEN
# We "falen naar bouwen": elke twijfel of fout → wél bouwen. Liever een
# overbodige build dan stilletjes verouderde productie.
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

# Dit script draait vanuit de Root Directory (apps/api); voor git-paden ankeren
# we aan de repo-root zodat de pathspecs kloppen.
cd "$(git rev-parse --show-toplevel)"

# Paden die de api-build kunnen beïnvloeden:
#   apps/api        → de app zelf (incl. vercel.json met crons + api/index.ts)
#   packages/shared → de @getfilly/shared workspace-package waar api van afhangt
#   pnpm-lock.yaml  → dependency-wijzigingen (bewust breed: liever te vaak bouwen)
#   package.json    → root-manifest (scripts/packageManager)
# Komt er later nóg een shared package bij waar api van afhangt, voeg die hier toe.
PATHS=(apps/api packages/shared pnpm-lock.yaml package.json)

# git diff --quiet: exit 0 = GEEN verschil in die paden → overslaan.
#                   exit !=0 = WEL verschil (of git faalt, bv. SHA buiten de
#                   shallow clone) → bouwen.
if git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" "$VERCEL_GIT_COMMIT_SHA" -- "${PATHS[@]}"; then
  echo "Geen api-relevante wijziging sinds vorige deploy → build overslaan."
  exit 0
else
  echo "Api-relevante wijziging gevonden → bouwen."
  exit 1
fi
