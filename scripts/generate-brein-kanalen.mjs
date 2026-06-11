#!/usr/bin/env node
/**
 * ============================================================
 * Genereert docs/social-posting-brein-kanalen.md uit
 * filly-brain.config.ts
 * ============================================================
 *
 * Waarom: het social-posting-brein-document
 * (docs/social-posting-brein.docx, voorheen "Timing Brein" /
 * Posting-Tijden v1.1) mist de berichtlengtes per kanaal; die leven
 * als bron-van-waarheid in apps/api/src/ai/filly-brain.config.ts
 * (CHANNEL_RULES). Dit script genereert daar een leesbaar hoofdstuk
 * uit, zodat document en code gegarandeerd gelijk blijven: code
 * wijzigen → script draaien → hoofdstuk is bij. Nooit andersom.
 *
 * Gebruik:  pnpm brein:doc
 * Output:   docs/social-posting-brein-kanalen.md (overschrijft)
 */

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = join(repoRoot, 'apps', 'api');

// 1. Compileer de config (TS → CJS) naar een tijdelijke map. We
//    gebruiken de tsc van de api-workspace zodat de TS-versie matcht.
const outDir = mkdtempSync(join(tmpdir(), 'filly-brein-'));
execFileSync(
  join(apiDir, 'node_modules', '.bin', 'tsc'),
  [
    'src/ai/filly-brain.config.ts',
    '--outDir', outDir,
    '--module', 'commonjs',
    '--target', 'es2020',
    '--skipLibCheck',
  ],
  { cwd: apiDir, stdio: 'inherit' },
);

const config = require(join(outDir, 'filly-brain.config.js'));
const { CHANNEL_RULES, CHANNEL_RULES_VERSION } = config;

// 2. Bouw het markdown-hoofdstuk.
const dayNames = ['', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
const today = new Date().toISOString().slice(0, 10);

const lines = [];
lines.push(`# Social-posting-brein — Lengte & vorm per kanaal`);
lines.push('');
lines.push(`> **Gegenereerd bestand — niet handmatig bewerken.**`);
lines.push(`> Bron: \`apps/api/src/ai/filly-brain.config.ts\` (CHANNEL_RULES ${CHANNEL_RULES_VERSION}).`);
lines.push(`> Bijwerken: pas de config aan en draai \`pnpm brein:doc\`. Gegenereerd op ${today}.`);
lines.push('');
lines.push(`Dit hoofdstuk vult het social-posting-brein-document`);
lines.push(`(\`docs/social-posting-brein.docx\`, de timing-laag) aan met de lengte-,`);
lines.push(`hashtag-, toon- en CTA-regels per kanaal die Filly bij élke`);
lines.push(`tekst-generatie afgedwongen krijgt (prompt-injectie + lengte-guard in code).`);
lines.push('');

// Overzichtstabel met de lengte-bandbreedtes.
lines.push(`## Overzicht lengte-bandbreedtes`);
lines.push('');
lines.push(`| Kanaal | Body (tekens) | Body (woorden) | Subject | Hashtags | Max/week |`);
lines.push(`|---|---|---|---|---|---|`);
for (const rules of Object.values(CHANNEL_RULES)) {
  const c = rules.copyLength;
  const words = c.minWords && c.maxWords ? `${c.minWords}–${c.maxWords}` : '—';
  const subject = c.subject ? `${c.subject.minChars}–${c.subject.maxChars} tekens` : '—';
  const hashtags = rules.hashtags.countMax === 0 ? 'geen' : `${rules.hashtags.countMin}–${rules.hashtags.countMax}`;
  lines.push(
    `| ${rules.label} | ${c.minChars}–${c.maxChars} | ${words} | ${subject} | ${hashtags} | ${rules.frequency.maxPerWeek} |`,
  );
}
lines.push('');

// Per kanaal een volledige sectie.
for (const rules of Object.values(CHANNEL_RULES)) {
  const c = rules.copyLength;
  lines.push(`## ${rules.label}`);
  lines.push('');
  lines.push(`*${rules.role}*`);
  lines.push('');
  lines.push(`**Lengte**`);
  if (c.subject) lines.push(`- Subject: ${c.subject.minChars}–${c.subject.maxChars} tekens`);
  if (c.preheader) lines.push(`- Preheader: ${c.preheader.minChars}–${c.preheader.maxChars} tekens`);
  if (c.minWords && c.maxWords) {
    lines.push(`- Body: ${c.minWords}–${c.maxWords} woorden (${c.minChars}–${c.maxChars} tekens)`);
  } else {
    lines.push(`- Body: ${c.minChars}–${c.maxChars} tekens`);
  }
  if (rules.visual.videoLengthSeconds) {
    const v = rules.visual.videoLengthSeconds;
    lines.push(`- Video: ${v.min}–${v.max} sec (sweet-spot ${v.sweetSpot}s)`);
  }
  lines.push('');
  lines.push(`**Hashtags**`);
  if (rules.hashtags.countMax === 0) {
    lines.push(`- Geen hashtags op dit kanaal.`);
  } else {
    lines.push(`- ${rules.hashtags.countMin}–${rules.hashtags.countMax} stuks, plaatsing: ${rules.hashtags.placement.replace(/_/g, ' ')}`);
    if (rules.hashtags.mix) lines.push(`- ${rules.hashtags.mix}`);
  }
  lines.push('');
  lines.push(`**Timing**`);
  lines.push(`- Beste dagen: ${rules.bestTimes.bestDays.map((d) => dayNames[d]).join(', ')}`);
  lines.push(`- Beste tijden: ${rules.bestTimes.bestHours.join(' en ')}`);
  if (rules.bestTimes.note) lines.push(`- ${rules.bestTimes.note}`);
  lines.push(`- Lead-time: minimaal ${rules.leadTime.minHours}u, optimaal ${rules.leadTime.optimalRangeHours[0]}–${rules.leadTime.optimalRangeHours[1]}u vóór de doel-datum. ${rules.leadTime.rationale}`);
  lines.push(`- Frequentie-plafond: ${rules.frequency.maxPerWeek}×/week, ${rules.frequency.maxPerMonth}×/maand`);
  lines.push('');
  lines.push(`**Toon:** ${rules.toneModulation}`);
  lines.push('');
  lines.push(`**CTA:** ${rules.ctaStyle}`);
  lines.push('');
  lines.push(`**Specifiek**`);
  for (const s of rules.specifics) lines.push(`- ${s}`);
  if (rules.visual.required) {
    lines.push(`- Visual verplicht (${rules.visual.aspectRatios.join(' / ')})${rules.visual.altTextRequired ? ', alt-tekst verplicht' : ''}.`);
  }
  lines.push('');
}

const target = join(repoRoot, 'docs', 'social-posting-brein-kanalen.md');
writeFileSync(target, lines.join('\n'), 'utf8');
rmSync(outDir, { recursive: true, force: true });
console.log(`✓ ${target} gegenereerd (CHANNEL_RULES ${CHANNEL_RULES_VERSION}, ${Object.keys(CHANNEL_RULES).length} kanalen).`);
