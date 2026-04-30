-- ============================================================
-- Get Filly — Migratie 0024
-- menu_items.subcategory voor drank-detail (wijn-rood, bier, etc.)
-- ============================================================
-- Context:
--   Drankkaarten worden vaak apart ge-uploaded en hebben ~10
--   logische subgroepen (wijn rood/wit/rosé/mousserend, bier,
--   cocktail, sterke drank, koffie/thee, fris). Allemaal in de
--   bestaande "drank"-tab gooien is rommelig — eigenaar wil
--   visueel onderscheid en Filly wil "een rode wijn voorstellen
--   bij dit gerecht" kunnen doen.
--
-- Aanpak:
--   Geen aparte drink_items-tabel — voegt complexiteit toe
--   (extra service, extra context-builder voor Filly, dubbele
--   import-flow). In plaats daarvan een lichtgewicht
--   subcategory-veld op menu_items dat we voor drank gericht
--   gebruiken (rood/wit/etc), en in de toekomst eventueel
--   ook voor menu-detail (vis/vlees/vega binnen hoofd).
--
-- Compatibiliteit:
--   - Nullable: bestaande items + handmatig aangemaakte gerechten
--     hoeven 'm niet te zetten.
--   - Geen check-constraint op de waarden zodat we 'm flexibel
--     kunnen evolueren — backend (tool-schema-enum) en frontend
--     (subcategory-mapping) zijn de validatie-laag.
-- ============================================================

alter table public.menu_items
  add column if not exists subcategory text;

comment on column public.menu_items.subcategory is
  'Sub-categorie binnen category. Voor category=drank: wijn-rood, wijn-wit, wijn-rose, wijn-mousserend, bier, cocktail, sterke-drank, koffie-thee, fris, overig. Voor andere categorieën nu nog niet gebruikt.';

-- Index op (restaurant_id, category, subcategory): optimaliseert
-- de UI-query "geef alle dranken gegroepeerd op subcategory".
create index if not exists idx_menu_items_restaurant_cat_subcat
  on public.menu_items(restaurant_id, category, subcategory)
  where is_available = true;
