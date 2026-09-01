import {
  CHANNEL_RULES,
  mapCampaignTypeToChannel,
  type FillyChannel,
} from '../ai/filly-brain.config';

// ============================================================
// Prompt-builders voor de Filly-beeldtool
// ============================================================
//
// Eén plek waar we de "fotograaf-instructie" formuleren: het model moet
// een echte, geloofwaardige foto opleveren (geen illustratie/render),
// realistisch belicht, met natuurlijke kleuren. De kanaal-verhouding
// hangen we er als tekst-hint aan; exacte crop op aspect-ratio doen we
// later deterministisch (sharp) als vervolgstap.
//
// Waarom hier centraal: zo blijft de toon/kwaliteit-lijn consistent over
// alle drie de standen (verbeteren, aanpassen, genereren) en kunnen we 'm
// op één plek bijstellen.
// ============================================================

// Basis-kwaliteitslijn die onder elke stand hangt. Kort en sturend.
const PHOTO_QUALITY_BASE =
  'Lever een realistische, professioneel ogende foto zoals een ' +
  'ervaren fotograaf die zou afleveren: natuurlijke belichting, correcte ' +
  'witbalans, goed contrast, scherp onderwerp en nette compositie. ' +
  'Geen tekst, logo of watermerk in het beeld tenzij expliciet gevraagd. ' +
  'Geen illustratie- of render-look, het moet een echte foto lijken.';

// Zet een aspect-ratio-string ("9:16") om naar een leesbare hint.
function aspectRatioHint(ratio: string): string {
  switch (ratio) {
    case '9:16':
      return 'staand formaat, verhouding 9:16 (fullscreen mobiel)';
    case '4:5':
      return 'staand formaat, verhouding 4:5';
    case '1:1':
      return 'vierkant formaat, verhouding 1:1';
    case '4:3':
      return 'liggend formaat, verhouding 4:3';
    case '16:9':
      return 'liggend formaat, verhouding 16:9';
    case '1.91:1':
      return 'breed liggend formaat, verhouding 1.91:1';
    default:
      return `verhouding ${ratio}`;
  }
}

// Bepaal het kanaal + de gewenste aspect-ratio voor een campagne-type.
// We pakken de eerste toegestane ratio van het kanaal als richtlijn.
export function channelVisualForCampaign(
  type: 'mail' | 'social' | 'whatsapp',
  socialPlatform?: string | null,
): { channel: FillyChannel; aspectRatio: string; label: string } {
  const channel = mapCampaignTypeToChannel(type, socialPlatform);
  const rules = CHANNEL_RULES[channel];
  const aspectRatio = rules.visual.aspectRatios[0] ?? '1:1';
  return { channel, aspectRatio, label: rules.label };
}

// ----- Stand 1: verbeteren (fotografen-polish, inhoud ongewijzigd) -----
export function buildEnhancePrompt(ctx: {
  aspectRatio: string;
  channelLabel: string;
  campaignContext?: string;
}): string {
  return (
    'Verbeter deze foto zoals een fotograaf zijn eigen opname zou nabewerken. ' +
    'Optimaliseer belichting, contrast, kleur, witbalans en scherpte, en ' +
    'verwijder ruis. Houd het ONDERWERP en de compositie exact hetzelfde: ' +
    'voeg niets toe en verander de inhoud niet, maak de foto alleen mooier en ' +
    'aantrekkelijker. ' +
    (ctx.campaignContext
      ? `Context van de campagne: ${ctx.campaignContext}. `
      : '') +
    `Doel-kanaal: ${ctx.channelLabel}, ${aspectRatioHint(ctx.aspectRatio)}. ` +
    PHOTO_QUALITY_BASE
  );
}

// ----- Stand 2: aanpassen met instructie (inhoud mag veranderen) -----
export function buildEditPrompt(ctx: {
  instruction: string;
  aspectRatio: string;
  channelLabel: string;
  campaignContext?: string;
}): string {
  return (
    `Pas deze foto aan volgens de opdracht: "${ctx.instruction}". ` +
    'Behoud de bestaande scène en sfeer waar dat kan, en voer de gevraagde ' +
    'wijziging geloofwaardig en realistisch uit. ' +
    (ctx.campaignContext
      ? `Context van de campagne: ${ctx.campaignContext}. `
      : '') +
    `Doel-kanaal: ${ctx.channelLabel}, ${aspectRatioHint(ctx.aspectRatio)}. ` +
    PHOTO_QUALITY_BASE
  );
}

// ----- Stand 3: genereren vanaf tekst (geen invoerfoto) -----
export function buildGeneratePrompt(ctx: {
  prompt: string;
  aspectRatio: string;
  channelLabel: string;
  campaignContext?: string;
}): string {
  return (
    `Maak een foto: ${ctx.prompt}. ` +
    (ctx.campaignContext
      ? `Context van de campagne: ${ctx.campaignContext}. `
      : '') +
    `Doel-kanaal: ${ctx.channelLabel}, ${aspectRatioHint(ctx.aspectRatio)}. ` +
    PHOTO_QUALITY_BASE
  );
}

// ----- Fan-out: dezelfde foto herkaderen naar een ander kanaal-formaat -----
// Gebruikt bij "plaats op alle kanalen": de gekozen master-foto wordt per
// kanaal in de juiste aspect-ratio gezet. Kern: INHOUD identiek houden,
// alleen het kader veranderen. Bij een krapper formaat bijsnijden; bij een
// ruimer formaat de bestaande scène natuurlijk doortekenen (outpaint) —
// TENZIJ het kanaal representatief moet blijven (Google Bedrijfsprofiel),
// dan alleen bijsnijden en geen nieuwe inhoud verzinnen.
export function buildReformatPrompt(ctx: {
  aspectRatio: string;
  channelLabel: string;
  gbp?: boolean;
}): string {
  const framing = ctx.gbp
    ? 'Verander de inhoud NIET en voeg niets toe: snijd alleen bij (of voeg ' +
      'neutrale marge toe) zodat de foto representatief blijft voor de zaak. '
    : 'Houd het onderwerp en de inhoud identiek. Snijd bij waar het formaat ' +
      'krapper is; waar het ruimer is, teken de bestaande scène natuurlijk ' +
      'door zodat het beeld het kader vult. Verzin geen nieuwe onderwerpen. ';
  return (
    `Herkader deze bestaande foto naar ${aspectRatioHint(ctx.aspectRatio)} ` +
    `voor ${ctx.channelLabel}. ` +
    framing +
    PHOTO_QUALITY_BASE
  );
}
