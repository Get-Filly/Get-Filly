-- 0084: afzender-naam en reply-to voor gastenmail zijn niet meer nodig.
alter table public.businesses
  drop column if exists email_from_name,
  drop column if exists email_reply_to;
