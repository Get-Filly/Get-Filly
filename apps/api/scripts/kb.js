#!/usr/bin/env node
// Kennisbank-hulpmiddel. Draai vanuit apps/api na `pnpm build`:
//   node --env-file=.env scripts/kb.js import bestand.csv --source "Naam" [--url ..] [--publisher ..]
//        [--kind studie|rapport|blog|dataset|eigen] [--reliability 1-3] [--commercial ja|nee|onbekend]
//        --mapping mapping.json
//   node --env-file=.env scripts/kb.js analyse
//   node --env-file=.env scripts/kb.js brief instagram,facebook
// Zie docs/werking/kennisbank-aanlevering.md en de ImportMapping in
// src/knowledge/knowledge.types.ts.
const fs = require('fs');
const path = require('path');
const { SupabaseService } = require('../dist/supabase/supabase.service');
const { KnowledgeService } = require('../dist/knowledge/knowledge.service');

function parseCsv(text, delimiter) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i]])));
}

function flag(args, name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const svc = new KnowledgeService(
    new SupabaseService({ get: (k) => process.env[k] }),
  );

  if (cmd === 'import') {
    const file = args[0];
    const name = flag(args, 'source');
    const mappingFile = flag(args, 'mapping');
    if (!file || !name || !mappingFile) {
      throw new Error('Gebruik: import <bestand> --source "Naam" --mapping mapping.json');
    }
    const text = fs.readFileSync(file, 'utf8');
    const ext = path.extname(file).toLowerCase();
    let rows;
    if (ext === '.json') {
      const parsed = JSON.parse(text);
      rows = Array.isArray(parsed) ? parsed : parsed.rows ?? parsed.data;
    } else {
      const delimiter = text.split('\n')[0].includes(';') ? ';' : ext === '.tsv' ? '\t' : ',';
      rows = parseCsv(text, delimiter);
    }
    if (!Array.isArray(rows)) throw new Error('Geen lijst met rijen gevonden in het bestand.');
    const mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
    const sourceId = await svc.createSource({
      name,
      url: flag(args, 'url'),
      publisher: flag(args, 'publisher'),
      kind: flag(args, 'kind'),
      reliability: flag(args, 'reliability') ? Number(flag(args, 'reliability')) : undefined,
      commercialUse: flag(args, 'commercial'),
      retrievedAt: new Date().toISOString().slice(0, 10),
    });
    const importId = await svc.importRaw({
      sourceId, rows, filename: path.basename(file), format: ext.slice(1) || 'csv',
    });
    const res = await svc.normalizeImport(importId, mapping);
    console.log(`Bron ${sourceId}, import ${importId}`);
    console.log(`${rows.length} rijen, ${res.inserted} metingen, ${res.skipped} overgeslagen`, res.reasons);
  } else if (cmd === 'analyse') {
    console.log(await svc.runAnalysis());
  } else if (cmd === 'brief') {
    const channels = (args[0] ?? 'instagram,facebook,tiktok,google_business').split(',');
    console.log((await svc.getBrief(channels)) || '(leeg: nog geen bruikbare inzichten)');
  } else {
    console.log('Commando: import | analyse | brief');
  }
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
