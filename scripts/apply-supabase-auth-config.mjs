#!/usr/bin/env node
// ============================================================
// Get Filly — Supabase auth-config applier
// ============================================================
// Zet de 4 email-templates (invite, magic-link, recovery, confirmation)
// + bijbehorende subjects in één keer op Supabase via de Management API.
// Bedoeld om te runnen vanuit de repo-root:
//
//   pnpm supabase:apply-templates
//
// Vereiste env-vars (in apps/api/.env):
//   SUPABASE_ACCESS_TOKEN — Personal Access Token, aan te maken op
//     https://supabase.com/dashboard/account/tokens (begint met sbp_)
//   SUPABASE_PROJECT_REF — projectref, staat in je URL:
//     https://supabase.com/dashboard/project/<ref>
//
// Runnen overschrijft de huidige templates en subjects op Supabase.
// Andere auth-settings blijven ongemoeid — we PATCHen alleen de 8
// relevante velden.
// ============================================================

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { templates } from './supabase-email-templates.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Lees .env uit apps/api/ — we delen de Supabase-secrets met de backend.
// Niet alle projecten hebben dotenv; simpel zelf parsen houdt dit
// script dependency-vrij.
function loadEnv() {
  const envPath = resolve(__dirname, '../apps/api/.env');
  let raw;
  try {
    raw = readFileSync(envPath, 'utf8');
  } catch {
    console.error(`✗ Kon ${envPath} niet lezen. Zorg dat apps/api/.env bestaat.`);
    process.exit(1);
  }
  const env = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const env = loadEnv();
const accessToken = env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = env.SUPABASE_PROJECT_REF || process.env.SUPABASE_PROJECT_REF;

if (!accessToken) {
  console.error(`
✗ SUPABASE_ACCESS_TOKEN ontbreekt in apps/api/.env.

Maak er eenmalig één aan:
  1. Ga naar https://supabase.com/dashboard/account/tokens
  2. Klik "Generate new token", naam bv. "get-filly-dev"
  3. Kopieer (begint met sbp_) en zet in apps/api/.env:
     SUPABASE_ACCESS_TOKEN=sbp_...
`);
  process.exit(1);
}
if (!projectRef) {
  console.error(`
✗ SUPABASE_PROJECT_REF ontbreekt in apps/api/.env.

Vind 'm in je Supabase-URL (of gebruik ttoizamfscichcmzmnsw voor dit project):
  https://supabase.com/dashboard/project/<ref>

Zet in apps/api/.env:
  SUPABASE_PROJECT_REF=ttoizamfscichcmzmnsw
`);
  process.exit(1);
}

// Vertaal onze template-namen naar Supabase's veldnamen. Één plek
// zodat als Supabase zijn naamgeving ooit wijzigt, we 't hier aanpassen.
const body = {
  mailer_subjects_invite: templates.invite.subject,
  mailer_templates_invite_content: templates.invite.content,

  mailer_subjects_magic_link: templates.magic_link.subject,
  mailer_templates_magic_link_content: templates.magic_link.content,

  mailer_subjects_recovery: templates.recovery.subject,
  mailer_templates_recovery_content: templates.recovery.content,

  mailer_subjects_confirmation: templates.confirmation.subject,
  mailer_templates_confirmation_content: templates.confirmation.content,
};

const url = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;

console.log(`→ PATCH ${url}`);
console.log(`  Project: ${projectRef}`);
console.log(`  Updates: ${Object.keys(body).length} velden (4 subjects + 4 bodies)`);

const res = await fetch(url, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

if (!res.ok) {
  const text = await res.text();
  console.error(`\n✗ ${res.status} ${res.statusText}`);
  console.error(text);
  console.error(`
Mogelijke oorzaken:
  - Access token is verlopen of verkeerd (begint met sbp_?)
  - Project ref klopt niet
  - Token heeft onvoldoende permissions (heb je 'm met alle scopes aangemaakt?)
`);
  process.exit(1);
}

console.log(`\n✓ Alle 4 email-templates + subjects op Supabase bijgewerkt.`);
console.log(`  - invite        (${templates.invite.subject})`);
console.log(`  - magic_link    (${templates.magic_link.subject})`);
console.log(`  - recovery      (${templates.recovery.subject})`);
console.log(`  - confirmation  (${templates.confirmation.subject})`);
console.log(`\nControleer visueel in Dashboard → Authentication → Email Templates.`);
