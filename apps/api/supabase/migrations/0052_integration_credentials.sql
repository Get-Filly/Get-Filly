-- ============================================================
-- 0052_integration_credentials.sql
-- ============================================================
-- Versleutelde OAuth-tokens van externe koppelingen (eerst Meta:
-- Facebook/Instagram). De token staat APP-LEVEL versleuteld
-- (AES-256-GCM, sleutel in INTEGRATIONS_ENCRYPTION_KEY-env van de
-- API) — de database ziet alleen ciphertext, nooit de platte token.
--
-- Eén rij per (restaurant, provider): max. één actieve koppeling per
-- zaak per provider (vandaar de unique-constraint, die de upsert
-- gebruikt). RLS: alleen leden van het restaurant zien/beheren hun
-- eigen rij (defense-in-depth bovenop de API-guards).

create table if not exists integration_credentials (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  -- 'meta' (Facebook/Instagram). Later: 'zenchef', 'google', ...
  provider text not null,
  -- AES-256-GCM ciphertext in de vorm "ivB64.tagB64.cipherB64".
  access_token_encrypted text not null,
  -- Toegekende scopes (door de gebruiker goedgekeurd in de dialog).
  scopes text[] not null default '{}',
  -- Wanneer de (long-lived) token verloopt; null = onbekend.
  expires_at timestamptz,
  -- Niet-gevoelige metadata (bv. meta-user-id, gekozen pagina-id).
  meta jsonb not null default '{}'::jsonb,
  -- Wie de koppeling legde (audit).
  connected_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, provider)
);

create index if not exists idx_integration_credentials_restaurant
  on integration_credentials (restaurant_id);

-- ------------------------------------------------------------
-- RLS: leden van het restaurant hebben volledige toegang tot hun
-- eigen rijen. De token-kolom is versleuteld, dus SELECT door een
-- lid lekt geen bruikbare token (de sleutel staat alleen in de API).
-- ------------------------------------------------------------
alter table integration_credentials enable row level security;

create policy "members select own integration creds"
  on integration_credentials for select
  using (
    restaurant_id in (
      select restaurant_id from restaurant_users where user_id = auth.uid()
    )
  );

create policy "members insert own integration creds"
  on integration_credentials for insert
  with check (
    restaurant_id in (
      select restaurant_id from restaurant_users where user_id = auth.uid()
    )
  );

create policy "members update own integration creds"
  on integration_credentials for update
  using (
    restaurant_id in (
      select restaurant_id from restaurant_users where user_id = auth.uid()
    )
  )
  with check (
    restaurant_id in (
      select restaurant_id from restaurant_users where user_id = auth.uid()
    )
  );

create policy "members delete own integration creds"
  on integration_credentials for delete
  using (
    restaurant_id in (
      select restaurant_id from restaurant_users where user_id = auth.uid()
    )
  );
