-- ============================================================
-- 0083: mail- en WhatsApp-campagnes volledig weg
-- ============================================================
-- Get-Filly mailt geen gasten van klanten meer en doet geen WhatsApp.
-- De 38 oude rijen (alleen demodata, niets naar echte gasten verstuurd)
-- gaan weg, samen met de tabellen die er alleen voor bestonden.
--
-- BLIJFT: mail naar onze eigen klanten (afmelden, nieuwsbrieven,
-- updates, rapportages), transactionele mail, unsubscribe_tokens,
-- en de opt-in kolommen op guests.
-- ============================================================

begin;

-- Kinderen (content, ontvangers, verzendlog) gaan mee via on delete cascade.
delete from public.campaigns where type in ('mail', 'whatsapp');

drop table if exists public.campaign_mail_content;
drop table if exists public.campaign_whatsapp_content;
drop table if exists public.campaign_recipients;
drop table if exists public.campaign_sends;

-- Verzenddomein voor gastenmail, alleen daarvoor gebruikt.
alter table public.businesses
  drop column if exists mail_domain,
  drop column if exists mail_from_address,
  drop column if exists mail_domain_status,
  drop column if exists mail_resend_domain_id,
  drop column if exists mail_domain_verified_at;

commit;
