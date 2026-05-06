// ============================================================
// Get Filly — Supabase email-template bronnen
// ============================================================
// Eén plek waar de HTML-bodies + subjects van alle Filly-auth-mails
// leven. Geen CSS-framework, alleen inline styles — email-clients
// (Gmail, Outlook, etc.) houden niet van <style>-tags.
//
// Huisstijl-kleuren:
//   papier-warm  = #FAF7F1 (achtergrond)
//   British Racing Green = #1F4A2D (knop, accent)
//   tekst        = #1A1A1A
//   subtiel     = #6B6B6B
//
// Belangrijk: {{ .SiteURL }}, {{ .TokenHash }}, {{ .RedirectTo }}
// zijn Supabase-template-variabelen — NIET vervangen bij generatie,
// Supabase doet dat per-mail. Alleen zinvol in context van een
// Supabase auth-email.
//
// Waarom onze eigen /auth/confirm-route in elke link:
//   @supabase/ssr werkt met cookies, niet met hash-tokens. Zonder
//   deze route blijft de sessie leeg en faalt elke vervolgpagina.
//   Eén route handelt invite, magic-link, recovery én signup af.
// ============================================================

// Kleine helper: wraps body-HTML in een gedeelde outer-shell
// (background, container, Filly-footer). Scheelt duplicatie.
function wrap(contentHtml) {
  return `<!doctype html>
<html lang="nl">
  <body style="margin:0;padding:0;background:#FAF7F1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,Arial,sans-serif;color:#1A1A1A;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#FAF7F1;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="520" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
            <tr>
              <td>
                <div style="font-size:14px;font-weight:600;color:#1F4A2D;letter-spacing:0.02em;margin-bottom:24px;">Get-Filly</div>
                ${contentHtml}
                <hr style="border:0;border-top:1px solid #eee;margin:32px 0 16px;" />
                <div style="font-size:12px;color:#6B6B6B;line-height:1.5;">
                  Heb je hier geen actie ondernomen? Dan kun je deze mail negeren —
                  er gebeurt verder niets.
                </div>
              </td>
            </tr>
          </table>
          <div style="font-size:11px;color:#6B6B6B;margin-top:16px;">
            Get-Filly · AI-marketingassistent voor horeca
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// Knop met onze brand-kleuren. Inline styling want email-clients.
function button(href, label) {
  return `<a href="${href}" style="display:inline-block;background:#1F4A2D;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:500;font-size:14px;">${label}</a>`;
}

// ============================================================
// Templates
// ============================================================
//
// Elk template heeft:
//   subject — regel die in de mailbox komt
//   content — HTML-body (inline styled)
//   note    — korte uitleg wat deze mail triggert (voor docs)
//   next    — hoe de "next"-parameter in de link is gezet
//
// mailer_subjects_* en mailer_templates_*_content zijn de exacte
// Supabase-velden voor de Management API.
// ============================================================

export const templates = {
  // --------------------------------------------------------
  // 1. INVITE — team-uitnodiging vanuit de eigenaar
  // --------------------------------------------------------
  // RedirectTo komt vanuit onze backend (team.service.ts) en wijst
  // naar /invite/accept?inv=<ourToken>. We geven 'm dus dynamisch
  // mee via {{ .RedirectTo }}.
  invite: {
    subject: 'Uitnodiging voor Get-Filly',
    content: wrap(`
      <h1 style="font-size:22px;margin:0 0 16px;font-weight:600;color:#1A1A1A;">Je bent uitgenodigd</h1>
      <p style="font-size:15px;line-height:1.55;color:#1A1A1A;margin:0 0 24px;">
        Iemand heeft je uitgenodigd om mee te werken op Get-Filly, een
        AI-marketingassistent voor horecazaken. Klik op de knop om je
        account te activeren en in te loggen.
      </p>
      ${button('{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next={{ .RedirectTo }}', 'Uitnodiging accepteren')}
      <p style="font-size:12px;color:#6B6B6B;margin:24px 0 0;line-height:1.5;">
        Werkt de knop niet? Kopieer deze link in je browser:<br>
        <span style="word-break:break-all;color:#6B6B6B;">{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next={{ .RedirectTo }}</span>
      </p>
    `),
  },

  // --------------------------------------------------------
  // 2. MAGIC LINK — passwordloos inloggen / her-activeren
  // --------------------------------------------------------
  magic_link: {
    subject: 'Je login-link voor Get-Filly',
    content: wrap(`
      <h1 style="font-size:22px;margin:0 0 16px;font-weight:600;color:#1A1A1A;">Log in op Get-Filly</h1>
      <p style="font-size:15px;line-height:1.55;color:#1A1A1A;margin:0 0 24px;">
        Klik op de knop hieronder om meteen in te loggen. De link is
        éénmalig te gebruiken en verloopt na een uur.
      </p>
      ${button('{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next={{ .RedirectTo }}', 'Inloggen')}
      <p style="font-size:12px;color:#6B6B6B;margin:24px 0 0;line-height:1.5;">
        Werkt de knop niet? Kopieer deze link in je browser:<br>
        <span style="word-break:break-all;color:#6B6B6B;">{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next={{ .RedirectTo }}</span>
      </p>
    `),
  },

  // --------------------------------------------------------
  // 3. RECOVERY — wachtwoord resetten
  // --------------------------------------------------------
  // Hier forceren we next=/reset-password, ongeacht wat de frontend
  // doorgeeft. Dat voorkomt dat een foutieve redirect-param de flow
  // breekt of gebruikt wordt voor open-redirect-poging.
  recovery: {
    subject: 'Reset je Get-Filly-wachtwoord',
    content: wrap(`
      <h1 style="font-size:22px;margin:0 0 16px;font-weight:600;color:#1A1A1A;">Wachtwoord resetten</h1>
      <p style="font-size:15px;line-height:1.55;color:#1A1A1A;margin:0 0 24px;">
        Je hebt aangevraagd om je wachtwoord opnieuw in te stellen.
        Klik op de knop om een nieuw wachtwoord te kiezen. De link
        is éénmalig te gebruiken en verloopt na een uur.
      </p>
      ${button('{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password', 'Wachtwoord resetten')}
      <p style="font-size:12px;color:#6B6B6B;margin:24px 0 0;line-height:1.5;">
        Werkt de knop niet? Kopieer deze link in je browser:<br>
        <span style="word-break:break-all;color:#6B6B6B;">{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password</span>
      </p>
    `),
  },

  // --------------------------------------------------------
  // 4. CONFIRMATION — bevestig e-mailadres na signup
  // --------------------------------------------------------
  // Voor nu `next=/dashboard`. Straks, als onboarding-wizard staat,
  // verplaatst dit naar `next=/onboarding` (zodat de user na
  // email-verify eerst zijn restaurant aanmaakt).
  confirmation: {
    subject: 'Bevestig je Get-Filly-account',
    content: wrap(`
      <h1 style="font-size:22px;margin:0 0 16px;font-weight:600;color:#1A1A1A;">Welkom bij Get-Filly</h1>
      <p style="font-size:15px;line-height:1.55;color:#1A1A1A;margin:0 0 24px;">
        Bedankt voor je aanmelding. Bevestig je e-mailadres zodat we
        zeker weten dat jij het bent — daarna kan je direct aan de slag.
      </p>
      ${button('{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/dashboard', 'E-mail bevestigen')}
      <p style="font-size:12px;color:#6B6B6B;margin:24px 0 0;line-height:1.5;">
        Werkt de knop niet? Kopieer deze link in je browser:<br>
        <span style="word-break:break-all;color:#6B6B6B;">{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/dashboard</span>
      </p>
    `),
  },
};
