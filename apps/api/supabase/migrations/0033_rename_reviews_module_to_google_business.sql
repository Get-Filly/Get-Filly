-- ============================================================
-- Migratie 0033 — Module-key rename: 'reviews' → 'google_business'
-- ============================================================
--
-- WAT EN WAAROM
-- -------------
-- De sidebar-sectie "Reviews" wordt uitgebreid tot een hub voor het
-- volledige Google Business Profile (reviews + profiel-audit +
-- foto-sync + Q&A + posts). De module-key in @getfilly/shared verandert
-- mee van 'reviews' naar 'google_business'. Bestaande gebruikers met
-- custom permissions hebben nog 'reviews' in hun jsonb-array staan —
-- die migreren we hier zodat ze niet plotseling de pagina kwijt zijn.
--
-- BELANGRIJK: dit raakt ALLEEN de jsonb-permissions-array. De DB-tabel
-- `reviews` (waar de daadwerkelijke review-data staat) blijft onaangeroerd
-- — die hoort bij dezelfde feature, alleen de navigatie-key verandert.
--
-- IDEMPOTENT: meerdere keren runnen is veilig. We checken eerst of de
-- waarde 'reviews' nog in de array staat voordat we 'm vervangen.
-- ============================================================

-- Stap 1: rijen waar 'reviews' in modules-array staat → vervang door
-- 'google_business'. Gebruikt jsonb_set + array-positie-zoektocht.
-- Werkt op zowel custom-permissions-rijen als rijen waar de eigenaar
-- al iets aangepast had.
update restaurant_users
set permissions = jsonb_set(
  permissions,
  '{modules}',
  (
    select jsonb_agg(
      case when value::text = '"reviews"' then '"google_business"'::jsonb
           else value
      end
    )
    from jsonb_array_elements(permissions->'modules')
  )
)
where permissions is not null
  and permissions ? 'modules'
  and permissions->'modules' @> '["reviews"]'::jsonb;

-- Stap 2: audit-log-entry zodat we kunnen herleiden wanneer de rename
-- heeft plaatsgevonden (handig bij latere debug van permission-issues).
-- Geen restaurant_id want dit is een platform-brede wijziging — daarom
-- een NULL en een aparte action-key die opvalt in queries.
-- entity_id is NULL want audit_log.entity_id is van type uuid; de
-- module-naam staat in de payload.
insert into audit_log (
  restaurant_id,
  user_id,
  action,
  entity_type,
  entity_id,
  payload
)
values (
  null,
  null,
  'platform_module_renamed',
  'module',
  null,
  jsonb_build_object(
    'from', 'reviews',
    'to', 'google_business',
    'reason', 'Reviews-sectie uitgebreid tot Google Business Profile-hub',
    'migration', '0033'
  )
);
